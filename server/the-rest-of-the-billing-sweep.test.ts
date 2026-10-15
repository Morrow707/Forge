import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";
import { bandForAthleteCount, BILLING_TIER_ORDER, BILLING_TIERS, MAX_BANDED_ATHLETES } from "@shared/billing-tiers";
import { MAX_EXPECTED_ATHLETES } from "@shared/schema";

/* THE TAIL OF THE 2026-10-14 AUDIT PANEL: six findings, each verified against HEAD first. */
const billing = readFileSync(join(import.meta.dirname, "billing.ts"), "utf8");
const storage = readFileSync(join(import.meta.dirname, "storage.ts"), "utf8");
const routes = readFileSync(join(import.meta.dirname, "routes.ts"), "utf8");

describe("every roster the form accepts has a band of its own", () => {
  it("prices a school above the old 1,000 ceiling at $4 a head", () => {
    // bandForAthleteCount clamped to the last enumerated band, so a school that typed 2,000 --
    // which signup accepts -- was billed the 981-1,000 price: $4,000 a month of roster charged
    // as a quarter of it.
    expect(bandForAthleteCount(2000).monthlyPriceCents).toBe(2000 * 400);
    expect(bandForAthleteCount(1001).athleteCapIncluded).toBe(1020);
  });

  it("the form's ceiling and the bands' are ONE number", () => {
    // They were 5,000 and 1,000, written down separately, which is the whole defect.
    expect(MAX_EXPECTED_ATHLETES).toBe(MAX_BANDED_ATHLETES);
    const top = BILLING_TIERS[BILLING_TIER_ORDER[BILLING_TIER_ORDER.length - 1]];
    expect(top.athleteCapIncluded).toBeGreaterThanOrEqual(MAX_EXPECTED_ATHLETES);
  });

  it("no headcount the form accepts is under-billed", () => {
    for (const n of [1, 5, 21, 120, 999, 1000, 1001, 2500, MAX_EXPECTED_ATHLETES]) {
      const band = bandForAthleteCount(n);
      expect(band.athleteCapIncluded, `roster ${n}`).toBeGreaterThanOrEqual(n);
      // $4.00 x the band ceiling, which is what the pricing page tells a reader to expect.
      expect(band.monthlyPriceCents, `roster ${n}`).toBe(band.athleteCapIncluded * 400);
    }
  });

  it("every band's price still steps by the block, so the arithmetic on /pricing holds", () => {
    const blocks = BILLING_TIER_ORDER.map((id) => BILLING_TIERS[id]).filter((b) => b.athleteFloor > 20);
    for (let i = 1; i < blocks.length; i += 1) {
      expect(blocks[i].athleteFloor).toBe(blocks[i - 1].athleteCapIncluded + 1);
    }
  });
});

describe("a retried delivery cannot reinstate the double bill", () => {
  it("cancels the superseded subscription BEFORE the row is overwritten", () => {
    const at = billing.indexOf('case "checkout.session.completed"');
    const branch = billing.slice(at, billing.indexOf('case "customer.subscription.updated"', at));
    const cancelAt = branch.indexOf("cancelSupersededStripeSubscription(userId, priorSubscriptionId)");
    const upsertAt = branch.indexOf("upsertSubscriptionByUserId");
    expect(cancelAt).toBeGreaterThan(-1);
    expect(upsertAt).toBeGreaterThan(cancelAt);
  });

  it("and reads the prior id before either", () => {
    const at = billing.indexOf('case "checkout.session.completed"');
    const branch = billing.slice(at, billing.indexOf('case "customer.subscription.updated"', at));
    expect(branch.indexOf("const priorSubscriptionId")).toBeLessThan(
      branch.indexOf("cancelSupersededStripeSubscription(userId, priorSubscriptionId)"),
    );
  });
});

describe("an add-on buyer can still reach the billing portal", () => {
  it("records the Stripe customer id with an upsert, not an UPDATE that matches nothing", () => {
    // An account whose only purchase is an add-on has no subscriptions row (createTrialSubscription
    // makes it, and a coached athlete never meets that), so the plain UPDATE dropped the id --
    // and that id is how /api/billing/portal is opened.
    expect(billing).not.toMatch(/updateSubscriptionByUserId\(userId, \{ stripeCustomerId: customerId \}\)/);
    expect((billing.match(/upsertStripeCustomerId\(/g) ?? []).length).toBe(3);
    const fn = storage.slice(storage.indexOf("async upsertStripeCustomerId("));
    const body = fn.slice(0, fn.indexOf("\n  },\n"));
    expect(body).toMatch(/onConflictDoUpdate/);
    // An existing row keeps its own accountType, tier and status: only the customer id moves.
    expect(body).toMatch(/set: \{ stripeCustomerId, updatedAt: new Date\(\) \}/);
  });
});

describe("a late Apple renewal cannot undo a refund", () => {
  it("ignores a notification that does not move the window forward", () => {
    const at = storage.indexOf("async applyAppleServerNotification(");
    const body = storage.slice(at, storage.indexOf("\n  },\n", at));
    expect(body).toMatch(/expiresAt <= alreadyRecorded\.currentPeriodEnd/);
    expect(body).toMatch(/apple_iap\.stale_renewal_ignored/);
    // Monotonic rather than a status list: Apple promises no delivery order, so "does not extend
    // the window" covers the refund case and every other out-of-order one at once.
    const guardAt = body.indexOf("expiresAt <= alreadyRecorded");
    const grantAt = body.indexOf("updateFreeAgentBilling", guardAt);
    expect(grantAt).toBeGreaterThan(guardAt);
  });

  it("reads the recorded window to compare against", () => {
    const at = storage.indexOf("async subscriptionRowsForAppleTransaction(");
    const body = storage.slice(at, storage.indexOf("\n  },\n", at));
    expect(body).toMatch(/currentPeriodEnd: subscriptions\.currentPeriodEnd/);
  });
});

describe("an admin's comp tick means what the panel says", () => {
  it("the tier gate honours isBetaAccount, as the add-on gates always have", () => {
    // The panel's label reads "Exempt from every paywall, whatever the tier above says", and
    // this gate -- camera, skills, AI chat -- never consulted it.
    const at = routes.indexOf("async function hasAthletePaidForAiAccess(");
    const body = routes.slice(at, routes.indexOf("\n}\n", at));
    expect(body).toMatch(/comped\?\.isBetaAccount/);
    const compAt = body.indexOf("comped?.isBetaAccount");
    expect(body.indexOf("tierGrants")).toBeGreaterThan(compAt);
  });
});

describe("an admin billing grant is in the record", () => {
  for (const [fn, event, field] of [
    ["updateFreeAgentBilling", "admin.free_agent_tier_set", "freeAgentTier"],
    ["updateCoachBilling", "admin.coach_band_set", "billingTier"],
  ] as const) {
    it(`${fn} records the ${field} it wrote`, () => {
      const at = storage.indexOf(`async ${fn}(`);
      const body = storage.slice(at, storage.indexOf("\n  },\n", at));
      expect(body).toMatch(new RegExp(event.replace(/\./g, "\\.")));
      expect(body).toMatch(new RegExp(`values\\.${field} !== undefined`));
      // Only when it was actually part of the save -- a log row per unrelated patch is noise.
      expect(body).toMatch(/admin\.comp_flag_set/);
    });
  }
});
