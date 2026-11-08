import { BASELINE_BURN_IN_CHECKS, type AnvilPart } from "./anvil-baseline";

/**
 * THE SLOW CHANNEL'S ANCHOR, AND WHY IT IS THE ONLY THING THAT CAN EVER LET THE ANVIL SPEAK.
 *
 * `weeklyVerdict` needs two of three channels agreeing (`anvil-corroboration.ts`), and two of the
 * three are not computable: the career channel wants the same athlete at the same age a year
 * earlier, which is a year away whatever anybody builds, and the slow channel wanted "a fixed
 * early-season anchor, which nobody has". So every week the Anvil has ever produced reads
 * `cannot_judge` BY CONSTRUCTION. This file is the half of that which was buildable.
 *
 * **THE ANCHOR IS THE WHOLE CHANNEL, MEASURED RATHER THAN ASSUMED.** `tools/anvil-sim/randomanchor.py`
 * turns the ACWR test (Carbone et al. 2022, which killed the acute:chronic workload ratio by
 * replacing its denominator with a random number) on the Anvil's own slow channel, across twelve
 * seasons and 1,389 athletes:
 *
 *     anchor                      slow decliners   fast decliners   clean (floor)
 *     as shipped                       16%              23%              10%
 *     shuffled across athletes         10%              10%              10%
 *     drawn at random                  10%               8%              10%
 *     no anchor at all                  9%               9%              10%
 *
 * So the drift from a fixed anchor is doing the work, and a late-season mean alone is nothing.
 *
 * **IT IS A COUNT, NOT A CALENDAR, AND THAT IS MEASURED TOO.** Every simulation to date anchors on
 * days 8%-32% of the season. Forge cannot: an athlete's season phase is one reported word rather
 * than a calendar, and somebody who starts the check in week nine has no early-season readings at
 * all. `tools/anvil-sim/countanchor.py` tests the anchor Forge CAN build -- the athlete's own
 * first N readings -- in all three worlds, at a false-alarm floor held equal:
 *
 *     world        anchor                                 slow    fast   clean
 *     football     days 8%-32% of the season               16%     23%     10%
 *     football     the athlete's first 20 readings         19%     21%     10%
 *     football     the 20 readings before the window       10%     10%     10%
 *     baseball     days 8%-32% of the season               25%     20%     10%
 *     baseball     the athlete's first 20 readings         25%     22%     10%
 *     baseball     the 20 readings before the window       10%      0%     10%
 *     basketball   days 8%-32% of the season               26%     26%     14%
 *     basketball   the athlete's first 20 readings         30%     21%     14%
 *     basketball   the 20 readings before the window       18%     11%     14%
 *
 * The count-based anchor matches or beats the calendar one in every world and needs no season, and
 * it scores one more athlete per football season because it has no early-season requirement to
 * fail. 14, 20 and 30 are within a point of each other, so 20 is taken to match `BASELINE_WINDOW`.
 *
 * **AND THE ROLLING ANCHOR DETECTS NOTHING, which is why "frozen" is a measurement and not a
 * preference.** The last row of each block is the anchor somebody reaches for when an athlete's
 * first checks look unrepresentative -- the twenty readings immediately before the window, so it
 * moves with the window. It sits at its own clean floor in all three worlds. An anchor that
 * re-learns itself is the fast channel's measured defect one timescale up: the fast channel's
 * rolling baseline flags 16.3% of days in an athlete's first three and 0.0% by days 16-18, and a
 * rolling slow anchor does the same thing to a season.
 *
 * **THE ANCHOR AND THE WINDOW ARE DISJOINT ON PURPOSE.** The ACWR's acute week sits inside its own
 * chronic window, so its numerator and denominator share data -- mathematical coupling that bites
 * any nested-window design. The anchor here is taken from the checks that fall BEFORE the window
 * opens, so no reading is in both and the difference is never partly a number minus itself.
 *
 * NOTHING HERE IS A THRESHOLD AND NOTHING HERE FLAGS ANYTHING. Pure functions, no clock, no I/O,
 * the same posture as `anvil-baseline.ts`. Rule #1's shape: a history too thin to anchor on
 * returns a STATED reason, never a silent number.
 */

/** The anchor is the athlete's first this-many eligible checks. Measured above; 14 and 30 are
 *  within a point of it, so it is set to `BASELINE_WINDOW`'s value for one fewer number. */
export const SLOW_ANCHOR_CHECKS = 20;

/** The recent window the drift is measured over, in days. The sims' W, unchanged. */
export const SLOW_WINDOW_DAYS = 45;

/**
 * How many checks the window must hold. The sims required `len(win) >= W * 0.7` with a reading
 * EVERY day, so this is that rule expressed as the count it really was -- 31 of 45.
 *
 * **STATED RATHER THAN QUIETLY LOOSENED, because nothing has measured it at a real cadence.** An
 * athlete checking five mornings a week clears it at 32; four mornings a week is 26 and gets a
 * stated absence instead of a window mean over two thirds as many readings. That is the
 * conservative direction and it is the first number to re-measure once there is real cadence data,
 * which there is not: the Anvil is a day old.
 */
export const SLOW_WINDOW_MIN_CHECKS = Math.round(SLOW_WINDOW_DAYS * 0.7);

/**
 * How many athletes the cohort median and MAD must be estimated from before the z means anything.
 *
 * **THE COHORT IS LOAD-BEARING AND THAT IS MEASURED**, which is the finding that decides this
 * file's shape. The obvious alternative needs no roster at all: the drift is a difference of two
 * means, so its standard error is the athlete's own day-to-day sigma times
 * `sqrt(1/n_window + 1/n_anchor)`, and that sigma is already estimated per athlete by the fast
 * channel's baseline. `tools/anvil-sim/ownsigma.py` measures it at a fixed z of 2.0:
 *
 *     world        normaliser                              slow    fast   clean
 *     football     cohort (needs a roster)                   7%      4%      3%
 *     football     the athlete's own sigma                   0%      0%      0%
 *     baseball     cohort (needs a roster)                   8%     12%      1%
 *     baseball     the athlete's own sigma                  58%     65%     54%
 *     basketball   cohort (needs a roster)                  12%      9%      3%
 *     basketball   the athlete's own sigma                  52%     55%     45%
 *
 * Both failures are one cause: the spread of the drift ACROSS athletes is not one athlete's
 * day-to-day sigma scaled by `sqrt(1/n)`. A season has a common drift that everybody shares -- the
 * cohort median is what removes it and the cohort MAD is what sets its scale -- and neither is
 * recoverable from a single series. In football that formula's standard error swamps the drift and
 * nothing ever reaches 2.0; in baseball it under-states the uncertainty so badly that **54% of
 * CLEAN athletes clear a two-sigma bar.** An autocorrelation correction (effective n from the
 * lag-1 coefficient) moves it to 50% and 40%, which is the same answer.
 *
 * **SO THE FLOOR IS THE COHORT'S, AND IT IS SET BY THE WORST DRAW RATHER THAN THE AVERAGE ONE.**
 * `tools/anvil-sim/cohortfloor.py`, 400 seeded draws per size at a fixed z of 2.0, reporting the
 * mean clean rate and the worst cohort drawn:
 *
 *     cohort      football mean/worst   baseball mean/worst   basketball mean/worst
 *          6            5% / 100%              3% /  50%              4% /  40%
 *         10            4% /  38%              3% /  40%              4% /  50%
 *         20            4% /  24%              2% /  25%              2% /  36%
 *         30            3% /  28%              2% /  17%              2% /  21%
 *         45            3% /  17%              2% /  14%              2% /  15%
 *         60            3% /  14%              2% /   7%              1% /   9%
 *         90            3% /  10%              1% /   5%              1% /   8%
 *        150            3% /   8%              1% /   3%              1% /   6%
 *
 * The MEAN is respectable at every size, which is exactly the trap: a cohort of six has a mean
 * clean rate of 3-5% and a worst draw that flags **every clean athlete in it**. 90 is the smallest
 * size whose worst draw is at or under 10% in all three worlds, which is the rate the
 * corroboration arithmetic in `anvil-corroboration.ts` assumed of each channel when it measured
 * two-of-three at 0.1% false weeks. Below it the slow channel would corroborate by noise, and a
 * second witness that fires on noise is worse than one witness, because the rule trusts it.
 *
 * **IT IS A COHORT TO ESTIMATE FROM, NOT A ROSTER TO BE SCORED INSIDE.** `tools/anvil-sim/pooled.py`
 * measured both halves: pooling across teams does NOT make the channel finer (sigma is a property
 * of the population, not of the sample -- 0.34 at 18 athletes, 0.33 at 720), but a small roster's
 * THRESHOLD is wild (0.54 to 4.38 off one 18 man team, against 1.14 to 1.48 at ten teams). So the
 * median and MAD are estimated from the widest cohort available and the athlete is scored against
 * their own drift.
 */
export const SLOW_COHORT_MIN = 90;

/** One check, reduced to what the slow channel reads: the date and the headline median. */
export type SlowChannelCheck = {
  readonly date: string;
  readonly medianMs: number | null;
  /** False for a check that may never join a baseline -- taken outside the morning window, or
   *  inside the burn-in. The same rule the fast channel's baseline uses. */
  readonly eligible: boolean;
};

export type SlowChannelAnchor = {
  readonly medianMs: number;
  readonly checks: number;
  /** The dates the anchor spans, recorded so a reader can see WHEN this athlete's normal was
   *  established -- which is the question a frozen anchor invites and the one a rolling one
   *  cannot answer. */
  readonly fromDate: string;
  readonly toDate: string;
};

export type SlowChannelDrift = {
  /** Window median minus anchor median, in milliseconds, with the fast channel's sign: POSITIVE
   *  is slower than this athlete's own early normal. */
  readonly driftMs: number;
  readonly anchor: SlowChannelAnchor;
  readonly window: { readonly medianMs: number; readonly checks: number; readonly from: string; readonly to: string };
};

export type SlowChannelAbsence = { readonly absent: string };

function median(xs: readonly number[]): number | null {
  const s = xs.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The date `days` before `iso`, as an ISO date. Pure string arithmetic through UTC, so it carries
 *  no local clock -- the same reason `shared/roster-hold.ts` takes today as an argument. */
function minusDays(iso: string, days: number): string {
  const t = Date.parse(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(t)) return iso;
  return new Date(t - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * One athlete's drift from their own frozen anchor, or why they have none.
 *
 * `checksOldestFirst` is every check this athlete has ever taken, oldest first -- the order the
 * burn-in drops from, and the order the anchor is defined in. Handed newest-first it would anchor
 * on the athlete's most recent month, which is the one mistake here that returns a plausible
 * number from the wrong end of the series.
 *
 * `asOf` is the last day of the window, passed in rather than read off a clock.
 */
export function slowChannelDrift(
  checksOldestFirst: readonly SlowChannelCheck[],
  asOf: string,
  part: AnvilPart = "reaction_time",
): SlowChannelDrift | SlowChannelAbsence {
  const windowFrom = minusDays(asOf, SLOW_WINDOW_DAYS);
  const usable = checksOldestFirst.filter((c) => c.eligible && c.medianMs != null && Number.isFinite(c.medianMs));
  // The burn-in drops from the OLD end, which is where the anchor is taken from -- so a practice
  // curve would otherwise become the athlete's permanent normal.
  const afterBurnIn = usable.slice(BASELINE_BURN_IN_CHECKS[part]);

  // DISJOINT: the anchor may only use checks that fall before the window opens, so no reading is
  // in both halves of the difference.
  const beforeWindow = afterBurnIn.filter((c) => c.date < windowFrom);
  if (beforeWindow.length < SLOW_ANCHOR_CHECKS) {
    return {
      absent:
        `${beforeWindow.length} of ${SLOW_ANCHOR_CHECKS} anchor checks before the window ` +
        `(the anchor is this athlete's first ${SLOW_ANCHOR_CHECKS} eligible checks, frozen)`,
    };
  }
  const anchorChecks = beforeWindow.slice(0, SLOW_ANCHOR_CHECKS);
  const anchorMedian = median(anchorChecks.map((c) => c.medianMs as number));
  if (anchorMedian == null) return { absent: "no anchor median" };

  const inWindow = afterBurnIn.filter((c) => c.date >= windowFrom && c.date <= asOf);
  if (inWindow.length < SLOW_WINDOW_MIN_CHECKS) {
    return {
      absent:
        `${inWindow.length} of ${SLOW_WINDOW_MIN_CHECKS} checks in the last ${SLOW_WINDOW_DAYS} days`,
    };
  }
  const windowMedian = median(inWindow.map((c) => c.medianMs as number));
  if (windowMedian == null) return { absent: "no window median" };

  return {
    driftMs: windowMedian - anchorMedian,
    anchor: {
      medianMs: anchorMedian,
      checks: anchorChecks.length,
      fromDate: anchorChecks[0].date,
      toDate: anchorChecks[anchorChecks.length - 1].date,
    },
    window: { medianMs: windowMedian, checks: inWindow.length, from: windowFrom, to: asOf },
  };
}

export type SlowCohortEntry = {
  readonly athleteId: number;
  readonly driftMs: number;
  /** The athlete's own mean training load over the window, in whatever unit Forge's load series
   *  uses. Null where there is none; see `slowChannelCohort` for what that costs. */
  readonly loadAu: number | null;
};

export type SlowCohortScore = {
  readonly athleteId: number;
  readonly z: number;
  /** True where this athlete's load was imputed to the cohort's median because they had none. */
  readonly loadImputed: boolean;
};

export type SlowCohortResult =
  | {
      readonly kind: "scored";
      readonly scores: readonly SlowCohortScore[];
      /** Which residual the cohort kept, and why -- read by the report so a coach's page can say
       *  what the number was normalised against rather than implying one form. */
      readonly form: "load_regressed" | "cohort_median";
      readonly cohort: number;
      readonly sigma: number;
    }
  | SlowChannelAbsence;

/**
 * The cohort step: every athlete's drift in, a z each out.
 *
 * **THE FORM IS CHOSEN BY A RULE, NOT BY A FITTED BOUNDARY.** `tools/anvil-sim/form_by_sport.py`
 * measured that the better form is roster-shaped: at 18% load spread across the roster (football)
 * regressing on the athlete's own load HURTS and the cohort median alone is better, while at
 * 39-40% (baseball, basketball) the regression wins -- and in baseball the cohort-median form
 * detects **0%** of the slow declines it was measured against, so getting the form wrong costs the
 * whole channel. Shipping a boundary somewhere between 18% and 39% would be fitting a threshold to
 * two points, which is the enumerate-the-accepted-forms shape CLAUDE.md refuses.
 *
 * So both residuals are computed on the cohort in hand and the one with the smaller spread is
 * kept. `tools/anvil-sim/formrule.py`, cohorts of 90, 200 draws, fixed z of 2.0:
 *
 *     world        form                                decliners   clean   worst   chose load
 *     football     regress on the athlete's own load         6%      3%     14%        100%
 *     football     cohort median only                        5%      2%      8%          0%
 *     football     whichever residual is tighter             5%      3%      9%         18%
 *     baseball     regress on the athlete's own load         7%      1%      5%        100%
 *     baseball     cohort median only                        0%      0%      0%          0%
 *     baseball     whichever residual is tighter             7%      1%      5%        100%
 *     basketball   regress on the athlete's own load         6%      1%      9%        100%
 *     basketball   cohort median only                        2%      1%      8%          0%
 *     basketball   whichever residual is tighter             6%      1%      8%          8%
 *
 * The rule lands on the better form in every world -- it picks the regression unanimously where
 * the regression wins and almost never where it loses -- with no sport table and nothing to update
 * when a sport nobody measured arrives.
 *
 * A LOAD NOBODY HAS IS IMPUTED TO THE COHORT'S MEDIAN, AND SAID SO ON THAT ATHLETE'S ROW. It makes
 * them a neutral point in the regression (their residual is measured from the fitted line at the
 * cohort's centre), which biases the slope very slightly toward zero -- the conservative
 * direction -- rather than dropping an athlete out of a channel for not having logged training.
 */
export function slowChannelCohort(entries: readonly SlowCohortEntry[]): SlowCohortResult {
  const usable = entries.filter((e) => Number.isFinite(e.driftMs));
  if (usable.length < SLOW_COHORT_MIN) {
    return {
      absent:
        `${usable.length} of ${SLOW_COHORT_MIN} athletes with a drift to estimate the cohort from ` +
        `(below that the worst cohort drawn flags a tenth or more of its clean athletes)`,
    };
  }
  const loads = usable.map((e) => e.loadAu).filter((l): l is number => l != null && Number.isFinite(l));
  const loadMedian = median(loads) ?? 0;
  const x = usable.map((e) => (e.loadAu != null && Number.isFinite(e.loadAu) ? e.loadAu : loadMedian));
  const y = usable.map((e) => e.driftMs);

  const mx = mean(x);
  const my = mean(y);
  const sxx = x.reduce((s, v) => s + (v - mx) * (v - mx), 0);
  const slope = sxx > 0 ? x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / sxx : 0;
  const regressed = y.map((v, i) => v - (my + slope * (x[i] - mx)));
  const centred = (() => {
    const m = median(y) as number;
    return y.map((v) => v - m);
  })();

  const regressedSigma = madSigma(regressed);
  const centredSigma = madSigma(centred);
  // STRICTLY tighter, so a tie keeps the simpler form -- the regression spends a degree of freedom
  // and a tie is the case where it bought nothing. Measured both ways in `formrule.py` and the
  // direction is immaterial to the result (football picks the regression 18% of cohorts with a
  // non-strict comparison and 21% with this one, inside the sampling noise of 200 draws); it is
  // the reasoning that picks it rather than the number.
  const useLoad = regressedSigma > 0 && (centredSigma <= 0 || regressedSigma < centredSigma);
  const residuals = useLoad ? regressed : centred;
  const sigma = useLoad ? regressedSigma : centredSigma;
  if (!(sigma > 0)) return { absent: "the cohort's drifts have no spread to score against" };

  const centre = median(residuals) as number;
  return {
    kind: "scored",
    form: useLoad ? "load_regressed" : "cohort_median",
    cohort: usable.length,
    sigma,
    scores: usable.map((e, i) => ({
      athleteId: e.athleteId,
      z: (residuals[i] - centre) / sigma,
      loadImputed: !(e.loadAu != null && Number.isFinite(e.loadAu)),
    })),
  };
}

function mean(xs: readonly number[]): number {
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
}

/** MAD -> sigma on the cohort's residuals.
 *
 *  Deliberately NOT the fast channel's own robust sigma from `anvil-baseline.ts`: that one carries
 *  a ten-check floor and a finite-sample correction table keyed on a BASELINE's length rather than
 *  on a cohort's size, so reusing it here would apply a correction measured for one estimator to
 *  another -- the shape CLAUDE.md records as a constant fitted on one lift reaching a different
 *  one. The import clause at the top of this file is what holds that true. */
function madSigma(xs: readonly number[]): number {
  const m = median(xs);
  if (m == null) return 0;
  const mad = median(xs.map((v) => Math.abs(v - m)));
  return mad != null && mad > 0 ? mad / 0.6745 : 0;
}
