import { describe, it, expect, vi, beforeEach } from "vitest";

/* DELETING AN ACCOUNT ABANDONED A LIVE SUBSCRIPTION, AND THE CARD KEPT BEING CHARGED.
 *
 * Found 2026-10-14 by the ten-dimension billing sweep, reported by two dimensions independently
 * and then confirmed by reading the path: there was not one Stripe reference anywhere in
 * deleteOwnAccount or deleteUserRecord. The `subscriptions` row cascades from `users`, so the
 * delete destroyed stripeSubscriptionId -- the ONLY handle -- while Stripe went on billing
 * monthly. The person had exercised the single control they had over their own data and the
 * charges continued, with no account left to sign into and nothing in Forge left to cancel with.
 *
 * ORDER IS THE WHOLE FIX. The cancel runs AFTER the password is accepted (a wrong password must
 * never cancel anybody's subscription) and BEFORE deleteUserRecord (afterwards the handles do
 * not exist). storage.deleteOwnAccount takes the canceller as a callback for exactly that
 * reason, rather than storage importing billing.ts -- which it cannot, being the module
 * billing.ts imports.
 *
 * TWO PLACES, because a Stripe subscription id lives in two: the tier's or the band's on the
 * subscriptions row, and each add-on's in users.addOnTerms. The same split that produced the
 * three bugs this was found beside.
 */
const getUser = vi.fn();
const findFirst = vi.fn();
const comparePasswords = vi.fn();
const deleteUserRecord = vi.fn();

vi.mock("./db", () => ({
  db: { query: { subscriptions: { findFirst: (...a: unknown[]) => findFirst(...a) } } },
  pool: {},
}));
vi.mock("./auth-utils", () => ({
  comparePasswords: (...a: unknown[]) => comparePasswords(...a),
  hashPassword: vi.fn(),
}));

describe("the billing handles are read from both places they live", () => {
  // storage.ts is 21k lines and pulls a large graph, so this exercises the SHAPE of the
  // collection rather than importing it: the two sources, de-duplicated, Apple reported and
  // never attempted. The itest drives the real route.
  function collect(sub: Record<string, unknown> | null, addOnTerms: Record<string, Record<string, string>>) {
    const ids = new Set<string>();
    if (sub?.stripeSubscriptionId) ids.add(sub.stripeSubscriptionId as string);
    for (const term of Object.values(addOnTerms ?? {})) {
      if (term?.stripeSubscriptionId) ids.add(term.stripeSubscriptionId);
    }
    const apple = [
      sub?.appleOriginalTransactionId as string | undefined,
      ...Object.values(addOnTerms ?? {}).map((t) => t?.appleOriginalTransactionId),
    ].filter(Boolean);
    return { stripeSubscriptionIds: [...ids], appleOriginalTransactionIds: [...new Set(apple)] };
  }

  it("finds the tier's subscription AND every add-on's", () => {
    const got = collect(
      { stripeSubscriptionId: "sub_tier" },
      { all_classes: { stripeSubscriptionId: "sub_classes" }, coaches_corner: { stripeSubscriptionId: "sub_corner" } },
    );
    expect(got.stripeSubscriptionIds.sort()).toEqual(["sub_classes", "sub_corner", "sub_tier"]);
  });

  it("finds an add-on's even when the account has no tier subscription", () => {
    // The row-less case: a Free Agent who never trialled has no subscriptions row at all, and
    // an add-on bought on the web is the only thing billing them.
    const got = collect(null, { all_classes: { stripeSubscriptionId: "sub_classes" } });
    expect(got.stripeSubscriptionIds).toEqual(["sub_classes"]);
  });

  it("de-duplicates, so one subscription is never cancelled twice", () => {
    const got = collect({ stripeSubscriptionId: "sub_x" }, { all_classes: { stripeSubscriptionId: "sub_x" } });
    expect(got.stripeSubscriptionIds).toEqual(["sub_x"]);
  });

  it("reports Apple rather than trying to cancel it", () => {
    // This server cannot cancel an Apple subscription at all -- only the person, in iOS
    // Settings. So it is surfaced to them; a silent 204 over a subscription that keeps charging
    // would be the worst of the three outcomes.
    const got = collect({ appleOriginalTransactionId: "1000000999" }, {});
    expect(got.stripeSubscriptionIds).toEqual([]);
    expect(got.appleOriginalTransactionIds).toEqual(["1000000999"]);
  });
});

describe("the delete path is wired in the one order that works", () => {
  const storageSrc = require("node:fs").readFileSync("server/storage.ts", "utf8");
  const authSrc = require("node:fs").readFileSync("server/auth.ts", "utf8");

  it("cancels only after the password is accepted", () => {
    const fn = storageSrc.slice(storageSrc.indexOf("async deleteOwnAccount("));
    const body = fn.slice(0, fn.indexOf("\n  },"));
    const passwordAt = body.indexOf("Incorrect password.");
    const cancelAt = body.indexOf("onBeforeDelete(handles)");
    expect(passwordAt).toBeGreaterThan(-1);
    expect(cancelAt).toBeGreaterThan(passwordAt);
  });

  it("cancels before the row is destroyed, while the handles still exist", () => {
    const fn = storageSrc.slice(storageSrc.indexOf("async deleteOwnAccount("));
    const body = fn.slice(0, fn.indexOf("\n  },"));
    expect(body.indexOf("onBeforeDelete(handles)")).toBeLessThan(body.indexOf("deleteUserRecord(userId)"));
  });

  it("never lets a payment failure block the deletion", () => {
    // A person's right to delete cannot be held hostage by Stripe being down. The ids are logged
    // for an operator instead.
    const fn = storageSrc.slice(storageSrc.indexOf("async deleteOwnAccount("));
    const body = fn.slice(0, fn.indexOf("\n  },"));
    expect(body).toContain("try {");
    expect(body).toContain("catch (err)");
    expect(body).toContain("need a hand");
    // And the delete still runs: it is outside the try.
    expect(body.trimEnd().endsWith("return billing ? { ok: true, billing } : { ok: true };\n    }".trimEnd())
      || body.includes("await this.deleteUserRecord(userId);")).toBe(true);
  });

  it("the REAL collector reads both places an id can live", () => {
    // The shape tests above reimplement the collection locally, which means they cannot fail
    // when the real function changes -- mutation-testing proved it: deleting the addOnTerms loop
    // from billingHandlesForAccount left all of them green. That is the assertion-direction trap
    // this repo keeps recording, so this one reads the real source.
    const fn = storageSrc.slice(storageSrc.indexOf("async billingHandlesForAccount("));
    const body = fn.slice(0, fn.indexOf("\n  },"));
    expect(body).toContain("subscriptions.userId, userId");       // the tier's / the band's
    expect(body).toContain("user?.addOnTerms");                    // every add-on's
    expect(body).toContain("term?.stripeSubscriptionId");
    // Apple is collected to be REPORTED, never cancelled here.
    expect(body).toContain("appleOriginalTransactionId");
    expect(body).not.toContain("stripe.subscriptions.cancel");
  });

  it("the route hands the real canceller in", () => {
    expect(authSrc).toContain("cancelSubscriptionsForDeletedAccount");
    expect(authSrc).toMatch(/deleteOwnAccount\(user\.id, password, \(handles\) =>/);
  });

  it("tells the person when an Apple subscription is still theirs to stop", () => {
    expect(authSrc).toContain("alsoCancelInAppStore");
  });

  it("cancels each id independently so one failure cannot take the rest down", () => {
    const billingSrc = require("node:fs").readFileSync("server/billing.ts", "utf8");
    const fn = billingSrc.slice(billingSrc.indexOf("export async function cancelSubscriptionsForDeletedAccount"));
    // To the next top-level declaration, NOT to the first `\n}` -- that one closes the inline
    // parameter type `handles: { stripeSubscriptionIds: string[] }` and would slice the body off
    // entirely, leaving every assertion below passing against nothing.
    const after = fn.slice(1);
    const end = Math.min(
      ...[after.indexOf("\nexport "), after.indexOf("\n/** CANCEL THE SUBSCRIPTION")].filter((i) => i > -1),
    );
    const body = after.slice(0, end);
    expect(body).toContain("for (const id of");
    expect(body).toContain("try {");
    expect(body).toContain("failed.push(id)");
    // Credits the unused remainder: somebody closing their account should not have paid for a
    // month of something they can no longer sign in to.
    expect(body).toContain("prorate: true");
  });
});
