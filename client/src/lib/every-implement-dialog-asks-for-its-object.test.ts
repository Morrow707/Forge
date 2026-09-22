import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// EVERY CAMERA SYSTEM RUNS THE SAME WAY, OR IT IS NOT THE SAME SYSTEM.
//
// Scott, 2026-09-22: "every camera system needs to run the same as squat and box jump, in
// unisons, with locking and unlocked mechanisms that make the confidence high."
//
// The object detector is inert unless a dialog names the class it wants. Audited across every
// AV dialog and only TWO of them did -- the bar and the med ball. A kettlebell swing and a
// golf/baseball swing both have an implement in the scene and neither ever asked, so the body
// tracker carried the whole take alone and overwatch had nothing to hold it against. That is
// the same shape as the bench press failure, in three more places.
//
// The four modes with no implement in the scene are the documented standing exception (see
// CLAUDE.md, "THE CAMERA ARCHITECTURE"): they have a body tracker and nothing for overwatch to
// judge it against, which is a known ceiling rather than a gap. They are named here so adding a
// fifth is a deliberate act rather than an omission nobody notices.
const NO_IMPLEMENT_IN_THE_SCENE = [
  "av-jump-tracker-dialog.tsx",
  "av-sprint-tracker-dialog.tsx",
  "av-mechanics-tracker-dialog.tsx",
  "av-horizontal-load-tracker-dialog.tsx",
  "av-goniometer-capture-dialog.tsx",
  "av-overhead-squat-capture-dialog.tsx",
];

describe("every AV dialog with an implement asks the object detector for it", () => {
  const dir = join(process.cwd(), "client/src/components");
  const dialogs = readdirSync(dir).filter(
    (f) => f.startsWith("av-") && (f.endsWith("tracker-dialog.tsx") || f.endsWith("capture-dialog.tsx")),
  );

  it("finds the dialogs at all, so a rename cannot turn this scan green", () => {
    expect(dialogs.length).toBeGreaterThanOrEqual(8);
  });

  it.each(dialogs)("%s names a tracking mode, or is a documented no-implement mode", (file) => {
    const src = readFileSync(join(dir, file), "utf8");
    const asks = /trackingMode:/.test(src);
    if (NO_IMPLEMENT_IN_THE_SCENE.includes(file)) {
      expect(asks).toBe(false);
      return;
    }
    expect(asks).toBe(true);
  });

  // The class has to be one the model was trained on. A typo here is silent: the detector finds
  // nothing all take and looks exactly like an implement that was never in frame.
  it("only ever asks for a class the bundled model knows", () => {
    const CLASSES = [
      "med_ball", "plate", "baseball", "golf_ball", "tennis_ball", "kettlebell", "dumbbell", "barbell",
    ];
    const asked = new Set<string>();
    for (const file of dialogs) {
      const src = readFileSync(join(dir, file), "utf8");
      for (const line of src.split("\n")) {
        const at = line.indexOf("trackingMode:");
        if (at < 0) continue;
        // Everything after the "?" of a ternary, so the value being COMPARED against (sport ===
        // "golf") is not mistaken for the class being asked for.
        let value = line.slice(at + "trackingMode:".length);
        const ternary = value.indexOf("?");
        if (ternary >= 0) value = value.slice(ternary + 1);
        for (const m of value.matchAll(/"([a-z_]+)"/g)) asked.add(m[1]);
      }
    }
    expect(asked.size).toBeGreaterThan(0);
    for (const label of asked) expect(CLASSES).toContain(label);
  });
});
