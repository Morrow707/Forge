// Coarse browsing taxonomy for the exercise picker's accordion filter --
// deliberately NOT a new schema field. Every exercise already carries
// movementType/bodyRegion/movementComplexity/category (see exercise-
// taxonomy.ts and the exercises table in shared/schema.ts); this just
// groups those into the handful of buckets a coach actually thinks in
// ("upper push day", "legs") when scanning a 200+ exercise library, so
// adding a new exercise never requires touching this file or the DB.
//
// Order matters: getExerciseFamily checks top-to-bottom and returns on the
// first match, so an exercise that could plausibly fit two buckets (e.g. a
// Combination exercise that also happens to have a Lower Body bodyRegion)
// lands in the more specific/intentional one (Combination) rather than the
// generic one (Legs).
export const EXERCISE_FAMILIES = [
  "Upper Push",
  "Upper Pull",
  "Lower Push",
  "Lower Pull",
  "Legs",
  "Core",
  "Combination",
  "Mobility & Activation",
  "Conditioning",
] as const;

export type ExerciseFamily = (typeof EXERCISE_FAMILIES)[number];

type FamilyInput = {
  category: string;
  movementType?: string | null;
  bodyRegion?: string | null;
  movementComplexity?: string | null;
};

export function getExerciseFamily(ex: FamilyInput): ExerciseFamily {
  // Checked BEFORE category: every seeded Combination-complexity exercise
  // is also tagged category "conditioning" (elevated heart rate, time-
  // crunched intent -- see COMBINATION_EXERCISE_TRAINING_PRINCIPLES in
  // storage.ts), so checking category first would silently swallow the
  // entire Combination bucket into Conditioning and leave the button this
  // family exists for permanently empty.
  if (ex.movementComplexity === "Combination") return "Combination";
  if (ex.category === "conditioning") return "Conditioning";
  if (ex.movementType === "Mobility" || ex.movementType === "Activation") {
    return "Mobility & Activation";
  }
  if (ex.bodyRegion === "Core" || ex.movementType === "Rotation") return "Core";
  if (ex.movementType === "Push" || ex.movementType === "Press") {
    // A handful of Press-pattern exercises (leg press) are tagged Lower
    // Body -- those belong with squats, not bench/overhead work.
    return ex.bodyRegion === "Lower Body" ? "Lower Push" : "Upper Push";
  }
  if (ex.movementType === "Pull") return "Upper Pull";
  if (ex.movementType === "Squat") return "Lower Push";
  if (ex.movementType === "Hinge") return "Lower Pull";
  if (ex.movementType === "Lunge" || ex.movementType === "Carry") return "Legs";
  if (ex.bodyRegion === "Lower Body") return "Legs";
  // Last resort (unset movementType, or an Isometric hold with no clearer
  // signal) -- Core is the safest generic bucket rather than leaving an
  // exercise unreachable from every family button.
  return "Core";
}

// Fixed canonical order for the equipment sub-filter grid, rendered
// identically under every family -- the whole point is that "Barbell"
// occupies the same grid cell whether you're browsing Upper Push or Legs,
// so switching families doesn't make you re-scan for where a button moved
// to. Equipment absent from the currently open family gets disabled in
// place, never hidden or reordered, to preserve that guarantee.
export const EQUIPMENT_ORDER = [
  "Bodyweight",
  "Dumbbell",
  "Barbell",
  "Machine",
  "Cable",
  "Band",
  "Kettlebell",
  "Medicine Ball",
  "Trap Bar",
  "EZ-Bar",
  "Bench",
  "Foam Roller",
  "Rope",
  "Jump Rope",
  // Added with the 231->413 library expansion's Conditioning bucket and a
  // handful of Strength/Accessory variants -- appended after the original
  // 14 rather than interleaved, so every equipment button that already
  // existed keeps the exact same grid position it always had.
  "Plate",
  "Landmine",
  "Sled",
  "Sandbag",
  "Battle Rope",
  "Tire",
  "Assault Bike",
  "Ski Erg",
  "Agility Ladder",
  "Cones",
] as const;

