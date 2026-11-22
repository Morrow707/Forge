import { describe, expect, it } from "vitest";
import { MAX_CARE_SUGGESTIONS, MIN_CARE_SUGGESTIONS, dayJointLoad, suggestCareDrills } from "./care-drills";

/**
 * "Add care drills" (Scott, 2026-11-22): two to four joint-care drills for the joints a day loads
 * most, then the program's sport and positions. Never filtered by age. A
 * proposal only; the builder adds nothing without the coach's tap.
 */
const ROWS = [
  { name: "Back Squat", muscleGroup: "Quads" },
  { name: "Walking Lunge", muscleGroup: "Quads", joints: ["knee"] },
  { name: "Bench Press", muscleGroup: "Chest" },
  { name: "Spanish Squat Hold", joints: ["knee"], purposes: ["care"] },
  { name: "Copenhagen Plank", joints: ["hip"], purposes: ["care"], sports: ["Soccer"] },
  { name: "Band Pull-Apart", joints: ["shoulder"], purposes: ["care"], positions: ["pitcher"] },
  { name: "Depth Drop Landing", joints: ["knee", "ankle"], purposes: ["care"] },
  { name: "Wrist Circles", joints: ["wrist"], purposes: ["warmup"] },
  { name: "Neck Isometrics", joints: ["neck"], purposes: ["care"] },
];
const LIB = ROWS.map((row, at) => ({ ...row, id: at + 1 }));
const byName = (name: string) => LIB.find((e) => e.name === name)!;
const onDay = (name: string) => {
  const ex = byName(name);
  return { exerciseId: ex.id, name: ex.name, muscleGroup: ex.muscleGroup, joints: ex.joints };
};
const legDay = [onDay("Back Squat"), onDay("Walking Lunge")];
const names = (r: ReturnType<typeof suggestCareDrills>) => r.suggestions.map((s) => s.exercise.name);

describe("care drill suggestions", () => {
  it("reads a day's joints from its tags, or from muscle groups when an exercise has none", () => {
    const load = dayJointLoad(legDay);
    expect(load[0]).toMatchObject({ joint: "knee", count: legDay.length });
    expect(load.find((l) => l.joint === "hip")?.names).toEqual(["Back Squat"]);
  });

  it("puts drills for the joints the day loads most first, and names the joint, never a weakness", () => {
    const r = suggestCareDrills(legDay, LIB);
    expect(names(r).slice(0, MIN_CARE_SUGGESTIONS)).toEqual(["Depth Drop Landing", "Spanish Squat Hold"]);
    expect(r.suggestions[0].reason).toBe("Knee: today's Back Squat and Walking Lunge load it.");
    r.suggestions.forEach((s) => expect(s.reason.toLowerCase()).not.toContain("weak"));
  });

  it("only ever offers drills tagged care, never a warm-up or an ordinary lift", () => {
    const r = suggestCareDrills(legDay, LIB);
    expect(names(r)).not.toContain("Wrist Circles");
    expect(names(r)).not.toContain("Back Squat");
  });

  it("the program's sport and positions break the tie for a day that loads nothing tagged", () => {
    const r = suggestCareDrills([onDay("Bench Press")], LIB, { sport: "Baseball", positions: ["pitcher"] });
    expect(names(r)[0]).toBe("Band Pull-Apart");
  });

  it("returns between two and four, and never a drill already on the day", () => {
    const r = suggestCareDrills(legDay, LIB);
    expect(r.suggestions.length).toBeGreaterThanOrEqual(MIN_CARE_SUGGESTIONS);
    expect(r.suggestions.length).toBeLessThanOrEqual(MAX_CARE_SUGGESTIONS);
    expect(names(suggestCareDrills([...legDay, onDay("Spanish Squat Hold")], LIB))).not.toContain("Spanish Squat Hold");
  });

  it("says so when the library has no care drills tagged at all", () => {
    const r = suggestCareDrills(legDay, LIB.filter((e) => !(e.purposes ?? []).includes("care")));
    expect(r).toEqual({ suggestions: [], noneTagged: true });
  });

  it("an empty day still offers care drills from the library", () => {
    expect(suggestCareDrills([], LIB).suggestions).toHaveLength(MIN_CARE_SUGGESTIONS);
  });
});
