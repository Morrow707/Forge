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
