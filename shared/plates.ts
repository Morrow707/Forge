export type WeightUnit = "lbs" | "kg";

// Standard gym plate denominations, largest first -- matches what's
// actually on a rack, so the breakdown below is always loadable.
const PLATE_SET: Record<WeightUnit, number[]> = {
  lbs: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};

export const DEFAULT_BAR_WEIGHT: Record<WeightUnit, number> = {
  lbs: 45,
  kg: 20,
};

// Smallest real jump a barbell can move in -- one pair of the smallest
// plate, one on each side.
const MIN_INCREMENT: Record<WeightUnit, number> = {
  lbs: 5,
  kg: 2.5,
};

export function roundToLoadable(weight: number, unit: WeightUnit): number {
  const step = MIN_INCREMENT[unit];
  return Math.round(weight / step) * step;
}

export type PlateBreakdown = {
  plates: number[];
  perSideWeight: number;
  achievedWeight: number;
  exact: boolean;
};

// Plates needed on ONE side of the bar to hit `targetWeight`, loaded
// largest-first the way every lifter actually does it. When the target
// isn't hittable exactly with this plate set, returns the closest
// achievable weight instead of a fractional plate.
export function calculatePlateBreakdown(
  targetWeight: number,
  unit: WeightUnit,
  barWeight: number = DEFAULT_BAR_WEIGHT[unit],
): PlateBreakdown {
  const perSideNeeded = Math.max(0, (targetWeight - barWeight) / 2);
  const plates: number[] = [];
  let remaining = perSideNeeded;
  for (const plate of PLATE_SET[unit]) {
    while (remaining + 1e-9 >= plate) {
      plates.push(plate);
      remaining -= plate;
    }
  }
  const perSideWeight = plates.reduce((sum, p) => sum + p, 0);
  const achievedWeight = barWeight + perSideWeight * 2;
  return {
    plates,
    perSideWeight,
    achievedWeight,
    exact: Math.abs(achievedWeight - targetWeight) < 0.01,
  };
}

export type WarmupStep = { label: string; weight: number; reps: string };

// Standard ascending ramp before a work set: empty bar, then 40/60/80% of
// the work weight, each rounded to something actually loadable. Skips any
// step that would land at or below the bar itself (light work weights).
export function buildWarmupRamp(
  workWeight: number,
  unit: WeightUnit,
  barWeight: number = DEFAULT_BAR_WEIGHT[unit],
): WarmupStep[] {
  const steps: WarmupStep[] = [{ label: "Bar", weight: barWeight, reps: "8-10" }];
  const ramp: { pct: number; reps: string }[] = [
    { pct: 0.4, reps: "5" },
    { pct: 0.6, reps: "3" },
    { pct: 0.8, reps: "2" },
  ];
  for (const { pct, reps } of ramp) {
    const rounded = roundToLoadable(workWeight * pct, unit);
    if (rounded <= barWeight) continue;
    steps.push({ label: `${Math.round(pct * 100)}%`, weight: rounded, reps });
  }
  return steps;
}
