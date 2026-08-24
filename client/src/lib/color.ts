// Color math for the branding dialog: real WCAG contrast (for the "would
// this be readable" guardrail) plus small hex/HSL conversion helpers used
// to nudge a color into passing without the coach hand-picking a new one.

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("")}`;
}

// True WCAG relative luminance (gamma-corrected sRGB), not a simple RGB
// average -- see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance.
function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The real WCAG contrast ratio between two colors, from 1 (identical) to
 * 21 (black on white). Order of the two args doesn't matter. */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA for normal-size text: 4.5:1. */
export function meetsWcagAA(hex1: string, hex2: string): boolean {
  return contrastRatio(hex1, hex2) >= 4.5;
}

// Quick black/white text pick against a background -- a simple luminance
// heuristic, not the real WCAG math above. Used where a hard 4.5:1
// guarantee isn't the point, just a fast good-enough default (e.g. text
// color inside a small color swatch chip).
export function contrastForegroundHsl(bgHex: string): "#000000" | "#ffffff" {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return "#ffffff";
  const [r, g, b] = rgb;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150 ? "#000000" : "#ffffff";
}

function hexToHsl(hex: string): [number, number, number] | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      break;
    case g:
      h = ((b - r) / d + 2) * 60;
      break;
    default:
      h = ((r - g) / d + 4) * 60;
  }
  return [h, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

/** Converts a #RRGGBB hex color to this app's "H S% L%" CSS custom
 * property format (see index.css's --primary etc) -- every themed token
 * here is a raw space-separated HSL triplet consumed via hsl(var(--x)),
 * not a literal color, so a branding override has to match that shape
 * rather than just writing the hex straight into the variable. */
export function hexToHslTriplet(hex: string): string | null {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  const [h, s, l] = hsl;
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

/** Nudges a color's lightness (hue/saturation preserved) toward black or
 * white, one step at a time, until its auto-picked text color
 * (contrastForegroundHsl) would clear WCAG AA against it. Returns the
 * original color unchanged if it already passes or isn't a valid hex --
 * this is a one-tap "make this safe" fix, not a color redesign. */
export function nearestAccessibleColor(hex: string): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  const textColor = contrastForegroundHsl(hex);
  if (meetsWcagAA(hex, textColor)) return hex;

  const [h, s, l] = hsl;
  // Darkening helps white text pass, lightening helps black text pass.
  const towardDark = textColor === "#ffffff";
  let candidate = l;
  for (let i = 0; i < 50; i++) {
    candidate = towardDark ? Math.max(0, candidate - 2) : Math.min(100, candidate + 2);
    const next = hslToHex(h, s, candidate);
    if (meetsWcagAA(next, textColor)) return next;
    if (candidate === 0 || candidate === 100) break;
  }
  return hex;
}
