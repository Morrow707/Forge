/** THE COLORS IN A LOGO, AS A PERSON WOULD NAME THEM (rewritten 2026-11-20).
 *
 *  Scott, reading the "From your logo, tap to use" row: six swatches that were really two colors,
 *  and a white or black logo that could never offer its white or black. So:
 *   - shades that look the same to the eye are one swatch (merged by perceived distance, CIE76
 *     in Lab, not by RGB buckets, which split one green into three at an anti-aliased edge);
 *   - a color is dropped as BACKGROUND only when it fills the image's edge and is a neutral (the
 *     white square around a crest), never because it is white or black -- a black logo on white
 *     offers its black, a white logo on navy offers its white, a full-bleed green logo keeps green;
 *   - specks under a small share of the picture (edge blending) are not offered at all.
 *  suggestBrandPair names a primary and a secondary from what is left; the page only suggests.
 *
 *  The counting works on raw RGBA bytes so it is tested without a browser; the canvas wrappers
 *  below just hand it a downscaled image. */

const SAMPLE_SIZE = 64;
const OPAQUE_ALPHA = 200;
const RGB_BINS = 16;
/** Two colors closer than this (CIE76, in Lab) read as the same color. */
const SAME_COLOR_DISTANCE = 14;
/** A color filling at least this share of the opaque edge pixels may be the background. */
const BACKGROUND_EDGE_SHARE = 0.4;
/** ...and is only dropped when it is a neutral: white, black or grey. */
const NEUTRAL_CHROMA = 12;
/** A color has to cover this share of the counted pixels to be offered. */
const MIN_SHARE = 0.02;
const DEFAULT_MAX = 6;
const RGBA = 4;
// Where each channel sits in one pixel's four RGBA bytes.
const G_BYTE = 1;
const B_BYTE = 2;
const A_BYTE = 3;
const MAX_CHANNEL = 255;
const HEX_BASE = 16;
const HEX_DIGITS = 2;

type Rgb = { r: number; g: number; b: number };
type Lab = { l: number; a: number; b: number };
type Cluster = { count: number; edge: number; r: number; g: number; b: number };

// sRGB to CIE Lab (D65), the standard formulas.
const LINEAR_THRESHOLD = 0.04045;
const LINEAR_SLOPE = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_SCALE = 1.055;
const GAMMA = 2.4;
// The D65 white point, the reference white for sRGB.
const D65_X = 0.95047;
const D65_Z = 1.08883;
const D65 = { x: D65_X, y: 1, z: D65_Z };
const LAB_EPSILON = 0.008856;
const LAB_KAPPA = 7.787;
const LAB_L_SCALE = 116;
const LAB_L_OFFSET = 16;
const LAB_OFFSET = LAB_L_OFFSET / LAB_L_SCALE;
const LAB_A_SCALE = 500;
const LAB_B_SCALE = 200;
const CUBE_ROOT = 1 / 3; // eslint-disable-line no-magic-numbers -- a cube root is a third
// The sRGB to CIE XYZ matrix, each row one of X, Y and Z.
const X_FROM_RGB = [0.4124, 0.3576, 0.1805] as const; // eslint-disable-line no-magic-numbers -- standard sRGB matrix
const Y_FROM_RGB = [0.2126, 0.7152, 0.0722] as const; // eslint-disable-line no-magic-numbers -- standard sRGB matrix
const Z_FROM_RGB = [0.0193, 0.1192, 0.9505] as const; // eslint-disable-line no-magic-numbers -- standard sRGB matrix
const RGB_TO_XYZ = [X_FROM_RGB, Y_FROM_RGB, Z_FROM_RGB] as const;

function toLab({ r, g, b }: Rgb): Lab {
  const lin = [r, g, b].map((c) => {
    const v = c / MAX_CHANNEL;
    return v <= LINEAR_THRESHOLD ? v / LINEAR_SLOPE : ((v + GAMMA_OFFSET) / GAMMA_SCALE) ** GAMMA;
  });
  const [x, y, z] = RGB_TO_XYZ.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]);
  const f = (t: number) => (t > LAB_EPSILON ? t ** CUBE_ROOT : LAB_KAPPA * t + LAB_OFFSET);
  const fx = f(x / D65.x);
  const fy = f(y / D65.y);
  const fz = f(z / D65.z);
  return { l: LAB_L_SCALE * fy - LAB_L_OFFSET, a: LAB_A_SCALE * (fx - fy), b: LAB_B_SCALE * (fy - fz) };
}

/** How different two colors look (CIE76). */
export function colorDistance(a: string, b: string): number {
  const la = toLab(hexToRgb(a));
  const lb = toLab(hexToRgb(b));
  return Math.hypot(la.l - lb.l, la.a - lb.a, la.b - lb.b);
}

/** How colorful a color is: near 0 for white, black and grey. */
export function chroma(hex: string): number {
  const { a, b } = toLab(hexToRgb(hex));
  return Math.hypot(a, b);
}

// "#rrggbb": where each channel's two hex digits start.
const RED_AT = 1;
const GREEN_AT = RED_AT + HEX_DIGITS;
const BLUE_AT = GREEN_AT + HEX_DIGITS;
const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + HEX_DIGITS), HEX_BASE);

function hexToRgb(hex: string): Rgb {
  return { r: channel(hex, RED_AT), g: channel(hex, GREEN_AT), b: channel(hex, BLUE_AT) };
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(MAX_CHANNEL, Math.round(v))).toString(HEX_BASE).padStart(HEX_DIGITS, "0")).join("")}`;
}

/** How far a color lies from the straight mix of two others, in Lab: near 0 for a blend of them. */
function distanceToSegment(p: Lab, a: Lab, b: Lab): number {
  const ab = { l: b.l - a.l, a: b.a - a.a, b: b.b - a.b };
  const len2 = ab.l ** 2 + ab.a ** 2 + ab.b ** 2;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.l - a.l) * ab.l + (p.a - a.a) * ab.a + (p.b - a.b) * ab.b) / len2));
  return Math.hypot(p.l - (a.l + t * ab.l), p.a - (a.a + t * ab.a), p.b - (a.b + t * ab.b));
}

const mean = (c: Cluster): Rgb => ({ r: c.r / c.count, g: c.g / c.count, b: c.b / c.count });

/** The colors a person would name in an image, most-covered first. `data` is RGBA bytes of a
 *  width x height image (a canvas's ImageData). */
export function dominantColorsFromPixels(data: Uint8ClampedArray, width: number, height: number, max = DEFAULT_MAX): string[] {
  // 1. Count opaque pixels into fine bins, noting which sit on the image's edge.
  const bins = new Map<number, Cluster>();
  const binWidth = (MAX_CHANNEL + 1) / RGB_BINS;
  const total = width * height;
  const counted = Array.from({ length: total }, (_, i) => i).reduce(
    (acc, i) => {
      const o = i * RGBA;
      if (data[o + A_BYTE] < OPAQUE_ALPHA) return acc;
      const [r, g, b] = [data[o], data[o + G_BYTE], data[o + B_BYTE]];
      const x = i % width;
      const y = Math.floor(i / width);
      const onEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const key = (Math.floor(r / binWidth) * RGB_BINS + Math.floor(g / binWidth)) * RGB_BINS + Math.floor(b / binWidth);
      const bin = bins.get(key) ?? { count: 0, edge: 0, r: 0, g: 0, b: 0 };
      bins.set(key, { count: bin.count + 1, edge: bin.edge + (onEdge ? 1 : 0), r: bin.r + r, g: bin.g + g, b: bin.b + b });
      return { pixels: acc.pixels + 1, edge: acc.edge + (onEdge ? 1 : 0) };
    },
    { pixels: 0, edge: 0 },
  );
  if (counted.pixels === 0) return [];

  // 2. Merge bins that look like the same color, biggest first.
  const merged = [...bins.values()]
    .sort((a, b) => b.count - a.count)
    .reduce<Cluster[]>((clusters, bin) => {
      const lab = toLab(mean(bin));
      const near = clusters.findIndex((c) => {
        const cl = toLab(mean(c));
        return Math.hypot(cl.l - lab.l, cl.a - lab.a, cl.b - lab.b) < SAME_COLOR_DISTANCE;
      });
      if (near < 0) return [...clusters, bin];
      return clusters.map((c, i) =>
        i === near ? { count: c.count + bin.count, edge: c.edge + bin.edge, r: c.r + bin.r, g: c.g + bin.g, b: c.b + bin.b } : c,
      );
    }, []);

  // 3. Drop the background (a neutral that fills the edge), blends and specks, then name the rest.
  const isBackground = (c: Cluster) =>
    counted.edge > 0 && c.edge / counted.edge >= BACKGROUND_EDGE_SHARE && chroma(toHex(mean(c))) < NEUTRAL_CHROMA;
  // A blend: a smaller color lying between two bigger ones (or a bigger one and the background),
  // the soft rim where a maroon circle meets a white page. It is no color anyone picked.
  const labOf = (c: Cluster) => toLab(mean(c));
  const isBlend = (c: Cluster) => {
    const p = labOf(c);
    const bigger = merged.filter((o) => o !== c && o.count > c.count).map(labOf);
    return bigger.some((a, i) => bigger.slice(i + 1).some((b) => distanceToSegment(p, a, b) < SAME_COLOR_DISTANCE));
  };
  const kept = merged.filter((c) => !isBackground(c) && !isBlend(c));
  const keptPixels = kept.reduce((n, c) => n + c.count, 0);
  return kept
    .filter((c) => c.count / Math.max(1, keptPixels) >= MIN_SHARE)
    .sort((a, b) => b.count - a.count)
    .slice(0, max)
    .map((c) => toHex(mean(c)));
}

/** A suggested primary and secondary from a logo's colors: the most-used colorful one, then the
 *  one that looks most different from it. Only a suggestion; the coach chooses. */
export function suggestBrandPair(colors: string[]): { primary: string; secondary: string | null } | null {
  if (colors.length === 0) return null;
  const primary = colors.find((c) => chroma(c) >= NEUTRAL_CHROMA) ?? colors[0];
  const rest = colors.filter((c) => c !== primary);
  const secondary = rest.reduce<string | null>(
    (best, c) => (best === null || colorDistance(primary, c) > colorDistance(primary, best) ? c : best),
    null,
  );
  return { primary, secondary };
}

/** The colors in a loaded image (a logo, or any picture a coach drops in). */
export function extractDominantColors(img: HTMLImageElement, max = DEFAULT_MAX): string[] {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  try {
    return dominantColorsFromPixels(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data, SAMPLE_SIZE, SAMPLE_SIZE, max);
  } catch {
    // A cross-origin image cannot be read back; no swatches rather than an error.
    return [];
  }
}

/** Reads a File into an image and extracts its colors. Resolves [] for anything unreadable. */
export function extractColorsFromFile(file: File, max = DEFAULT_MAX): Promise<string[]> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(extractDominantColors(img, max));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve([]);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}
