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
 *  Takes "#0B3D91", "0B3D91", "#036", "036", any case, with spaces around it. */
export function normalizeHex(input: string): string | null {
  // A leading "#", if any: "#0B3D91" loses it, "0B3D91" is left alone.
  // https://regex101.com/?regex=%5E%23&testString=%230B3D91%0A0B3D91
  const raw = input.trim().replace(/^#/, "");
  // Three or six hex digits and nothing else: "036" and "0B3D91" pass, "navy" and "0326" do not.
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

/** Ready-made team colors (2026-11-20, Scott: "more colors for the primary and secondary"). Plain
 *  color names an athletic program uses, never a school's name. Grouped so the grid reads blues,
 *  greens, golds, reds, purples, then neutrals. */
export const TEAM_COLORS: readonly { name: string; hex: string }[] = [
  { name: "Navy", hex: "#0B2A5B" },
  { name: "Midnight", hex: "#14213D" },
  { name: "Royal", hex: "#1D4ED8" },
  { name: "Cobalt", hex: "#0047AB" },
  { name: "Columbia blue", hex: "#9BCBEB" },
  { name: "Powder blue", hex: "#B0D0E8" },
  { name: "Sky", hex: "#38BDF8" },
  { name: "Carolina blue", hex: "#4B9CD3" },
  { name: "Teal", hex: "#00827F" },
  { name: "Aqua", hex: "#00B5AD" },
  { name: "Kelly green", hex: "#138A36" },
  { name: "Forest", hex: "#1B4D3E" },
  { name: "Hunter", hex: "#355E3B" },
  { name: "Lime", hex: "#84CC16" },
  { name: "Olive", hex: "#5B6B2F" },
  { name: "Athletic gold", hex: "#FFB81C" },
  { name: "Vegas gold", hex: "#C5B358" },
  { name: "Old gold", hex: "#CFB87C" },
  { name: "Yellow", hex: "#FFD100" },
  { name: "Orange", hex: "#FF6A13" },
  { name: "Burnt orange", hex: "#BF5700" },
  { name: "Copper", hex: "#B87333" },
  { name: "Scarlet", hex: "#BB0000" },
  { name: "Red", hex: "#C8102E" },
  { name: "Cardinal", hex: "#8C1515" },
  { name: "Crimson", hex: "#9E1B32" },
  { name: "Maroon", hex: "#6B1F2A" },
  { name: "Pink", hex: "#EC4899" },
  { name: "Magenta", hex: "#C2185B" },
  { name: "Purple", hex: "#4B2E83" },
  { name: "Violet", hex: "#7C3AED" },
  { name: "Lavender", hex: "#B9A3E3" },
  { name: "Brown", hex: "#4E3629" },
  { name: "Tan", hex: "#C8A97E" },
  { name: "Cream", hex: "#F3E5C0" },
  { name: "Black", hex: "#111111" },
  { name: "Charcoal", hex: "#36454F" },
  { name: "Steel", hex: "#71797E" },
  { name: "Silver", hex: "#A2AAAD" },
  { name: "White", hex: "#FFFFFF" },
];

const PERCENT = 100;
const HUE_DEGREES = 360;
const HUE_SEXTANT = 60;
const HALF = 2;
// Where a shade row's lightness steps sit, light to dark (percent).
const SHADE_LIGHTNESS = [92, 80, 66, 52, 40, 28, 18] as const;

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const n = normalizeHex(hex) ?? "#000000";
  const [r, g, b] = [n.slice(1, 3), n.slice(3, 5), n.slice(5, 7)].map((c) => Number.parseInt(c, HEX_BASE) / BYTE);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / HALF;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(HALF * l - 1));
  const h =
    max === r ? HUE_SEXTANT * (((g - b) / d) % (HUE_DEGREES / HUE_SEXTANT)) : max === g ? HUE_SEXTANT * ((b - r) / d + HALF) : HUE_SEXTANT * ((r - g) / d + HALF * HALF);
  return { h: (h + HUE_DEGREES) % HUE_DEGREES, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(HALF * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / HUE_SEXTANT) % HALF) - 1));
  const m = l - c / HALF;
  const sextant = Math.floor(h / HUE_SEXTANT) % (HUE_DEGREES / HUE_SEXTANT);
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sextant];
  return hexFromRgb((r + m) * BYTE, (g + m) * BYTE, (b + m) * BYTE);
}

/** Lighter and darker versions of a color, lightest first, keeping its hue and saturation: one
 *  team color becomes a whole row to pick from. */
export function shadesOf(hex: string): string[] {
  const { h, s } = hexToHsl(hex);
  return SHADE_LIGHTNESS.map((l) => hslToHex(h, s, l / PERCENT)).filter((c, i, all) => all.indexOf(c) === i);
}

/** A color's hue, 0-359, for "match primary" on the background tint. */
export function hueOf(hex: string): number {
  return Math.round(hexToHsl(hex).h) % HUE_DEGREES;
}
