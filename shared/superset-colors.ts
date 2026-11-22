/* THE SUPERSET HUES, as hex, for anything that cannot read a Tailwind class (a printed PDF).
 *
 * client/src/lib/supersets.ts draws a superset with a colored letter badge and a colored left
 * border, one hue per letter: A the program's primary color, then B blue, C purple, D emerald,
 * E amber, F pink, G teal, H rose. Those are Tailwind classes there (Tailwind needs the class
 * names written out), and these are the same colors as hex, in the same order, so the weight-room
 * sheet's PDF and the app read one list. client/src/lib/superset-colors-match.test.ts holds the
 * two in step: a hue changed in one place and not the other fails there. */

/** Tailwind's 500 shade of each letter's hue, A..H. A is null: it is the program's primary color. */
export const SUPERSET_TAILWIND_HUES = [null, "blue-500", "purple-500", "emerald-500", "amber-500", "pink-500", "teal-500", "rose-500"] as const;
export const SUPERSET_HEX: readonly (string | null)[] = [null, "#3b82f6", "#a855f7", "#10b981", "#f59e0b", "#ec4899", "#14b8a6", "#f43f5e"];

const CHAR_CODE_A = 65;

/** The hue for a label ("A", "B2"), keyed off its letter like colorForLabel; A is `primary`. */
export function supersetHexForLabel(label: string, primary: string): string {
  const index = label.toUpperCase().charCodeAt(0) - CHAR_CODE_A;
  const hex = SUPERSET_HEX[((index % SUPERSET_HEX.length) + SUPERSET_HEX.length) % SUPERSET_HEX.length];
  return hex ?? primary;
}
