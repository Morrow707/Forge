import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_RECENT_COLORS, hexFromRgb, normalizeHex, pixelHex, withRecent } from "./color-input";

// EVERY COLOR A PERSON CAN SET GOES THROUGH ColorField (Scott, 2026-11-20: "wherever there is a
// place to add color ... a space to add colors, to change colors or to input colors, and the
// little inkblot thing where i can click on an image and capture that color"). A bare color wheel
// has no box to type a code into and no eyedropper, so it is FORBIDDEN outside ColorField.

const CLIENT = join(__dirname, "..");
const ALLOWED = new Set([join(CLIENT, "components", "color-field.tsx")]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Source with comments removed, so prose about a color wheel never counts as one. */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\*|\*|\/\/)/.test(line))
    .map((line) => line.replace(/\s\/\/.*$/, ""))
    .join("\n");
}

// A color input in JSX, however it is quoted: type="color", type='color', type={"color"}.
const COLOR_INPUT = /type=(?:"color"|'color'|\{\s*["']color["']\s*\})/;

describe("every color field", () => {
  it("is a ColorField: no bare color wheel anywhere else in the client", () => {
    const offenders = sourceFiles(CLIENT).filter((f) => !ALLOWED.has(f) && COLOR_INPUT.test(stripComments(readFileSync(f, "utf8"))));
    expect(offenders.map((f) => f.slice(CLIENT.length))).toEqual([]);
  });

  it("finds a bare color wheel when one is written, and ignores one quoted in a comment", () => {
    expect(COLOR_INPUT.test(stripComments('<input type="color" value={x} />'))).toBe(true);
    expect(COLOR_INPUT.test(stripComments("{/* was <input type=\"color\" /> */}\n// type=\"color\""))).toBe(false);
  });

  it("ColorField itself offers the code box, the wheel and the eyedropper", () => {
    const src = readFileSync(join(CLIENT, "components", "color-field.tsx"), "utf8");
    expect(src).toMatch(/<Input\b/);
    expect(src).toMatch(COLOR_INPUT);
    expect(src).toMatch(/<ImageColorPicker\b/);
    expect(src).toMatch(/data-testid="color-field-eyedropper"/);
  });

  it("every video drawing tool with preset pen colors also offers the coach's own", () => {
    const tools = sourceFiles(join(CLIENT, "components")).filter((f) => /video-.*\.tsx$/.test(f));
    const withPresets = tools.filter((f) => /\b(DRAW_)?COLORS\.map\(/.test(stripComments(readFileSync(f, "utf8"))));
    expect(withPresets.length).toBeGreaterThanOrEqual(3);
    expect(withPresets.filter((f) => !/<CustomPenColor\b/.test(readFileSync(f, "utf8"))).map((f) => f.slice(CLIENT.length))).toEqual([]);
  });
});

describe("typing a color", () => {
  it("takes a code with or without #, short or long, any case", () => {
    expect(normalizeHex("#003262")).toBe("#003262");
    expect(normalizeHex("003262")).toBe("#003262");
    expect(normalizeHex(" #0a3 ")).toBe("#00AA33");
    expect(normalizeHex("abcdef")).toBe("#ABCDEF");
  });

  it("refuses what is not a color code", () => {
    ["navy", "#0326", "#00326", "", "#", "12345g"].forEach((bad) => expect(normalizeHex(bad)).toBeNull());
  });
});

describe("taking a color from a picture", () => {
  // A 2 x 1 picture: one navy pixel, one see-through pixel.
  const NAVY = [11, 42, 91, 255];
  const CLEAR = [0, 0, 0, 0];
  const data = [...NAVY, ...CLEAR];

  it("reads the exact pixel", () => {
    expect(pixelHex(data, 2, 0, 0)).toBe("#0B2A5B");
    expect(hexFromRgb(255, 0, 128)).toBe("#FF0080");
  });

  it("offers nothing for a see-through pixel or a spot off the picture", () => {
    expect(pixelHex(data, 2, 1, 0)).toBeNull();
    expect(pixelHex(data, 2, 0, 3)).toBeNull();
  });
});

describe("recent colors", () => {
  it("keeps the newest first, no repeats, and a short list", () => {
    const many = Array.from({ length: MAX_RECENT_COLORS + 3 }, (_, i) => hexFromRgb(i, i, i));
    const list = many.reduce<string[]>((acc, c) => withRecent(acc, c), []);
    expect(list).toHaveLength(MAX_RECENT_COLORS);
    expect(list[0]).toBe(many[many.length - 1]);
    expect(withRecent(["#111111", "#222222"], "#222222")).toEqual(["#222222", "#111111"]);
  });
});

describe("more colors", () => {
  it("offers dozens of named team colors, every one a real color code and named once", async () => {
    const { TEAM_COLORS } = await import("./color-input");
    expect(TEAM_COLORS.length).toBeGreaterThanOrEqual(40);
    TEAM_COLORS.forEach((c) => expect(normalizeHex(c.hex), c.name).toBe(c.hex));
    expect(new Set(TEAM_COLORS.map((c) => c.name)).size).toBe(TEAM_COLORS.length);
  });

  it("turns one color into a row of lighter and darker shades of the same hue", async () => {
    const { shadesOf, hueOf } = await import("./color-input");
    const navy = "#0B2A5B";
    const shades = shadesOf(navy);
    expect(shades.length).toBeGreaterThanOrEqual(6);
    shades.forEach((s) => expect(Math.abs(hueOf(s) - hueOf(navy))).toBeLessThanOrEqual(2));
    // Lightest first: each shade is darker than the one before.
    const lum = (h: string) => [1, 3, 5].reduce((n, i) => n + Number.parseInt(h.slice(i, i + 2), 16), 0);
    shades.slice(1).forEach((s, i) => expect(lum(s)).toBeLessThan(lum(shades[i])));
  });

  it("reads the hue of a color for the background tint's Match buttons", async () => {
    const { hueOf } = await import("./color-input");
    expect(hueOf("#FF0000")).toBe(0);
    expect(hueOf("#00FF00")).toBe(120);
    expect(hueOf("#0000FF")).toBe(240);
    expect(hueOf("#808080")).toBe(0);
  });
});
