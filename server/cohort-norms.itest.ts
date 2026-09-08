import { describe, it, expect, beforeEach } from "vitest";
import { rebuildCohortNorms, normsForAthlete } from "./cohort-norms";
import { NORM_MIN_COHORT } from "@shared/cohort-norms";
import { makeAthlete, resetDatabase } from "./test-support/fixtures";

const makeCohort = async (n: number, overrides: Record<string, unknown>) => {
  for (let i = 0; i < n; i++) {
    await makeAthlete({ verticalJumpIn: 24 + (i % 12), ...overrides } as never);
  }
};

describe("cohort norms", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("produces nothing at all from a cohort below the floor", async () => {
    // A percentile from a handful of athletes is not a weaker percentile, it
    // is a different kind of claim. Withholding it is the whole point.
    await makeCohort(NORM_MIN_COHORT - 1, { sport: "Football", position: "LB", age: 16, gender: "male" });
    await rebuildCohortNorms();
    expect(await normsForAthlete({ sport: "Football", position: "LB", age: 16, gender: "male" })).toBeNull();
  });

  it("answers from the exact cohort once it is large enough", async () => {
    await makeCohort(NORM_MIN_COHORT + 5, { sport: "Football", position: "LB", age: 16, gender: "male" });
    await rebuildCohortNorms();

    const result = await normsForAthlete({ sport: "Football", position: "LB", age: 16, gender: "male" });
    expect(result).not.toBeNull();
    expect(result!.widenedFrom).toEqual([]);
    expect(result!.key.position).toBe("LB");
    const jump = result!.norms.find((n) => n.metric === "vertical jump");
    expect(jump!.n).toBeGreaterThanOrEqual(NORM_MIN_COHORT);
    expect(jump!.p50).toBeGreaterThan(jump!.p25);
  });

  it("drops position before age when the exact cohort is too thin", async () => {
    // Spread across positions so no single position reaches the floor but
    // the sport and age band together do.
    for (let i = 0; i < NORM_MIN_COHORT + 10; i++) {
      await makeAthlete({
        sport: "Football",
        position: i % 2 === 0 ? "LB" : "WR",
        age: 16,
        gender: "male",
        verticalJumpIn: 24 + (i % 12),
      } as never);
    }
    await rebuildCohortNorms();

    const result = await normsForAthlete({ sport: "Football", position: "LB", age: 16, gender: "male" });
    expect(result).not.toBeNull();
    expect(result!.widenedFrom).toContain("position");
    expect(result!.key.ageBand).toBe("16-17");
    expect(result!.key.sport).toBe("Football");
  });

  it("moves an athlete's reference when they change age band", async () => {
    // The property the whole design exists for: nothing is told about a
    // birthday, the reference just follows.
    await makeCohort(NORM_MIN_COHORT + 2, { sport: "Football", age: 15, gender: "male" });
    await makeCohort(NORM_MIN_COHORT + 2, { sport: "Football", age: 17, gender: "male" });
    await rebuildCohortNorms();

    const younger = await normsForAthlete({ sport: "Football", age: 15, gender: "male" });
    const older = await normsForAthlete({ sport: "Football", age: 17, gender: "male" });
    expect(younger!.key.ageBand).toBe("14-15");
    expect(older!.key.ageBand).toBe("16-17");
  });

  it("rebuilds from scratch rather than accumulating", async () => {
    await makeCohort(NORM_MIN_COHORT + 2, { sport: "Football", age: 16, gender: "male" });
    const first = await rebuildCohortNorms();
    const second = await rebuildCohortNorms();
    // A rebuild that appended would double every cohort's sample and quietly
    // corrupt every percentile in the table.
    expect(second.norms).toBe(first.norms);

    const result = await normsForAthlete({ sport: "Football", age: 16, gender: "male" });
    expect(result!.norms[0].n).toBeLessThanOrEqual(NORM_MIN_COHORT + 2);
  });

  it("bands on date of birth rather than a stale stored age", async () => {
    // users.age is optional and self-reported; date_of_birth is required at
    // signup. Banding on `age` alone meant most real accounts had no band at
    // all and silently fell through to the sport-wide cohort -- a sixteen
    // year old compared against adults with nothing on the page to say so.
    for (let i = 0; i < NORM_MIN_COHORT + 2; i++) {
      await makeAthlete({
        sport: "Lacrosse",
        gender: "male",
        // Says 25, actually 16. The date of birth is the fact about the
        // person; the stored number is a fact about the day it was typed.
        age: 25,
        dateOfBirth: "2010-01-01",
        verticalJumpIn: 24 + (i % 12),
      } as never);
    }
    await rebuildCohortNorms();

    const result = await normsForAthlete({
      sport: "Lacrosse",
      gender: "male",
      dateOfBirth: "2010-01-01",
    });
    expect(result).not.toBeNull();
    expect(result!.key.ageBand).toBe("16-17");
  });

  it("names gender when the last-resort widening drops it", async () => {
    // "Athletes like you" quietly meaning "everyone" is the exact misreading
    // the provenance list exists to prevent.
    for (let i = 0; i < NORM_MIN_COHORT + 2; i++) {
      await makeAthlete({ verticalJumpIn: 24 + (i % 12) } as never);
    }
    await rebuildCohortNorms();

    const result = await normsForAthlete({ sport: "Curling", gender: "female", age: 44 });
    expect(result).not.toBeNull();
    expect(result!.widenedFrom).toContain("gender");
  });

  it("excludes an athlete who opted out of tracking", async () => {
    await makeCohort(NORM_MIN_COHORT + 2, { sport: "Rugby", age: 16, gender: "male", trackingOptOut: true });
    await rebuildCohortNorms();
    expect(await normsForAthlete({ sport: "Rugby", age: 16, gender: "male" })).toBeNull();
  });
});
