// Rolls up the fine-grained muscle-group vocabulary already used by
// exercises.muscleGroup / secondaryMuscles into the smaller set of visual
// regions the body-map SVG actually renders -- several data-level names
// (Back/Lats/Traps, or Hips/Hip Flexors) share one drawn patch since a
// coach scanning a heat map cares about "upper back" as a whole, not a
// literal traps-vs-lats split.
export const MUSCLE_GROUP_TO_REGION: Record<string, string> = {
  Neck: "neck",
  Shoulders: "shoulders",
  Chest: "chest",
  Back: "upperBack",
  Lats: "upperBack",
  Traps: "upperBack",
  "Lower Back": "lowerBack",
  Biceps: "biceps",
  Triceps: "triceps",
  Forearms: "forearms",
  Abs: "abs",
  Core: "abs",
  Obliques: "obliques",
  Glutes: "glutes",
  Hips: "hips",
  "Hip Flexors": "hips",
  Adductors: "adductors",
  Quads: "quads",
  Hamstrings: "hamstrings",
  Calves: "calves",
  Ankle: "calves",
  // "Full Body" deliberately has no region -- it doesn't tell you which
  // specific muscle was hit, so it's excluded rather than guessed at.
};

export const MUSCLE_REGIONS = [
  "neck",
  "shoulders",
  "chest",
  "upperBack",
  "lowerBack",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "obliques",
  "glutes",
  "hips",
  "adductors",
  "quads",
  "hamstrings",
  "calves",
] as const;
export type MuscleRegion = (typeof MUSCLE_REGIONS)[number];

export const MUSCLE_REGION_LABEL: Record<MuscleRegion, string> = {
  neck: "Neck",
  shoulders: "Shoulders",
  chest: "Chest",
  upperBack: "Upper Back",
  lowerBack: "Lower Back",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  obliques: "Obliques",
  glutes: "Glutes",
  hips: "Hips",
  adductors: "Adductors",
  quads: "Quads",
  hamstrings: "Hamstrings",
  calves: "Calves",
};

export type MuscleLoadByRegion = Partial<Record<MuscleRegion, number>>;

// rawByGroup keys are exercises.muscleGroup/secondaryMuscles strings (see
// getMuscleLoadForAthlete) -- weighted set counts, primary muscle worth
// more than an exercise that only hits it secondarily.
export function rollUpMuscleLoad(rawByGroup: Record<string, number>): MuscleLoadByRegion {
  const byRegion: MuscleLoadByRegion = {};
  for (const [group, count] of Object.entries(rawByGroup)) {
    const region = MUSCLE_GROUP_TO_REGION[group] as MuscleRegion | undefined;
    if (!region) continue;
    byRegion[region] = (byRegion[region] ?? 0) + count;
  }
  return byRegion;
}

// 0 (no load relative to this athlete's own busiest region) reads as cool
// blue, 1 (their busiest region) as hot orange-red -- interpolated in HSL
// so the ramp looks continuous rather than jumping between named colors.
// Intentionally relative-to-self, not an absolute volume scale: a Free
// Agent training twice a week and a daily-training athlete should each see
// their own real hot/cold spots, not one washed out next to the other.
export function muscleHeatColor(intensity: number): string {
  const t = Math.max(0, Math.min(1, intensity));
  const hue = 210 - t * 210;
  return `hsl(${hue}, 70%, ${55 - t * 10}%)`;
}
