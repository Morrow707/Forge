/** Samples an image's pixels for one-tap "exact color" swatches. Downscales to a small canvas
 *  first (only the mix matters), buckets by a coarse quantisation so anti-aliased neighbours
 *  collapse into one swatch, and drops near-white, near-black and transparent pixels, which on
 *  a logo or a jersey photo are background rather than a color anyone wants.
 *
 *  Lived inside team-branding-dialog.tsx until 2026-10-03; the Branding page uses it for the
 *  logo and for any picture a coach drops in ("pull colors from an image"). */
export function extractDominantColors(img: HTMLImageElement, max = 6): string[] {
  const canvas = document.createElement("canvas");
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, size, size);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return [];
  }
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  const QUANT = 24;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue;
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    if (maxc > 240 && minc > 225) continue;
    if (maxc < 20) continue;
    const key = `${Math.round(r / QUANT)}-${Math.round(g / QUANT)}-${Math.round(b / QUANT)}`;
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, max)
    .map(({ count, r, g, b }) => {
      const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n / count)));
      return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    });
}

/** Reads a File into an image and extracts its swatches. Resolves [] for anything unreadable. */
export function extractColorsFromFile(file: File, max = 6): Promise<string[]> {
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
