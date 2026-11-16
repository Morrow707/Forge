import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { learnFromTake, learnFromTakeForLift } from "./body-model-learning";
import {
  BODY_MODEL_UNCERTAINTY_FLOOR,
  LIFTS_WHERE_THE_BODY_MODEL_VOTES,
  readBodyModel,
} from "@shared/athlete-body-model";
import { trackingDiagnosticsSchema } from "@shared/schema";

/* Scott, 2026-11-16: "it should learn my height and my limb length and continue to get more
 * accurate not starting over each week" / "Don't do shin only, do them all, what if a shin is
 * hidden?" / "what happens when we're doing a bench? Or a row?" The athlete's bones are remembered
 * per lift, every bone the take can see, taught by any take whose other rulers agreed. */
const strip = (src: string) => src.split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "").replace(/^\s*\*.*$/, "")).join("\n");

describe("the body is remembered per lift", () => {
  it("a take whose rulers agreed teaches, and a take with no teacher does not", () => {
    expect(learnFromTake(null, { shin: 0.44 }, "consensus")).not.toBeNull();
    expect(learnFromTake(null, { shin: 0.44 }, "shoulder_width")).toBeNull();
    expect(learnFromTake(null, { shin: 0.44 }, null)).toBeNull();
  });

  it("keeps each lift's bones apart: a bench never moves a squat's shin", () => {
    let m = learnFromTakeForLift(null, "Back Squat", { shin: 0.44, upperArm: 0.29 }, "consensus")!;
    m = learnFromTakeForLift(m, "Bench Press", { shin: 0.7, upperArm: 0.4 }, "consensus")!;
    m = learnFromTakeForLift(m, "Back Squat", { shin: 0.45, upperArm: 0.292 }, "consensus")!;
    m = learnFromTakeForLift(m, "Back Squat", { shin: 0.43, upperArm: 0.295 }, "consensus")!;
    expect(m.byLift!["Back Squat"].shin!.metres).toBeCloseTo(0.44, 2);
    expect(m.byLift!["Back Squat"].shin!.takes).toBe(3);
    expect(m.byLift!["Bench Press"].shin!.metres).toBeCloseTo(0.7, 2);
    expect(m.byLift!["Bench Press"].shin!.takes).toBe(1);
  });

  it("gets steadier with takes: one bad take is outvoted, not averaged in", () => {
    let m = learnFromTakeForLift(null, "Back Squat", { shin: 0.44 }, "consensus")!;
    for (const v of [0.445, 0.435, 0.6, 0.44, 0.442]) m = learnFromTakeForLift(m, "Back Squat", { shin: v }, "consensus")!;
    expect(m.byLift!["Back Squat"].shin!.metres).toBeCloseTo(0.44, 2);
    expect(m.byLift!["Back Squat"].shin!.takes).toBe(6);
  });

  it("nothing is read until a bone has three takes behind it", () => {
    let m = learnFromTakeForLift(null, "Back Squat", { shin: 0.44 }, "consensus")!;
    m = learnFromTakeForLift(m, "Back Squat", { shin: 0.44 }, "consensus")!;
    expect(readBodyModel(m.byLift!["Back Squat"], { shin: 105 })).toBeNull();
    m = learnFromTakeForLift(m, "Back Squat", { shin: 0.44 }, "consensus")!;
    expect(readBodyModel(m.byLift!["Back Squat"], { shin: 105 })!.scale).toBeCloseTo(0.44 / 105, 6);
  });

  const squat = () => {
    let m: any = null;
    for (let i = 0; i < 3; i++) m = learnFromTakeForLift(m, "Back Squat", { shin: 0.44, femur: 0.44, torso: 0.6, upperArm: 0.29, forearm: 0.22 }, "consensus");
    return m.byLift["Back Squat"];
  };

  it("a hidden shin leaves the other bones to answer", () => {
    const all = readBodyModel(squat(), { shin: 110, femur: 110, torso: 150, upperArm: 72.5, forearm: 55 })!;
    const noShin = readBodyModel(squat(), { femur: 110, torso: 150, upperArm: 72.5, forearm: 55 })!;
    expect(all.limbsVoting).toBe(5);
    expect(noShin.limbsVoting).toBe(4);
    expect(noShin.scale).toBeCloseTo(0.004, 5);
    expect(all.scale).toBeCloseTo(0.004, 5);
  });

  it("one bone read wildly on a take does not move the reading: it is the middle, not the mean", () => {
    const r = readBodyModel(squat(), { shin: 110, femur: 110, torso: 150, upperArm: 30, forearm: 55 })!;
    expect(r.scale).toBeCloseTo(0.004, 5);
    expect(r.limbs.upperArm!).toBeGreaterThan(0.009);
  });

  it("never states itself tighter than the floor", () => {
    expect(readBodyModel(squat(), { shin: 110, femur: 110, torso: 150 })!.uncertaintyFraction).toBe(BODY_MODEL_UNCERTAINTY_FLOOR);
    expect(BODY_MODEL_UNCERTAINTY_FLOOR).toBeGreaterThanOrEqual(0.08);
  });

  it("votes on no lift until one has earned it, and the tracker asks the list", () => {
    expect(LIFTS_WHERE_THE_BODY_MODEL_VOTES).toEqual([]);
    const dialog = strip(readFileSync(join(__dirname, "../client/src/components/av-bar-tracker-dialog.tsx"), "utf8"));
    expect(dialog).toMatch(/LIFTS_WHERE_THE_BODY_MODEL_VOTES\.includes\(exerciseName\)/);
    expect(dialog).toMatch(/bodyModelReading && bodyModelVotes/);
    expect(dialog).toMatch(/byLift\?\.\[exerciseName\]/);
  });

  it("a bone is never learned from a scale it voted in", () => {
    const dialog = strip(readFileSync(join(__dirname, "../client/src/components/av-bar-tracker-dialog.tsx"), "utf8"));
    expect(dialog).toMatch(/plausibleScales\.filter\(\(c\) => c\.source !== "body_model"\)/);
    // Taught on calibrationInput, the raw-unit landmarks the read uses (2026-11-16: on `frames`
    // the scale was applied twice and every bone stored ~250x short).
    expect(dialog).toMatch(/measureLimbsInMetres\(calibrationInput, consensusWithoutBodyModel\)/);
  });

  it("the server folds a take that names its lift into that lift", () => {
    const storage = strip(readFileSync(join(__dirname, "storage.ts"), "utf8"));
    expect(storage).toMatch(/d\.limbMeasurementLift\s*\?\s*learnFromTakeForLift\(/);
  });

  it("the schema keeps what the phone sends", () => {
    const src = readFileSync(join(__dirname, "../shared/schema.ts"), "utf8");
    for (const f of ["limbMeasurementSource", "limbMeasurementLift"]) expect(src).toMatch(new RegExp(`^\\s*${f}: z\\.string\\(\\)\\.nullable\\(\\)\\.optional\\(\\),`, "m"));
    expect(src).toMatch(/^\s*bodyModel: z\s*$/m);
    expect(trackingDiagnosticsSchema).toBeDefined();
  });
});
