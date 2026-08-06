import type { BodyPainPart } from "./wellness";

// Which muscle groups (exercises.muscleGroup / secondaryMuscles values) a
// flagged pain spot puts at risk -- deliberately generous (a "L Shoulder"
// flag also flags Chest/Triceps/Back, since pressing and pulling both load
// the shoulder joint) since the cost of over-flagging is one extra AI-picked
// alternative, while under-flagging means recommending an exercise that
// re-aggravates the same spot.
export const BODY_PAIN_TO_MUSCLE_GROUPS: Record<BodyPainPart, string[]> = {
  neck: ["Neck", "Shoulders", "Traps"],
  shoulder_left: ["Shoulders", "Chest", "Triceps", "Back", "Lats"],
  shoulder_right: ["Shoulders", "Chest", "Triceps", "Back", "Lats"],
  elbow_left: ["Triceps", "Biceps", "Forearms"],
  elbow_right: ["Triceps", "Biceps", "Forearms"],
  wrist_left: ["Forearms"],
  wrist_right: ["Forearms"],
  upper_back: ["Back", "Lats", "Traps", "Shoulders"],
  lower_back: ["Lower Back", "Back", "Glutes", "Hamstrings"],
  core: ["Abs", "Core", "Obliques"],
  hip_left: ["Glutes", "Hips", "Adductors", "Hip Flexors"],
  hip_right: ["Glutes", "Hips", "Adductors", "Hip Flexors"],
  knee_left: ["Quads", "Hamstrings", "Calves", "Glutes"],
  knee_right: ["Quads", "Hamstrings", "Calves", "Glutes"],
  ankle_left: ["Calves"],
  ankle_right: ["Calves"],
};

// Movement patterns that load a flagged joint regardless of which muscle
// the exercise is tagged under -- a barbell bench press is tagged "Chest",
// not "Shoulder", but still loads a sore shoulder heavily through the press
// pattern itself.
const BODY_PAIN_TO_RISKY_MOVEMENT_TYPES: Partial<Record<BodyPainPart, string[]>> = {
  shoulder_left: ["Press", "Push", "Pull"],
  shoulder_right: ["Press", "Push", "Pull"],
  elbow_left: ["Press", "Push", "Pull"],
  elbow_right: ["Press", "Push", "Pull"],
  wrist_left: ["Press", "Push", "Pull", "Carry"],
  wrist_right: ["Press", "Push", "Pull", "Carry"],
  knee_left: ["Squat", "Lunge"],
  knee_right: ["Squat", "Lunge"],
  ankle_left: ["Squat", "Lunge"],
  ankle_right: ["Squat", "Lunge"],
  hip_left: ["Squat", "Hinge", "Lunge"],
  hip_right: ["Squat", "Hinge", "Lunge"],
  lower_back: ["Hinge", "Squat", "Carry"],
};

// A jump-tracked plyometric movement asks a lot of ankles/knees/hips on
// landing regardless of its muscleGroup tag.
const PLYOMETRIC_RISK_PARTS: BodyPainPart[] = [
  "knee_left",
  "knee_right",
  "ankle_left",
  "ankle_right",
  "hip_left",
  "hip_right",
];

export function isExerciseRiskyForPainParts(
  exercise: {
    muscleGroup: string;
    secondaryMuscles?: string[] | null;
    movementType?: string | null;
    category?: string | null;
  },
  painParts: string[],
): boolean {
  for (const part of painParts) {
    const key = part as BodyPainPart;
    const riskyMuscleGroups = BODY_PAIN_TO_MUSCLE_GROUPS[key];
    if (!riskyMuscleGroups) continue;
    if (riskyMuscleGroups.includes(exercise.muscleGroup)) return true;
    if (exercise.secondaryMuscles?.some((m) => riskyMuscleGroups.includes(m))) return true;

    const riskyMovementTypes = BODY_PAIN_TO_RISKY_MOVEMENT_TYPES[key];
    if (riskyMovementTypes && exercise.movementType && riskyMovementTypes.includes(exercise.movementType)) {
      return true;
    }
    if (exercise.category === "plyometric" && PLYOMETRIC_RISK_PARTS.includes(key)) return true;
  }
  return false;
}
