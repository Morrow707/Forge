import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* Scott, 2026-11-17: "on purpose artifact we had labels we could click on, on this muscle map we
 * can't? Where did the labels go?" -- the exercise picker drew the figure with no leaders, so a
 * beginner who does not know a muscle's name had only the figure to aim at. And: "make the
 * exercise picker muscle map a bit bigger ... fat human thumbs". Checked in Chromium at 390px:
 * the figure went from 163x320 to ~230x470, a label tap selected Quads, a figure tap Abs. */
const src = readFileSync(join(__dirname, "../components/muscle-filter-map.tsx"), "utf8")
  .split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")).join("\n");

describe("the exercise picker's body map", () => {
  it("draws its labels on both figures", () => {
    expect(src.match(/leaders=\{BODY_MAP_LEADERS/g)?.length).toBe(2);
  });
  it("gives the phone figure narrower label columns and no fixed 320px height", () => {
    expect(src).toMatch(/gutterShare=\{0\.36\}/);
    expect(src).not.toMatch(/className="h-80 flex-1/);
  });
});
