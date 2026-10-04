import { describe, expect, it } from "vitest";
import { classCategoryMatchesSport } from "./class-sport-match";
import { FORGE_CLASSES } from "../server/seed-data/forge-classes";

describe("classCategoryMatchesSport", () => {
  it("matches a class to the athlete's sport by name and by the alias table", () => {
    expect(classCategoryMatchesSport("Basketball", "Basketball")).toBe(true);
    expect(classCategoryMatchesSport("basketball", "BASKETBALL ")).toBe(true);
    expect(classCategoryMatchesSport("Pitching", "Baseball")).toBe(true);
    expect(classCategoryMatchesSport("Pitching", "Softball")).toBe(true);
    expect(classCategoryMatchesSport("Track", "Track & Field")).toBe(true);
    expect(classCategoryMatchesSport("Football", "Soccer")).toBe(false);
    expect(classCategoryMatchesSport("Volleyball", "Baseball")).toBe(false);
    expect(classCategoryMatchesSport(null, "Baseball")).toBe(false);
    expect(classCategoryMatchesSport("Baseball", null)).toBe(false);
  });

  it("reaches every repo-written class from at least one sport in the suggestions list", () => {
    // A class nobody's sport reaches would never be labelled, which is the silent kind of miss.
    const sports = ["Football", "Basketball", "Baseball", "Softball", "Soccer", "Volleyball", "Wrestling", "Track & Field"];
    // Fundamentals is for every athlete and belongs to no sport, which is the one allowed miss.
    for (const cls of FORGE_CLASSES.filter((c) => c.category !== "Fundamentals")) {
      expect(sports.some((s) => classCategoryMatchesSport(cls.category, s)), `${cls.name} (${cls.category})`).toBe(true);
    }
  });
});
