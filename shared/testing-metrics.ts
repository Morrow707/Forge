// Shared between the per-athlete testing history dialog, the coach's team
// trends chart, and goal-achievement checks, so all three agree on the same
// metrics, units, and which direction counts as "better" (a faster 40 time
// is an improvement, but a smaller vertical jump isn't).

export const TESTING_METRICS = [
  { key: "fortyYardDash", label: "40-Yard Dash", unit: "sec", lowerIsBetter: true },
  { key: "proAgilitySeconds", label: "Pro Agility", unit: "sec", lowerIsBetter: true },
  { key: "threeConeSeconds", label: "3-Cone / L-Drill", unit: "sec", lowerIsBetter: true },
  { key: "verticalJumpIn", label: "Vertical Jump", unit: "in", lowerIsBetter: false },
  { key: "broadJumpIn", label: "Broad Jump", unit: "in", lowerIsBetter: false },
  { key: "benchMaxLbs", label: "Bench Max", unit: "lbs", lowerIsBetter: false },
  { key: "squatMaxLbs", label: "Squat Max", unit: "lbs", lowerIsBetter: false },
  { key: "deadliftMaxLbs", label: "Deadlift Max", unit: "lbs", lowerIsBetter: false },
] as const;

export type TestingMetricKey = (typeof TESTING_METRICS)[number]["key"];

export function testingMetricLabel(key: string) {
  return TESTING_METRICS.find((m) => m.key === key)?.label ?? key;
}

export function testingMetricUnit(key: string) {
  return TESTING_METRICS.find((m) => m.key === key)?.unit ?? "";
}

export function testingMetricLowerIsBetter(key: string) {
  return TESTING_METRICS.find((m) => m.key === key)?.lowerIsBetter ?? false;
}
