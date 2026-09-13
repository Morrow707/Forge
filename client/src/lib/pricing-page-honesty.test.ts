import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  BILLING_TIERS,
  BILLING_TIER_ORDER,
  ORG_BLOCK_SIZE,
  bandForAthleteCount,
} from "@shared/billing-tiers";

// THE PRICING PAGE CANNOT CONTRADICT ITSELF, OR THE PRICE LIST.
//
// It did both. One sentence said full personalization is included "above
// ORG_BLOCK_SIZE athletes" (20) and another, six lines down, said "programs above 30
// athletes already include all of it" -- a number a customer could reasonably hold
// Forge to, stated twice with two values. And it rendered the first two bands plus a
// grid of round numbers (~50, ~100, ~250...), so a 12- to 40-athlete program, the
// most common size the band table exists for, could not find its own price anywhere.
const page = readFileSync("client/src/pages/pricing.tsx", "utf8");
const bands = BILLING_TIER_ORDER.map((id) => BILLING_TIERS[id]);

describe("the pricing page states one personalization threshold", () => {
  it("derives it from the bands instead of writing a number in prose", () => {
    expect(page).toContain("PERSONALIZATION_FROM");
    expect(page).toContain("includesFullPersonalization");
  });

  it("has no hand-typed roster threshold left in the copy", () => {
    // "above 30 athletes" was the stale one; any bare "<number> athletes" in prose is
    // the same class of defect, so none are allowed outside the derived constants.
    // Comments stripped first: the fix's own comment quotes the stale sentence it
    // replaced, which is documentation rather than copy a customer reads.
    const prose = page
      .slice(page.indexOf("export default function PricingPage"))
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(prose).not.toMatch(/above \d+\s*\n?\s*athletes/);
  });

  it("agrees with the price list on where personalization starts", () => {
    const firstIncluded = bands.find((b) => b.includesFullPersonalization);
    expect(firstIncluded?.athleteFloor).toBe(ORG_BLOCK_SIZE + 1);
  });
});

describe("every roster size can find its price", () => {
  it("shows all the starter bands, not just the cheapest two", () => {
    const starters = bands.filter((b) => b.athleteCapIncluded <= ORG_BLOCK_SIZE);
    expect(starters.length).toBeGreaterThan(2);
    expect(page).toContain("STARTER_BANDS");
    expect(page).not.toContain("BILLING_TIER_ORDER.slice(0, 2)");
  });

  it("lists block bands by their real range rather than round-number samples", () => {
    expect(page).toContain("BLOCK_BANDS");
    expect(page).toContain("band.label");
    expect(page).not.toContain("[50, 100, 250, 500, 900]");
  });

  it("covers the common program sizes the old sample grid skipped", () => {
    for (const roster of [12, 18, 25, 40]) {
      const band = bandForAthleteCount(roster);
      // Inside the range the page now enumerates: starter bands, or a block band up
      // to a full football roster.
      expect(band.athleteCapIncluded).toBeLessThanOrEqual(120);
    }
  });
});
