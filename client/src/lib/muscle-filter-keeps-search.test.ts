import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * THE BODY MAP IS AN EXTRA DOOR, NOT A REPLACEMENT DOOR.
 *
 * Scott, 2026-09-21: "body map never replaces text search." The map exists for the athlete who
 * does not yet know what a lat is. Everyone who DOES know will type "hamstring" and expect it
 * to work, so a change that made the picture the only way to narrow the library would slow
 * every coach down to help a beginner.
 *
 * Two properties, both easy to lose in a later tidy-up and neither visible from a screenshot:
 * search survives, and the map drives the SAME filter the chips do rather than a parallel one
 * that can disagree with them.
 */
const picker = readFileSync("client/src/components/exercise-picker-dialog.tsx", "utf8");
const map = readFileSync("client/src/components/muscle-filter-map.tsx", "utf8");

describe("the exercise picker", () => {
  it("still has a text search box", () => {
    expect(picker).toContain("Search your exercise bank");
    expect(picker).toMatch(/value=\{search\}/);
  });

  it("drives the existing muscleGroupFilter, not a second filter of its own", () => {
    // One filtering path. Two would eventually disagree, and the disagreement would look like
    // exercises randomly missing from the list.
    expect(picker).toContain("<MuscleFilterMap");
    expect(picker).toMatch(/selected=\{muscleGroupFilter\}/);
    expect(picker).toMatch(/setMuscleGroupFilter\(/);
  });

  it("keeps the map above the list without a JavaScript viewport guess", () => {
    // Collapsed on a phone, open on a desktop, decided by CSS. A width read in JS is wrong on
    // a tablet, wrong after a rotation, and wrong on first paint.
    expect(map).toContain("sm:hidden");
    expect(map).toContain("sm:block");
    expect(map).not.toMatch(/window\.(innerWidth|matchMedia)/);
  });

  it("says in words what it filtered to", () => {
    // Colour alone does not explain why the list got shorter -- not to somebody who cannot
    // distinguish the highlight, and not to somebody who tapped by accident.
    expect(map).toContain("Search still works across everything");
  });
});
