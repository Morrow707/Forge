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

export const READINESS_LABEL: Record<ReadinessLevel, string> = {
  green: "Fresh",
  yellow: "Managing",
  red: "Flagged",
};

// Sleep is scored on the same 1-5 scale as soreness/stress so the three can
// be averaged directly; soreness and stress are inverted first since a lower
// raw value there (less sore, less stressed) means better readiness.
export function computeReadiness(c: { sleepHours: number; soreness: number; stress: number }): {
  score: number;
  level: ReadinessLevel;
} {
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
  const score = (sleepScore + sorenessScore + stressScore) / 3;
  const level: ReadinessLevel = score >= 4 ? "green" : score >= 2.5 ? "yellow" : "red";
  return { score, level };
}
