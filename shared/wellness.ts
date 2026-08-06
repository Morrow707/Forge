export type ReadinessLevel = "green" | "yellow" | "red";

export const SORENESS_SCALE = [
  { value: 1, label: "None" },
  { value: 2, label: "Mild" },
  { value: 3, label: "Moderate" },
  { value: 4, label: "Sore" },
  { value: 5, label: "Very sore" },
];

export const STRESS_SCALE = [
  { value: 1, label: "Calm" },
  { value: 2, label: "Mild" },
  { value: 3, label: "Moderate" },
  { value: 4, label: "Stressed" },
  { value: 5, label: "Very stressed" },
];

// Higher is better on both of these, unlike soreness/stress above -- kept as
// separate scales (not a shared "1-5, higher good" helper) so each one's
// labels read naturally on its own.
export const HYDRATION_SCALE = [
  { value: 1, label: "Dehydrated" },
  { value: 2, label: "Below average" },
  { value: 3, label: "Average" },
  { value: 4, label: "Well hydrated" },
  { value: 5, label: "Excellent" },
];

export const MENTAL_FOCUS_SCALE = [
  { value: 1, label: "Scattered" },
  { value: 2, label: "Distracted" },
  { value: 3, label: "Average" },
  { value: 4, label: "Focused" },
  { value: 5, label: "Locked in" },
];

export const READINESS_LABEL: Record<ReadinessLevel, string> = {
  green: "Fresh",
  yellow: "Managing",
  red: "Flagged",
};

// Grouped loosely top-to-bottom; only used to render the expanded check-in's
// pain map, never the collapsed summary -- an athlete's coach sees whether
// something hurts (via the resulting readiness score and any AI note), not
// which exact joint, unless they open the full history.
export const BODY_PAIN_PARTS = [
  { key: "neck", label: "Neck" },
  { key: "shoulder_left", label: "L Shoulder" },
  { key: "shoulder_right", label: "R Shoulder" },
  { key: "elbow_left", label: "L Elbow" },
  { key: "elbow_right", label: "R Elbow" },
  { key: "wrist_left", label: "L Wrist" },
  { key: "wrist_right", label: "R Wrist" },
  { key: "upper_back", label: "Upper Back" },
  { key: "lower_back", label: "Lower Back" },
  { key: "core", label: "Core" },
  { key: "hip_left", label: "L Hip" },
  { key: "hip_right", label: "R Hip" },
  { key: "knee_left", label: "L Knee" },
  { key: "knee_right", label: "R Knee" },
  { key: "ankle_left", label: "L Ankle" },
  { key: "ankle_right", label: "R Ankle" },
] as const;

export type BodyPainPart = (typeof BODY_PAIN_PARTS)[number]["key"];

// A 0-100 score built from five 1-5 inputs (sleep is bucketed onto the same
// scale as the rest so nothing dominates the average), then nudged down for
// any flagged pain spot -- a few points per spot, capped, since the pain map
// is corroborating evidence for a low score rather than an equally-weighted
// sixth input. Soreness and stress are inverted first (a lower raw value
// there means better readiness); hydration and mental focus already run
// low-to-high the same direction as the final score.
export function computeReadiness(c: {
  sleepHours: number;
  soreness: number;
  stress: number;
  hydration: number;
  mentalFocus: number;
  bodyPainMap?: string[] | null;
}): { score: number; level: ReadinessLevel } {
  const sleepScore =
    c.sleepHours >= 8
      ? 5
      : c.sleepHours >= 7
        ? 4
        : c.sleepHours >= 6
          ? 3
          : c.sleepHours >= 5
            ? 2
            : 1;
  const sorenessScore = 6 - c.soreness;
  const stressScore = 6 - c.stress;
  const avg = (sleepScore + sorenessScore + stressScore + c.hydration + c.mentalFocus) / 5;
  const base100 = ((avg - 1) / 4) * 100;
  const painPenalty = Math.min((c.bodyPainMap?.length ?? 0) * 4, 20);
  const score = Math.max(0, Math.min(100, Math.round(base100 - painPenalty)));
  const level: ReadinessLevel = score >= 70 ? "green" : score >= 40 ? "yellow" : "red";
  return { score, level };
}
