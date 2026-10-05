import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_FREE_AGENT_TIER_IDS,
  FREE_AGENT_TIER_ORDER,
  appleProductIdForFreeAgentTier,
} from "@shared/free-agent-tiers";

// The Swift plugin hardcodes the StoreKit product ids it asks the App Store
// for, because Swift cannot import the TypeScript that defines them. Nothing
// made the two agree, and they had drifted: the plugin offered family_v2,
// retired with the Family plan, and omitted basic_v2, so the cheapest tier
// could not be bought on iOS at all. Both halves also feed what an operator
// creates in App Store Connect, so a mismatch means creating the wrong
// products -- which Apple then reserves forever.
const swift = readFileSync(
  join(__dirname, "..", "ios", "App", "App", "AppleIapPlugin.swift"),
  "utf8",
);

function productIdsInSwift(): string[] {
  const block = swift.match(/private static let productIds = \[([\s\S]*?)\]/);
  if (!block) throw new Error("productIds array not found in AppleIapPlugin.swift");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("StoreKit product ids", () => {
  // ALL_FREE_AGENT_TIER_IDS, NOT THE FOR-SALE LIST, AND A WITHDRAWN TIER IS EXACTLY WHY.
  //
  // What the plugin asks StoreKit for is what it can RESOLVE, not what it offers. An athlete
  // already subscribed to a withdrawn tier still has to be able to restore purchases and still
  // has to have their renewals resolve, and StoreKit can only hand back a product the app asked
  // about by id. Dropping the id here would strand exactly the people who are still paying.
  //
  // Hiding it from the purchase UI is a separate job done in a separate place:
  // fetchFreeAgentTierProducts maps over FREE_AGENT_TIER_ORDER, so the withdrawn product is
  // fetched and never shown. Fetched-but-not-offered is the correct state for a tier somebody
  // may still own.
  it("are exactly the ids the shared tier list generates, in the same order", () => {
    const expected = ALL_FREE_AGENT_TIER_IDS.map(appleProductIdForFreeAgentTier);
    expect(productIdsInSwift()).toEqual(expected);
  });

  it("still asks StoreKit about every withdrawn tier, so subscribers can restore", () => {
    // Stated on its own as well as implied by the assertion above, because the obvious
    // "tidy-up" here is to shrink this list to whatever is currently for sale, and the cost of
    // that is invisible in every test that only exercises a new purchase.
    for (const tier of ALL_FREE_AGENT_TIER_IDS) {
      expect(productIdsInSwift()).toContain(appleProductIdForFreeAgentTier(tier));
    }
    expect(productIdsInSwift().length).toBeGreaterThanOrEqual(FREE_AGENT_TIER_ORDER.length);
  });

  it("offer no tier that no longer exists", () => {
    expect(productIdsInSwift().some((id) => id.includes("family"))).toBe(false);
  });

  it("carry the per-tier suffix, since every earlier id is permanently burned", () => {
    // basic stays _v2 (always in the right group); the two AI tiers are _v3 after the 2026-10-04
    // products landed in groups of their own. An unsuffixed id is the Consumable mistake.
    const ids = productIdsInSwift();
    expect(ids.find((id) => id.includes(".basic"))).toMatch(/_v2$/);
    expect(ids.find((id) => id.includes(".ai_coach_v"))).toMatch(/_v3$/);
    expect(ids.find((id) => id.includes(".ai_coach_video"))).toMatch(/_v3$/);
    for (const id of ids) expect(id).toMatch(/_v\d+$/);
  });
});

describe("the verifier recognises every product Forge sells at Apple", () => {
  // 2026-10-05: the first sandbox purchase run. verifyAppleTransaction asked
  // tierForAppleProductId alone, so All Classes and Coaches Corner -- both on sale in App Store
  // Connect -- would have been refused with "isn't set up yet" after Apple took the money.
  it("includes the tiers, the Free Agent add-ons and the coach add-ons", async () => {
    const { isKnownAppleProductId } = await import("./apple-iap");
    const {
      ALL_FREE_AGENT_TIER_IDS,
      FREE_AGENT_ADD_ON_ORDER,
      appleProductIdForFreeAgentTier,
      appleProductIdForFreeAgentAddOn,
      appleProductIdForCoachAddOn,
    } = await import("@shared/free-agent-tiers");
    const { COACH_PURCHASABLE_ADD_ON_ORDER } = await import("@shared/billing-tiers");
    for (const tier of ALL_FREE_AGENT_TIER_IDS) expect(isKnownAppleProductId(appleProductIdForFreeAgentTier(tier))).toBe(true);
    for (const addOn of FREE_AGENT_ADD_ON_ORDER) expect(isKnownAppleProductId(appleProductIdForFreeAgentAddOn(addOn))).toBe(true);
    for (const addOn of COACH_PURCHASABLE_ADD_ON_ORDER) expect(isKnownAppleProductId(appleProductIdForCoachAddOn(addOn))).toBe(true);
    expect(isKnownAppleProductId("com.foreperformancesystems.forge.addon.all_classes_v1")).toBe(true);
    expect(isKnownAppleProductId("com.foreperformancesystems.forge.addon.coaches_corner_v1")).toBe(true);
    expect(isKnownAppleProductId("com.foreperformancesystems.forge.freeagent.nothing_v2")).toBe(false);
  });
});
