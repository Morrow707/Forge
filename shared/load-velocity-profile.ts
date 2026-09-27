/**
 * AN ATHLETE'S LOAD-VELOCITY PROFILE, AND THE ONE RULE THAT STOPS IT EATING ITSELF.
 *
 * Mean concentric velocity against load is close to linear for a given person on a given lift --
 * that is the entire basis of velocity-based training. Every set adds a point. After a handful,
 * the profile predicts the velocity at a load within a few percent, and strength moves by under
 * 5% a week, so a take reading 1.5x the profile at the same load is not a faster athlete. It is
 * a scale error of about 1.5.
 *
 * THE CIRCULARITY THAT WOULD MAKE THIS WORSE THAN USELESS.
 *
 * A profile built from camera numbers and then used to correct camera numbers corrects error
 * toward the average of the same error -- and then everything agrees with everything, the
 * contradiction flags go quiet, and a systematic bias becomes INVISIBLE. That is strictly worse
 * than the honest mess we have now, because today the pipeline at least says it disagrees with
 * itself on 18 of 24 takes.
 *
 * So a profile point is only admitted from a take with an INDEPENDENT ruler: a bar sensor, a
 * plate measured in frame, or the gravity ruler off a flat jump. A take scaled from shoulder
 * breadth teaches this nothing, however many of them there are. The profile is an anchored
 * instrument or it is a mirror.
 *
 * A profile also needs a SPREAD of loads. Somebody who benches 135 every week gives one point
 * and no line, and fitting a slope to that is arithmetic pretending to be knowledge.
 */

export const ANCHORED_SCALE_SOURCES = ["sensor", "plate", "gravity", "grip_width"] as const;
export type AnchoredScaleSource = (typeof ANCHORED_SCALE_SOURCES)[number];

export function scaleSourceIsAnchored(source: string | null | undefined): boolean {
  return (ANCHORED_SCALE_SOURCES as readonly string[]).includes(source ?? "");
}

export type ProfilePoint = {
  loadKg: number;
  meanVelocityMps: number;
  /** Which independent ruler made this point admissible. */
  source: AnchoredScaleSource;
  date: string;
};

export type LoadVelocityProfile = {
  /** Velocity at zero load, from the fit. */
  interceptMps: number;
  /** Change in velocity per kilogram. Negative for any real athlete. */
  slopeMpsPerKg: number;
  points: number;
  /** The load range the fit actually covers. Predicting outside it is extrapolation and the
   *  caller is told so rather than left to assume. */
  minLoadKg: number;
  maxLoadKg: number;
  /** Typical absolute residual, m/s. How far a point usually sits from the line. */
  residualMps: number;
};

/** Below this, a "line" is two points and a hope. */
export const MIN_PROFILE_POINTS = 4;
/** And they have to be spread: four points at the same load describe nothing. */
export const MIN_PROFILE_LOAD_SPREAD_KG = 10;

export function fitLoadVelocityProfile(points: ProfilePoint[]): LoadVelocityProfile | null {
  const usable = points.filter(
    (p) => Number.isFinite(p.loadKg) && Number.isFinite(p.meanVelocityMps) && p.loadKg > 0,
  );
  if (usable.length < MIN_PROFILE_POINTS) return null;
  const loads = usable.map((p) => p.loadKg);
  const minLoadKg = Math.min(...loads);
  const maxLoadKg = Math.max(...loads);
  if (maxLoadKg - minLoadKg < MIN_PROFILE_LOAD_SPREAD_KG) return null;

  const n = usable.length;
  const meanLoad = loads.reduce((a, b) => a + b, 0) / n;
  const meanVel = usable.reduce((a, p) => a + p.meanVelocityMps, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of usable) {
    num += (p.loadKg - meanLoad) * (p.meanVelocityMps - meanVel);
    den += (p.loadKg - meanLoad) ** 2;
  }
  if (!(den > 0)) return null;
  const slope = num / den;
  const intercept = meanVel - slope * meanLoad;

  const residuals = usable
    .map((p) => Math.abs(p.meanVelocityMps - (intercept + slope * p.loadKg)))
    .sort((a, b) => a - b);

  return {
    interceptMps: Math.round(intercept * 1000) / 1000,
    slopeMpsPerKg: Math.round(slope * 100000) / 100000,
    points: n,
    minLoadKg,
    maxLoadKg,
    residualMps: Math.round(residuals[Math.floor(residuals.length / 2)] * 1000) / 1000,
  };
}

/** What the profile expected, and how far this take is from it. A ratio far from 1 at a load
 *  inside the fitted range is a scale error, not an athlete having a good day.
 *
 *  NEVER CORRECTS ANYTHING. It returns the disagreement and lets a caller flag it. Silently
 *  rewriting a measured number toward a prediction is how a dataset stops being a record of what
 *  happened -- the camera still reports what it saw, with a caveat, which is rule #1's shape. */
export function compareTakeToProfile(
  profile: LoadVelocityProfile | null,
  loadKg: number,
  measuredMeanVelocityMps: number,
): { expectedMps: number; ratio: number; extrapolated: boolean } | null {
  if (!profile || !(loadKg > 0) || !(measuredMeanVelocityMps > 0)) return null;
  const expected = profile.interceptMps + profile.slopeMpsPerKg * loadKg;
  if (!(expected > 0)) return null;
  return {
    expectedMps: Math.round(expected * 1000) / 1000,
    ratio: Math.round((measuredMeanVelocityMps / expected) * 1000) / 1000,
    extrapolated: loadKg < profile.minLoadKg || loadKg > profile.maxLoadKg,
  };
}
