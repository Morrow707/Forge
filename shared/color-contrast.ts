// Picks black or white text over a given #RRGGBB background using a
// simple weighted-RGB luminance heuristic -- not true WCAG relative
// luminance (see client/src/lib/color.ts's contrastRatio/meetsWcagAA for
// that, used where a real 4.5:1 guarantee actually matters, e.g. the
// branding dialog's live contrast warning). This lighter version is for
// spots that just need a quick, good-enough readable pick against an
// arbitrary brand color with no UI to show a warning in.
export function pickReadableTextHex(bgHex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(bgHex.trim());
  if (!match) return "#ffffff";
  const r = parseInt(match[1].slice(0, 2), 16) / 255;
  const g = parseInt(match[1].slice(2, 4), 16) / 255;
  const b = parseInt(match[1].slice(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.6 ? "#111111" : "#ffffff";
}
