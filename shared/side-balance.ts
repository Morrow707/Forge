/**
 * THE TWO-SIDED CHECK: how far one side sits below the other on a return-to-training drill.
 *
 * Scott, 2026-11-22. A drill tagged `return_to_training` and logged one side at a time (the `side`
 * column on workout_set_entries) shows the coach the left/right difference on that athlete's
 * exercise history: "Right 18% below left", beside a reference line that a difference under 10%
 * is the usual guide.
 *
 * DISPLAY ONLY. Nothing reads this to allow, refuse, flag or clear anything: whether somebody is
 * ready to go back to full training is a clinician's and a coach's decision, never this number's.
 *
 * What is compared: each side's BEST effort across the sets shown, where an effort is the load
 * times the reps when a load was logged and the reps alone when it was not. The best set rather
 * than a total, so a side that simply did one more set does not read as the stronger side.
 * Sets with no side recorded (logged before sides existed) are left out and counted, never
 * guessed onto a side.
 */

/** The usual guide: a difference under this, in percent, is commonly read as close to even. */
export const SIDE_DIFFERENCE_USUAL_GUIDE_PERCENT = 10;

const PERCENT = 100;

export type SidedSet = {
  side?: string | null;
  reps?: number | string | null;
  weight?: number | string | null;
};

/** A logged number that may arrive as text ("8", "135.5"); null when it is not a positive number. */
function positiveNumber(value: number | string | null | undefined): number | null {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

export type SideBalance = {
  left: number;
  right: number;
  /** The side below the other, or null when they are even. */
  lowerSide: "left" | "right" | null;
  /** How far the lower side sits below the higher one, in whole percent. */
  percentBelow: number;
  /** Sets the comparison left out because no side was recorded on them. */
  setsWithoutSide: number;
  /** The sentence the coach sees, e.g. "Right 18% below left". */
  sentence: string;
};

/** One set's effort: load x reps with a load, reps alone without. Null when nothing was logged. */
export function setEffort(set: SidedSet): number | null {
  const reps = positiveNumber(set.reps);
  if (reps == null) return null;
  const weight = positiveNumber(set.weight);
  return weight != null ? weight * reps : reps;
}

function sideLabel(side: "left" | "right"): string {
  return side === "left" ? "Left" : "Right";
}

/**
 * The left/right comparison over these sets, or null when either side has nothing logged: a
 * comparison against an empty side is not a difference, it is a missing side.
 */
export function sideBalance(sets: readonly SidedSet[]): SideBalance | null {
  const best = (side: "left" | "right") =>
    sets
      .filter((s) => s.side === side)
      .map(setEffort)
      .reduce<number>((acc, e) => (e != null && e > acc ? e : acc), 0);
  const left = best("left");
  const right = best("right");
  if (left <= 0 || right <= 0) return null;
  const setsWithoutSide = sets.filter((s) => s.side !== "left" && s.side !== "right").length;
  const higher = Math.max(left, right);
  const percentBelow = Math.round(((higher - Math.min(left, right)) / higher) * PERCENT);
  if (percentBelow === 0) {
    return { left, right, lowerSide: null, percentBelow: 0, setsWithoutSide, sentence: "Left and right even" };
  }
  const lowerSide = left < right ? "left" : "right";
  const higherSide = lowerSide === "left" ? "right" : "left";
  return {
    left,
    right,
    lowerSide,
    percentBelow,
    setsWithoutSide,
    sentence: `${sideLabel(lowerSide)} ${percentBelow}% below ${higherSide}`,
  };
}

/** The reference line shown beside the difference. */
export const SIDE_DIFFERENCE_GUIDE_SENTENCE = `A difference under ${SIDE_DIFFERENCE_USUAL_GUIDE_PERCENT}% is the usual guide. This is for reading only; it never decides anything.`;
