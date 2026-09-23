import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MUSCLE_GROUPS } from "@shared/exercise-taxonomy";
import { SCORABLE_MUSCLE_GROUPS } from "@shared/strength-score";

/**
 * THE FIGURE AND THE LIBRARY HAVE TO AGREE.
 *
 * Every region on the body map is keyed to a muscleGroup from the exercise taxonomy. A region
 * keyed to something else is a region nothing can ever fill: tapping it filters to zero
 * exercises, or tints a muscle no score will ever arrive for, and both failures look like an
 * empty database rather than a typo in an SVG.
 *
 * Read out of the source rather than by importing the component, because importing it pulls in
 * React and the whole client tree for what is a question about a list of strings.
 */
const src = readFileSync("client/src/components/body-map.tsx", "utf8");
const drawn = Array.from(src.matchAll(/\{\s*group:\s*"([^"]+)"/g)).map((m) => m[1]);

/** Each region as {group, view, label, d}, parsed out of the same source. Same reasoning as
 *  `drawn` above: this is a question about path strings, not about React. */
const ALL_REGIONS = Array.from(
  src.matchAll(
    /\{\s*group:\s*"([^"]+)",\s*view:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*d:\s*([\s\S]*?),\s*\},/g,
  ),
).map((m) => ({
  group: m[1],
  view: m[2],
  label: m[3],
  // The `d` is written as adjacent string literals joined by +; rebuild it the way the bundler
  // would rather than matching one quoted run and silently testing a third of the shape.
  d: (m[4].match(/"([^"]*)"/g) ?? []).map((q) => q.slice(1, -1)).join(""),
}));

describe("the body map's regions", () => {
  it("found the regions at all", () => {
    // Guards against the regex silently matching nothing and the file passing vacuously.
    expect(drawn.length).toBeGreaterThan(10);
  });

  it("names only real muscle groups", () => {
    const unknown = Array.from(new Set(drawn)).filter(
      (g) => !(MUSCLE_GROUPS as readonly string[]).includes(g),
    );
    expect(unknown, "a region keyed to a group the library does not use").toEqual([]);
  });

  it("draws both a front and a back", () => {
    expect(src).toContain('view: "front"');
    expect(src).toContain('view: "back"');
  });

  it("covers most of what gets scored, and is honest about the rest", () => {
    // Not every scorable group has somewhere sensible to draw it -- the profile falls back to
    // a list row for those rather than dropping them out of the score silently. What matters
    // is that the gap is DECLARED, which UNDRAWN_SCORABLE_GROUPS does.
    const missing = SCORABLE_MUSCLE_GROUPS.filter((g) => !drawn.includes(g));
    expect(src).toContain("UNDRAWN_SCORABLE_GROUPS");
    // If this ever grows past a couple, the figure has stopped being a map of the score.
    expect(missing.length, `undrawn: ${missing.join(", ")}`).toBeLessThanOrEqual(2);
  });

  it("gives every region a keyboard path and a fat touch target", () => {
    // An SVG shape is not a button unless it behaves like one, and the thin regions (forearms,
    // calves) are unhittable on a phone without the transparent wide stroke.
    expect(src).toContain('role="button"');
    expect(src).toContain("tabIndex={0}");
    expect(src).toContain('stroke="transparent"');
  });
});

// EVERY MUSCLE HAS TO LAND ON THE BODY.
//
// The previous figure drew limb muscles as a stroke along the same line the limb itself was
// stroked on, so a muscle could not drift off its limb -- by construction. That trick is gone
// (it is why every limb muscle was a capsule, which is the "blocky" Scott objected to), so the
// guarantee has to come back as a measurement instead.
//
// Absolute coordinates, walked out of the path data rather than read off it: the outlines are
// written with relative curves, so the raw numbers in the string are deltas and mean nothing on
// their own. That is exactly the kind of check a human eye passes and then regrets.
describe("every region sits on the figure", () => {
  // The envelope the silhouette occupies in the 240x470 viewBox, with a little slack for the
  // stroke. Anything outside this is drawing in empty space beside the body.
  const BODY = { minX: 58, maxX: 182, minY: 70, maxY: 450 };

  function pointsOf(d: string): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    let x = 0;
    let y = 0;
    let startX = 0;
    let startY = 0;
    // Split into command letters and their number runs.
    const tokens = d.match(/[MmLlCcZz][^MmLlCcZz]*/g) ?? [];
    for (const token of tokens) {
      const cmd = token[0];
      const nums = (token.slice(1).match(/-?\d*\.?\d+/g) ?? []).map(Number);
      if (cmd === "Z" || cmd === "z") {
        x = startX;
        y = startY;
        continue;
      }
      const step = cmd === "C" || cmd === "c" ? 6 : 2;
      for (let i = 0; i + step <= nums.length; i += step) {
        const rel = cmd === cmd.toLowerCase();
        // Only the END point of a curve moves the pen; the control points are pulled toward,
        // never reached, so including them would fail a shape that is perfectly inside.
        const dx = nums[i + step - 2];
        const dy = nums[i + step - 1];
        x = rel ? x + dx : dx;
        y = rel ? y + dy : dy;
        if (cmd === "M" || cmd === "m") {
          startX = x;
          startY = y;
        }
        out.push({ x, y });
      }
    }
    return out;
  }

  it("walks a path correctly, or the rest of this proves nothing", () => {
    // M to (10,10), then a relative curve ending +5,+5, then a relative line -3,0.
    const pts = pointsOf("M10 10 c1 1 2 2 5 5 l-3 0 Z");
    expect(pts).toEqual([
      { x: 10, y: 10 },
      { x: 15, y: 15 },
      { x: 12, y: 15 },
    ]);
  });

  for (const region of ALL_REGIONS) {
    it(`${region.view}/${region.label} stays inside the body`, () => {
      const pts = pointsOf(region.d);
      expect(pts.length).toBeGreaterThan(3);
      for (const p of pts) {
        expect(p.x, `${region.label} x`).toBeGreaterThanOrEqual(BODY.minX);
        expect(p.x, `${region.label} x`).toBeLessThanOrEqual(BODY.maxX);
        expect(p.y, `${region.label} y`).toBeGreaterThanOrEqual(BODY.minY);
        expect(p.y, `${region.label} y`).toBeLessThanOrEqual(BODY.maxY);
      }
    });
  }

  // The reason the head is blank is a rule about minors, not a style choice -- see the header
  // of body-map.tsx. A face is the one addition that would make this the wrong kind of picture.
  it("draws no face", () => {
    const src = readFileSync(join(process.cwd(), "client/src/components/body-map.tsx"), "utf8");
    expect(src).toContain("THE FIGURE HAS NO FACE");
    for (const region of ALL_REGIONS) {
      // No region may sit in the head, which is the top of the viewBox.
      for (const p of pointsOf(region.d)) expect(p.y).toBeGreaterThan(66);
    }
  });
});
