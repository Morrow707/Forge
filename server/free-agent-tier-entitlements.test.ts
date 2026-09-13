import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { entitlementsForFreeAgentTier, FREE_AGENT_TIERS } from "@shared/free-agent-tiers";

// BASIC IS PRICED TO EXCLUDE THE AI COACH, SO BASIC HAS TO EXCLUDE THE AI COACH.
//
// subscriptions.tier holds exactly two values, base and pro, and there are three
// Free Agent SKUs. The old gate read `strengthAi ? true : tier === "pro"`, so every
// active Free Agent subscription -- including $4.99 Basic, whose own description is
// "No AI coach, no video form-check" -- got the AI chat coach, the AI program
// builder and the nutrition Q&A. Two entitlement models existed for one product and
// only the weaker one was wired, which is also how the Stripe webhook came to write
// the column nothing read.
describe("a Free Agent SKU decides what it includes", () => {
  it("gives Basic neither the AI coach nor video", () => {
    expect(entitlementsForFreeAgentTier("basic")).toEqual({
      hasAiChat: false,
      hasVideoFormCheck: false,
    });
  });

  it("gives AI Coach the chat but not video", () => {
    expect(entitlementsForFreeAgentTier("ai_coach")).toEqual({
      hasAiChat: true,
      hasVideoFormCheck: false,
    });
  });

  it("gives AI Coach + Video both", () => {
    expect(entitlementsForFreeAgentTier("ai_coach_video")).toEqual({
      hasAiChat: true,
      hasVideoFormCheck: true,
    });
  });

  it("treats no tier, and any tier it has never heard of, as nothing", () => {
    for (const tier of [null, undefined, "", "family", "enterprise"]) {
      expect(entitlementsForFreeAgentTier(tier)).toEqual({
        hasAiChat: false,
        hasVideoFormCheck: false,
      });
    }
  });

  it("matches the price list rather than restating it", () => {
    // If a SKU's flags change in shared/free-agent-tiers.ts, this function has to
    // follow automatically -- a second copy of the mapping is the bug this replaces.
    for (const [id, def] of Object.entries(FREE_AGENT_TIERS)) {
      expect(entitlementsForFreeAgentTier(id)).toEqual({
        hasAiChat: def.hasAiChat,
        hasVideoFormCheck: def.hasVideoFormCheck,
      });
    }
  });

  it("has no environment switch in it", () => {
    // getFreeAgentEntitlements applies the beta flag, the trial and
    // BILLING_ENFORCEMENT_ENABLED; this one must not, or route gating inside the
    // BILLING_LIVE branch would hand everyone unlimited access whenever enforcement
    // happens to be off -- a different switch from the one that decides whether
    // checkout exists at all.
    const tiers = readFileSync(join(__dirname, "..", "shared", "free-agent-tiers.ts"), "utf8");
    const at = tiers.indexOf("export function entitlementsForFreeAgentTier");
    const body = tiers.slice(at, tiers.indexOf("export const FREE_AGENT_TIER_ORDER"));
    expect(body).not.toContain("ENFORCEMENT_ENABLED");
    expect(body).not.toContain("isBetaAccount");
    expect(body).not.toContain("trialExpiresAt");
  });
});

describe("the Free Agent AI gate reads the SKU", () => {
  const routes = readFileSync(join(__dirname, "routes.ts"), "utf8");
  const gate = (() => {
    const at = routes.indexOf("async function hasAthletePaidForAiAccess");
    return routes.slice(at, routes.indexOf("function requirePaidAiAccess"));
  })();

  it("resolves entitlements from the purchased tier", () => {
    expect(gate).toContain("entitlementsForFreeAgentTier");
    expect(gate).toContain("getFreeAgentBillingAccount");
  });

  it("no longer decides AI access from the base/pro column", () => {
    expect(gate).not.toContain('sub.tier === "pro"');
  });

  it("still lets a trial through as full access", () => {
    // storage.createTrialSubscription writes tier "base" with status "trialing", and
    // a trial is meant to sell the paid features, so it cannot resolve through a SKU
    // the athlete has not bought yet.
    expect(gate).toContain('sub.status === "trialing"');
  });
});
