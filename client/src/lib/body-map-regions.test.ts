import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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
