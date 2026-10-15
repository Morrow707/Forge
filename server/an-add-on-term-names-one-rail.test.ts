import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nextAddOnTerms, addOnIsActive } from "@shared/add-on-terms";

/**
 * AN APPLE ADD-ON PURCHASE CANCELLED THE CARD SUBSCRIPTION AND THEN REVOKED WHAT IT JUST SOLD.
 *
 * `nextAddOnTerms`' purchase branch is `{ ...prior, purchasedAt, accessUntil: undefined,
 * refundedAt: undefined }` -- it resets the two stamps and carries every OTHER key of the prior
 * term through, the other rail's handle among them. So an Apple purchase over an account that had
 * bought the same add-on on the web left BOTH handles on one term, and the chain from there is
 * mechanical:
 *
 *   1. `supersededStripeSubscriptionId` names the old Stripe id (an Apple purchase passes no
 *      `provider.stripeSubscriptionId` for it to be compared against).
 *   2. The verify route cancels that subscription at Stripe.
 *   3. Stripe sends `customer.subscription.deleted` for it.
 *   4. `endAddOnsForDeletedStripeSubscription` matches `term.stripeSubscriptionId === S` -- still
 *      S, because nothing ever cleared it -- and ends the add-on.
 *
 * THE TIER HAS HAD BOTH HALVES OF THIS RULE SINCE 2026-10-14 and the add-on had neither, one
 * table over. That is why the sweep which fixed the tier did not see it: its itest exercises a
 * TIER product and the term was never in its scope.
 *
 * Found by the 2026-10-15 audit panel, verified against the code before anything was changed.
 */

const SERVER = resolve(import.meta.dirname);
const read = (f: string) => readFileSync(resolve(SERVER, f), "utf8");
const stripComments = (src: string) =>
  src.replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("the term after a cross-rail purchase", () => {
  const WEB = { purchasedAt: "2026-01-01T00:00:00.000Z", stripeSubscriptionId: "sub_web" };

  it("drops the Stripe handle when the same add-on is bought in the app", () => {
    // The real call shape both writers make, with the clear this file exists for.
    const after = nextAddOnTerms({ all_classes: WEB }, "all_classes", {
      purchasedAt: "2026-02-01T00:00:00.000Z",
      appleOriginalTransactionId: "T_apple",
      stripeSubscriptionId: undefined,
    });
    expect(after.all_classes.appleOriginalTransactionId).toBe("T_apple");
    expect(after.all_classes.stripeSubscriptionId).toBeUndefined();
    // DELETED, not stored as null -- nextAddOnTerms strips undefined on purpose, and a json
    // column that can hold either makes every reader ask which.
    expect(Object.keys(after.all_classes)).not.toContain("stripeSubscriptionId");
  });

  it("drops the Apple handle when the same add-on is bought on the web", () => {
    const after = nextAddOnTerms(
      { all_classes: { purchasedAt: "2026-01-01T00:00:00.000Z", appleOriginalTransactionId: "T_apple" } },
      "all_classes",
      { purchasedAt: "2026-02-01T00:00:00.000Z", stripeSubscriptionId: "sub_web", appleOriginalTransactionId: undefined },
    );
    expect(after.all_classes.stripeSubscriptionId).toBe("sub_web");
    expect(Object.keys(after.all_classes)).not.toContain("appleOriginalTransactionId");
  });

  it("carries the prior handle through when NO rail is named, which is an admin grant", () => {
    // The case the clear must not reach. An admin comping an add-on passes no provider, and that
    // handle is the only thing that can ever cancel or refund the live subscription behind it.
    const after = nextAddOnTerms({ all_classes: WEB }, "all_classes", {
      accessUntil: undefined,
      refundedAt: undefined,
    });
    expect(after.all_classes.stripeSubscriptionId).toBe("sub_web");
  });

  it("still grants the add-on either way", () => {
    // Rule #1's shape: closing a cross-rail hole must not withhold what was paid for.
    const after = nextAddOnTerms({ all_classes: WEB }, "all_classes", {
      purchasedAt: "2026-02-01T00:00:00.000Z",
      appleOriginalTransactionId: "T_apple",
      stripeSubscriptionId: undefined,
    });
    expect(addOnIsActive(["all_classes"], after, "all_classes")).toBe(true);
  });
});

describe("both writers clear the losing rail", () => {
  const storage = stripComments(read("storage.ts"));
  const body = (name: string) => {
    const at = storage.indexOf(`async ${name}(`);
    return storage.slice(at, storage.indexOf("\n  },", at));
  };

  for (const name of ["addFreeAgentAddOn", "addCoachBillingAddOn"]) {
    it(`${name} clears the other rail's handle, in both directions`, () => {
      const fn = body(name);
      expect(fn).not.toBe("");
      expect(fn).toContain("? { stripeSubscriptionId: undefined }");
      expect(fn).toContain("? { appleOriginalTransactionId: undefined }");
      // Guarded on this purchase NAMING a rail, so an admin grant clears nothing.
      expect(fn).toContain("provider?.appleOriginalTransactionId && !provider?.stripeSubscriptionId");
      expect(fn).toContain("provider?.stripeSubscriptionId && !provider?.appleOriginalTransactionId");
    });

    it(`${name} hands up BOTH superseded handles`, () => {
      // Stripe's is cancellable by Forge and is cancelled by the route; Apple's is not, so it is
      // reported. A handle that is neither cancelled nor reported is a subscription nothing in
      // the system can ever find again.
      const fn = body(name);
      expect(fn).toContain("supersededStripeSubscriptionId");
      expect(fn).toContain("supersededAppleOriginalTransactionId");
      expect(fn).toContain("prior?.refundedAt == null");
    });
  }

  it("the Apple verify path records the App Store subscription it superseded", () => {
    expect(storage).toContain('"add_on.rail_changed"');
    expect(storage).toContain("alsoCancelInAppStore: true");
  });
});

describe("the paid month is read off the subscription ITEM", () => {
  const billing = stripComments(read("billing.ts"));

  it("falls back to items.data[0], because Subscription no longer carries the field", () => {
    // Stripe moved current_period_end from Subscription to SubscriptionItem (SDK 22.5.0, API
    // 2026-07-29.dahlia). The top-level read was ALWAYS undefined, so addOnAccessUntil was always
    // `new Date()` and every Stripe add-on cancellation took endAddOnsForDeletedStripeSubscription's
    // `accessUntil <= now` branch -- revokeAddOnAfterRefund, which strips the add-on AND stamps
    // refundedAt, which only an admin can clear. The comment above it had promised the paid month
    // since the day it was written.
    const at = billing.indexOf("const deletedPeriodEnd");
    const expr = billing.slice(at, billing.indexOf(";", at));
    expect(expr).toContain("items?.data?.[0]?.current_period_end");
    // The top-level read is KEPT first: an endpoint pinned to an older API version still sends it.
    expect(expr).toContain("current_period_end ??");
  });

  it("is the only place in this file still reading the removed field without a fallback", () => {
    // Two other sites already read the item or fall back to it; this asserts none regresses.
    const bare = billing
      .split("\n")
      .filter((l) => /current_period_end/.test(l))
      .filter((l) => !/items/.test(l) && !/current_period_end \?\?/.test(l));
    expect(bare).toEqual([]);
  });

  it("the SDK on disk really has moved it, which is what makes the above load-bearing", () => {
    // Asserted against the installed package rather than taken on trust: if a future bump puts
    // the field back on Subscription, this case says so instead of the fix looking pointless.
    const subs = readFileSync(
      resolve(SERVER, "../node_modules/stripe/cjs/resources/Subscriptions.d.ts"),
      "utf8",
    );
    const iface = subs.slice(subs.indexOf("interface Subscription "), subs.indexOf("namespace Subscription"));
    const fields = new Set([...iface.matchAll(/^\s{4,8}(\w+)[?!]?:/gm)].map((m) => m[1]));
    expect(fields.has("cancel_at_period_end")).toBe(true);
    expect(fields.has("current_period_end")).toBe(false);
  });
});
