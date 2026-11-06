/**
 * ITEMS 6 AND 7: WHAT EACH PART REPORTS, AND HOW MUCH IT COUNTS.
 *
 * Both were measured the same way, on the two axes that overturned mean 1/RT on 2026-11-05:
 * SEPARATION under a real shift, and DAMAGE from one ordinary distraction, in units of the
 * metric's own rested spread. A metric that separates well and moves half a flag when a dog barks
 * is not usable on an unsupervised phone in a locker room. `tools/anvil-sim/items367.py`.
 *
 * **THE TWO ITEMS LANDED ON OPPOSITE AGGREGATORS AND THE REASON IS THE SAME ONE.** Part 1's
 * headline is a MEDIAN because a disturbed reaction-time trial is always LATE -- the error is
 * one-sided high, so a max would be catastrophic and a mean nearly so. Part 4 reports the BEST of
 * three because a disturbed tapping trial is always LOW -- the error is one-sided in the other
 * direction, so the max is the robust choice and the mean is the fragile one. Same argument, read
 * off the direction of the metric rather than off a habit.
 */

/**
 * ITEM 6: PART 1 CARRIES TWO NUMBERS, AND THE SECOND IS A PER-PERSON LAPSE COUNT.
 *
 * The headline stays the median, for the measured reason recorded on 2026-11-05. The second number
 * is the count of trials in the tail, where the tail is defined against THIS ATHLETE's own
 * baseline -- never against the 355 ms the PVT literature uses, which is a number from a different
 * instrument and whose import this build already refused once.
 *
 * WHICH TAIL METRIC, measured over 24,000 draws of 25 ex-Gaussian trials:
 *
 *     metric                    separation (d)   1-trial damage   sep/damage
 *     lapses, own median+1.25s            2.64             0.44          6.0
 *     lapses, own median+1.5s             2.63             0.51          5.2
 *     lapses, own median+3.0s             2.39             1.15          2.1
 *     lapses, 2.0x own median             1.16             6.96          0.2
 *     slowest-10% mean                    2.23             3.76          0.6
 *
 * **The slowest-10% mean is the obvious tail metric and it is the mean-1/RT mistake again**: good
 * separation, and one distracted trial moves it nearly four of its own standard deviations.
 *
 * WHY 1.25 AND NOT LOWER, WHICH THE RATIO ALONE WOULD ARGUE FOR. Separation rises to a plateau at
 * k = 1.25 (2.44 at 0.75, 2.54 at 1.0, **2.64 at 1.25**, and flat from there), while damage rises
 * monotonically with k. So the rule is: the LOWEST k at which separation is at its plateau. Below
 * it the metric both separates worse and stops being a tail at all -- at k = 0.75 the baseline
 * athlete already lapses on 6.9 trials of 25, which is a second median wearing a tail's clothes.
 * At 1.25 it is 4.3 of 25.
 */
export const LAPSE_THRESHOLD_SIGMAS = 1.25;

/**
 * A trial is a lapse if it is this far above the athlete's OWN baseline median, in their OWN
 * robust sigma. Pure; the baseline is passed in, never read from a clock or a store.
 */
export function lapseThresholdFor(baselineMedianMs: number, baselineSigmaMs: number): number {
  return baselineMedianMs + LAPSE_THRESHOLD_SIGMAS * baselineSigmaMs;
}

export function countLapses(trialsMs: readonly number[], thresholdMs: number): number {
  return trialsMs.reduce((n, t) => (t > thresholdMs ? n + 1 : n), 0);
}

/**
 * ITEM 7: PART 4 TAKES THREE TRIALS, REPORTS THE BEST, AND HAS THE LOWEST WEIGHT.
 *
 * Measured over 30,000 simulated days, with a between-day effect and within-day trial noise:
 *
 *     reported            between-day CV   damage, one fumbled trial   CV/damage
 *     one trial                    5.47%                        3.66        1.49
 *     mean of three                4.81%                        1.39        3.47
 *     median of three              4.93%                        0.35       14.25
 *     best of three                5.01%                        0.16       31.10
 *
 * **Three trials buy almost nothing on noise -- half a percentage point -- because between-day
 * variation dominates within-day variation.** What they buy is robustness: the best of three is
 * 23 times less disturbed by a fumble than a single trial, because a fumble can only ever make a
 * maximal-effort count LOWER. That is the whole case for three trials, and it is not the case the
 * decision list assumed.
 */
export const TAPPING_TRIALS = 3;

/** Of three maximal-effort trials, the best is the robust one. See the table above. */
export function reportedTapCount(trials: readonly number[]): number | null {
  const valid = trials.filter((t) => Number.isFinite(t) && t > 0);
  return valid.length ? Math.max(...valid) : null;
}

/**
 * THE DEAD BAND IS A MULTIPLE OF THE ATHLETE'S OWN DAY-TO-DAY SPREAD, NOT A FIXED 6%.
 *
 * The decision list proposed +/-6%. Measured against a MODELLED between-day effect the simulation
 * assumes rather than one anybody has observed, best-of-three lands at 5.0% and +/-6% is about
 * 1.2 of those standard deviations -- which is where this number comes from and is the whole of its
 * provenance. **Nobody has measured a real athlete's day-to-day tapping spread**, so a fixed 6%
 * would be a constant fitted to a simulation's own assumption. Rule #5.
 *
 * So the band is 1.2x the athlete's OWN measured between-day CV once there is one, and
 * `TAPPING_DEAD_BAND_PLACEHOLDER` until then, marked as a placeholder so it cannot be mistaken for
 * a measurement on the day somebody greps for it.
 */
export const TAPPING_DEAD_BAND_SIGMAS = 1.2;
export const TAPPING_DEAD_BAND_PLACEHOLDER = 0.06;

export function tappingDeadBand(ownBetweenDayCv: number | null): {
  band: number;
  measured: boolean;
} {
  return ownBetweenDayCv != null && ownBetweenDayCv > 0
    ? { band: TAPPING_DEAD_BAND_SIGMAS * ownBetweenDayCv, measured: true }
    : { band: TAPPING_DEAD_BAND_PLACEHOLDER, measured: false };
}

/** A move inside the dead band is not a move. */
export function tappingMoved(
  today: number,
  baseline: number,
  ownBetweenDayCv: number | null,
): boolean {
  if (!(baseline > 0)) return false;
  return Math.abs(today / baseline - 1) > tappingDeadBand(ownBetweenDayCv).band;
}

/**
 * RELATIVE WEIGHTS, AND WHY THEY ARE ORDINAL RATHER THAN FITTED.
 *
 * Decision-list item 7 says part 4 carries the LOWEST weight. These are an ORDER, not a
 * calibration: not one of them has been fitted against an outcome, because no athlete has taken
 * this check. Rule #5 -- the ordering is what the evidence supports and a decimal would be an
 * invention. The ordering itself is read straight off the 2026-11-06 pass: part 1 is
 * practice-resistant and carries the measured headline; part 3 has a flat practice curve but a
 * coarse integer output that ceilings; part 4 is contaminated by touchscreen practice and its
 * evenness metric has already been deleted; part 2 has an output quantized into 20-point steps and
 * a practice curve that had not plateaued at three weeks.
 */
export const PART_WEIGHT_ORDER = [
  "reaction_time",
  "sequence_span",
  "tapping",
  "go_no_go",
] as const;
