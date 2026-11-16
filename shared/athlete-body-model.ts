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
export const RULERS_THAT_MAY_TEACH_A_LIMB = ["plate", "gravity", "grip_width", "consensus"] as const;

/* THE FOURTH TEACHER, "consensus", AND A MODEL PER LIFT (2026-11-16). Scott: "it should learn my
 * height and my limb length and continue to get more accurate not starting over each week" and
 * "Don't do shin only, do them all, what if a shin is hidden? ... what happens when we're doing a
 * bench? Or a row?"
 *
 * The three teachers above had never taught anything: no take in the corpus was scaled by a plate
 * alone, so users.bodyModel was empty on every account and every take worked its scale out cold.
 * "consensus" is a take on which two or more of the OTHER rulers agreed (the stored model itself
 * never among them, so a bone is never learned from its own echo).
 *
 * PER LIFT, EVERY BONE. A bone's apparent length is steady within one lift and different between
 * lifts (this athlete's upper arm reads 0.289-0.295m on every squat and 0.34-0.37m on every RDL;
 * the shin 0.42-0.46m standing and 0.55-0.74m lying on a bench), because what is measured is the
 * bone as that lift shows it to the camera. So the model is kept per exercise
 * (bodyModel.byLift[name]), every bone the take can see is learned, and on a later take of that
 * lift every remembered bone that is visible gives a scale and the MIDDLE of them is the model's
 * reading -- a hidden shin leaves the forearms and the torso to answer.
 *
 * IT RECORDS ON EVERY TAKE AND VOTES ONLY WHERE IT HAS EARNED IT. Measured before shipping on the
 * 22 sensor-paired takes that carry bone spans:
 *  - taught by the phone's own scales in the order it met the takes, it made the 11-16 RDL worse
 *    (+2.0 -> +7.0%: its teachers were the 11-09 takes, one of them 25% off) and a dumbbell press
 *    worse (+10 -> +20%), and one bench better (-4.8 -> -0.1%);
 *  - taught by the scale the SENSOR requires (the best a teacher can be), it reads Pendlay row
 *    8.1 -> 4.0% and dumbbell press 15.3 -> 6.7% on average, squat and RDL about level
 *    (2.0 -> 2.4, 3.1 -> 3.2), barbell press worse (4.1 -> 5.9).
 * So a remembered body caps the bad takes and does not by itself reach the sensor, and a model
 * taught by bad takes repeats them. The all-sets rule (shared/lift-standing.ts) therefore applies:
 * the model's reading is written into every take's diagnostics (calibration.bodyModel) with what
 * it would have read, and it joins the blend only on a lift named in
 * LIFTS_WHERE_THE_BODY_MODEL_VOTES, which a lift enters when its recorded readings sit closer to
 * the sensor than the blend did across that lift's sets. */
export const LIFTS_WHERE_THE_BODY_MODEL_VOTES: readonly string[] = [];

/** The model's stated uncertainty never goes under this. The stored bone may be steady to 2%,
 *  but the take still has to MEASURE the same bone in pixels, and that reading is the noisy half. */
export const BODY_MODEL_UNCERTAINTY_FLOOR = 0.08;

export type BodyModelReading = {
  scale: number;
  uncertaintyFraction: number;
  /** Each remembered, visible bone's own scale on this take. */
  limbs: Partial<Record<LimbKey, number>>;
  limbsVoting: number;
};

/** What the athlete's remembered bones say this take's scale is: the middle of every converged,
 *  visible bone's scale, with their own disagreement as the uncertainty. Null with none. */
export function readBodyModel(
  model: AthleteBodyModel | null | undefined,
  spansUnits: Partial<Record<LimbKey, number>>,
): BodyModelReading | null {
  if (!model) return null;
  const limbs: Partial<Record<LimbKey, number>> = {};
  for (const [key, span] of Object.entries(spansUnits) as [LimbKey, number][]) {
    const one = scaleFromKnownLimb(model[key], span);
    if (one) limbs[key] = one.scale;
  }
  const scales = Object.values(limbs).sort((a, b) => a - b);
  if (scales.length === 0) return null;
  const mid = scales[Math.floor(scales.length / 2)];
  const mad = scales.map((v) => Math.abs(v - mid)).sort((a, b) => a - b)[Math.floor(scales.length / 2)];
  return {
    scale: mid,
    uncertaintyFraction: Math.max(BODY_MODEL_UNCERTAINTY_FLOOR, mid > 0 ? mad / mid : 1),
    limbs,
    limbsVoting: scales.length,
  };
}

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
/** The stored column: the bones per lift (see byLift above), beside the older flat estimates. */
export type StoredBodyModel = AthleteBodyModel & { byLift?: Record<string, AthleteBodyModel> };

/** A limb whose estimates disagree by more than this across takes has not converged, and using
 *  it as a ruler would launder that disagreement into a confident-looking number. */
export const LIMB_CONVERGED_MAX_SPREAD = 0.08;

/** The lengths a human bone, grip or shoulder span can actually have, in metres. A reading
 *  outside this is a unit error, not a skeleton (the 2026-11-16 teaching bug stored 0.002-0.006m),
 *  so it is never learned, and one already stored is dropped from the history at the next fold. */
export const LIMB_METRES_PLAUSIBLE = { min: 0.08, max: 1.3 } as const;

export function limbLengthIsPlausible(metres: number): boolean {
  return Number.isFinite(metres) && metres >= LIMB_METRES_PLAUSIBLE.min && metres <= LIMB_METRES_PLAUSIBLE.max;
}

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
  const all = [...history, metresThisTake].filter(limbLengthIsPlausible);
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
    uncertaintyFraction: Math.max(BODY_MODEL_UNCERTAINTY_FLOOR, estimate!.spreadFraction),
  };
}
