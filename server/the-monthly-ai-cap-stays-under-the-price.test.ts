import { describe, expect, it } from "vitest";
import { AI_MONTHLY_CAP_USD, monthlyCapUsdFor } from "./ai-monthly-cap";
import { FREE_AGENT_TIERS } from "@shared/free-agent-tiers";

/* THE MONTHLY AI CEILING NEVER LETS A SUBSCRIBER COST MORE THAN THEY PAY (2026-11-17). Each plan's
 * ceiling stays below what the plan pays Forge after Apple's full 30% -- the worst case -- so a
 * price cut or a raised ceiling that would let one account run at a loss fails here first. */

const APPLE_STANDARD_CUT = 0.3;

describe("the monthly AI ceiling", () => {
  for (const tier of ["basic", "ai_coach", "ai_coach_video"] as const) {
    it(`${tier}: the ceiling is below what the plan pays Forge after Apple's 30%`, () => {
      const def = FREE_AGENT_TIERS[tier];
      const paysForge = (def.monthlyPriceCents / 100) * (1 - APPLE_STANDARD_CUT);
      expect(AI_MONTHLY_CAP_USD[tier]).toBeLessThan(paysForge);
      expect(monthlyCapUsdFor({ id: 1, role: "athlete", freeAgentTier: tier })).toBe(AI_MONTHLY_CAP_USD[tier]);
    });
  }

  it("an admin is not counted; every other role has a ceiling", () => {
    expect(monthlyCapUsdFor({ id: 1, role: "admin" })).toBeNull();
    for (const role of ["coach", "athlete", "guardian"]) expect(monthlyCapUsdFor({ id: 1, role })).toBeGreaterThan(0);
  });
});
