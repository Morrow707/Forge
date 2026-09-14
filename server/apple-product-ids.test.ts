import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
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
  it("are exactly the ids the shared tier list generates, in the same order", () => {
    const expected = FREE_AGENT_TIER_ORDER.map(appleProductIdForFreeAgentTier);
    expect(productIdsInSwift()).toEqual(expected);
  });

  it("offer no tier that no longer exists", () => {
    expect(productIdsInSwift().some((id) => id.includes("family"))).toBe(false);
  });

  it("keep the _v2 suffix, since the unsuffixed ids are permanently burned", () => {
    for (const id of productIdsInSwift()) expect(id.endsWith("_v2")).toBe(true);
  });
});
