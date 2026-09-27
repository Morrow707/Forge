/**
 * GRAVITY IS THE ONE RULER NOBODY HAS TO MEASURE, BUY OR REMEMBER.
 *
 * Every other scale source in this pipeline needs something: a detector to find a plate, a whole
 * body in frame, a population average, or the athlete to go and find a tape measure. Anything in
 * free flight needs none of them. It obeys 9.81 m/s^2 everywhere, and flight TIME is measured in
 * frames, which carry no scale at all.
 *
 * So a jump produces two heights that should be the same number:
 *
 *   - From flight time:   h = g*t^2/8. Scale-FREE. Frames and gravity, nothing else.
 *   - From displacement:  how far the ankle trace actually moved, in metres. Scale-DEPENDENT.
 *
 * Their ratio is a direct measurement of how wrong the take's real-world scale is, with no
 * sensor, no tape and no reference object anywhere in the room. One jump is one calibration
 * point, and every box jump ever filmed already contains one.
 *
 * THE CORRECTION THE IDEA NEEDS, WHICH IS NOT OPTIONAL.
 *
 * h = g*t^2/8 is derived from a SYMMETRIC parabola -- half the flight up, half down. It is only
 * scale-free when the athlete lands where they took off. jump-tracking.ts already knows this and
 * generalises the formula with the net rise, which is exactly right for reporting a box jump's
 * height -- and exactly wrong here, because that generalisation feeds the trace's own
 * scale-dependent netRise back in. The result is no longer independent of the thing it is
 * supposed to be measuring, and a ruler that borrows from what it is checking measures nothing.
 *
 * So a gravity reading is emitted ONLY for a flat jump: takeoff and landing within a few
 * centimetres of each other. A box jump is refused as a RULER while still being reported as a
 * jump -- the set keeps every number it had (RULE #1), this simply declines to draw a
 * calibration conclusion from it.
 *
 * FRAME RATE DECIDES WHETHER THIS IS WORTH ANYTHING. Height goes with the SQUARE of time, so a
 * one-frame error on takeoff or landing is doubled in the answer. At 120fps that is about 3% on
 * a half-second flight, so roughly 6% on height -- usable. At 30fps it is around 13% and 26%,
 * which is not a ruler, it is a rumour. The reading carries its own uncertainty so a caller can
 * weigh it rather than having to know this.
 */

export const GRAVITY_MPS2 = 9.81;

/** Takeoff and landing must agree within this to call a jump flat. Three centimetres is inside
 *  the ankle-landmark noise on a good take and far under any real box. */
export const FLAT_JUMP_TOLERANCE_CM = 3;

/** Below this there is not enough air for the timing to mean anything: a 10cm hop at 120fps is
 *  a handful of frames and the square makes the error enormous. */
export const MIN_GRAVITY_FLIGHT_SECONDS = 0.25;

export type GravityReading = {
  /** g*t^2/8, in centimetres. Depends on nothing but frames and gravity. */
  flightHeightCm: number;
  /** What the trace said, in centimetres. This is the number carrying the scale. */
  displacementHeightCm: number;
  /** displacement / flight. 1.0 means the take's scale is right. 1.45 means every distance in
   *  that take is 45% too big, and so is every velocity and every watt derived from it. */
  scaleErrorRatio: number;
  /** Propagated from the frame interval, since height goes with the square of time. */
  uncertaintyFraction: number;
  flightSeconds: number;
};

export function gravityReadingFromJump(input: {
  flightSeconds: number;
  displacementHeightCm: number;
  /** Net rise from takeoff to landing, centimetres. Non-zero means a box, and no reading. */
  netRiseCm: number;
  /** The capture's real frame interval, seconds. This is what decides whether the answer is
   *  worth having. */
  frameIntervalSeconds: number;
}): GravityReading | null {
  const { flightSeconds, displacementHeightCm, netRiseCm, frameIntervalSeconds } = input;
  if (!(flightSeconds >= MIN_GRAVITY_FLIGHT_SECONDS)) return null;
  if (!(displacementHeightCm > 0)) return null;
  // A box jump, a depth jump, or a landing the tracker placed somewhere other than the ground.
  // Any of those break the symmetry the formula rests on.
  if (!(Math.abs(netRiseCm) <= FLAT_JUMP_TOLERANCE_CM)) return null;

  const flightHeightCm = ((GRAVITY_MPS2 * flightSeconds * flightSeconds) / 8) * 100;
  if (!(flightHeightCm > 0)) return null;

  // One frame of error at each end, and the square doubles the fractional error.
  const uncertaintyFraction = Math.min(1, (2 * frameIntervalSeconds) / flightSeconds);

  return {
    flightHeightCm: Math.round(flightHeightCm * 10) / 10,
    displacementHeightCm: Math.round(displacementHeightCm * 10) / 10,
    scaleErrorRatio: Math.round((displacementHeightCm / flightHeightCm) * 1000) / 1000,
    uncertaintyFraction: Math.round(uncertaintyFraction * 1000) / 1000,
    flightSeconds: Math.round(flightSeconds * 1000) / 1000,
  };
}

/** The set's verdict: the median of every usable rep, because one mistimed landing should not
 *  speak for a set, and the reps of a jump set are the same movement repeated. */
export function gravityVerdictForSet(readings: GravityReading[]): {
  scaleErrorRatio: number;
  uncertaintyFraction: number;
  repsUsed: number;
} | null {
  if (readings.length === 0) return null;
  const mid = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  return {
    scaleErrorRatio: Math.round(mid(readings.map((r) => r.scaleErrorRatio)) * 1000) / 1000,
    // The MEDIAN uncertainty, not the best one. Several agreeing reps do narrow the answer, but
    // claiming a square-root-of-n narrowing would be pretending these are independent draws --
    // they share a tracker, a framing and a frame rate, and their errors move together.
    uncertaintyFraction: Math.round(mid(readings.map((r) => r.uncertaintyFraction)) * 1000) / 1000,
    repsUsed: readings.length,
  };
}
