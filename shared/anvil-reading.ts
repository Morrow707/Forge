import {
  BASELINE_MIN_CHECKS,
  baselineChecksFor,
  robustSigma,
  type AnvilPart,
} from "./anvil-baseline";
import {
  countLapses,
  lapseThresholdFor,
  reportedTapCount,
  tappingDeadBand,
} from "./anvil-part-metrics";
import { countsTowardBaseline, type AnvilWindowLabel } from "./anvil-window";

/**
 * THE FIRST PLACE THE PIECES MEET: raw checks in, a reading out.
 *
 * Everything it uses was built and measured separately -- the burn-in and the finite-sample
 * correction from `anvil-baseline.ts`, the lapse threshold and the tap aggregator from
 * `anvil-part-metrics.ts`, the window from `anvil-window.ts`. This file adds no constant of its
 * own. That is deliberate: a scoring layer that invents a number is where the fitted values stop
 * being traceable, and every number here has a measurement and a script behind it.
 *
 * **IT SCORES THE FAST CHANNEL AND NOTHING ELSE, AND SAYS SO.** The slow and career channels read
 * training data this function is never handed. A weekly CLAIM needs two of three channels
 * agreeing (`anvil-corroboration.ts`), so what comes out of here is one witness -- shown to the
 * athlete as a reading with no claim attached, which is exactly what the daily surface is for.
 *
 * **NOTHING IS WITHHELD.** A check always produces its own numbers. What a thin baseline withholds
 * is the COMPARISON, and it says which of the two reasons it has.
 */

export type AnvilRawCheck = {
  readonly date: string;
  readonly takenAt: string;
  readonly window: AnvilWindowLabel;
  readonly trialsMs: readonly number[];
  readonly omissions: number;
  readonly rulesMissed: number | null;
  readonly sequenceBest: number | null;
  readonly tapCounts: readonly number[] | null;
  readonly partsRun: readonly string[];
};

/** What one check measured, before any comparison. Always present. */
export type AnvilCheckNumbers = {
  readonly medianMs: number | null;
  readonly trials: number;
  readonly omissions: number;
  readonly rulesMissed: number | null;
  readonly sequenceBest: number | null;
  readonly tapCount: number | null;
};

/** The comparison against this athlete's own normal, or why there isn't one. */
export type AnvilComparison =
  | {
      readonly kind: "compared";
      readonly medianZ: number;
      readonly lapses: number;
      readonly lapseThresholdMs: number;
      readonly baselineMedianMs: number;
      readonly baselineSigmaMs: number;
      readonly baselineChecks: number;
      readonly bandLowMs: number;
      readonly bandHighMs: number;
      readonly tapMoved: boolean | null;
    }
  | { readonly kind: "learning"; readonly have: number; readonly need: number }
  | { readonly kind: "no_spread" };

export type AnvilReading = {
  readonly numbers: AnvilCheckNumbers;
  readonly comparison: AnvilComparison;
  /** True when this check will never join a baseline: taken late, or a practice run. */
  readonly outsideTheWindow: boolean;
};

function median(xs: readonly number[]): number | null {
  const s = xs.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Score one check against the athlete's own history.
 *
 * `history` is every earlier check, OLDEST FIRST -- the order `baselineChecksFor` needs, because
 * the burn-in drops from the old end. Handed newest-first it would discard the most recent checks
 * and return a plausible number from the wrong end of the series, which is the one mistake here
 * that produces no error.
 */
export function readCheck(check: AnvilRawCheck, history: readonly AnvilRawCheck[]): AnvilReading {
  const numbers: AnvilCheckNumbers = {
    medianMs: median(check.trialsMs),
    trials: check.trialsMs.length,
    omissions: check.omissions,
    rulesMissed: check.rulesMissed,
    sequenceBest: check.sequenceBest,
    tapCount: check.tapCounts ? reportedTapCount(check.tapCounts) : null,
  };
  const outsideTheWindow = !countsTowardBaseline(check.window);

  // Only in-window checks are a normal. A late check is still SCORED against that normal -- it is
  // the athlete's own number and they should see where it sits -- it simply never joins it.
  const eligible = history.filter((h) => countsTowardBaseline(h.window));
  const forPart: AnvilPart = "reaction_time";
  const window = baselineChecksFor(forPart, eligible);
  const medians = window.map((h) => median(h.trialsMs)).filter((m): m is number => m != null);

  if (medians.length < BASELINE_MIN_CHECKS) {
    return {
      numbers,
      comparison: { kind: "learning", have: medians.length, need: BASELINE_MIN_CHECKS },
      outsideTheWindow,
    };
  }

  const sigma = robustSigma(medians);
  if ("absent" in sigma) {
    // `too_few_checks` is unreachable here (the guard above is the same bound) so this is the
    // no-spread case: an athlete whose last twenty checks are identical to the millisecond, which
    // means something is wrong with the timer rather than with them.
    return { numbers, comparison: { kind: "no_spread" }, outsideTheWindow };
  }

  const baselineMedianMs = median(medians) as number;
  const today = numbers.medianMs;
  const thresholdMs = lapseThresholdFor(baselineMedianMs, sigma.sigma);
  const tapHistory = window
    .map((h) => (h.tapCounts ? reportedTapCount(h.tapCounts) : null))
    .filter((t): t is number => t != null);
  const tapBaseline = median(tapHistory);
  // The athlete's own between-day spread, which is what the dead band is a multiple of. Null
  // until there is one, and `tappingDeadBand` then reports `measured: false` rather than passing
  // the placeholder off as a measurement.
  const tapCv =
    tapBaseline && tapHistory.length >= BASELINE_MIN_CHECKS
      ? ("absent" in robustSigma(tapHistory) ? null : (robustSigma(tapHistory) as { sigma: number }).sigma / tapBaseline)
      : null;

  return {
    numbers,
    comparison: {
      kind: "compared",
      medianZ: today == null ? 0 : (today - baselineMedianMs) / sigma.sigma,
      lapses: countLapses(check.trialsMs, thresholdMs),
      lapseThresholdMs: thresholdMs,
      baselineMedianMs,
      baselineSigmaMs: sigma.sigma,
      baselineChecks: medians.length,
      // The band the athlete is shown. One sigma either side, which is a DESCRIPTION of where
      // their days usually land and not a threshold -- nothing fires at its edge.
      bandLowMs: baselineMedianMs - sigma.sigma,
      bandHighMs: baselineMedianMs + sigma.sigma,
      tapMoved:
        numbers.tapCount != null && tapBaseline != null
          ? Math.abs(numbers.tapCount / tapBaseline - 1) > tappingDeadBand(tapCv).band
          : null,
    },
    outsideTheWindow,
  };
}

/**
 * EVERY CHECK IN A SERIES, EACH SCORED AS IT STOOD ON THE DAY.
 *
 * Takes the whole series oldest first and scores each check against only the checks BEFORE it.
 * Not against the whole series: that would recompute history with hindsight, so the number an
 * athlete saw on Tuesday would quietly change on Friday as the baseline filled in. A reading that
 * moves after the fact cannot be talked about -- "it said 0.8 sigma on Tuesday" has to stay true.
 *
 * The cost is honest and visible: the first day of somebody's second week has a thinner baseline
 * than the last, and `comparison.kind` says `learning` with the count when it does.
 */
export function readSeries(
  oldestFirst: readonly AnvilRawCheck[],
): Array<{ check: AnvilRawCheck; reading: AnvilReading }> {
  return oldestFirst.map((check, i) => ({
    check,
    reading: readCheck(check, oldestFirst.slice(0, i)),
  }));
}

/**
 * THE FAST CHANNEL'S WEEK: the MEDIAN of the week's daily z-scores, or a stated absence.
 *
 * The median and not the mean, for the reason the lapse metric is a count rather than an average
 * (`anvil-part-metrics.ts`): one distracted morning is worth 1.70 SD on a mean of a handful of
 * days, so a mean would let a single phone call become a week. Three compared days is the floor --
 * two days cannot have a median that is not one of them.
 *
 * **IT IS ONE WITNESS AND NOTHING MORE.** `weeklyVerdict` needs two of three channels before the
 * Anvil says anything, and the slow and career channels are not computable yet: the slow channel
 * wants a fixed early-season anchor nobody has, and the career channel wants the same athlete at
 * the same age a year apart. So today every week comes back `cannot_judge`, with the reason
 * naming which channel was missing. That is the correct answer, not a gap to paper over.
 */
export const FAST_CHANNEL_MIN_DAYS = 3;

export function fastChannelWeek(
  readings: ReadonlyArray<{ reading: AnvilReading }>,
):
  | { readonly channel: "fast"; readonly z: number }
  | { readonly channel: "fast"; readonly absent: string } {
  const zs = readings
    .filter((r) => !r.reading.outsideTheWindow)
    .map((r) => (r.reading.comparison.kind === "compared" ? r.reading.comparison.medianZ : null))
    .filter((z): z is number => z != null);
  if (zs.length < FAST_CHANNEL_MIN_DAYS) {
    return {
      channel: "fast",
      absent: `${zs.length} of ${FAST_CHANNEL_MIN_DAYS} compared in-window days this week`,
    };
  }
  return { channel: "fast", z: median(zs) as number };
}
