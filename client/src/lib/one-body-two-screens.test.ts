import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MUSCLE_REGIONS } from "@shared/muscle-map";

// ONE FIGURE, EVERYWHERE A MUSCLE IS DRAWN.
//
// There were two. The strength profile used BodyMap; the Muscle Load Map had its own rounded
// rects, under a comment calling itself "purely schematic ... not anatomical art". So redrawing
// BodyMap as real anatomy changed one screen and not the other, and the screen Scott was looking
// at was the other one: "Did you change this either? I don't notice a difference."
//
// Two drawings of the same athlete's muscles will always drift, and the one that drifts is the
// one showing somebody their own body.
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const heatMap = read("client/src/components/muscle-heat-map.tsx");

describe("the muscle load map and the strength profile draw the same body", () => {
  it("renders BodyMap rather than a figure of its own", () => {
    expect(heatMap).toContain('import { BodyMap } from "@/components/body-map"');
    expect(heatMap).toContain('<BodyMap view="front"');
    expect(heatMap).toContain('<BodyMap view="back"');
  });

  it("keeps no schematic shapes behind", () => {
    // The old figure was arrays of rects and ellipses. A leftover would be a second body waiting
    // to be rendered again by the next person who needed one.
    expect(heatMap).not.toContain("FRONT_SHAPES");
    expect(heatMap).not.toContain("BACK_SHAPES");
    expect(heatMap).not.toContain("function BodySvg");
  });

  // The two vocabularies are different sizes on purpose, so the seam between them is the thing
  // worth pinning: a region that maps to a group the figure does not draw would be a fill that
  // silently goes nowhere.
  it("maps every region it claims to map onto a group the figure really draws", () => {
    const bodyMap = read("client/src/components/body-map.tsx");
    const drawnGroups = new Set(
      Array.from(bodyMap.matchAll(/\{\s*group:\s*"([^"]+)"/g)).map((m) => m[1]),
    );
    const mapped = Array.from(
      heatMap.matchAll(/^\s{2}(\w+):\s*\[([^\]]+)\],/gm),
    );
    expect(mapped.length).toBeGreaterThan(8);
    for (const [, region, groupList] of mapped) {
      expect(MUSCLE_REGIONS, `${region} is not a real region`).toContain(region);
      for (const g of groupList.match(/"([^"]+)"/g) ?? []) {
        const group = g.slice(1, -1);
        expect(drawnGroups, `${region} -> ${group} is not drawn`).toContain(group);
      }
    }
  });

  // An unmapped region keeps its row in the list beside the figure. Dropping it to suit the
  // picture would make the picture a lie about the training.
  it("does not require every region to be drawable", () => {
    const mappedRegions = Array.from(heatMap.matchAll(/^\s{2}(\w+):\s*\[/gm)).map((m) => m[1]);
    expect(mappedRegions.length).toBeLessThan(MUSCLE_REGIONS.length);
  });
});

// A SKILL DAY IS A DAY WITH THINGS TO DO ON IT.
//
// The calendar preview was gated on kind === "exercise", so an athlete whose programme is
// hitting or pitching got a title and a programme name and nothing else -- the one athlete for
// whom the day's content is least guessable from its name.
describe("the calendar previews a skill day too", () => {
  const calendar = read("client/src/components/calendar-view.tsx");
  const page = read("client/src/pages/athlete/calendar.tsx");

  it("no longer refuses a skill entry", () => {
    // Only the explanatory comment may mention the old gate.
    const code = calendar
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain('kind === "exercise"');
  });

  it("sends the kind, since the ids mean different things per programme", () => {
    expect(page).toContain("kind=${e.kind}");
  });

  it("still skips a rest day, which has nothing to list", () => {
    expect(calendar).toContain("!rep.isRestDay");
    expect(calendar).toContain("!e.isRestDay");
  });
});
