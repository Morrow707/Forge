/**
 * THE MORNING WINDOW, AND WHY MISSING IT NEVER REFUSES A CHECK.
 *
 * Scott asked for "around the same time every day", and the reason is not tidiness. Simple
 * reaction time has a diurnal swing larger than the effect the Anvil is looking for, so a check
 * at 07:00 and one at 16:00 are not the same measurement of the same person -- comparing them
 * puts time of day into every z-score as unmodelled noise. A fixed window is the cheapest way to
 * hold that constant, and it costs the athlete nothing they were not going to do anyway.
 *
 * **THE WINDOW IS A LABEL AND NEVER A GATE.** A check taken at four in the afternoon is kept,
 * scored, shown to the athlete, and held OUT of the baseline. Rule #1 applied to a clock: the
 * refusal would destroy the one thing that cannot be recovered -- what the athlete actually did --
 * to protect a comparison that can simply be skipped. A missing day is honest; a mistimed day
 * folded into somebody's normal is not; a refused day is both lost and silent.
 *
 * `practice` is the third state and is the athlete's own choice: a run that counts for nothing,
 * available any time. It exists because the burn-in in `anvil-baseline.ts` assumes a first
 * attempt is thrown away, and an athlete who wants to see what the tasks are before their first
 * real one should not have to spend a real one to find out.
 *
 * Pure. Minutes since local midnight in, a label out -- no clock, no timezone library, and the
 * local day is decided by the client, which is the only thing that knows what day it is where the
 * athlete is standing.
 */

export type AnvilWindowLabel = "in_window" | "late" | "practice";

/** 05:40, in minutes since local midnight. Early enough for a school lifting session. */
export const ANVIL_WINDOW_OPENS_MINUTES = 5 * 60 + 40;
/** 08:40. Three hours wide, which is what makes it a window somebody can actually hit daily. */
export const ANVIL_WINDOW_CLOSES_MINUTES = 8 * 60 + 40;

export function windowLabelFor(
  localMinutesSinceMidnight: number,
  opts: { readonly practice?: boolean } = {},
): AnvilWindowLabel {
  if (opts.practice) return "practice";
  const m = localMinutesSinceMidnight;
  if (!Number.isFinite(m) || m < 0 || m >= 24 * 60) return "late";
  return m >= ANVIL_WINDOW_OPENS_MINUTES && m <= ANVIL_WINDOW_CLOSES_MINUTES
    ? "in_window"
    : "late";
}

/**
 * Only an in-window check joins the athlete's normal. Stated as its own function rather than
 * inlined as `=== "in_window"` at each caller, because this is the whole consequence of the
 * window existing and it must be impossible to apply inconsistently.
 */
export function countsTowardBaseline(label: AnvilWindowLabel): boolean {
  return label === "in_window";
}

/**
 * The one attempt that counts for a day. **The FIRST in-window check, never the best and never
 * the latest.**
 *
 * Best-of would let an athlete retake until they liked the number, which turns a measurement into
 * a target; latest would do the same more slowly. First is the only rule that cannot be gamed, and
 * it is what "one attempt counts" on the pre-check screen already promises.
 *
 * Takes the day's checks in any order and returns the one that counts, or null when none does --
 * which is a real state (every check that day was late or practice) and is why this returns null
 * rather than falling back to one of them.
 */
export function checkThatCounts<T extends { takenAt: Date | string; window: AnvilWindowLabel }>(
  dayChecks: readonly T[],
): T | null {
  const counting = dayChecks.filter((c) => countsTowardBaseline(c.window));
  if (counting.length === 0) return null;
  return counting.reduce((earliest, c) =>
    new Date(c.takenAt).getTime() < new Date(earliest.takenAt).getTime() ? c : earliest,
  );
}

/** Minutes since local midnight from the client's own clock. The client sends this; nothing infers it. */
export function localMinutesFrom(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}
