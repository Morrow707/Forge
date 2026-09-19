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

  it("keep the _v2 suffix, since the unsuffixed ids are permanently burned", () => {
    for (const id of productIdsInSwift()) expect(id.endsWith("_v2")).toBe(true);
  });
});
