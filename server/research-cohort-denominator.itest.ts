import { describe, it, expect, beforeEach } from "vitest";
import { queryTrackedCohort } from "./storage";
import { makeAthlete, resetDatabase } from "./test-support/fixtures";

/**
 * The research export quotes a denominator, and the denominator has to count
 * people the extract itself does not.
 *
 * runResearchCohortQuery reports `matchedBeforeConsent` alongside
 * `consentedCount` so an admin can tell a rare cohort from a merely
 * unconsented one -- twelve athletes drawn from four hundred and twelve drawn
 * from fourteen are very different claims, and only the second is close to a
 * census of a small group. The 409 an under-floor export refuses with quotes
 * that number back at them.
 *
 * It stopped meaning that. When the consent rule was unified, the default
 * population predicate started requiring researchDataConsent, so the "before
 * consent" half was drawn from the consented population too and the two
 * numbers became equal by construction: every cohort looked like it covered
 * the whole platform. Nothing leaked -- the figure was too small, not too
 * large -- but the one question it exists to answer could no longer be asked.
 *
 * Exercised through queryTrackedCohort rather than the route: the route parses
 * plain English with a model call first, and the filter object is the part
 * that matters here.
 */
describe("the research export denominator counts the unconsented", () => {
  const filters = { sports: ["Football"], metrics: [] } as any;

  beforeEach(async () => {
    await resetDatabase();
  });

  async function makeFootballAthlete(overrides: Record<string, unknown>) {
    return makeAthlete({ sport: "Football", age: 17, ...overrides } as any);
  }

  it("counts consented and unconsented athletes alike", async () => {
    for (let i = 0; i < 5; i++) {
      await makeFootballAthlete({ researchDataConsent: true });
    }
    for (let i = 0; i < 3; i++) {
      await makeFootballAthlete({ researchDataConsent: false });
    }

    const denominator = await queryTrackedCohort(filters, { population: "tracked" });
    expect(denominator.cohortSize).toBe(8);
  });

  it("is a different number from the consented population it is compared against", async () => {
    // The regression itself: these two came back equal, so the ratio the
    // admin reads was always 1.
    for (let i = 0; i < 5; i++) {
      await makeFootballAthlete({ researchDataConsent: true });
    }
    for (let i = 0; i < 3; i++) {
      await makeFootballAthlete({ researchDataConsent: false });
    }

    const consented = await queryTrackedCohort(filters);
    const denominator = await queryTrackedCohort(filters, { population: "tracked" });

    expect(consented.cohortSize).toBe(5);
    expect(denominator.cohortSize).toBe(8);
    expect(denominator.cohortSize).toBeGreaterThan(consented.cohortSize);
  });

  it("still leaves out anyone who opted out of collection entirely", async () => {
    // trackingOptOut is the collection question and it is not what this
    // denominator relaxes. An athlete who opted out is not counted anywhere,
    // including in a figure that only ever becomes a total.
    for (let i = 0; i < 4; i++) {
      await makeFootballAthlete({ researchDataConsent: true });
    }
    for (let i = 0; i < 2; i++) {
      await makeFootballAthlete({ researchDataConsent: false, trackingOptOut: true });
    }

    const denominator = await queryTrackedCohort(filters, { population: "tracked" });
    expect(denominator.cohortSize).toBe(4);
  });

  it("does not widen the population the extract itself is built from", async () => {
    // The whole point of keeping this a separate option: asking for the
    // denominator must not change what a default call returns.
    for (let i = 0; i < 3; i++) {
      await makeFootballAthlete({ researchDataConsent: true });
    }
    for (let i = 0; i < 6; i++) {
      await makeFootballAthlete({ researchDataConsent: false });
    }

    const platform = await queryTrackedCohort(filters);
    expect(platform.cohortSize).toBe(3);
  });
});
