import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeTrackedSet, REST_AT_TOP_MIN_SECONDS, REST_AT_TOP_SECONDS } from "./bar-tracking";
import { firstMoveForExercise, romBucketForExercise } from "./exercise-camera-profile";
import { cameraTunablesFor, FITTED_OVERRIDES } from "@shared/camera-tunables-by-lift";
import {
  OVR_BACK_SQUAT_2026_11_09,
  OVR_ROMANIAN_DEADLIFT_2026_11_09,
  OVR_BOX_JUMP_HIP_2026_11_09,
} from "./tracker-ground-truth";

/* ROUND TWELVE, 2026-11-09: Back Squat, Romanian Deadlift and Box Jump on build 720, beside the
 * OVR. Scott: "I am only doing squats box jumps and rdls so don't touch anything else."
 *
 * THE SQUAT IS THE ONE THIS ROUND FIXED, AND THE FAULT WAS THE CLOCK, NOT THE SCALE. Its range of
 * motion read -8.3% while its mean read -40.3% (0.43 against the sensor's 0.72), and a mean error
 * five times the distance error is not scale -- that is the 2026-10-06 argument, and it is the
 * third time this file has had to make it. Forge was counting the 0.20-0.37s he stood at lockout
 * between reps as part of the lift, on every rep, which also manufactured a 54% "velocity loss"
 * across a set the sensor says was flat (0.78 / 0.71 / 0.70 / 0.71 / 0.74).
 *
 * Two changes, and the split between them is the point:
 *  - A RULE, shared: a rest the phase ENDS INSIDE is still a rest (REST_AT_TOP_MIN_SECONDS). The
 *    round-ten rule demanded a whole second of stillness before it would cut, which an athlete
 *    gives you after the LAST rep of a set and never between two -- so it had only ever fired on
 *    a last rep, and did so here too (rep 5's 3.1s stand). Its floor is 0.4s, which leaves the
 *    2026-10-29 RDL's 0.15s tails alone: the sensor counts those as lifting, and cutting them
 *    moved that take from +7.8% to +12.2%.
 *  - A NUMBER, this lift's own: driveOnsetFraction 0 -> 0.02. At 0 the reported window has no
 *    speed-based close at all -- the threshold is zero, so nothing is ever trimmed -- which is
 *    not a small value but a different KIND of value, and it is what left the window at the mercy
 *    of the phase boundary.
 *
 * THE COST, measured on every stored trace in the corpus: ONLY BACK SQUAT TAKES MOVE. Bench, row,
 * press, dumbbell press, RDL and both jumps are bit-identical; no rep count and no range of
 * motion changes anywhere. See docs/camera-tracking-notes.md, "Round twelve", for the table. */
type Fixture = {
  id: string; exerciseName: string; heightIn: number | null; loadKg: number | null; loggedReps: number | null;
  trackingLevel: string; boxHeightIn: number | null; trackingDiagnostics: any; barPathTrace: any[];
  shipped: {
    reps: number; peakVelocityMps: number | null; meanVelocityMps: number | null; romCm: number | null;
    jumpHeightCm: number | null; repMeans: number[]; repConcentricSeconds: number[];
  };
};
const fixtures: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-11-09-export.json"), "utf8"));
const byId = (id: string) => fixtures.find((f) => f.id === id)!;
const SQUAT = "2026-11-09 Back Squat set 1";
const RDL = "2026-11-09 Romanian Deadlift set 1";
const JUMP = "2026-11-09 Box Jump set 1";

function replay(f: Fixture, patch: Partial<Record<string, number>> = {}) {
  const points = f.barPathTrace.map((p: any) => ({ t: p.t, x: p.x / 100, y: p.y / 100, z: 0, confidence: p.c ?? 1 }));
  const romKind = romBucketForExercise(f.exerciseName);
  const tune = cameraTunablesFor(f.exerciseName, romKind);
  Object.assign(tune.values, patch);
  const m = summarizeTrackedSet(
    points, f.loadKg ?? undefined, f.heightIn ?? undefined, firstMoveForExercise(f.exerciseName), [],
    f.trackingDiagnostics?.calibration?.positionScaleCorrection ?? 1, false, romKind, { x: 0, y: 1 },
    f.loggedReps ?? null, tune,
  );
  if (!m) throw new Error(`${f.id}: no metrics`);
  return m;
}
const sensorCm = (romIn: number) => romIn * 2.54;

describe("the 2026-11-09 export replays through each lift's own record", () => {
  it("holds the three captures, and the squat's trace is what the phone shipped", () => {
    expect(fixtures.map((f) => f.id).sort()).toEqual([SQUAT, JUMP, RDL].sort());
    const s = byId(SQUAT);
    // the phone's own numbers, which is what makes the improvement below a measurement and not a
    // reconstruction: 0.43 m/s over a 73.4cm range, with windows that GROW rep after rep
    expect(s.shipped.meanVelocityMps).toBe(0.43);
    expect(s.shipped.repConcentricSeconds).toEqual([1.27, 1.4, 1.53, 1.73, 2.54]);
    expect(s.shipped.repMeans).toEqual([0.59, 0.54, 0.48, 0.44, 0.27]);
  });

  it("the squat: the stand at lockout is out of the window, and the set goes -40.3% -> -15.3%", () => {
    const own = cameraTunablesFor("Back Squat", "squat");
    expect(own.values.driveOnsetFraction).toBe(0.02);
    expect(own.sources.driveOnsetFraction).toBe("fitted");
    const m = replay(byId(SQUAT));
    const s = OVR_BACK_SQUAT_2026_11_09.sensor;
    expect(m.repBreakdown.length).toBe(5);
    // THE RANGE OF MOTION DOES NOT MOVE. It was never the fault and the fix must not touch it.
    expect(m.romCm).toBe(73.4);
    expect(m.romCm! / sensorCm(s.set.romIn) - 1).toBeCloseTo(-0.083, 2);
    expect(m.meanVelocityMps).toBe(0.61);
    expect(m.meanVelocityMps! / s.set.meanVelocityMps - 1).toBeCloseTo(-0.153, 2);
    // and the fake fatigue is gone: the phone read 0.59 / 0.54 / 0.48 / 0.44 / 0.27 against a
    // sensor that was flat. Nothing is fitted to make this true -- it falls out of the windows.
    const means = m.repBreakdown.map((r) => r.meanVelocityMps!);
    expect(Math.max(...means) - Math.min(...means), "spread across the set").toBeLessThan(0.3);
  });

  it("the squat's windows: rep 1 lands on the sensor, and every rep is shorter than the phone's", () => {
    const m = replay(byId(SQUAT));
    const s = OVR_BACK_SQUAT_2026_11_09.sensor;
    const shipped = byId(SQUAT).shipped.repConcentricSeconds;
    m.repBreakdown.forEach((r: any, i: number) => {
      expect(r.windows.driveSeconds, `rep ${i + 1} is shorter than the phone's`).toBeLessThan(shipped[i]);
    });
    // the sensor's own concentric is its range over its mean; rep 1 is 0.99s
    const sensorSeconds = (s.reps[0].romIn * 0.0254) / s.reps[0].meanVelocityMps;
    expect(Math.abs(m.repBreakdown[0].windows!.driveSeconds! - sensorSeconds)).toBeLessThan(0.06);
  });

  it("the stand is a REPORTING cut only: the counts and the range of motion are the phone's", () => {
    for (const id of [SQUAT, RDL]) {
      const f = byId(id);
      const m = replay(f);
      expect(m.repBreakdown.length, id).toBe(f.shipped.reps);
      // within a millimetre of the phone's: the replay rounds the set median a hair differently
      // from the device (the RDL reads 37.9 against 37.8), which is not this round's doing
      expect(Math.abs(m.romCm! - f.shipped.romCm!), id).toBeLessThan(0.15);
    }
  });

  it("the floor leaves a short deceleration alone, which is why the 10-29 RDL does not move", () => {
    expect(REST_AT_TOP_MIN_SECONDS).toBe(0.4);
    expect(REST_AT_TOP_MIN_SECONDS).toBeLessThan(REST_AT_TOP_SECONDS);
  });

  it("the squat's own numbers reach the squat and nothing else", () => {
    expect(FITTED_OVERRIDES["Back Squat"].driveOnsetFraction).toBe(0.02);
    for (const name of ["Romanian Deadlift", "Bench Press", "Pendlay Row", "Barbell Shoulder Press"]) {
      expect(cameraTunablesFor(name, romBucketForExercise(name)).values.driveOnsetFraction, name)
        .not.toBe(FITTED_OVERRIDES["Back Squat"].driveOnsetFraction);
    }
    // and the RDL's take reads the RDL's record, not the squat's: at the squat's window it is a
    // different number, so the two records are demonstrably separate on real traces
    const atOwn = replay(byId(RDL)).meanVelocityMps!;
    const atSquats = replay(byId(RDL), { driveOnsetFraction: 0.02 }).meanVelocityMps!;
    expect(atOwn).not.toBe(atSquats);
  });

  /* THE TWO THAT ARE NOT FIXED, pinned at what they read so the next round can see them move.
   * Neither is a window fault and neither is touched by this round's changes. */

  it("RECORDED, NOT FIXED -- the RDL is a pure SCALE error: the mean error equals the range error", () => {
    const m = replay(byId(RDL));
    const s = OVR_ROMANIAN_DEADLIFT_2026_11_09.sensor;
    const romErr = m.romCm! / sensorCm(s.set.romIn) - 1;
    const meanErr = m.meanVelocityMps! / s.set.meanVelocityMps - 1;
    expect(romErr).toBeCloseTo(-0.25, 1);
    expect(meanErr).toBeCloseTo(-0.26, 1);
    // THE TEST THAT SAYS IT IS SCALE AND NOT THE CLOCK: a scale error moves both by the same
    // factor. The squat's did not (-8.3% against -40.3%), which is what made it a window fault.
    expect(Math.abs(meanErr - romErr), "a scale error moves the two together").toBeLessThan(0.03);
    // seven reps against eight logged, with rep 1 carrying the merged pull (51.5cm against
    // 35.6-41.1 for the rest) -- the lift's open segmenter item, see KNOWN_UNDERCOUNTS
    expect(m.repBreakdown.length).toBe(7);
    expect(byId(RDL).loggedReps).toBe(8);
    // and no rep of it holds at the top, so round twelve's rule is not what it needs
    m.repBreakdown.forEach((r: any, i: number) => expect(r.windows.heldAtTopSeconds, `rep ${i + 1}`).toBe(0));
  });

  it("RECORDED, NOT FIXED -- the box jump's height is good and its velocities are not", () => {
    const f = byId(JUMP);
    const gt = OVR_BOX_JUMP_HIP_2026_11_09;
    // the sensor's rep 1 is the SETUP rep and is not one of ours: 33.3in of range against
    // 26.8-28.2 for the five real ones. Read reportedOverOurReps, never the screen's bottom row.
    expect(gt.sensor.ignoredRep1.romIn).toBeGreaterThan(Math.max(...gt.sensor.reps.map((r) => r.romIn)));
    expect(gt.sensor.setRowIncludingSetupRep.meanVelocityMps).not.toBe(gt.sensor.reportedOverOurReps.meanVelocityMps);
    expect(f.shipped.jumpHeightCm! / (gt.sensor.reportedOverOurReps.romIn * 2.54) - 1).toBeCloseTo(0.05, 1);
    expect(gt.forgeOnDevice.meanVelocityMps / gt.sensor.reportedOverOurReps.meanVelocityMps - 1).toBeCloseTo(-0.5, 1);
    // six reps found against five logged, and the countermovement read disagrees rep to rep --
    // a 1.4cm dip on rep 1, none at all on rep 2, 35.5cm on rep 4
    expect(gt.forgeOnDevice.repCount).toBe(6);
    expect(gt.forgeOnDevice.repDipDepthsCm[1]).toBeNull();
  });
});
