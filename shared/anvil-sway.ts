/**
 * ITEM 11: SINGLE-LEG MEDIO-LATERAL SWAY -- THE MEASUREMENT, PROTOTYPED AHEAD OF THE TASK.
 *
 * The 2026-11-06 pass asked for this to be prototyped BEFORE any further cognitive task, and the
 * reason is the one thing the Anvil is short of: the four games are four readings of the same
 * system through the same sensor -- a finger on a touchscreen. Three of them inherit the same
 * touchscreen practice curve and the same distraction hazard. Postural sway is read off the CAMERA,
 * which is a sensor Forge already has, pointed at a system the games cannot see.
 *
 * It is also the only candidate in that pass with a plausible claim to being a PEER rather than a
 * fifth opinion from the same witness -- Rule #2's argument, in the Anvil's own terms: a signal
 * judged by a measurement it had no hand in producing.
 *
 * **WHAT IS PROTOTYPED HERE IS THE MEASUREMENT, NOT THE TASK.** The arithmetic below is standard
 * posturography computed from a trace Forge's pose pipeline already produces, and it needs no
 * published constant, no reference cohort and no device to be correct. What it does NOT have is a
 * threshold, a norm, or one minute of real footage. Nothing here decides anything.
 *
 * **MEDIO-LATERAL ONLY, ON PURPOSE.** Side-to-side displacement of the hip over a planted foot is
 * the axis that is in the image plane for the camera angle an athlete actually films from, and it
 * is the axis Forge's own camera notes name as measurable; anterior-posterior sway is on the
 * estimated depth axis, "the least reliable number the tracker produces". Measuring one axis well
 * beats two badly, and this is the same argument the bar work settled years of confusion with.
 */

/** One sample of the hip's horizontal position, in whatever unit the trace carries. */
export type SwaySample = { readonly tSeconds: number; readonly xUnits: number };

export type SwayMeasure = {
  /** Root-mean-square displacement about the mean position. The headline. */
  readonly rms: number;
  /** Total path travelled per second. Picks up fast correction that RMS averages away. */
  readonly meanVelocity: number;
  /** The widest excursion, kept because a single large correction is its own event. */
  readonly range: number;
  readonly samples: number;
  readonly seconds: number;
  /** Sample-rate honesty, the same measure every capture mode already reports. */
  readonly effectiveHz: number;
  readonly largestGapSeconds: number;
};

export type SwayResult = { readonly measure: SwayMeasure } | { readonly absent: SwayAbsence };

export type SwayAbsence =
  | "too_few_samples"
  | "too_short"
  | "sampling_too_sparse"
  | "trace_has_a_hole";

/** Below this a sway measure is reading noise rather than posture. */
export const MIN_SWAY_SAMPLES = 60;
export const MIN_SWAY_SECONDS = 8;
/** A hole longer than this means the athlete left the frame, which is not a steady stand. */
export const MAX_SWAY_GAP_SECONDS = 0.5;
export const MIN_SWAY_HZ = 10;

/**
 * **THE SCALE IS DELIBERATELY NOT APPLIED HERE AND THAT IS THE OPEN HALF.** These come back in
 * TRACE UNITS. Turning them into centimetres needs the same scale blend every camera number
 * needs, and the camera section's own rule applies: a number corroborated by one ruler is an
 * assertion. A sway measure is ALSO usable unscaled, against the athlete's own earlier readings
 * at the same framing, which is what the fast channel does with everything else -- so the
 * unscaled number is a real signal today and the scaled one is work.
 */
export function measureSway(samples: readonly SwaySample[]): SwayResult {
  const xs = samples
    .filter((s) => Number.isFinite(s.tSeconds) && Number.isFinite(s.xUnits))
    .slice()
    .sort((a, b) => a.tSeconds - b.tSeconds);
  if (xs.length < MIN_SWAY_SAMPLES) return { absent: "too_few_samples" };

  const seconds = xs[xs.length - 1].tSeconds - xs[0].tSeconds;
  if (seconds < MIN_SWAY_SECONDS) return { absent: "too_short" };

  let largestGap = 0;
  let path = 0;
  for (let i = 1; i < xs.length; i++) {
    largestGap = Math.max(largestGap, xs[i].tSeconds - xs[i - 1].tSeconds);
    path += Math.abs(xs[i].xUnits - xs[i - 1].xUnits);
  }
  if (largestGap > MAX_SWAY_GAP_SECONDS) return { absent: "trace_has_a_hole" };

  const effectiveHz = (xs.length - 1) / seconds;
  if (effectiveHz < MIN_SWAY_HZ) return { absent: "sampling_too_sparse" };

  const mean = xs.reduce((a, s) => a + s.xUnits, 0) / xs.length;
  const rms = Math.sqrt(xs.reduce((a, s) => a + (s.xUnits - mean) ** 2, 0) / xs.length);
  const lo = Math.min(...xs.map((s) => s.xUnits));
  const hi = Math.max(...xs.map((s) => s.xUnits));

  return {
    measure: {
      rms,
      meanVelocity: path / seconds,
      range: hi - lo,
      samples: xs.length,
      seconds,
      effectiveHz,
      largestGapSeconds: largestGap,
    },
  };
}

/**
 * **NOT A THRESHOLD AND NOT A SCORE.** Declared so that the absence of one is a recorded fact
 * rather than an oversight, in the shape `FITTED_OVERRIDES` and `NOT_PUBLIC_ON_PURPOSE` already
 * use: the machinery exists, the list is empty, and adding to it costs a sentence somebody greps.
 */
export const SWAY_THRESHOLDS_FITTED: ReadonlyArray<never> = [];
