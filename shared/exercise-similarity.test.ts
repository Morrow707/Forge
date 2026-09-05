import { describe, it, expect } from "vitest";
import {
  normalizeExerciseName,
  nameSimilarity,
  namesAreSimilar,
  findSimilar,
  SIMILAR_NAME_THRESHOLD,
} from "./exercise-similarity";

describe("normalizeExerciseName", () => {
  it("expands the abbreviations coaches actually type", () => {
    expect(normalizeExerciseName("Flat BB Bench")).toBe("flat barbell bench");
    expect(normalizeExerciseName("DB Row")).toBe("dumbbell row");
    expect(normalizeExerciseName("1 Arm KB Press")).toBe("single arm kettlebell press");
  });

  it("strips punctuation and filler without losing the movement", () => {
    expect(normalizeExerciseName("Bench Press (Flat) - Barbell")).toBe("bench press flat barbell");
    // Singularised, so "Farmer's Carry", "Farmers Carry" and "Farmer Carry" all agree.
    expect(normalizeExerciseName("Farmer's Carry")).toBe("farmer carry");
    expect(normalizeExerciseName("Farmers Carry")).toBe("farmer carry");
  });

  it("keeps a word that legitimately ends in s", () => {
    expect(normalizeExerciseName("Bench Press")).toBe("bench press");
    expect(normalizeExerciseName("Bench Presses")).toBe("bench press");
  });

  it("agrees across unicode dashes and apostrophes", () => {
    expect(normalizeExerciseName("Farmer’s Carry")).toBe(normalizeExerciseName("Farmer's Carry"));
    expect(normalizeExerciseName("Push—Up")).toBe(normalizeExerciseName("Push-Up"));
  });
});

describe("nameSimilarity", () => {
  // The case exact matching misses: a coach re-typing a library lift in their own words.
  it.each([
    ["Bench Press", "Barbell Bench Press (Flat)"],
    ["Bench Press", "Bench Press - Barbell"],
    ["Bench Press", "Flat BB Bench Press"],
    ["Romanian Deadlift", "RDL"],
    ["Bulgarian Split Squat", "Bulgarian Split Squats"],
    ["Single-Arm Dumbbell Row", "1 Arm DB Row"],
  ])("flags %s and %s as the same movement", (a, b) => {
    expect(namesAreSimilar(a, b)).toBe(true);
  });

  // The failure that would make the page useless: flagging every lift that shares a word.
  it.each([
    ["Back Squat", "Front Squat"],
    ["Back Squat", "Squat Jump"],
    ["Overhead Press", "Bench Press"],
    ["Bent-Over Row", "Upright Row"],
    ["Power Clean", "Power Snatch"],
    ["Incline Bench Press", "Decline Bench Press"],
  ])("does not flag %s and %s, which are different lifts", (a, b) => {
    expect(namesAreSimilar(a, b)).toBe(false);
  });

  it("is symmetric and self-identical", () => {
    expect(nameSimilarity("Back Squat", "Back Squat")).toBe(1);
    expect(nameSimilarity("Bench Press", "Flat BB Bench")).toBeCloseTo(
      nameSimilarity("Flat BB Bench", "Bench Press"),
      10,
    );
  });

  it("scores an empty or punctuation-only name at zero rather than throwing", () => {
    expect(nameSimilarity("", "Back Squat")).toBe(0);
    expect(nameSimilarity("---", "Back Squat")).toBe(0);
  });
});

describe("findSimilar", () => {
  const library = [
    { id: 1, name: "Bench Press" },
    { id: 2, name: "Back Squat" },
    { id: 3, name: "Romanian Deadlift" },
    { id: 4, name: "Overhead Press" },
  ];

  it("finds the library lift a coach re-created, best first", () => {
    const matches = findSimilar({ id: 99, name: "Flat BB Bench Press" }, library);
    expect(matches[0].item.name).toBe("Bench Press");
    expect(matches[0].score).toBeGreaterThanOrEqual(SIMILAR_NAME_THRESHOLD);
  });

  it("returns nothing for a genuinely new movement", () => {
    expect(findSimilar({ id: 99, name: "Sled Rope Pull" }, library)).toEqual([]);
  });

  it("never matches an item against itself", () => {
    expect(findSimilar({ id: 1, name: "Bench Press" }, library)).toEqual([]);
  });

  it("caps how many it returns so one generic name cannot flood the page", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: i + 10, name: `Bench Press ${i}` }));
    expect(findSimilar({ id: 1, name: "Bench Press" }, many, 5)).toHaveLength(5);
  });
});
