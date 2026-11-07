import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rejectImplausibleScales } from "./pose-tracking";
import { postureAllowsHeightCalibration, postureForExercise } from "./exercise-camera-profile";

/* THE STATURE YARDSTICK RUNS EXACTLY WHERE THE HEIGHT RULER MAY VOTE.
 *
 * Round eleven, 2026-11-06, the bench beside the OVR (135x8, build 714): the nose-to-ankle span of
 * a SUPINE athlete filmed from the foot of the bench read 1011 units, which at the scale the sensor
 * requires is a 139-inch man. That span convicted the shoulder ruler (implied 163.6in, +17.8%
 * against the sensor) and kept the two 3D rulers that happened to sit under the 1.8x ceiling, so
 * the take fell to the collapsed pair alone and read -12.6%; the shoulder and the pair bracket the
 * sensor and read +2.5% together. The 2026-10-06 shoulder fix stated the rule in words -- "the
 * body-length yardstick is consulted only where a body length IS a stature" -- and wrote it as
 * `bent_over` alone. A lying, seated or supported athlete's span is not a stature either, so the
 * yardstick now stands down wherever the height RULER does (postureAllowsHeightCalibration),
 * because both read the same span as a stature. The grip yardstick still runs on every posture.
 *
 * Costed on every stored take: the only non-standing take in the corpus whose stature yardstick
 * ever convicted anything is this bench (the 10-30 Pendlay row's two refusals were the GRIP's), so
 * nothing else moves. Rule #1 in shape: a yardstick standing down only ever ADMITS.
 *
 * Mutations: restoring `posture === "bent_over" ? null` reds the scan; a bench span handed to the
 * yardstick reds the replay case. */

const DIALOG = join(__dirname, "..", "components", "av-bar-tracker-dialog.tsx");

function stripComments(text: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of text.split("\n")) {
    const t = line.trimStart();
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
      continue;
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) inBlock = true;
      continue;
    }
    if (t.startsWith("//")) continue;
    out.push(line);
  }
  return out.join("\n");
}

// The 11-06 bench's three rulers as the export carries them, and the span the yardstick read.
const BENCH = [
  { source: "body_3d" as const, scale: 0.0031793892744623508, uncertaintyFraction: 0.2 },
  { source: "depth" as const, scale: 0.0029321205033754063, uncertaintyFraction: 0.2 },
  { source: "shoulder_width" as const, scale: 0.004111440286159734, uncertaintyFraction: 0.2 },
];
const SUPINE_SPAN_UNITS = (163.6 * 0.0254) / 0.004111440286159734; // the span that implied 163.6in for the shoulder
const GRIP_PX = 214.5;

describe("the stature yardstick on a lying athlete", () => {
  it("convicted the bench's shoulder ruler when handed the supine span (the defect, reproduced)", () => {
    const { rejected } = rejectImplausibleScales(BENCH, SUPINE_SPAN_UNITS, 75, GRIP_PX);
    expect(rejected.map((r) => r.source)).toEqual(["shoulder_width"]);
    expect(rejected[0].impliedHeightIn).toBeCloseTo(163.6, 0);
  });

  it("admits all three when the span is withheld, and the grip yardstick still runs", () => {
    const { kept, rejected } = rejectImplausibleScales(BENCH, null, 75, GRIP_PX);
    expect(rejected).toEqual([]);
    expect(kept).toHaveLength(3);
    // The grip is still consulted: a scale that puts the hands 2m apart is refused on any posture.
    const absurd = [...BENCH, { source: "plate" as const, scale: 0.02, uncertaintyFraction: 0.1 }];
    const r = rejectImplausibleScales(absurd, null, 75, GRIP_PX);
    expect(r.rejected.map((x) => x.source)).toEqual(["plate"]);
  });

  it("a bench is a posture whose span is not a stature, a squat's is", () => {
    expect(postureForExercise("Bench Press")).toBe("lying");
    expect(postureAllowsHeightCalibration("lying")).toBe(false);
    expect(postureAllowsHeightCalibration("seated")).toBe(false);
    expect(postureAllowsHeightCalibration("bent_over")).toBe(false);
    expect(postureAllowsHeightCalibration("standing")).toBe(true);
  });

  it("the dialog hands the yardstick a span only where the height ruler may vote", () => {
    const src = stripComments(readFileSync(DIALOG, "utf8"));
    const at = src.indexOf("const bodySpanUnits =");
    expect(at).toBeGreaterThan(0);
    const stmt = src.slice(at, src.indexOf(";", at));
    expect(stmt).toMatch(/postureAllowsHeightCalibration\(posture\) \? impliedBodyLengthUnits\(calibrationInput\) : null/);
    // The old form, which stood down for a hinge alone.
    expect(stmt).not.toMatch(/=== "bent_over"/);
  });

  it("the comment strip is load-bearing here: the fix's own comment names the old form", () => {
    const raw = readFileSync(DIALOG, "utf8");
    expect(raw).toMatch(/`bent_over` alone/);
    const prose = `// const bodySpanUnits = posture === "bent_over" ? null : impliedBodyLengthUnits(calibrationInput);\nconst z = 3;`;
    expect(stripComments(prose)).not.toMatch(/bent_over/);
  });
});
