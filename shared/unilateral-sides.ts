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

/* ONE PILL PER SET, TWO FILM BUTTONS INSIDE IT (Scott, 2026-11-10, on the pager reading "Set 1 ·
 * Left, Set 1 · Right, Set 2 · Left ..." for a single-arm row: "it should still only say set one
 * set 2 set 3 ... then when I click on set one, there's two buttons that say film right and film
 * left ... data isn't going to change, but I need to be able to film both sides of the body. The
 * way it looks now is scrambled").
 *
 * The data model is unchanged -- a unilateral set is still two rows, one per side, so each side
 * keeps its own clip, numbers and trace -- and only the SCREEN groups them. The reps and the load
 * are typed once and written to both rows of the pair. */

/** How many rows one prescribed set occupies: two on a unilateral lift (left, right), one otherwise. */
export function rowsPerSet(laterality: string | null | undefined): number {
  return isUnilateral(laterality) ? 2 : 1;
}

/** The index of the first row of the set a row belongs to (rows are positional, 0-based). */
export function setStartIndex(rowIndex: number, laterality: string | null | undefined): number {
  const per = rowsPerSet(laterality);
  return rowIndex - (rowIndex % per);
}

/** The pager's pills: one per prescribed set, each naming the row indexes it covers. */
export function setPills(rowCount: number, laterality: string | null | undefined): { label: string; rowIndexes: number[] }[] {
  const per = rowsPerSet(laterality);
  return Array.from({ length: Math.ceil(rowCount / per) }, (_, p) => ({
    label: `Set ${p + 1}`,
    rowIndexes: Array.from({ length: per }, (_, k) => p * per + k).filter((i) => i < rowCount),
  }));
}

/** "Film Left" / "Film Right" on a unilateral row; null on a bilateral one (its button keeps its label). */
export function filmSideLabel(side: BodySide | null | undefined, laterality: string | null | undefined): string | null {
  if (!isUnilateral(laterality)) return null;
  return side ? `Film ${sideLabel(side)}` : "Film (side not recorded)";
}
