import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { appleProductIdForCoachAddOn, appleProductIdForFreeAgentTier } from "@shared/free-agent-tiers";
import { COACH_PURCHASABLE_ADD_ON_ORDER } from "@shared/billing-tiers";

// Coaches Corner went on sale in the app on 2026-10-03 (Scott: "we need to add coaches corner to
// apple in store purchase"). These pin the three things that make that true and keep it true.
const routes = readFileSync("server/routes.ts", "utf8");
const storage = readFileSync("server/storage.ts", "utf8");
const client = readFileSync("client/src/lib/apple-iap.ts", "utf8");

describe("Coaches Corner on the App Store", () => {
  it("has the product id that was created in App Store Connect, outside the tier group", () => {
    expect(appleProductIdForCoachAddOn("coaches_corner")).toBe(
      "com.foreperformancesystems.forge.addon.coaches_corner_v1",
    );
    // Never shares a prefix with a tier product, which would put it in the tier group's namespace.
    expect(appleProductIdForFreeAgentTier("basic")).not.toContain(".addon.");
    expect(COACH_PURCHASABLE_ADD_ON_ORDER).toContain("coaches_corner");
  });

  it("is recognised by the server from the purchasable list, scoped to a coach", () => {
    expect(storage).toMatch(/COACH_PURCHASABLE_ADD_ON_ORDER\.map\(\(addOn\) => \[appleProductIdForCoachAddOn\(addOn\), addOn\]\)/);
    expect(storage).toMatch(/scope: "free_agent" \| "coach" = "free_agent"/);
    // The call takes a third argument since 2026-10-11 -- the Apple transaction id, recorded
    // so a refund naming it can revoke this add-on later (shared/add-on-terms.ts). And since
    // later the same day it is granted to the PRIMARY coach's row rather than the buyer's,
    // because that is the row ownsCoachesCorner reads: an assistant's purchase unlocked the
    // library for nobody (see a-checkout-only-takes-money-it-can-honour.test.ts, which pins the
    // grant and the reason it is a grant rather than a refusal). What this pins is unchanged:
    // inside the coach scope, a coach add-on is what gets granted.
    expect(storage).toMatch(/if \(scope === "coach"\) \{[\s\S]*addCoachBillingAddOn\(grantTo, coachAddOn[,)]/);
    expect(storage).toMatch(/if \(scope === "coach"\) \{[\s\S]*const grantTo = await this\.getPrimaryCoachId\(userId\)/);
  });

  it("is verified through the account route, which reads the role", () => {
    expect(routes).toContain('app.post("/api/account/apple-iap/verify", requireAuth');
    expect(routes).toMatch(/user\.role === "coach" \? "coach" : "free_agent"/);
    // A COACHED ATHLETE IS STILL RECOGNISED HERE -- but recorded rather than refused, since
    // 2026-10-15. This asserted the 403 that used to answer them, and that 403 was the bug: the
    // phone finishes a transaction only on 410 and 409, so the refusal replayed at every launch
    // forever while Apple charged (see a-coached-athletes-receipt-is-recorded.test.ts for the
    // whole chain and for why a grant, not a third finishable status, is the fix). Re-pointed at
    // the property this case is actually about -- the route reads the role and the coach link --
    // rather than at the answer it used to give.
    expect(routes).toMatch(/const coachedAthlete =\s*\n?\s*user\.role === "athlete" && \(await storage\.getCoachesForAthlete\(user\.id\)\)\.length > 0;/);
    // And a role with nothing to buy at all is still refused, which is the 403 that stays.
    expect(routes).toMatch(/user\.role !== "athlete" && user\.role !== "coach"\) \{\s*\n\s*return res\.status\(403\)/);
    expect(client).toContain('"/api/account/apple-iap/verify"');
    expect(client).toContain("export async function purchaseCoachAddOn(");
  });
});
