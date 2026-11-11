/** WHERE EACH LIFT STANDS ACROSS EVERY SET FILMED BESIDE THE SENSOR -- never across the newest one.
 *
 * Scott, 2026-11-11: "it seems like every week we start high, get it dialed in, then the next week
 * they are high again." The settings were holding (the ledger replay proves each sealed take still
 * reads what it read), so the drift was not a leak. It was the method: every round chose its step
 * on that round's one or two takes, and the same lift reads 10-20% apart between takes with
 * nothing changed -- the 11-06 bench +2% and the 11-10 bench set 1 -9% at one record, the 11-10
 * press +47% and +10% minutes apart, the 11-10 row -3% and -35% the same evening. A step chosen on
 * one take mostly fits that take's wobble, so the next week's takes land somewhere else in the
 * cloud and read as "high again". Rule #5 in CLAUDE.md says this in general; this file makes it
 * the arithmetic every round is judged by.
 *
 * THREE RULES, agreed with Scott the same night:
 *  1. A lift is judged by its AVERAGE and its SPREAD over every sensor-paired set on record, not
 *     by its newest set (`standingOf`).
 *  2. A lift's scale SETTINGS move only once it has `MIN_SETS_BEFORE_A_SETTING_MOVES` sets, and
 *     only by a step that lowers its average error across all of them (`stepVerdict`, driven by
 *     scripts/sweep-lift-setting.ts). Bugs -- a lost hand, a split rep, a wrong ruler -- are fixed
 *     the day they are seen, one set is enough to find one.
 *  3. A lift is DIALED IN when at least `DIALED_IN_MIN_SETS` sets all read within
 *     `DIALED_IN_BAND_PCT` of the sensor, and not before.
 *
 * Pure arithmetic over numbers the ledger already pins, so it imports only the ledger and records
 * and gates nothing (Rule #1). Range of motion only: velocity and rep counts are not in the
 * ledger's rows yet. */
import { ACCURACY_LEDGER, type LedgerRow } from "./accuracy-ledger";
import standingOnRecord from "./lift-standing-on-record.json";

export const DIALED_IN_MIN_SETS = 5;
/** Per cent either side of the sensor every one of those sets must sit inside. */
export const DIALED_IN_BAND_PCT = 3;
/** Fewer sets than this and a settings step is fitting one take's wobble. */
export const MIN_SETS_BEFORE_A_SETTING_MOVES = 5;

export type Standing = {
  readonly sets: number;
  /** Signed mean: which way the lift LEANS. Calibration can remove this. */
  readonly biasPct: number;
  /** Mean distance from the sensor, sign ignored: the number a step must lower. */
  readonly meanAbsPct: number;
  /** Sample standard deviation: the take-to-take wobble. Settings cannot remove this; tracking
   *  fixes can. */
  readonly spreadPct: number;
  /** The set furthest from the sensor, signed. */
  readonly worstPct: number;
  readonly dialedIn: boolean;
};

/** Two decimals: the precision the ledger pins `liveErrorPct` to. */
const DECIMALS = 2;
const round2 = (n: number): number => Number(n.toFixed(DECIMALS));

export function standingOf(errorsPct: readonly number[]): Standing {
  const n = errorsPct.length;
  if (n === 0) throw new Error("a standing needs at least one set");
  const bias = errorsPct.reduce((a, b) => a + b, 0) / n;
  const meanAbs = errorsPct.reduce((a, b) => a + Math.abs(b), 0) / n;
  const spread = n === 1 ? 0 : Math.sqrt(errorsPct.reduce((a, b) => a + (b - bias) * (b - bias), 0) / (n - 1));
  const worst = errorsPct.reduce((w, e) => (Math.abs(e) > Math.abs(w) ? e : w), 0);
  return {
    sets: n,
    biasPct: round2(bias),
    meanAbsPct: round2(meanAbs),
    spreadPct: round2(spread),
    worstPct: round2(worst),
    dialedIn: n >= DIALED_IN_MIN_SETS && errorsPct.every((e) => Math.abs(e) <= DIALED_IN_BAND_PCT),
  };
}

/** Every lift in the ledger, read off each row's pinned `liveErrorPct` -- which the ledger replay
 *  holds to the live pipeline, so this is today's pipeline on every set ever filmed. */
export function ledgerStandings(rows: readonly LedgerRow[] = ACCURACY_LEDGER): Record<string, Standing> {
  const byLift = rows.reduce<Record<string, number[]>>(
    (acc, r) => ({ ...acc, [r.exercise]: [...(acc[r.exercise] ?? []), r.liveErrorPct] }),
    {},
  );
  return Object.fromEntries(Object.entries(byLift).map(([lift, errs]) => [lift, standingOf(errs)]));
}

export type StepVerdict = { readonly allowed: boolean; readonly why: string };

/** Whether a proposed settings step for one lift may ship, given every set's error before and
 *  after it (same sets, same order). Not a test of the setting's VALUE -- a test of the evidence. */
export function stepVerdict(beforePct: readonly number[], afterPct: readonly number[]): StepVerdict {
  if (beforePct.length !== afterPct.length) throw new Error("before and after must cover the same sets");
  const before = standingOf(beforePct);
  const after = standingOf(afterPct);
  if (before.sets < MIN_SETS_BEFORE_A_SETTING_MOVES) {
    return {
      allowed: false,
      why: `${before.sets} set(s) on record; a setting moves at ${MIN_SETS_BEFORE_A_SETTING_MOVES}. Fix bugs, film more.`,
    };
  }
  if (after.meanAbsPct >= before.meanAbsPct) {
    return {
      allowed: false,
      why: `average error ${before.meanAbsPct}% -> ${after.meanAbsPct}% across ${before.sets} sets: not lower.`,
    };
  }
  return {
    allowed: true,
    why: `average error ${before.meanAbsPct}% -> ${after.meanAbsPct}% across ${before.sets} sets` +
      ` (lean ${before.biasPct}% -> ${after.biasPct}%, wobble ${before.spreadPct}% -> ${after.spreadPct}%).`,
  };
}

/** WHERE EVERY LIFT STOOD WHEN THIS WAS LAST COMMITTED. The ratchet: a change that moves any
 *  lift's average over its sets reds `every-lift-is-judged-across-all-its-sets.test.ts`, and the
 *  edit here is where "the bench got worse across all five sets" shows up in a diff instead of in
 *  next week's filming. A new set added to the ledger changes `sets` and is re-recorded with it.
 *  Recorded 2026-11-11 from the ledger as it stood at round sixteen. */
export const STANDING_ON_RECORD: Readonly<Record<string, { sets: number; meanAbsPct: number }>> = standingOnRecord;
