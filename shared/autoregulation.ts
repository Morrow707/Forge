import type { ReadinessLevel } from "./wellness";

/**
 * AUTOREGULATION FOR A FREE AGENT'S OWN TRAINING, FROM TODAY'S READINESS (added 2026-10-15).
 *
 * Scott, on the competitor list ("Fitbod and RP adjust next week's load from what you did"):
 * "lets have it auto regulate for the free agent classes, not the athletes as they are
 * controlled by the coach." So this applies to an athlete with NO coach and to nobody else --
 * a coached athlete's numbers are the coach's prescription and this file never touches them.
 * The server attaches it only on that branch (storage.getWorkoutDayDetail), and the test pins
 * the gate.
 *
 * WHAT IT IS: today's check-in (shared/wellness.ts computeReadiness, the 0-100 score every
 * Free Agent already fills in) overlaid on the per-lift RPE rule that has existed since the
 * workout screen was written (storage.suggestNextLoad, "felt easy last time, try 5% more").
 * That rule looks backwards at ONE session; this looks at how the athlete is TODAY. Both are
 * suggestions with a one-tap Use button. Nothing rewrites the program and nothing is applied
 * silently -- the athlete decides, the same way the existing suggestion works.
 *
 * WHAT IT IS NOT: a model. Three readiness bands and two RPE bands, with the factors stated
 * here in the open so they can be argued about. They are deliberately conservative -- an
 * autoregulator that adds load is only ever right about adding 2.5%, and one that removes it
 * is allowed to remove more, because a bad day under a bar costs more than a good day
 * under-loaded. No camera number is read here (every camera number is uncalibrated).
 *
 * NO CHECK-IN TODAY MEANS NO SUGGESTION. Guessing a readiness is worse than saying nothing,
 * and "check in to get today's suggestion" is the honest nudge toward the one input this
 * runs on.
 */

export type AutoregulationInput = {
  /** Today's readiness, or null when there is no check-in today. */
  readiness: { score: number; level: ReadinessLevel } | null;
  /** The RPE the athlete logged the last time they did this lift, if any. */
  lastRpe: number | null;
  /** The working weight they used that time, in their own unit; null for bodyweight, band, box. */
  lastWeight: number | null;
};

export type Autoregulation = {
  /** Multiplier on the last working weight. 1 means repeat it. */
  factor: number;
  /** The one sentence the athlete reads. */
  text: string;
  /** What Use fills in, rounded to the nearest 2.5; null when there is no numeric load. */
  suggestedWeight: number | null;
  /** Which rule fired, for the report and the test, never shown. */
  rule: "red" | "yellow" | "green_easy" | "green_hard" | "green_maxed" | "green_no_rpe";
};

export const AUTOREGULATION_FACTORS = {
  /** Red readiness: take 10% off and keep the reps. */
  red: 0.9,
  /** Yellow: 5% off. */
  yellow: 0.95,
  /** Green and last time felt easy (RPE <= 7): add 2.5%. */
  greenEasy: 1.025,
  /** Green and last time was hard (RPE 8-9): repeat it. */
  greenHard: 1,
  /** Green and last time was a 10: 5% off anyway, a 10 is not a working weight. */
  greenMaxed: 0.95,
} as const;

const roundToPlate = (n: number) => Math.round(n / 2.5) * 2.5;

export function autoregulateLoad(input: AutoregulationInput): Autoregulation | null {
  const { readiness, lastRpe, lastWeight } = input;
  if (!readiness) return null;
  const hasWeight = lastWeight != null && Number.isFinite(lastWeight) && lastWeight > 0;
  const fill = (factor: number) => (hasWeight ? roundToPlate(lastWeight! * factor) : null);
  const at = (factor: number) => (hasWeight ? ` to ${fill(factor)}` : "");

  if (readiness.level === "red") {
    const factor = AUTOREGULATION_FACTORS.red;
    return {
      factor,
      rule: "red",
      text: `Readiness is ${readiness.score} today. Take 10% off${at(factor)} and keep the reps.`,
      suggestedWeight: fill(factor),
    };
  }
  if (readiness.level === "yellow") {
    const factor = AUTOREGULATION_FACTORS.yellow;
    return {
      factor,
      rule: "yellow",
      text: `Readiness is ${readiness.score} today. Take 5% off${at(factor)}.`,
      suggestedWeight: fill(factor),
    };
  }
  // Green.
  if (lastRpe == null) {
    return {
      factor: 1,
      rule: "green_no_rpe",
      text: `Readiness is ${readiness.score} today. Log an RPE this session and tomorrow's suggestion gets sharper.`,
      suggestedWeight: null,
    };
  }
  if (lastRpe <= 7) {
    const factor = AUTOREGULATION_FACTORS.greenEasy;
    return {
      factor,
      rule: "green_easy",
      text: `Readiness is ${readiness.score} and last time felt easy. Add 2.5%${at(factor)}.`,
      suggestedWeight: fill(factor),
    };
  }
  if (lastRpe <= 9) {
    return {
      factor: AUTOREGULATION_FACTORS.greenHard,
      rule: "green_hard",
      text: `Readiness is ${readiness.score}. Last time was hard work, so repeat it${hasWeight ? ` at ${lastWeight}` : ""}.`,
      suggestedWeight: hasWeight ? lastWeight! : null,
    };
  }
  const factor = AUTOREGULATION_FACTORS.greenMaxed;
  return {
    factor,
    rule: "green_maxed",
    text: `Readiness is ${readiness.score}, but last time was a 10. Back off 5%${at(factor)} and own the reps.`,
    suggestedWeight: fill(factor),
  };
}
