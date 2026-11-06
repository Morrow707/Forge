/* EVERY SET OF A UNILATERAL EXERCISE IS FILMED ONE SIDE AT A TIME, SO EACH SIDE IS ITS OWN SET ROW.
 *
 * Scott, 2026-11-06, after the first single-arm dumbbell row beside the OVR: "I wanted to do the row
 * to the side, but can't because I can't get the other side, on the videos, we need to add a way to
 * film the right side and the left side individually, the exercises ask for it, we need to build
 * that into the system, every set, every rep, every unilateral exercise needs to have a way to film
 * both sides separately."
 *
 * That take is the argument: the sensor rode the dumbbell across both arms (41.3cm on one, 47.1cm
 * on the other -- a real difference), the camera filmed one, and nothing recorded which. A
 * unilateral set is two efforts, one per side, each with its own reps, its own clip, its own numbers
 * and its own trace, and the data model already has a row per effort: `workout_set_entries`, keyed
 * by set number. So a unilateral exercise prescribed "3 x 5 each side" builds SIX rows -- set 1
 * left, set 1 right, set 2 left, ... -- and each carries `side`. The athlete logs each side's reps
 * (a left arm does 8 and a right arm 7, and that is worth knowing), films each side, and the
 * tracker is TOLD which hand is working rather than left to infer it.
 *
 * The side of a NEW row is decided by its set number (odd = left, even = right) so a pair stays a
 * pair however the rows are added; a row saved before this existed has no side and is shown as
 * such -- it is never back-filled, because "which arm" is a fact about the take and not a guess.
 * A bilateral exercise has no side and builds exactly the rows it always did.
 */

export type BodySide = "left" | "right";

export function isUnilateral(laterality: string | null | undefined): boolean {
  return laterality === "unilateral";
}

/** How many set ROWS a prescription builds: one per side per prescribed set on a unilateral lift. */
export function setRowCountFor(prescribedSets: number, laterality: string | null | undefined): number {
  return isUnilateral(laterality) ? prescribedSets * 2 : prescribedSets;
}

/** The side a NEW row takes from its set number on a unilateral lift; null on a bilateral one. */
export function sideForNewSet(setNumber: number, laterality: string | null | undefined): BodySide | null {
  if (!isUnilateral(laterality)) return null;
  return setNumber % 2 === 1 ? "left" : "right";
}

/** Which prescribed set (1-based) a row belongs to: rows 1 and 2 are set 1 on a unilateral lift. */
export function pairIndexFor(setNumber: number, laterality: string | null | undefined): number {
  return isUnilateral(laterality) ? Math.ceil(setNumber / 2) : setNumber;
}

export function sideLabel(side: BodySide | null | undefined): string {
  return side === "left" ? "Left" : side === "right" ? "Right" : "";
}

/** "Set 2 · Right" on a unilateral lift; "Set 2" on a bilateral one; a unilateral row saved before
 *  sides existed reads "Set 2 · side not recorded", never a guessed side. */
export function setRowLabel(
  setNumber: number,
  side: BodySide | null | undefined,
  laterality: string | null | undefined,
): string {
  if (!isUnilateral(laterality)) return `Set ${setNumber}`;
  const pair = pairIndexFor(setNumber, laterality);
  return side ? `Set ${pair} · ${sideLabel(side)}` : `Set ${pair} · side not recorded`;
}
