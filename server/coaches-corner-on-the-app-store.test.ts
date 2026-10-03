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
    expect(storage).toMatch(/if \(scope === "coach"\) \{[\s\S]*addCoachBillingAddOn\(userId, coachAddOn\)/);
  });

  it("is verified through the account route, which reads the role", () => {
    expect(routes).toContain('app.post("/api/account/apple-iap/verify", requireAuth');
    expect(routes).toMatch(/user\.role === "coach" \? "coach" : "free_agent"/);
    // A coached athlete cannot buy a tier through it either, same rule as the athlete route.
    expect(routes).toMatch(/getCoachesForAthlete\(user\.id\)\)\.length > 0\) \{\s*\n\s*return res\.status\(403\)/);
    expect(client).toContain('"/api/account/apple-iap/verify"');
    expect(client).toContain("export async function purchaseCoachAddOn(");
  });
});
