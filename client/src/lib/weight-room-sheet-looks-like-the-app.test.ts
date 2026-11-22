/* eslint-disable ts-patterns/no-magic-numbers -- test values */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { computeExerciseLabels, deriveLinkedToNext } from "@/lib/supersets";
import { WeightRoomSheetPreview } from "@/components/weight-room-sheet-preview";
import { SUPERSET_HEX, SUPERSET_TAILWIND_HUES } from "@shared/superset-colors";
import { DEFAULT_SHEET_LAYOUT, EMPTY_DAY_EDITS, SHEET_TOGGLE_KEYS, buildSheet, supersetLabels, type SheetLayout } from "@shared/weight-room-sheet";
import { sheetLift, sheetSource } from "@shared/weight-room-sheet-fixture";

/* THE PRINTED SHEET'S SUPERSETS ARE THE APP'S SUPERSETS, AND THE PREVIEW SHOWS ONLY WHAT IS ON.
 * The sheet labels a day with shared/weight-room-sheet.ts supersetLabels; the app with
 * client/src/lib/supersets.ts computeExerciseLabels. They must agree on every day, and the hues
 * the PDF reads (shared/superset-colors.ts) must be the classes the app draws. */

describe("the sheet's superset labels are the app's", () => {
  const days = [
    [null, "a", "a", null, "b", "b", "b"],
    [null, null, null],
    ["x", "x", null, "y", "y"],
    ["x", null, "x"],
  ];
  it.each(days.map((d) => [d.join(",")]))("on the day %s", (joined) => {
    const groups = joined.split(",").map((g) => (g === "" ? null : g));
    const lifts = groups.map((supersetGroup, i) => ({ key: String(i), supersetGroup }));
    const app = computeExerciseLabels(deriveLinkedToNext(lifts));
    expect(supersetLabels(lifts).map((s) => s.label)).toEqual(lifts.map((l) => app[l.key]));
  });
});

describe("the PDF's hues are the app's hues", () => {
  it("one hex per Tailwind hue, in the same order as the app's badge classes", () => {
    const src = readFileSync(new URL("./supersets.ts", import.meta.url), "utf8");
    const badges = src.slice(src.indexOf("LETTER_BADGE_COLORS = ["), src.indexOf("];", src.indexOf("LETTER_BADGE_COLORS = [")));
    expect(SUPERSET_HEX).toHaveLength(SUPERSET_TAILWIND_HUES.length);
    SUPERSET_TAILWIND_HUES.forEach((hue, i) => {
      const line = badges.split("\n").filter((l) => l.includes('"bg-'))[i];
      if (hue == null) expect(line).toContain("bg-primary");
      else expect(line).toContain(`bg-${hue}`);
    });
  });
});

describe("the on-screen sheet shows only what is turned on", () => {
  const source = sheetSource({
    lifts: [sheetLift(1, "Back Squat", { supersetGroup: "g" }), sheetLift(2, "Romanian Deadlift", { supersetGroup: "g", movementType: "Hinge" }), sheetLift(7, "Band Pull-Apart", { category: "mobility", movementType: "Activation" })],
  });
  const brand = { teamName: "Cal Strength", primaryColor: "#003262", logoUrl: null };
  const render = (layout: SheetLayout) => renderToStaticMarkup(createElement(WeightRoomSheetPreview, { model: buildSheet(source, layout, { ...EMPTY_DAY_EDITS, note: "Hydrate" }), brand }));
  const allOn = { ...DEFAULT_SHEET_LAYOUT, toggles: Object.fromEntries(SHEET_TOGGLE_KEYS.map((k) => [k, true])) as SheetLayout["toggles"] };
  const allOff = { ...DEFAULT_SHEET_LAYOUT, toggles: Object.fromEntries(SHEET_TOGGLE_KEYS.map((k) => [k, false])) as SheetLayout["toggles"] };
  const marks = ["sheet-code", "sheet-qr", "sheet-note", "sheet-phase", "sheet-warmup", "sheet-slot", "col-max", "col-target", "col-last", "col-plates", "sheet-coach-notes"];

  it("with everything on, every element is drawn", () => {
    const html = render(allOn);
    marks.forEach((m) => expect(html, m).toContain(m));
  });
  it("with everything off, none of them is, and the bare grid remains", () => {
    const html = render(allOff);
    marks.forEach((m) => expect(html, m).not.toContain(m));
    expect(html).toContain("Back Squat");
    expect(html).toContain("Cal Strength");
  });
});
