/**
 * FEET AND INCHES TO TYPE, TOTAL INCHES TO STORE.
 *
 * Scott, 2026-10-01: "for height, give them a foot and inches, but have it convert it in the
 * background for us, easier to type in, im 6'3\" and thats what? 75\" total? not sure off the
 * top of my head."
 *
 * That uncertainty is the whole argument. Nobody in the United States knows their height in
 * inches without doing arithmetic, so a single "Height (inches)" box asks every athlete to do
 * a conversion before they can answer a question they already know the answer to. Some will
 * get it wrong, and a wrong height is not a cosmetic error here: it is the ruler the camera
 * converts pixels into metres with, so a 6'3" athlete who types 63 makes every distance and
 * speed on their sets about 16% short.
 *
 * NOTHING ABOUT STORAGE CHANGES. `users.heightIn` stays total inches, every schema still takes
 * `heightIn`, and the camera keeps reading one number. This is an input format, not a data
 * model -- which is what makes it safe to change on four screens at once with no migration.
 */

export const MAX_HEIGHT_INCHES = 120;

export function toTotalInches(feet: number, inches: number): number {
  return feet * 12 + inches;
}

/**
 * Inches over 11 carry into feet, so somebody who types 5 feet 14 gets 6'2" rather than a
 * validation error. People do type that, and refusing it teaches nothing.
 */
export function fromTotalInches(total: number): { feet: number; inches: number } {
  const whole = Math.max(0, Math.round(total));
  return { feet: Math.floor(whole / 12), inches: whole % 12 };
}

/** 75 -> `6'3"`. Used for the live echo under the fields, so the arithmetic is visible. */
export function formatFeetInches(total: number): string {
  const { feet, inches } = fromTotalInches(total);
  return `${feet}'${inches}"`;
}

/**
 * Parses whatever is in the two boxes. Returns null when there is not yet enough to form a
 * height, so a half-filled form reads as unanswered rather than as zero -- "0 inches tall" is
 * a number the camera would happily use.
 */
export function parseFeetInches(
  feetRaw: string,
  inchesRaw: string,
): number | null {
  const feetTrimmed = feetRaw.trim();
  const inchesTrimmed = inchesRaw.trim();
  if (feetTrimmed === "" && inchesTrimmed === "") return null;
  const feet = feetTrimmed === "" ? 0 : Number(feetTrimmed);
  const inches = inchesTrimmed === "" ? 0 : Number(inchesTrimmed);
  if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null;
  if (feet < 0 || inches < 0) return null;
  // Feet alone is a height; inches alone, with no feet, is not one anybody means.
  if (feetTrimmed === "") return null;
  const total = toTotalInches(feet, inches);
  if (total <= 0 || total > MAX_HEIGHT_INCHES) return null;
  return total;
}
