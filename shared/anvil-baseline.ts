/**
 * THE TWO BASELINE RULES THE 2026-11-06 RESEARCH PASS LEFT WITH NOWHERE TO LIVE: the scale
 * estimate's finite-sample bias, and the burn-in that keeps the practice curve out of an athlete's
 * normal. Decision-list items 4 and 13.
 *
 * Both are about the BASELINE rather than about a threshold, which is why they are here and not
 * wherever the flagging rule eventually lands: an athlete's own rolling window is the denominator
 * of every z-score the Anvil computes, so a biased or contaminated baseline moves every finding at
 * once and no threshold can compensate for it.
 *
 * NOTHING HERE IS A THRESHOLD AND NOTHING HERE FLAGS ANYTHING. Pure functions, no clock, no
 * athlete, no I/O -- the same posture as `shared/roster-hold.ts`. Rule #1's shape applied to a
 * baseline: a window too short to estimate from returns a STATED reason, never a silent number.
 */

/** The rolling window the fast channel scores against: the athlete's own last twenty checks. */
export const BASELINE_WINDOW = 20;

/**
 * The fewest checks that may produce a reading at all. Below this the athlete is told their normal
 * is still being learned -- which is what the card already says -- rather than handed a z-score
 * computed from four numbers.
 */
export const BASELINE_MIN_CHECKS = 10;

/**
 * ITEM 4: MAD/0.6745 IS AN ASYMPTOTIC IDENTITY AND THE ANVIL USES IT AT n = 20.
 *
 * 0.6745 is the normal distribution's MAD, so `MAD / 0.6745` recovers sigma for a Gaussian core --
 * in the limit. At a finite n the median absolute deviation of a sample is biased LOW, so the
 * estimate is biased low too, so every z-score computed against it is biased HIGH, so the Anvil
 * flags more often than its stated false-alarm rate. Measured, 400,000 draws per n, seeded, by
 * `tools/anvil-sim/madbias.py`:
 *
 *     n     mean estimated sigma   correction
 *     10          0.9121             1.0964
 *     14          0.9398             1.0641
 *     20          0.9587             1.0431
 *     25          0.9686             1.0324
 *     30          0.9738             1.0269
 *     60          0.9874             1.0128
 *    120          0.9939             1.0062
 *
 * **It is a TABLE and not a constant, because the window is not always full.** With the burn-in
 * below, an athlete's first scored check has a window of ten and the bias there is 9.6%, not 4.3%
 * -- and the first weeks are exactly when a new athlete is most likely to be flagged for nothing.
 * One constant fitted at n = 20 would be wrong in the direction that matters, at the time it
 * matters, which is this repo's own lesson about a number fitted on one lift reaching another.
 *
 * **The 2026-11-06 pass recorded 1.0420 at n = 20 from its own draw.** This table says 1.0431. That
 * is Monte-Carlo noise on the same quantity, not a correction to it, and the earlier figure is left
 * on the record so nobody reads the difference as a finding.
 *
 * This is a property of the ESTIMATOR, not of any movement or any task, so it is shared across
 * every channel. It is not a fitted number in Rule #5's sense -- no take and no athlete chose it.
 */
export const MAD_FINITE_SAMPLE_CORRECTION: ReadonlyArray<readonly [n: number, correction: number]> = [
  [10, 1.0964],
  [14, 1.0641],
  [20, 1.0431],
  [25, 1.0324],
  [30, 1.0269],
  [60, 1.0128],
  [120, 1.0062],
];

/** MAD -> sigma for a Gaussian core, before the finite-sample correction. */
export const MAD_TO_SIGMA = 1 / 0.6745;

/**
 * The correction to apply at this sample size. Linear between measured points; the smallest
 * measured n below it and 1.0 above the largest, since the bias vanishes asymptotically and
 * over-correcting a long window is the one direction that LOOSENS a guard silently.
 */
export function madCorrectionFor(n: number): number {
  const t = MAD_FINITE_SAMPLE_CORRECTION;
  if (!Number.isFinite(n) || n <= t[0][0]) return t[0][1];
  if (n >= t[t.length - 1][0]) return 1;
  for (let i = 1; i < t.length; i++) {
    const [n1, c1] = t[i];
    if (n <= n1) {
      const [n0, c0] = t[i - 1];
      return c0 + ((c1 - c0) * (n - n0)) / (n1 - n0);
    }
  }
  return 1;
}

/**
 * An unbiased robust sigma from a sample, or a stated reason. Rule #1's shape: a window too thin to
 * estimate from says so rather than returning a confident number from four readings.
 */
export function robustSigma(
  values: readonly number[],
): { sigma: number; n: number } | { absent: "too_few_checks" | "no_spread" } {
  const xs = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (xs.length < BASELINE_MIN_CHECKS) return { absent: "too_few_checks" };
  const med = median(xs);
  const mad = median(xs.map((v) => Math.abs(v - med)).sort((a, b) => a - b));
  if (mad <= 0) return { absent: "no_spread" };
  return { sigma: mad * MAD_TO_SIGMA * madCorrectionFor(xs.length), n: xs.length };
}

function median(sorted: readonly number[]): number {
  const n = sorted.length;
  const mid = n >> 1;
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * ITEM 13: BURN IN THE BASELINE -- AND IT IS PER TASK, NOT ONE WEEK FOR ALL FOUR.
 *
 * The decision list said "discard the first week of checks, or run one practice session before the
 * first recorded one". Implemented per task, because the evidence is per task and a single week
 * applied to all four would be both too much and too little:
 *
 *  - **Part 1, simple reaction time, 1 check.** The whole practice move is session 1 -> 2 and
 *    nothing after it: Del Rossi et al. 2014 (PMID 24673236) ran ten sessions over five weeks,
 *    264.9 -> 252.0 ms, with 7.2 ms of that between sessions 1 and 2 (p = .057) and **no
 *    differences among the last nine**; Woods et al. 2015 (PMID 26617505) found SRT differing
 *    **under 3 ms** across three weekly sessions. Their own recommendation is one practice session
 *    before a recorded baseline. **This is the headline, so this is the number that matters**, and
 *    a seven-check burn-in on it would cost two extra weeks before an athlete sees anything in
 *    exchange for a 3 ms effect.
 *  - **Part 3, sequence span, 1 check.** +2.4% and non-significant across three weekly sessions,
 *    attributed to re-randomizing the layout and the sequence every trial. That property is
 *    load-bearing and is why this number is 1 rather than 7 -- see `SEQUENCE_RERANDOMIZES_PER_TRIAL`.
 *  - **Part 4, tapping, 7 checks.** Touchscreen tapping is the bad case: +9.9 taps (5-12%) between
 *    two visits a week apart (Makai-Boloni et al. 2021), and a phone finger-movement test needed 94
 *    repetitions to reach 90% of its ceiling (Woelfle et al. 2021). Mechanical max-rate tapping is
 *    flat across ten weekly sessions (Gill et al. 1986) -- the touchscreen is what decides which
 *    world this is, and it is the bad one. Lowest weight in the check for this reason.
 *  - **Part 2, go/no-go, 21 checks, AND THAT IS A STATEMENT RATHER THAN A FIX.** The closest
 *    measured analogue fell 31-33 ms with omega_p2 = 0.24 across three weekly sessions and **had not
 *    plateaued**, with the gains largest on the hardest trials -- the ones carrying the inhibition
 *    signal, so practice eats the signal preferentially. Three weeks of checks is where its curve
 *    was still moving, not where it stops. Part 2 is HELD unchanged by Scott's decision of
 *    2026-11-06 pending a real test-retest, so this number records what the baseline has to throw
 *    away for it to mean anything, and it is deliberately uncomfortable.
 */
export const BASELINE_BURN_IN_CHECKS: Readonly<Record<AnvilPart, number>> = {
  reaction_time: 1,
  go_no_go: 21,
  sequence_span: 1,
  tapping: 7,
};

export type AnvilPart = "reaction_time" | "go_no_go" | "sequence_span" | "tapping";

/**
 * The checks a part's baseline may be built from: oldest first in, burn-in dropped, window capped.
 * Takes the list OLDEST FIRST, which is the order the burn-in is defined in -- handed newest-first
 * it would discard the most recent checks, which is the one mistake here that produces a
 * plausible-looking number from the wrong end of the series.
 */
export function baselineChecksFor<T>(part: AnvilPart, oldestFirst: readonly T[]): T[] {
  const after = oldestFirst.slice(BASELINE_BURN_IN_CHECKS[part]);
  return after.slice(Math.max(0, after.length - BASELINE_WINDOW));
}

/** Whether a part has enough post-burn-in checks to be scored at all. */
export function partIsScoreable(part: AnvilPart, totalChecks: number): boolean {
  return totalChecks - BASELINE_BURN_IN_CHECKS[part] >= BASELINE_MIN_CHECKS;
}

/**
 * ITEM 14: THE SEQUENCE TASK RE-RANDOMIZES EVERY TRIAL, AND IT IS THE REASON PART 3 HAS NO
 * PRACTICE CURVE.
 *
 * Declared here as a required property rather than left as an implementation detail, because it
 * reads exactly like one: a layout and a sequence generated fresh per trial looks like something to
 * memoize or to seed for reproducibility, and either "simplification" silently converts part 3 from
 * the one task with a flat practice curve (+2.4%, ns, three weekly sessions) into another part 2.
 * The burn-in above is 1 BECAUSE of this; change the property and that number is wrong too.
 */
export const SEQUENCE_RERANDOMIZES_PER_TRIAL = true;

/**
 * ITEM 15: TAP EVENNESS IS NOT REPORTED, ON TWO INDEPENDENT GROUNDS.
 *
 * It does not move under a real fatiguing protocol, and touchscreen practice TIGHTENS inter-tap SD
 * by 18% over a week (Makai-Boloni et al. 2021) -- in exactly the direction a "fresher" reading
 * would move, so the metric's own learning curve is indistinguishable from the thing it claims to
 * measure. Part 4 reports the tap COUNT and nothing else.
 *
 * Declared as a constant rather than simply deleted so that re-adding it is a visible decision.
 */
export const TAP_EVENNESS_IS_REPORTED = false;
