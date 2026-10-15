import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bandForAthleteCount, BILLING_TIERS, ORG_BLOCK_SIZE } from "@shared/billing-tiers";

/**
 * A NUMBER SOMEBODY TYPES INTO A FORM CANNOT GRANT A PAID ENTITLEMENT.
 *
 * Coach signup asks "roughly how many athletes will you have", and until 2026-10-11 the answer
 * was written straight onto the account as users.billingTier -- before a card, before a
 * payment, before anything. getEntitlements derives four paid entitlements from the band
 * (includesFullPersonalization is `lo > ORG_BLOCK_SIZE`), so typing 21 handed out Full
 * Personalization at $24.99 a month and multi-team, free and permanently. PUT /api/coach/plan
 * did it again for an existing coach, any time, from the same field and guarded by nothing but
 * their own role.
 *
 * The number was designed as a PRICE QUOTE and that design is sound. The bug was one column
 * answering two questions: what we would bill you, and what you have paid for. So:
 *   billingTier         = what was PAID for (Stripe webhook, or an admin deliberately)
 *   plannedAthleteCount = what the school SAID (free to type, quotes the price, buys nothing)
 *
 * The arithmetic test comes first, because it is the thing that made the hole worth money.
 */

const SERVER = resolve(import.meta.dirname);
const read = (f: string) => readFileSync(resolve(SERVER, f), "utf8");
// LINE COMMENTS FIRST, THEN BLOCK -- the order is load-bearing. A `/*` inside a line comment
// (server/auth.ts: "see the /api/auth/mfa/* routes below") pairs with the next real `*/` if the
// block pass runs first, swallowing everything between and leaving a scan reading a fraction of
// the file while still passing. Taking line comments off first removes the fake opener with them.
const stripComments = (src: string) =>
  src.replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("what the typed number would have bought", () => {
  it("crosses into the personalization bands one athlete past the block size", () => {
    // The exact edge the hole turned on: 20 buys nothing, 21 used to buy a $24.99 add-on.
    expect(BILLING_TIERS[bandForAthleteCount(ORG_BLOCK_SIZE).id].includesFullPersonalization).toBe(false);
    expect(BILLING_TIERS[bandForAthleteCount(ORG_BLOCK_SIZE + 1).id].includesFullPersonalization).toBe(true);
    expect(BILLING_TIERS[bandForAthleteCount(ORG_BLOCK_SIZE + 1).id].includesMultiTeam).toBe(true);
  });
});

describe("only a payment writes the band", () => {
  const auth = stripComments(read("auth.ts"));
  const storage = stripComments(read("storage.ts"));

  it("signup writes no band at all", () => {
    expect(auth).toContain("billingTier: null");
    expect(auth).not.toMatch(/billingTier:[\s\S]{0,80}bandForAthleteCount/);
  });

  it("the plan route restates the headcount and nothing else", () => {
    const fn = storage.slice(storage.indexOf("async setPlannedAthleteCount"));
    const body = fn.slice(0, fn.indexOf("\n  },"));
    expect(body).toContain("plannedAthleteCount: expectedAthletes");
    expect(body).not.toMatch(/\.set\(\{[^}]*billingTier/);
    expect(body).not.toContain("bandForAthleteCount");
  });

  it("leaves the two writers that represent a real purchase or a deliberate grant", () => {
    // applyCoachSubscriptionBand is the Stripe webhook's write; the admin PATCH is the other.
    expect(storage).toContain("async applyCoachSubscriptionBand");
    expect(storage).toMatch(/\.set\(\{ billingTier: bandId/);
  });
});

describe("a cancellation forgets the band", () => {
  const billing = stripComments(read("billing.ts"));
  const storage = stripComments(read("storage.ts"));

  it("clears it for a coach, as the Free Agent branch does for a tier", () => {
    // Lived inside customer.subscription.deleted until 2026-10-15, when it was factored into
    // endStripeSubscription so the two OTHER ways a Stripe subscription ends -- Stripe cancelling
    // through an `updated` event, and dunning finishing in `unpaid` -- revoke the same things.
    // Re-pointed at its new home rather than relaxed: the assertion is about the band coming off
    // with the subscription, and that is now true on three paths instead of one.
    const fn = billing.slice(billing.indexOf("async function endStripeSubscription"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toContain('updated.accountType === "free_agent"');
    expect(body).toContain('updated.accountType === "coach"');
    expect(body).toContain("clearCoachBand");
    // And the branch it came out of reaches it, rather than having quietly lost it.
    const branch = billing.slice(billing.indexOf('case "customer.subscription.deleted"'));
    expect(branch.slice(0, branch.indexOf("break;"))).toContain("endStripeSubscription(");
  });

  it("keeps the stated headcount, which was never a purchase", () => {
    const fn = storage.slice(storage.indexOf("async clearCoachBand"));
    const body = fn.slice(0, fn.indexOf("\n  },"));
    expect(body).toContain("billingTier: null");
    expect(body).not.toContain("plannedAthleteCount");
  });
});

describe("the two readers that were not about entitlement", () => {
  const routes = stripComments(read("routes.ts"));
  const storage = stripComments(read("storage.ts"));

  it("quotes from what the program has or expects, not from the band on file", () => {
    const fn = routes.slice(routes.indexOf("async function coachPlanPayload"));
    const body = fn.slice(0, fn.indexOf("\n  }"));
    expect(body).toContain("bandForAthleteCount(billedCount)");
    // And still reports the paid band separately, so the screen can tell the two apart.
    expect(body).toContain("paidBand");
  });

  it("draws the paid band on the billing page, and only when it differs from the quote", () => {
    // A field the server returns and nothing renders is a field nobody reads -- the shape that
    // made the builder's REST toggle cosmetic for a fortnight. paidBand exists so a coach whose
    // roster outgrew what they bought can see both facts, so the page has to show it; and only
    // when they differ, because two identical numbers on one card is what audit row B2 was.
    const page = stripComments(read("../client/src/pages/coach/billing.tsx"));
    expect(page).toContain("plan.paidBand && plan.paidBand.id !== plan.band?.id");
    expect(page).toContain("Your subscription covers");
    // And declared on the type the page reads, or TypeScript would not have been asked.
    expect(page).toMatch(/paidBand: \{ id: string; label: string \} \| null;/);
  });

  it("still asks a new school for the Institutional Service Agreement", () => {
    // This keyed off billingTier, which ONLY had a value because signup wrote one. Dropping that
    // write without re-pointing this would have silently stopped asking every new school for a
    // signed agreement -- a legal surface, failing quietly.
    const fn = storage.slice(storage.indexOf("async getInstitutionalAgreementStatus"));
    const body = fn.slice(0, fn.indexOf("\n  },"));
    expect(body).toContain("!coach?.plannedAthleteCount && !coach?.billingTier");
  });
});
