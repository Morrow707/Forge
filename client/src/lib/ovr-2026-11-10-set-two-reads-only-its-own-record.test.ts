import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeTrackedSet } from "./bar-tracking";
import { firstMoveForExercise, romBucketForExercise } from "./exercise-camera-profile";
import { cameraTunablesFor, FITTED_OVERRIDES } from "@shared/camera-tunables-by-lift";
import { ledgerRow } from "@shared/accuracy-ledger";
import {
  OVR_BENCH_PRESS_SET2_2026_11_10,
  OVR_DUMBBELL_SHOULDER_PRESS_2026_11_10,
  OVR_DUMBBELL_SHOULDER_PRESS_SET2_2026_11_10,
  OVR_SINGLE_ARM_DUMBBELL_ROW_2026_11_10,
} from "./tracker-ground-truth";

/* ROUND FIFTEEN, 2026-11-10, set 2 of the bench, the dumbbell shoulder press and the single-arm row
 * on build 730 -- the first takes on round fourteen's record. Scott: "each three lifts gets at
 * least one fix". One small step per lift, each in that lift's own FITTED_OVERRIDES record:
 *   bench  depthRulerUncertainty 0.2 -> 0.18 (every bench ledger row moves toward the sensor)
 *   press  body3DCorrectedUncertainty 0.2 -> 0.15 and driveOnsetFraction 0.02 -> 0.01
 *   row    driveOnsetFraction 0.02 -> 0.01 (costed on set 1, the only row set with a sensor screen)
 * This file pins the record, that each reaches its own trace and no other, and what each moved.
 *
 * Fixture: __fixtures__/ovr-2026-11-10-set2-export.json, trimmed from the 11-10 evening export. */
type TracePoint = { t: number; x: number; y: number; c?: number };
type Fixture = {
  id: string; exerciseName: string; side: string | null; heightIn: number | null; loadKg: number | null; loggedReps: number | null;
  trackingDiagnostics: { calibration: { positionScaleCorrection: number | null } };
  barPathTrace: TracePoint[];
};
const setTwo: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-11-10-set2-export.json"), "utf8"));
const setOne: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-11-10-export.json"), "utf8"));
const byId = (list: Fixture[], id: string): Fixture => {
  const f = list.find((x) => x.id === id);
  if (!f) throw new Error(`no fixture ${id}`);
  return f;
};
const BENCH_2 = "2026-11-10 Bench Press set 2";
const PRESS_2 = "2026-11-10 Dumbbell Shoulder Press set 2";
const ROW_2_LEFT = "2026-11-10 Single-Arm Dumbbell Row set 3";
const ROW_2_RIGHT = "2026-11-10 Single-Arm Dumbbell Row set 4";
const ROW_1_LEFT = "2026-11-10 Single-Arm Dumbbell Row set 1";
const ROW_1_RIGHT = "2026-11-10 Single-Arm Dumbbell Row set 2";
const PRESS_1 = "2026-11-10 Dumbbell Shoulder Press set 1";

const BENCH_DEPTH_UNCERTAINTY = 0.18;
const PRESS_3D_POSE_UNCERTAINTY = 0.15;
const PRESS_DRIVE_ONSET = 0.01;
const ROW_DRIVE_ONSET = 0.01;
/** The values each fix replaced, so the replay can read the take both ways. */
const BENCH_DEPTH_BEFORE = 0.2;
const PRESS_DRIVE_BEFORE = 0.02;
const ROW_DRIVE_BEFORE = 0.02;

/** liveErrorPct on the two new ledger rows (as filmed: bench -14.8, press +10.1). */
const BENCH_SET2_LIVE = -13.12; // -14.2 after round fifteen
const PRESS_SET2_LIVE = 4.32; // +6.46 after round fifteen

const TRACE_UNITS_PER_UNIT = 100;
const CM_PER_IN = 2.54;

function replay(f: Fixture, asExercise = f.exerciseName, patch: Record<string, number> = {}) {
  const points = f.barPathTrace.map((p) => ({ t: p.t, x: p.x / TRACE_UNITS_PER_UNIT, y: p.y / TRACE_UNITS_PER_UNIT, z: 0, confidence: p.c ?? 1 }));
  const tune = cameraTunablesFor(asExercise, romBucketForExercise(asExercise));
  Object.assign(tune.values, patch);
  const m = summarizeTrackedSet(points, f.loadKg ?? undefined, f.heightIn ?? undefined, firstMoveForExercise(f.exerciseName), [],
    f.trackingDiagnostics.calibration.positionScaleCorrection ?? 1, false, romBucketForExercise(f.exerciseName), { x: 0, y: 1 }, f.loggedReps ?? null, tune);
  if (!m) throw new Error(`${f.id}: no metrics`);
  return m;
}
/** The mean with the scale divided out: what the window alone gets wrong. */
function meanAtTrueScaleErr(f: Fixture, sensorMean: number, sensorRomCm: number, patch: Record<string, number> = {}) {
  const m = replay(f, f.exerciseName, patch);
  return Math.abs(((m.meanVelocityMps ?? Number.NaN) * sensorRomCm) / (m.romCm ?? Number.NaN) / sensorMean - 1);
}

describe("round fifteen: set 2 on round fourteen's record, one more step per lift", () => {
  it("holds the four set-2 captures, each row side on its own row with its side", () => {
    expect(setTwo.map((f) => f.id).sort()).toEqual([BENCH_2, PRESS_2, ROW_2_LEFT, ROW_2_RIGHT].sort());
    expect(byId(setTwo, ROW_2_LEFT).side).toBe("left");
    expect(byId(setTwo, ROW_2_RIGHT).side).toBe("right");
    expect(OVR_DUMBBELL_SHOULDER_PRESS_SET2_2026_11_10.sensor.reps).toHaveLength(OVR_DUMBBELL_SHOULDER_PRESS_SET2_2026_11_10.repsPerSet);
    expect(OVR_SINGLE_ARM_DUMBBELL_ROW_2026_11_10.sensor.left).toHaveLength(OVR_SINGLE_ARM_DUMBBELL_ROW_2026_11_10.repsPerSide);
    expect(OVR_SINGLE_ARM_DUMBBELL_ROW_2026_11_10.sensor.right).toHaveLength(OVR_SINGLE_ARM_DUMBBELL_ROW_2026_11_10.repsPerSide);
  });

  it("each lift's own record carries its round-fifteen number", () => {
    // Round sixteen (same evening) took the bench's depth and the press's two numbers one step
    // further; round fifteen's own values are kept here as the history, and the row's window stands.
    expect([BENCH_DEPTH_UNCERTAINTY, PRESS_3D_POSE_UNCERTAINTY, PRESS_DRIVE_ONSET]).toEqual([0.18, 0.15, 0.01]);
    expect(FITTED_OVERRIDES["Single-Arm Dumbbell Row"]).toMatchObject({ driveOnsetFraction: ROW_DRIVE_ONSET });
  });

  it("the two new ledger rows record the live pipeline on set 2", () => {
    expect(ledgerRow("2026-11-10-bench-press-set-2").liveErrorPct).toBeCloseTo(BENCH_SET2_LIVE, 1);
    expect(ledgerRow("2026-11-10-dumbbell-shoulder-press-set-2").liveErrorPct).toBeCloseTo(PRESS_SET2_LIVE, 1);
  });

  it("the row's window moves set 1's mean toward the sensor on both sides and moves no rep count", () => {
    const s = OVR_SINGLE_ARM_DUMBBELL_ROW_2026_11_10.sensor;
    [
      { f: byId(setOne, ROW_1_LEFT), sensor: s.reportedLeft },
      { f: byId(setOne, ROW_1_RIGHT), sensor: s.reportedRight },
    ].forEach(({ f, sensor }) => {
      const rom = sensor.romIn * CM_PER_IN;
      expect(meanAtTrueScaleErr(f, sensor.meanVelocityMps, rom), f.id)
        .toBeLessThan(meanAtTrueScaleErr(f, sensor.meanVelocityMps, rom, { driveOnsetFraction: ROW_DRIVE_BEFORE }));
    });
    [ROW_1_LEFT, ROW_1_RIGHT].map((id) => byId(setOne, id)).concat([byId(setTwo, ROW_2_LEFT), byId(setTwo, ROW_2_RIGHT)])
      .forEach((f) => expect(replay(f).repBreakdown.length, f.id).toBe(replay(f, f.exerciseName, { driveOnsetFraction: ROW_DRIVE_BEFORE }).repBreakdown.length));
  });

  it("the press's window does not move set 2 away from the sensor, and moves set 1 toward it", () => {
    const s2 = OVR_DUMBBELL_SHOULDER_PRESS_SET2_2026_11_10.sensor.reportedOverOurReps;
    const f2 = byId(setTwo, PRESS_2);
    const f1 = byId(setOne, PRESS_1);
    const s1 = OVR_DUMBBELL_SHOULDER_PRESS_2026_11_10.sensor.reportedOverOurReps;
    const press1Sensor = { mean: s1.meanVelocityMps, romCm: s1.romIn * CM_PER_IN };
    expect(meanAtTrueScaleErr(f2, s2.meanVelocityMps, s2.romIn * CM_PER_IN))
      .toBeLessThanOrEqual(meanAtTrueScaleErr(f2, s2.meanVelocityMps, s2.romIn * CM_PER_IN, { driveOnsetFraction: PRESS_DRIVE_BEFORE }));
    expect(meanAtTrueScaleErr(f1, press1Sensor.mean, press1Sensor.romCm))
      .toBeLessThan(meanAtTrueScaleErr(f1, press1Sensor.mean, press1Sensor.romCm, { driveOnsetFraction: PRESS_DRIVE_BEFORE }));
  });

  it("each number reaches only its own lift: the same trace read through another lift's record ignores it", () => {
    const bench = byId(setTwo, BENCH_2);
    const other = "Incline Barbell Bench Press";
    expect(replay(bench, other).meanVelocityMps).toBe(replay(bench, other, { depthRulerUncertainty: BENCH_DEPTH_BEFORE }).meanVelocityMps);
    expect(cameraTunablesFor(other, romBucketForExercise(other)).values.depthRulerUncertainty).toBe(BENCH_DEPTH_BEFORE);
    expect(cameraTunablesFor("Pendlay Row", romBucketForExercise("Pendlay Row")).values.driveOnsetFraction).not.toBe(ROW_DRIVE_ONSET);
    expect(OVR_BENCH_PRESS_SET2_2026_11_10.sensor.reps).toHaveLength(OVR_BENCH_PRESS_SET2_2026_11_10.repsPerSet);
  });
});
