/**
 * AN ATHLETE'S SKELETON DOES NOT CHANGE BETWEEN TAKES, SO IT IS A RULER THEY CARRY WITH THEM.
 *
 * The scale problem in one sentence: the camera needs to know how many metres a pixel is worth,
 * and everything it can ask is unreliable. A plate needs a detector that finds one. Height needs
 * the whole body in frame, which a bench filmed from the foot of the bench never gives. Shoulder
 * breadth is a population average that varied by a third on one athlete across five takes.
 *
 * But an athlete's upper arm is the same length today as last week. So the FIRST time a take has
 * a trustworthy ruler -- a plate measured in frame, or the gravity ruler off a flat jump -- that
 * take's limb measurements are in real metres, and they stay true forever. Every later take of
 * that athlete, at any angle, with no plate and no full body in shot, can be scaled from a limb
 * it can see.
 *
 * This is the athlete-to-athlete learning: the more somebody films, the better their own
 * skeleton is known, and the less the pipeline has to guess.
 *
 * THE MAXIMUM, NOT THE MEAN, AND THE REASON IS THE SAME ONE AS EVERYWHERE ELSE HERE.
 *
 * A limb seen at an angle measures SHORT. It can never measure long. So across hundreds of
 * frames the largest reading is the one closest to square-on, and it is the true length; a mean
 * sits among the foreshortened readings and reports a limb shorter than the athlete's, which
 * inflates metres-per-pixel and every distance downstream. Vision's z is the least trustworthy
 * axis it produces, which is exactly why this measures in the image plane and lets
 * foreshortening be the thing the maximum defeats, rather than trying to correct for depth.
 *
 * A high percentile rather than the literal maximum, because one landmark that flew off the
 * athlete would otherwise define a bone.
 *
 * ONLY FROM A CONFIDENT RULER. A limb learned from a take whose own scale was a guess is a guess
 * wearing a number, and it would then propagate to every future take as though it were measured.
 * That is the one way this feature can make things WORSE than not having it, so the gate is
 * strict and the confidence travels with the estimate.
 */

export const LIMB_SPAN_PERCENTILE = 0.95;

/** Enough frames that the percentile describes the take rather than a handful of reads. */
export const MIN_LIMB_SAMPLES = 30;

/** Which rulers are trusted enough to teach a bone. Both are independent of the body: a plate is
 *  an object of known size, and gravity is gravity. A body-derived scale is deliberately absent
 *  -- learning a limb from a scale that was itself derived from a limb is circular. */
export const RULERS_THAT_MAY_TEACH_A_LIMB = ["plate", "gravity", "grip_width"] as const;

export type LimbKey =
  | "upperArm"
  | "forearm"
  | "torso"
  | "femur"
  | "shin"
  | "shoulderWidth"
  | "gripWidth";

export type LimbEstimate = {
  metres: number;
  /** How many takes have contributed. More takes, more confidence. */
  takes: number;
  /** The spread across those takes, as a fraction. A limb that keeps changing was never
   *  measured -- it is the scale that moved. */
  spreadFraction: number;
  /** Which rulers taught it, so an estimate can be traced back rather than trusted blindly. */
  sources: string[];
};

export type AthleteBodyModel = Partial<Record<LimbKey, LimbEstimate>>;

/** A limb whose estimates disagree by more than this across takes has not converged, and using
 *  it as a ruler would launder that disagreement into a confident-looking number. */
export const LIMB_CONVERGED_MAX_SPREAD = 0.08;

export function limbHasConverged(estimate: LimbEstimate | undefined): boolean {
  // Two takes cannot establish a spread -- either one is equally the outlier.
  return (
    estimate != null && estimate.takes >= 3 && estimate.spreadFraction <= LIMB_CONVERGED_MAX_SPREAD
  );
}

/** Folds one take's limb measurements into what is already known.
 *
 *  Median across takes rather than a running mean: a single take whose ruler was wrong in a way
 *  the gate did not catch should not permanently shift a bone, and a median lets it be outvoted
 *  as more takes arrive. */
export function foldLimbMeasurement(
  existing: LimbEstimate | undefined,
  metresThisTake: number,
  source: string,
  history: number[],
): LimbEstimate {
  const all = [...history, metresThisTake].filter((m) => Number.isFinite(m) && m > 0);
  const sorted = [...all].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mad = [...all.map((m) => Math.abs(m - median))].sort((a, b) => a - b)[
    Math.floor(all.length / 2)
  ];
  return {
    metres: Math.round(median * 10000) / 10000,
    takes: all.length,
    spreadFraction: median > 0 ? Math.round((mad / median) * 1000) / 1000 : 1,
    sources: [...new Set([...(existing?.sources ?? []), source])],
  };
}

/** The scale a known limb gives on a take that can see it. The inverse of the problem: we know
 *  the metres, the frame gives the pixels. */
export function scaleFromKnownLimb(
  estimate: LimbEstimate | undefined,
  measuredSpanUnits: number | null,
): { scale: number; uncertaintyFraction: number } | null {
  if (!limbHasConverged(estimate)) return null;
  if (!measuredSpanUnits || !(measuredSpanUnits > 0)) return null;
  return {
    scale: estimate!.metres / measuredSpanUnits,
    // The limb's own spread IS the uncertainty -- there is no separate number to invent, and
    // pretending to one would be the population-average mistake again in new clothes.
    uncertaintyFraction: Math.max(0.02, estimate!.spreadFraction),
  };
}
