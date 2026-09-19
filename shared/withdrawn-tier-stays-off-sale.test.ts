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
  type FreeAgentTierId,
} from "./free-agent-tiers";

/**
 * WITHDRAWING A TIER HAS TO DO TWO OPPOSITE THINGS AT ONCE, AND THIS FILE HOLDS BOTH.
 *
 * AI Coach + Video was pulled from sale on 2026-09-19 because the camera it is sold on is not
 * accurate yet. "Pulled from sale" means: nobody can buy it, nobody sees the price, it is not an
 * option anywhere a customer looks. It does NOT mean it stops working. Athletes are already
 * paying for it, and every one of them must keep video form-check, keep resolving on renewal,
 * and keep being able to restore purchases.
 *
 * Those two requirements pull in opposite directions, and the failure mode is silent and
 * expensive in one specific direction: a reasonable-looking cleanup that shrinks one more list
 * to "the tiers we sell" takes a paid feature away from a paying customer, with no error
 * anywhere and nothing on any screen to show it happened. The customer just quietly stops
 * getting what they are being charged for.
 *
 * So this asserts both halves against the real source, including two text scans over files this
 * package cannot import. They are scans and they know it -- they prove the lists were wired to
 * the right places, not that the runtime behaves. That is the half that rots.
 */

const WITHDRAWN = "ai_coach_video" as FreeAgentTierId;

const read = (...parts: string[]) => readFileSync(join(__dirname, "..", ...parts), "utf8");

describe("the withdrawn tier is off sale", () => {
  it("is not in the for-sale list, which is what every customer surface renders", () => {
    // /pricing, the landing cards, the athlete upgrade page and the StoreKit product list all map
    // over this one array. That is the entire reason withdrawing a tier is a one-line change:
    // there is no second place where the price could survive.
    expect(FREE_AGENT_TIER_ORDER).not.toContain(WITHDRAWN);
    expect(isFreeAgentTierPurchasable(WITHDRAWN)).toBe(false);
  });

  it("is declared withdrawn rather than merely absent", () => {
    // Absence alone is indistinguishable from someone having deleted a line by accident. The
    // explicit list is what lets the admin screen label it and what makes the intent greppable.
    expect(WITHDRAWN_FREE_AGENT_TIERS).toContain(WITHDRAWN);
  });

  it("leaves the tiers that ARE for sale purchasable", () => {
    // The obvious over-correction: withdrawing one tier and breaking checkout for the others.
    expect(FREE_AGENT_TIER_ORDER.length).toBeGreaterThan(0);
    for (const tier of FREE_AGENT_TIER_ORDER) {
      expect(isFreeAgentTierPurchasable(tier)).toBe(true);
      expect(WITHDRAWN_FREE_AGENT_TIERS).not.toContain(tier);
    }
  });

  it("refuses a checkout for it, from the derived list rather than a typed-out copy", () => {
    // The route used to name the three tier ids as string literals, so withdrawing a tier
    // everywhere else would have left this one endpoint still creating checkouts for it. A
    // hand-typed copy of a list is a copy that stops agreeing with the list.
    const routes = read("server", "routes.ts");
    const checkout = routes.slice(routes.indexOf("/api/billing/checkout/free-agent-tier"));
    const body = checkout.slice(0, checkout.indexOf("createFreeAgentTierCheckout"));
    expect(body).toContain("z.enum(FREE_AGENT_TIER_ORDER");
    expect(body).not.toContain(`"${WITHDRAWN}"`);
  });
});

describe("the withdrawn tier still works for anyone already paying for it", () => {
  it("keeps its definition, its price and its description", () => {
    // "Keep it in the code" was explicit. Nothing about it was deleted; only the offer was.
    const def = FREE_AGENT_TIERS[WITHDRAWN];
    expect(def).toBeDefined();
    expect(def.monthlyPriceCents).toBe(1999);
    expect(def.hasVideoFormCheck).toBe(true);
  });

  it("still grants video form-check", () => {
    // THE ONE THAT MATTERS MOST. If this ever returns false, everybody on the tier lost the
    // feature they are being charged for, and nothing else in the app would say so.
    expect(entitlementsForFreeAgentTier(WITHDRAWN)).toEqual({
      hasAiChat: true,
      hasVideoFormCheck: true,
    });
  });

  it("is still in the ever-sold list, which is what resolves an existing subscription", () => {
    expect(ALL_FREE_AGENT_TIER_IDS).toContain(WITHDRAWN);
    for (const tier of FREE_AGENT_TIER_ORDER) expect(ALL_FREE_AGENT_TIER_IDS).toContain(tier);
  });

  it("still resolves an Apple receipt, so a renewal does not read as an unknown product", () => {
    // Built from ALL_FREE_AGENT_TIER_IDS. Built from the sale list instead, this map returns null
    // for a subscriber's product id, which reads as "unknown product", grants nothing, and strips
    // video form-check from someone who is still being billed for it.
    const appleIap = read("server", "apple-iap.ts");
    expect(appleIap).toContain("ALL_FREE_AGENT_TIER_IDS.map((tier) => [appleProductIdForFreeAgentTier(tier), tier])");
    expect(appleIap).not.toContain("FREE_AGENT_TIER_ORDER.map((tier) => [appleProductIdForFreeAgentTier(tier), tier])");
  });

  it("is still a legal stored value, so an admin can open the account and save it", () => {
    // The admin billing form sends the tier it is showing. Validating against the sale list would
    // reject an athlete's own current tier on any save that touched an unrelated field.
    const schema = read("shared", "schema.ts");
    const form = schema.slice(schema.indexOf("export const updateFreeAgentBillingSchema"));
    expect(form.slice(0, 400)).toContain(".enum(ALL_FREE_AGENT_TIER_IDS");
  });

  it("keeps an Apple product id, which is what a restore needs", () => {
    expect(appleProductIdForFreeAgentTier(WITHDRAWN)).toMatch(/ai_coach_video/);
  });
});

describe("nothing customer-facing names the withdrawn tier directly", () => {
  // Every one of these pages renders FREE_AGENT_TIER_ORDER, so they drop the tier automatically.
  // What this catches is the other thing: a hardcoded reference that outlives the list, like the
  // featured-card flag on /pricing that pointed at "ai_coach_video" by name and quietly left the
  // section with no highlighted card at all once the tier went away.
  it.each([
    ["pricing page", ["client", "src", "pages", "pricing.tsx"]],
    ["landing page", ["client", "src", "pages", "landing.tsx"]],
    ["athlete upgrade page", ["client", "src", "pages", "athlete", "upgrade.tsx"]],
  ])("%s does not hardcode it", (_label, parts) => {
    expect(read(...parts)).not.toContain(WITHDRAWN);
  });

  it("sizes the tier-card grid to however many tiers are on sale", () => {
    // Three hardcoded columns and two cards leaves a visible hole. Derived, so it is right now
    // and right again if the tier comes back.
    const cols = FREE_AGENT_TIER_ORDER.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
    for (const parts of [
      ["client", "src", "pages", "pricing.tsx"],
      ["client", "src", "pages", "landing.tsx"],
      ["client", "src", "pages", "athlete", "upgrade.tsx"],
    ]) {
      expect(read(...parts)).toContain("FREE_AGENT_TIER_GRID_COLS");
    }
    expect(cols).toBe("sm:grid-cols-2");
  });
});
