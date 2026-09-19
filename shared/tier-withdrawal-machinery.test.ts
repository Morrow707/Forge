import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_FREE_AGENT_TIER_IDS,
  FREE_AGENT_TIERS,
  FREE_AGENT_TIER_ORDER,
  WITHDRAWN_FREE_AGENT_TIERS,
  entitlementsForFreeAgentTier,
  isFreeAgentTierPurchasable,
  appleProductIdForFreeAgentTier,
} from "./free-agent-tiers";

/**
 * WITHDRAWING A TIER HAS TO DO TWO OPPOSITE THINGS AT ONCE, AND THIS KEEPS BOTH WORKING WHILE
 * NOTHING IS WITHDRAWN.
 *
 * AI Coach + Video was pulled from sale on 2026-09-19 and put back the same day, once the
 * decision became "sell it with a warning" rather than "stall it". So WITHDRAWN_FREE_AGENT_TIERS
 * is empty right now, and the obvious move is to delete all of this.
 *
 * Don't. The machinery is what made the withdrawal safe, and the thing it protects against is
 * silent and one-directional: a cleanup that shrinks one more list to "the tiers we sell" takes a
 * paid feature away from a paying customer, with no error anywhere and nothing on any screen to
 * show it happened. They just quietly stop getting what they are billed for. Rebuilding that
 * understanding under time pressure, the next time something has to be pulled, is exactly when
 * it will be got wrong.
 *
 * So this tests the SHAPE rather than one tier's membership: the two lists stay distinct, the
 * sale list drives what is offered, the ever-sold list drives what still resolves, and nothing
 * that resolves an existing subscription consults the sale list.
 */

const read = (...parts: string[]) => readFileSync(join(__dirname, "..", ...parts), "utf8");

describe("the two lists stay distinct and keep their separate jobs", () => {
  it("has an ever-sold list that is a superset of the for-sale list", () => {
    for (const tier of FREE_AGENT_TIER_ORDER) expect(ALL_FREE_AGENT_TIER_IDS).toContain(tier);
    expect(ALL_FREE_AGENT_TIER_IDS.length).toBeGreaterThanOrEqual(FREE_AGENT_TIER_ORDER.length);
  });

  it("treats exactly the non-withdrawn tiers as purchasable", () => {
    for (const tier of ALL_FREE_AGENT_TIER_IDS) {
      const withdrawn = WITHDRAWN_FREE_AGENT_TIERS.includes(tier);
      expect(isFreeAgentTierPurchasable(tier)).toBe(!withdrawn);
      expect(FREE_AGENT_TIER_ORDER.includes(tier)).toBe(!withdrawn);
    }
  });

  it("never lets a withdrawal revoke an entitlement", () => {
    // THE ONE THAT MATTERS MOST, and it holds whether or not anything is withdrawn today.
    // entitlementsForFreeAgentTier must answer from the tier's own definition and never consult
    // the sale list, or pulling a tier would strip the feature from everyone already paying.
    for (const tier of ALL_FREE_AGENT_TIER_IDS) {
      const def = FREE_AGENT_TIERS[tier];
      expect(entitlementsForFreeAgentTier(tier)).toEqual({
        hasAiChat: def.hasAiChat,
        hasVideoFormCheck: def.hasVideoFormCheck,
        hasSkills: def.hasSkills,
      });
    }
    const tiers = read("shared", "free-agent-tiers.ts");
    const at = tiers.indexOf("export function entitlementsForFreeAgentTier");
    const body = tiers.slice(at, at + 700);
    expect(body).not.toContain("FREE_AGENT_TIER_ORDER");
    expect(body).not.toContain("WITHDRAWN_FREE_AGENT_TIERS");
  });

  it("resolves an Apple receipt from the ever-sold list, not the sale list", () => {
    // Built from the sale list instead, this map returns null for a withdrawn tier's product id
    // on renewal -- which reads as "unknown product", grants nothing, and strips the feature from
    // somebody still being billed.
    const appleIap = read("server", "apple-iap.ts");
    expect(appleIap).toContain("ALL_FREE_AGENT_TIER_IDS.map((tier) => [appleProductIdForFreeAgentTier(tier), tier])");
    expect(appleIap).not.toContain("FREE_AGENT_TIER_ORDER.map((tier) => [appleProductIdForFreeAgentTier(tier), tier])");
  });

  it("validates a stored tier against the ever-sold list", () => {
    // An admin opening an athlete on a withdrawn tier has to be able to save the form without
    // the tier they are not changing being rejected on the way through.
    const schema = read("shared", "schema.ts");
    const form = schema.slice(schema.indexOf("export const updateFreeAgentBillingSchema"));
    expect(form.slice(0, 400)).toContain(".enum(ALL_FREE_AGENT_TIER_IDS");
  });

  it("keeps an Apple product id for every tier ever sold, which a restore needs", () => {
    for (const tier of ALL_FREE_AGENT_TIER_IDS) {
      expect(appleProductIdForFreeAgentTier(tier)).toBeTruthy();
    }
  });

  it("derives the checkout enum rather than naming tiers as literals", () => {
    // The route used to list the three ids as strings, so withdrawing a tier everywhere else
    // would have left that one endpoint still selling it.
    const routes = read("server", "routes.ts");
    const checkout = routes.slice(routes.indexOf("/api/billing/checkout/free-agent-tier"));
    const body = checkout.slice(0, checkout.indexOf("createFreeAgentTierCheckout"));
    expect(body).toContain("z.enum(FREE_AGENT_TIER_ORDER");
    for (const tier of ALL_FREE_AGENT_TIER_IDS) expect(body).not.toContain(`"${tier}"`);
  });

  it("sizes the tier-card grid to however many tiers are on sale", () => {
    for (const parts of [
      ["client", "src", "pages", "pricing.tsx"],
      ["client", "src", "pages", "landing.tsx"],
      ["client", "src", "pages", "athlete", "upgrade.tsx"],
    ]) {
      expect(read(...parts)).toContain("FREE_AGENT_TIER_GRID_COLS");
    }
  });
});
