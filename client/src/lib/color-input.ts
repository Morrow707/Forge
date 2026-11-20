/** EVERY COLOR IN THE APP IS TYPED, PICKED OR TAKEN FROM A PICTURE THE SAME WAY (Scott,
 *  2026-11-20: "wherever there is a place to add color ... a space to add colors, to change colors
 *  or to input colors, and the little inkblot thing where i can click on an image and capture that
 *  color"). The pure half of ColorField and ImageColorPicker, tested without a browser. */

const HEX_BASE = 16;
const BYTE = 255;
const SHORT_HEX_LENGTH = 3;
const FULL_HEX_LENGTH = 6;
const HEX_DIGITS_PER_CHANNEL = 2;
const GREEN = 1;
const BLUE = 2;
const RECENT_KEY = "forge:recent-colors";
export const MAX_RECENT_COLORS = 8;

/** A color as a person might type or paste it, as "#RRGGBB", or null when it is not one.
 *  Takes "#003262", "003262", "#036", "036", any case, with spaces around it. */
export function normalizeHex(input: string): string | null {
  // A leading "#", if any: "#003262" loses it, "003262" is left alone.
  // https://regex101.com/?regex=%5E%23&testString=%23003262%0A003262
  const raw = input.trim().replace(/^#/, "");
  // Three or six hex digits and nothing else: "036" and "003262" pass, "navy" and "0326" do not.
  // https://regex101.com/?regex=%5E(%5B0-9a-fA-F%5D%7B3%7D%7C%5B0-9a-fA-F%5D%7B6%7D)%24
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) return null;
  const full = raw.length === SHORT_HEX_LENGTH ? [...raw].map((c) => c + c).join("") : raw;
  return full.length === FULL_HEX_LENGTH ? `#${full.toUpperCase()}` : null;
}

/** "#RRGGBB" for three 0-255 channels. */
export function hexFromRgb(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(BYTE, Math.round(v))).toString(HEX_BASE).padStart(HEX_DIGITS_PER_CHANNEL, "0")).join("").toUpperCase()}`;
}

/** The color of one pixel in RGBA bytes laid out width pixels to a row. A see-through pixel has
 *  no color worth taking, so it answers null rather than black. */
export function pixelHex(data: ArrayLike<number>, width: number, x: number, y: number): string | null {
  const RGBA = 4;
  const ALPHA = 3;
  const SEE_THROUGH = 16;
  const o = (Math.floor(y) * width + Math.floor(x)) * RGBA;
  if (o < 0 || o + ALPHA >= data.length || data[o + ALPHA] < SEE_THROUGH) return null;
  return hexFromRgb(data[o], data[o + GREEN], data[o + BLUE]);
}

/** The newest color first, no repeats, at most MAX_RECENT_COLORS. */
export function withRecent(list: readonly string[], hex: string): string[] {
  return [hex, ...list.filter((c) => c !== hex)].slice(0, MAX_RECENT_COLORS);
}

/** Colors this browser used lately, for the quick row under every color field. A convenience
 *  kept on this device only; an empty list when storage is unavailable. */
export function readRecentColors(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string" && normalizeHex(c) === c) : [];
  } catch {
    return [];
  }
}

export function rememberColor(hex: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(withRecent(readRecentColors(), hex)));
  } catch {
    // Private browsing or storage blocked: the field still works, it just remembers nothing.
  }
}
