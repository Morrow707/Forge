import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { makeAthlete, resetDatabase } from "./test-support/fixtures";

const DATE = "2026-09-10";

function food(overrides: Record<string, unknown> = {}) {
  return {
    date: DATE,
    description: "Chicken and rice",
    caloriesKcal: 600,
    proteinG: 45,
    carbsG: 70,
    fatG: 12,
    fiberG: 4,
    source: "manual" as const,
    ...overrides,
  };
}

describe("a day's food log groups by meal and keeps unsorted entries", () => {
  beforeEach(resetDatabase);

  it("stores the meal it was logged under and leaves an omitted one null", async () => {
    const athlete = await makeAthlete();
    await storage.addFoodLogEntry(athlete.id, food({ meal: "breakfast" }) as any);
    await storage.addFoodLogEntry(athlete.id, food({ description: "Older entry" }) as any);

    const day = await storage.getFoodLogForDate(athlete.id, DATE);
    const byDescription = new Map(day.entries.map((e) => [e.description, e.meal]));
    expect(byDescription.get("Chicken and rice")).toBe("breakfast");
    // An entry logged before meal grouping existed has no meal, and nothing invents one for it.
    expect(byDescription.get("Older entry")).toBeNull();
  });

  it("moves an entry into a meal on edit, which is the only way an old one gets there", async () => {
    const athlete = await makeAthlete();
    const entry = await storage.addFoodLogEntry(athlete.id, food() as any);
    expect(entry.meal).toBeNull();

    const updated = await storage.updateFoodLogEntry(athlete.id, entry.id, { meal: "dinner" } as any);
    expect(updated.meal).toBe("dinner");
  });

  // Fiber has been stored, summed and given a target since nutrition shipped, and was never
  // rendered anywhere. The total is checked here so the number the new bar reads is a real one.
  it("totals fiber alongside the other macros", async () => {
    const athlete = await makeAthlete();
    await storage.addFoodLogEntry(athlete.id, food({ fiberG: 4 }) as any);
    await storage.addFoodLogEntry(athlete.id, food({ fiberG: 7.5 }) as any);

    const day = await storage.getFoodLogForDate(athlete.id, DATE);
    expect(day.totals.fiberG).toBeCloseTo(11.5, 5);
  });
});

// nutritionTargets.waterOz has been settable by a coach since nutrition targets were built, with
// nothing anywhere able to log against it. The goal was real and permanently unmet.
describe("water is logged one drink at a time", () => {
  beforeEach(resetDatabase);

  it("sums the day's drinks and returns them alongside the food log", async () => {
    const athlete = await makeAthlete();
    await storage.addWaterLogEntry(athlete.id, { date: DATE, amountOz: 16 });
    await storage.addWaterLogEntry(athlete.id, { date: DATE, amountOz: 24 });

    const day = await storage.getFoodLogForDate(athlete.id, DATE);
    expect(day.waterOz).toBe(40);
    expect(day.water).toHaveLength(2);
  });

  it("removes one drink without touching the rest", async () => {
    const athlete = await makeAthlete();
    const first = await storage.addWaterLogEntry(athlete.id, { date: DATE, amountOz: 32 });
    await storage.addWaterLogEntry(athlete.id, { date: DATE, amountOz: 8 });

    expect(await storage.deleteWaterLogEntry(athlete.id, first.id)).toBe(true);
    expect((await storage.getFoodLogForDate(athlete.id, DATE)).waterOz).toBe(8);
  });

  it("will not let one athlete delete another's water", async () => {
    const mine = await makeAthlete();
    const theirs = await makeAthlete();
    const entry = await storage.addWaterLogEntry(theirs.id, { date: DATE, amountOz: 16 });

    expect(await storage.deleteWaterLogEntry(mine.id, entry.id)).toBe(false);
    expect((await storage.getFoodLogForDate(theirs.id, DATE)).waterOz).toBe(16);
  });

  it("keeps days apart", async () => {
    const athlete = await makeAthlete();
    await storage.addWaterLogEntry(athlete.id, { date: DATE, amountOz: 16 });
    await storage.addWaterLogEntry(athlete.id, { date: "2026-09-09", amountOz: 64 });

    expect((await storage.getFoodLogForDate(athlete.id, DATE)).waterOz).toBe(16);
  });
});
