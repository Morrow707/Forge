import { describe, it, expect } from "vitest";
import { isExerciseRiskyForPainParts, BODY_PAIN_TO_MUSCLE_GROUPS } from "./injury-matching";
import { BODY_PAIN_PARTS } from "./wellness";

const exercise = (over: Partial<Parameters<typeof isExerciseRiskyForPainParts>[0]> = {}) => ({
  muscleGroup: "Chest",
  ...over,
});

describe("no pain flagged", () => {
  it("clears every exercise when the pain map is empty", () => {
    expect(isExerciseRiskyForPainParts(exercise(), [])).toBe(false);
  });

  it("ignores a pain part it has no mapping for rather than throwing", () => {
    expect(isExerciseRiskyForPainParts(exercise(), ["left_pinky"])).toBe(false);
    expect(isExerciseRiskyForPainParts(exercise(), ["", "not_a_part"])).toBe(false);
  });
});

describe("primary muscle group matching", () => {
  it("flags a chest press against a sore shoulder", () => {
    expect(isExerciseRiskyForPainParts(exercise({ muscleGroup: "Chest" }), ["shoulder_left"])).toBe(true);
  });

  it("clears a calf raise against a sore shoulder", () => {
    expect(isExerciseRiskyForPainParts(exercise({ muscleGroup: "Calves" }), ["shoulder_left"])).toBe(false);
  });

  it("flags the exact muscle group the pain maps to", () => {
    expect(isExerciseRiskyForPainParts(exercise({ muscleGroup: "Forearms" }), ["wrist_left"])).toBe(true);
  });

  it("treats left and right of the same joint identically", () => {
    const ex = exercise({ muscleGroup: "Quads" });
    expect(isExerciseRiskyForPainParts(ex, ["knee_left"])).toBe(true);
    expect(isExerciseRiskyForPainParts(ex, ["knee_right"])).toBe(true);
  });

  it("matches muscle group names exactly, not case-insensitively", () => {
    expect(isExerciseRiskyForPainParts(exercise({ muscleGroup: "forearms" }), ["wrist_left"])).toBe(false);
  });
});

describe("secondary muscle matching", () => {
  it("flags an exercise whose secondary muscle is at risk even when the primary is not", () => {
    const ex = exercise({ muscleGroup: "Calves", secondaryMuscles: ["Forearms"] });
    expect(isExerciseRiskyForPainParts(ex, ["wrist_left"])).toBe(true);
  });

  it("handles a null or absent secondary list", () => {
    expect(isExerciseRiskyForPainParts(exercise({ muscleGroup: "Calves", secondaryMuscles: null }), ["wrist_left"])).toBe(false);
    expect(isExerciseRiskyForPainParts(exercise({ muscleGroup: "Calves" }), ["wrist_left"])).toBe(false);
  });

  it("handles an empty secondary list", () => {
    expect(isExerciseRiskyForPainParts(exercise({ muscleGroup: "Calves", secondaryMuscles: [] }), ["wrist_left"])).toBe(false);
  });
});

describe("movement pattern matching", () => {
  it("flags a bench press for a sore shoulder through the press pattern, not its Chest tag", () => {
    // Chest is already in the shoulder's muscle list, so use a tag that is
    // not, to isolate the movement-type rule.
    const ex = exercise({ muscleGroup: "Calves", movementType: "Press" });
    expect(isExerciseRiskyForPainParts(ex, ["shoulder_left"])).toBe(true);
  });

  it("flags a squat pattern for a sore knee", () => {
    expect(isExerciseRiskyForPainParts(exercise({ muscleGroup: "Abs", movementType: "Squat" }), ["knee_left"])).toBe(true);
  });

  it("flags a hinge for a sore lower back but not for a sore wrist", () => {
    const ex = exercise({ muscleGroup: "Abs", movementType: "Hinge" });
    expect(isExerciseRiskyForPainParts(ex, ["lower_back"])).toBe(true);
    expect(isExerciseRiskyForPainParts(ex, ["wrist_left"])).toBe(false);
  });

  it("flags a carry for a sore wrist", () => {
    expect(isExerciseRiskyForPainParts(exercise({ muscleGroup: "Abs", movementType: "Carry" }), ["wrist_left"])).toBe(true);
  });

  it("ignores a movement type with no rule against the flagged part", () => {
    expect(isExerciseRiskyForPainParts(exercise({ muscleGroup: "Abs", movementType: "Press" }), ["knee_left"])).toBe(false);
  });

  it("handles a null or absent movement type", () => {
    expect(isExerciseRiskyForPainParts(exercise({ muscleGroup: "Abs", movementType: null }), ["knee_left"])).toBe(false);
    expect(isExerciseRiskyForPainParts(exercise({ muscleGroup: "Abs" }), ["knee_left"])).toBe(false);
  });

  it("has no movement rule for parts a movement cannot load through a pattern", () => {
    expect(isExerciseRiskyForPainParts(exercise({ muscleGroup: "Abs", movementType: "Squat" }), ["neck"])).toBe(false);
  });
});

describe("plyometric landing risk", () => {
  const plyo = (muscleGroup: string) => exercise({ muscleGroup, category: "plyometric" });

  const landingParts = ["knee_left", "knee_right", "ankle_left", "ankle_right", "hip_left", "hip_right"];
  for (const part of landingParts) {
    it(`flags a plyometric for ${part} regardless of its muscle tag`, () => {
      expect(isExerciseRiskyForPainParts(plyo("Abs"), [part])).toBe(true);
    });
  }

  it("does not flag a plyometric for an upper-body part with no landing risk", () => {
    expect(isExerciseRiskyForPainParts(plyo("Abs"), ["neck"])).toBe(false);
    expect(isExerciseRiskyForPainParts(plyo("Abs"), ["wrist_left"])).toBe(false);
  });

  it("does not apply the landing rule to a non-plyometric", () => {
    expect(isExerciseRiskyForPainParts(exercise({ muscleGroup: "Abs", category: "strength" }), ["ankle_left"])).toBe(false);
    expect(isExerciseRiskyForPainParts(exercise({ muscleGroup: "Abs", category: null }), ["ankle_left"])).toBe(false);
  });
});

describe("multiple flagged parts", () => {
  it("flags as soon as any one part matches", () => {
    const ex = exercise({ muscleGroup: "Quads" });
    expect(isExerciseRiskyForPainParts(ex, ["neck", "wrist_left", "knee_left"])).toBe(true);
  });

  it("clears only when no part matches at all", () => {
    const ex = exercise({ muscleGroup: "Calves" });
    expect(isExerciseRiskyForPainParts(ex, ["neck", "wrist_left", "elbow_left"])).toBe(false);
  });
});

describe("the pain-to-muscle map itself", () => {
  it("covers every body pain part the check-in can flag", () => {
    for (const part of BODY_PAIN_PARTS) {
      expect(BODY_PAIN_TO_MUSCLE_GROUPS[part.key], `missing mapping for ${part.key}`).toBeDefined();
    }
  });

  it("maps no part to an empty list, which would silently never flag anything", () => {
    for (const [part, groups] of Object.entries(BODY_PAIN_TO_MUSCLE_GROUPS)) {
      expect(groups.length, `${part} maps to nothing`).toBeGreaterThan(0);
    }
  });

  it("maps left and right of a paired joint to the same muscle groups", () => {
    const paired = ["shoulder", "elbow", "wrist", "hip", "knee", "ankle"] as const;
    for (const joint of paired) {
      expect(BODY_PAIN_TO_MUSCLE_GROUPS[`${joint}_left`]).toEqual(BODY_PAIN_TO_MUSCLE_GROUPS[`${joint}_right`]);
    }
  });

  it("lists no duplicate muscle group within a single part", () => {
    for (const [part, groups] of Object.entries(BODY_PAIN_TO_MUSCLE_GROUPS)) {
      expect(new Set(groups).size, `${part} repeats a muscle group`).toBe(groups.length);
    }
  });
});
