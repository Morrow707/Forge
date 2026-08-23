// Converts a coach-picked #RRGGBB into the space-separated "H S% L%" triplet
// this app's CSS custom properties store (see index.css's --primary etc.) --
// every one of them gets consumed as hsl(var(--primary)) by tailwind.config.ts,
// so a hex string can't be dropped straight in; it has to become that same
// triplet shape or the CSS variable override silently does nothing.
export function hexToHslTriplet(hex: string): string | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const r = parseInt(match[1].slice(0, 2), 16) / 255;
  const g = parseInt(match[1].slice(2, 4), 16) / 255;
  const b = parseInt(match[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Picks black or white text over a given #RRGGBB background using the
// standard relative-luminance threshold (WCAG's own "which reads better"
// cutoff) -- a coach's brand color can land anywhere on the lightness
// scale (a bright gold vs. a navy), and --primary-foreground has to follow
// it or button/active-tab text goes unreadable against their own color.
export function contrastForegroundHsl(hex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "0 0% 100%";
  const r = parseInt(match[1].slice(0, 2), 16) / 255;
  const g = parseInt(match[1].slice(2, 4), 16) / 255;
  const b = parseInt(match[1].slice(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.6 ? "0 0% 4%" : "0 0% 100%";
}

// WCAG's actual relative luminance -- gamma-corrected linear RGB, not the
// simple weighted-average heuristic contrastForegroundHsl above uses for its
// quick black-or-white pick. This is the real building block the spec's
// contrast-ratio formula requires; contrastForegroundHsl is left as-is
// (already shipped, already fine for "pick black or white") rather than
// rewritten to share this, since its threshold was tuned empirically, not
// derived from the WCAG ratio itself.
function relativeLuminance(hex: string): number | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const r = channel(parseInt(match[1].slice(0, 2), 16) / 255);
  const g = channel(parseInt(match[1].slice(2, 4), 16) / 255);
  const b = channel(parseInt(match[1].slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// The real WCAG 2.x contrast-ratio formula: (L_lighter + 0.05) / (L_darker +
// 0.05), always expressed as a ratio >= 1. Returns null (rather than
// throwing) on an invalid hex so a caller mid-typing a color doesn't need
// its own try/catch -- same "null on bad input" convention hexToHslTriplet
// already uses.
export function contrastRatio(hex1: string, hex2: string): number | null {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  if (l1 === null || l2 === null) return null;
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// WCAG AA's normal-text threshold (4.5:1) -- the one that matters here,
// since a coach's brand color shows up as button/active-tab/nav text at
// ordinary sizes, not large display type (which AA only requires 3:1 for).
export function meetsWcagAA(hex1: string, hex2: string): boolean {
  const ratio = contrastRatio(hex1, hex2);
  return ratio !== null && ratio >= 4.5;
}
