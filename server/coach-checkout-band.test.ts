import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BILLING_TIERS,
  ORG_BASE_CENTS,
  ORG_PER_ATHLETE_CENTS,
  bandForAthleteCount,
} from "@shared/billing-tiers";

const BANDS = Object.values(BILLING_TIERS);

// CHECKOUT HAS TO CHARGE WHAT THE PAGE QUOTED.
//
// /coach/billing quotes the roster band -- $480/mo for a 120-athlete program -- and
// checkout line-itemed coachBasePriceId() alone, the flat account fee. That fee is
// ORG_BASE_CENTS, which is 0, because the old $10 fee was dropped. So the page
// quoted the band and the subscription charged something unrelated to it.
//
// The arithmetic below is the claim billing-tiers.ts makes about itself: every band
// divides back out to exactly the per-athlete rate. That is what makes one Stripe
// Price with a quantity able to express every band, which is the shape checkout now
// uses.
describe("a band is the per-athlete rate times its ceiling", () => {
  it("divides back out to the flat rate for every band", () => {
    for (const band of BANDS) {
      expect(band.monthlyPriceCents).toBe(
        ORG_BASE_CENTS + band.athleteCapIncluded * ORG_PER_ATHLETE_CENTS,
      );
    }
  });

  it("gives no band a volume discount", () => {
    for (const band of BANDS) {
      expect((band.monthlyPriceCents - ORG_BASE_CENTS) / band.athleteCapIncluded).toBe(
        ORG_PER_ATHLETE_CENTS,
      );
    }
  });

  it("quotes a quantity that covers the roster", () => {
    for (const roster of [1, 5, 6, 12, 20, 21, 40, 119, 120]) {
      const band = bandForAthleteCount(roster);
      expect(band.athleteCapIncluded).toBeGreaterThanOrEqual(roster);
    }
  });
});

describe("coach checkout bills the band", () => {
  const billing = readFileSync(join(__dirname, "billing.ts"), "utf8");
  const fn = (() => {
    const at = billing.indexOf("export async function createCoachSubscriptionCheckout");
    return billing.slice(at, billing.indexOf("/** A one-off class-lesson purchase."));
  })();

  it("line-items the per-athlete price with the band's ceiling as the quantity", () => {
    expect(fn).toContain("coachPerAthletePriceId()");
    expect(fn).toContain("quantity: band.athleteCapIncluded");
  });

  it("only bills the flat account fee while one exists", () => {
    expect(fn).toContain("ORG_BASE_CENTS > 0");
  });

  it("records on the subscription which band was quoted", () => {
    expect(fn).toContain("quotedMonthlyCents");
    expect(fn).toContain("bandAthleteCap");
  });

  it("takes the roster count rather than assuming one size fits all", () => {
    expect(fn).toContain("rosterAthleteCount: number");
  });
});
