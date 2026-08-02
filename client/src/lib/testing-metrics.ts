// Shared between the per-athlete testing history dialog and the coach's
// team trends chart so both list the exact same metrics in the same order.

export const TESTING_METRICS = [
  { key: "fortyYardDash", label: "40-Yard Dash", unit: "sec" },
  { key: "proAgilitySeconds", label: "Pro Agility", unit: "sec" },
  { key: "verticalJumpIn", label: "Vertical Jump", unit: "in" },
  { key: "broadJumpIn", label: "Broad Jump", unit: "in" },
  { key: "benchMaxLbs", label: "Bench Max", unit: "lbs" },
  { key: "squatMaxLbs", label: "Squat Max", unit: "lbs" },
  { key: "deadliftMaxLbs", label: "Deadlift Max", unit: "lbs" },
] as const;

export type TestingMetricKey = (typeof TESTING_METRICS)[number]["key"];

export function testingMetricLabel(key: string) {
  return TESTING_METRICS.find((m) => m.key === key)?.label ?? key;
}

export function testingMetricUnit(key: string) {
  return TESTING_METRICS.find((m) => m.key === key)?.unit ?? "";
}
