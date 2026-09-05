import { describe, it, expect } from "vitest";
import {
  ORG_BASE_CENTS,
  ORG_PER_ATHLETE_CENTS,
  bandForAthleteCount,
  formatCents,
  COACHES_CORNER_MONTHLY_PRICE_CENTS,
  COACHES_CORNER_FREE_AT_ATHLETE_COUNT,
} from "./billing-tiers";
import { FREE_AGENT_TIERS, FREE_AGENT_TIER_ORDER } from "./free-agent-tiers";
import { FORGE_CLASS_LESSON_DEFAULT_PRICE_CENTS } from "./class-pricing";
import { PRICING_CATALOG, PRICING_CATALOG_KEYS } from "../server/pricing-catalog";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The failure this file exists to prevent: the landing page declared its own
// Free Agent tier list ("Base $29.99 / Pro $39.99") and its own coach seat
// bands, while /pricing rendered the shared modules ($9.99/$19.99/$49.99),
// and a third dead price list sat in server/billing.ts with no readers. Three
// sources, three answers, for the same product. These tests assert there is
// one source and that the catalog enumerates everything sellable.
describe("one pricing source", () => {
  const landing = readFileSync(
    join(__dirname, "..", "client", "src", "pages", "landing.tsx"),
    "utf8",
  );

  it("the landing page derives prices instead of declaring them", () => {
    // Any bare dollar amount in this file is a price typed by hand.
    const hardcoded = landing.match(/"\$\d+\.\d\d"/g) ?? [];
    expect(hardcoded).toEqual([]);
    expect(landing).toContain('from "@shared/billing-tiers"');
    expect(landing).toContain('from "@shared/free-agent-tiers"');
  });

  it("keeps the dead server price list deleted", () => {
    const billing = readFileSync(join(__dirname, "..", "server", "billing.ts"), "utf8");
    expect(billing).not.toMatch(/^export const PRICING\b/m);
  });

  it("prices a coach band from the base fee plus the flat per-athlete rate", () => {
    for (const n of [15, 50, 100, 250]) {
      const band = bandForAthleteCount(n);
      expect(band.monthlyPriceCents).toBe(
        ORG_BASE_CENTS + band.athleteCapIncluded * ORG_PER_ATHLETE_CENTS,
      );
    }
  });
});

describe("pricing catalog completeness", () => {
  it("has a unique key per entry", () => {
    expect(PRICING_CATALOG_KEYS.size).toBe(PRICING_CATALOG.length);
  });

  it("prices every Free Agent tier at the shared figure", () => {
    for (const id of FREE_AGENT_TIER_ORDER) {
      const entry = PRICING_CATALOG.find((i) => i.key === `fa_tier_${id}`);
      expect(entry?.defaultCents).toBe(FREE_AGENT_TIERS[id].monthlyPriceCents);
    }
  });

  it("enumerates Coaches Corner, which used to have a gate and no price", () => {
    const entry = PRICING_CATALOG.find((i) => i.key === "coaches_corner");
    expect(entry?.defaultCents).toBe(COACHES_CORNER_MONTHLY_PRICE_CENTS);
    expect(entry?.description).toContain(String(COACHES_CORNER_FREE_AT_ATHLETE_COUNT));
  });

  it("comps Coaches Corner only where the org fee already dwarfs it", () => {
    const orgFee = bandForAthleteCount(COACHES_CORNER_FREE_AT_ATHLETE_COUNT).monthlyPriceCents;
    expect(orgFee).toBeGreaterThan(COACHES_CORNER_MONTHLY_PRICE_CENTS * 10);
  });

  it("enumerates the Forge Class lesson price", () => {
    const entry = PRICING_CATALOG.find((i) => i.key === "forge_class_lesson_default");
    expect(entry?.defaultCents).toBe(FORGE_CLASS_LESSON_DEFAULT_PRICE_CENTS);
  });

  it("no longer calls the sport add-ons unbuilt -- all three ship", () => {
    for (const entry of PRICING_CATALOG.filter((i) => i.key.startsWith("fa_addon_"))) {
      expect(entry.description).not.toContain("not built yet");
    }
  });

  it("states every price in whole cents", () => {
    for (const entry of PRICING_CATALOG) {
      expect(Number.isInteger(entry.defaultCents)).toBe(true);
      expect(entry.defaultCents).toBeGreaterThan(0);
      expect(formatCents(entry.defaultCents)).toMatch(/^\$\d+\.\d\d$/);
    }
  });
});
