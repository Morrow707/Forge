import { describe, expect, it } from "vitest";
import { colorDistance, dominantColorsFromPixels, suggestBrandPair } from "./image-colors";
import { CROP_SHAPES, cropRect, fitRect, initialCropView, panView } from "./image-crop";

// THE LOGO SWATCHES AND THE CROP (Scott, 2026-11-20): six swatches that were really two colors,
// a white or black logo that could never offer its own white or black, and an upload with no
// crop and no preview.

const SIZE = 32;
const RGBA = 4;
const SAME = 6;
type Px = readonly [number, number, number, number];
type Box = readonly [number, number, number, number];

const OPAQUE = 255;
const HEX_BASE = 16;
const px = (hex: string, alpha = OPAQUE): Px => [
  Number.parseInt(hex.slice(1, 3), HEX_BASE),
  Number.parseInt(hex.slice(3, 5), HEX_BASE),
  Number.parseInt(hex.slice(5, 7), HEX_BASE),
  alpha,
];

const WHITE = "#ffffff";
const BLACK = "#0a0a0a";
const NAVY = "#0b2a5b";
const GREEN = "#1b4d3e";
const GREEN_EDGE = "#215445"; // the blended edge of the green shape
const AMBER = "#e8a33d";
const AMBER_EDGE = "#e29e42";
const CLEAR = px("#000000", 0);

// Shapes on the 32 x 32 test image, as [x0, y0, x1, y1).
const MIDDLE_SQUARE: Box = [8, 8, 24, 24];
const GREEN_BAR: Box = [6, 6, 26, 16];
const GREEN_RIM: Box = [5, 5, 27, 17];
const AMBER_BAR: Box = [6, 18, 26, 26];
const AMBER_RIM: Box = [5, 17, 27, 27];
const LARGE_SQUARE: Box = [4, 4, 28, 28];
const CENTRE = 16;

const inBox = (x: number, y: number, [x0, y0, x1, y1]: Box) => x >= x0 && x < x1 && y >= y0 && y < y1;

/** A SIZE x SIZE image: each pixel takes the first layer whose box holds it, else the base. */
function image(base: Px, layers: { box: Box; color: Px }[] = []): Uint8ClampedArray {
  const pixels = Array.from({ length: SIZE * SIZE }, (_, i) => {
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    return layers.find((l) => inBox(x, y, l.box))?.color ?? base;
  });
  return Uint8ClampedArray.from(pixels.flat());
}
const colorsOf = (data: Uint8ClampedArray) => dominantColorsFromPixels(data, SIZE, SIZE);
const near = (got: string, want: string) => colorDistance(got, want) < SAME;

describe("the colors offered from a logo", () => {
  it("merges blended edge shades into the color they belong to, and drops the white square around it", () => {
    const colors = colorsOf(
      image(px(WHITE), [
        { box: GREEN_BAR, color: px(GREEN) },
        { box: GREEN_RIM, color: px(GREEN_EDGE) },
        { box: AMBER_BAR, color: px(AMBER) },
        { box: AMBER_RIM, color: px(AMBER_EDGE) },
      ]),
    );
    expect(colors).toHaveLength(2);
    expect(near(colors[0], GREEN)).toBe(true);
    expect(near(colors[1], AMBER)).toBe(true);
  });

  it("offers a black logo's black, and still drops the white page it sits on", () => {
    const colors = colorsOf(image(px(WHITE), [{ box: MIDDLE_SQUARE, color: px(BLACK) }]));
    expect(colors.map((c) => near(c, BLACK))).toEqual([true]);
  });

  it("offers a white logo's white when it sits on a navy field, and keeps the navy", () => {
    const colors = colorsOf(image(px(NAVY), [{ box: MIDDLE_SQUARE, color: px(WHITE) }]));
    expect(colors.some((c) => near(c, NAVY))).toBe(true);
    expect(colors.some((c) => near(c, WHITE))).toBe(true);
  });

  it("offers a white logo on a transparent background", () => {
    const colors = colorsOf(image(CLEAR, [{ box: MIDDLE_SQUARE, color: px(WHITE) }]));
    expect(colors.map((c) => near(c, WHITE))).toEqual([true]);
  });

  it("keeps a full-bleed colored logo's color although it fills the edge", () => {
    expect(colorsOf(image(px(GREEN))).map((c) => near(c, GREEN))).toEqual([true]);
  });

  it("does not offer the soft rim where a colored shape meets a white page", () => {
    const MAROON = "#7a1f1f";
    const RIM = "#bc8f8f"; // half maroon, half white
    const colors = colorsOf(image(px(WHITE), [{ box: GREEN_BAR, color: px(MAROON) }, { box: GREEN_RIM, color: px(RIM) }]));
    expect(colors.map((c) => near(c, MAROON))).toEqual([true]);
  });

  it("does not offer a speck", () => {
    const speck: Box = [CENTRE, CENTRE, CENTRE + 1, CENTRE + 1];
    const colors = colorsOf(image(px(WHITE), [{ box: speck, color: px(AMBER) }, { box: LARGE_SQUARE, color: px(GREEN) }]));
    expect(colors.map((c) => near(c, GREEN))).toEqual([true]);
  });

  it("returns nothing for a fully transparent image", () => {
    expect(colorsOf(image(CLEAR))).toEqual([]);
    expect(RGBA * SIZE * SIZE).toBe(image(CLEAR).length);
  });
});

describe("the suggested primary and secondary", () => {
  it("takes the most-used colorful color as primary and the most different one as secondary", () => {
    expect(suggestBrandPair([GREEN, "#234f40", AMBER])).toEqual({ primary: GREEN, secondary: AMBER });
  });

  it("prefers a color over a neutral for the primary even when the neutral covers more", () => {
    expect(suggestBrandPair([BLACK, "#b91c1c"])).toEqual({ primary: "#b91c1c", secondary: BLACK });
  });

  it("has no secondary to suggest for a one-color logo, and nothing for none", () => {
    expect(suggestBrandPair([GREEN])).toEqual({ primary: GREEN, secondary: null });
    expect(suggestBrandPair([])).toBeNull();
  });
});

describe("the crop", () => {
  // A 400 x 200 picture cropped to a square: the largest square is 200 wide, centred at x 100.
  const W = 400;
  const H = 200;
  const FRAME = 200;
  const DRAG = 50;
  const FAR = 5000;
  const ZOOM_TWICE = 2;
  const square = CROP_SHAPES.logo.aspect;
  const start = initialCropView();

  it("starts on the largest centred square of a wide picture", () => {
    expect(cropRect(W, H, square, start)).toEqual({ x: H / 2, y: 0, w: H, h: H });
  });

  it("zooms in around the centre and never leaves the picture", () => {
    const half = H / ZOOM_TWICE;
    expect(cropRect(W, H, square, { ...start, zoom: ZOOM_TWICE })).toEqual({ x: (W - half) / 2, y: (H - half) / 2, w: half, h: half });
    expect(cropRect(W, H, square, { ...start, zoom: ZOOM_TWICE, centerX: 0, centerY: 1 })).toEqual({ x: 0, y: H - half, w: half, h: half });
  });

  it("moves with a drag and stops at the picture's edge", () => {
    expect(cropRect(W, H, square, panView(W, H, square, start, DRAG, 0, FRAME)).x).toBe(H / 2 - DRAG);
    expect(cropRect(W, H, square, panView(W, H, square, start, FAR, 0, FRAME)).x).toBe(0);
  });

  it("fits the whole picture inside the frame when asked, centred", () => {
    const OUT = CROP_SHAPES.logo.outWidth;
    expect(fitRect(W, H, OUT, OUT)).toEqual({ x: 0, y: OUT / 4, w: OUT, h: OUT / 2 });
  });

  it("cuts each image to the shape of the place it is shown", () => {
    const WIDE = 4;
    const PHONE = 9 / 16;
    expect(CROP_SHAPES.logo.aspect).toBe(1);
    expect(CROP_SHAPES.wordmark.aspect).toBe(WIDE);
    expect(CROP_SHAPES.background.aspect).toBeCloseTo(PHONE);
    expect(CROP_SHAPES.background.type).toBe("image/jpeg");
    expect(CROP_SHAPES.logo.type).toBe("image/png");
  });
});
