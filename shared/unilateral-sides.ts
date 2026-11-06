/* EVERY SET OF A UNILATERAL EXERCISE IS FILMED ONE SIDE AT A TIME, SO EACH SIDE IS ITS OWN SET ROW,
 * AND ON SCREEN THE PAIR IS ONE SET WITH TWO RECORD BUTTONS.
 *
 * Scott, 2026-11-06, after the first single-arm dumbbell row beside the OVR: "I wanted to do the row
 * to the side, but can't because I can't get the other side, on the videos, we need to add a way to
 * film the right side and the left side individually, the exercises ask for it, we need to build
 * that into the system, every set, every rep, every unilateral exercise needs to have a way to film
 * both sides separately."
 *
 * That take is the argument: the sensor rode the dumbbell across both arms (41.3cm on one, 47.1cm
 * on the other -- a real difference), the camera filmed one, and nothing recorded which. A
 * unilateral set is two efforts, one per side, each with its own clip, its own numbers and its own
 * trace, and the data model already has a row per effort: `workout_set_entries`, keyed by set
 * number. So a unilateral exercise prescribed "3 x 5 each side" builds SIX rows -- set 1 left, set 1
 * right, set 2 left, ... -- and each carries `side`, so the tracker is TOLD which hand is working
 * rather than left to infer it.
 *
 * THE SCREEN SHOWS THE PAIR AS ONE SET. The first version drew a pill per ROW ("Set 1 · Left",
 * "Set 1 · Right", ten pills for a five-set row) and Scott, looking at it on the phone the same
 * evening: "This looks terrible, have there still be just one set or 2 sets or whatever, and then
 * when I open it have there be two record buttons that say left and right on them. Your way is too
 * clunky." So the pills are "Set 1" ... "Set 5" exactly as a bilateral lift draws them, the reps and
 * load typed on a set land on BOTH of its rows, and the open set carries two record buttons, Left
 * and Right, each filming its own row. `groupSetRows` is the one place a row list becomes the sets
 * the screen draws; a bilateral lift groups one row per set and nothing about it changes.
 *
 * The side of a NEW row is decided by its set number (odd = left, even = right) so a pair stays a
 * pair however the rows are added. A row saved before sides existed has no side on the server: if
 * nothing was ever filmed on it, it takes its structural side the next time the day is saved (there
 * is no take whose arm could be misnamed); a row that already HOLDS a capture keeps null, because
 * which arm that take saw is a fact about the take and not a guess -- the export says so, and the
 * next take recorded on it from the Left or Right button names the side then. A bilateral exercise
 * has no side and builds exactly the rows it always did.
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

/** The side a row's record button is labelled with: the side the row recorded, else the side its
 *  number gives it. Never null on a unilateral lift -- a button has to say which arm it films. */
export function rowSideFor(
  row: { setNumber: number; side: BodySide | null | undefined },
  laterality: string | null | undefined,
): BodySide | null {
  return row.side ?? sideForNewSet(row.setNumber, laterality);
}

export type SetGroup<T> = { pairIndex: number; rows: T[] };

/** The sets the screen draws: on a unilateral lift each pair of rows is one set, on a bilateral
 *  lift every row is. Rows arrive in set-number order and stay in it. */
export function groupSetRows<T extends { setNumber: number }>(
  rows: readonly T[],
  laterality: string | null | undefined,
): SetGroup<T>[] {
  const groups: SetGroup<T>[] = [];
  for (const row of rows) {
    const pairIndex = pairIndexFor(row.setNumber, laterality);
    const last = groups[groups.length - 1];
    if (last && last.pairIndex === pairIndex) last.rows.push(row);
    else groups.push({ pairIndex, rows: [row] });
  }
  return groups;
}

/** "Set 2", on every lift. The side never appears on a pill: it is on the record button. */
export function setPillLabel(pairIndex: number): string {
  return `Set ${pairIndex}`;
}
