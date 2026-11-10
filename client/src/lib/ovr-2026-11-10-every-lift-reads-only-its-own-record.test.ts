import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeTrackedSet } from "./bar-tracking";
import { firstMoveForExercise, romBucketForExercise } from "./exercise-camera-profile";
import { cameraTunablesFor, FITTED_OVERRIDES } from "@shared/camera-tunables-by-lift";
import { ledgerRow } from "@shared/accuracy-ledger";
import {
  OVR_BENCH_PRESS_2026_11_10,
  OVR_DUMBBELL_SHOULDER_PRESS_2026_11_10,
} from "./tracker-ground-truth";

/* ROUND FOURTEEN, 2026-11-10, build 728: Bench Press, Dumbbell Shoulder Press, and the Single-Arm
 * Dumbbell Row filmed one side at a time (Set 1 · Left, Set 1 · Right). Scott: "For calibration I
 * want every lift to at least be touched ... We are trying to get to 0% deviation from the OVR
 * data. Consistent 0%." Every fix is in that lift's own FITTED_OVERRIDES record; this file pins
 * that each reaches its own trace and no other, and what each moved on today's takes.
 *
 * Fixture: __fixtures__/ovr-2026-11-10-export.json, trimmed from the admin export. */
type TracePoint = { t: number; x: number; y: number; c?: number };
type WitnessPoint = { sh: number | null; hp: number | null; an: number | null };
type Fixture = {
  id: string; exerciseName: string; side: string | null; heightIn: number | null; loadKg: number | null; loggedReps: number | null;
  trackingDiagnostics: {
    trace: { declaredSide: string | null; unilateralWorkingHand: string | null };
    calibration: { positionScaleCorrection: number | null };
  };
  barPathTrace: TracePoint[];
  bodyWitnessTrace: { points: WitnessPoint[] } | null;
};
const fixtures: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-11-10-export.json"), "utf8"));
const byId = (id: string): Fixture => {
  const f = fixtures.find((x) => x.id === id);
  if (!f) throw new Error(`no fixture ${id}`);
  return f;
};
const BENCH = "2026-11-10 Bench Press set 1";
const PRESS = "2026-11-10 Dumbbell Shoulder Press set 1";
const ROW_L = "2026-11-10 Single-Arm Dumbbell Row set 1";
const ROW_R = "2026-11-10 Single-Arm Dumbbell Row set 2";
const ALL = [BENCH, PRESS, ROW_L, ROW_R];
/** The OVR's means over the reps Forge was asked to read (press reps 5-12; row 1-10 left, 11-20 right). */
const BENCH_SENSOR_MEAN = 0.72;
const PRESS_SENSOR_MEAN = 0.902;
const ROW_LEFT_SENSOR_MEAN = 0.954;
const ROW_RIGHT_SENSOR_MEAN = 0.894;
const SENSOR_MEAN: Record<string, number> = {
  [BENCH]: BENCH_SENSOR_MEAN, [PRESS]: PRESS_SENSOR_MEAN, [ROW_L]: ROW_LEFT_SENSOR_MEAN, [ROW_R]: ROW_RIGHT_SENSOR_MEAN,
};
/** The stored trace is in hundredths of a unit. */
const TRACE_UNITS_PER_UNIT = 100;
const SHARED_DRIVE_ONSET = 0.04;
const BENCH_3D_POSE_UNCERTAINTY = 0.25;
const BENCH_DRIVE_ONSET = 0.03;
const ROW_DEPTH_UNCERTAINTY = 0.4;
const ROW_DRIVE_ONSET = 0.02;
const PRESS_SHOULDER_TOLERANCE = 0.4;
const PRESS_HEIGHT_UNCERTAINTY = 0.4;
const PRESS_DEPTH_UNCERTAINTY = 0.6;
const PRESS_DRIVE_ONSET = 0.02;
const BENCH_OWN = { body3DCorrectedUncertainty: BENCH_3D_POSE_UNCERTAINTY, driveOnsetFraction: BENCH_DRIVE_ONSET };
const ROW_OWN = { depthRulerUncertainty: ROW_DEPTH_UNCERTAINTY, driveOnsetFraction: ROW_DRIVE_ONSET };
const PRESS_OWN = {
  biacromialToleranceFraction: PRESS_SHOULDER_TOLERANCE, heightRulerUncertainty: PRESS_HEIGHT_UNCERTAINTY,
  depthRulerUncertainty: PRESS_DEPTH_UNCERTAINTY, driveOnsetFraction: PRESS_DRIVE_ONSET,
};
/** liveErrorPct on each ledger row at the lift's own record (as filmed in the comment). */
const BENCH_11_10_LIVE = -8.57; // -10.2 as filmed
const PRESS_11_10_LIVE = 31.3; // +46.5
const PRESS_11_06_LIVE = 31.22; // +41.8
const ROW_LEFT_11_10_LIVE = -4.38; // -9.0
const ROW_RIGHT_11_10_LIVE = 10.53; // +9.2
const LIVE_ERROR_PCT: Record<string, number> = {
  "2026-11-10-bench-press-set-1": BENCH_11_10_LIVE,
  "2026-11-10-dumbbell-shoulder-press-set-1": PRESS_11_10_LIVE,
  "2026-11-06-dumbbell-shoulder-press-set-1": PRESS_11_06_LIVE,
  "2026-11-10-single-arm-dumbbell-row-left": ROW_LEFT_11_10_LIVE,
  "2026-11-10-single-arm-dumbbell-row-right": ROW_RIGHT_11_10_LIVE,
};
/** Hip-to-ankle over shoulder-to-hip: every take but the press reads above this; the press below. */
const STATURE_RATIO_FLOOR = 1.2;
const HALF = 2;

function replay(f: Fixture, asExercise = f.exerciseName, patch: Record<string, number> = {}) {
  const points = f.barPathTrace.map((p) => ({ t: p.t, x: p.x / TRACE_UNITS_PER_UNIT, y: p.y / TRACE_UNITS_PER_UNIT, z: 0, confidence: p.c ?? 1 }));
  const tune = cameraTunablesFor(asExercise, romBucketForExercise(asExercise));
  Object.assign(tune.values, patch);
  const m = summarizeTrackedSet(points, f.loadKg ?? undefined, f.heightIn ?? undefined, firstMoveForExercise(f.exerciseName), [],
    f.trackingDiagnostics.calibration.positionScaleCorrection ?? 1, false, romBucketForExercise(f.exerciseName), { x: 0, y: 1 }, f.loggedReps ?? null, tune);
  if (!m) throw new Error(`${f.id}: no metrics`);
  return m;
}
const meanErr = (f: Fixture, mean: number | null) => (mean ?? Number.NaN) / SENSOR_MEAN[f.id] - 1;
function statureRatio(f: Fixture): number {
  const r = (f.bodyWitnessTrace?.points ?? [])
    .filter((p): p is { sh: number; hp: number; an: number } => p.sh != null && p.hp != null && p.an != null && p.hp !== p.sh)
    .map((p) => (p.an - p.hp) / (p.hp - p.sh))
    .sort((a, b) => a - b);
  return r[Math.floor(r.length / HALF)];
}

describe("round fourteen: every lift touched, each in its own record", () => {
  it("holds the four captures, the row's two sides on their own rows with the side the tracker was told", () => {
    expect(fixtures.map((f) => f.id).sort()).toEqual([...ALL].sort());
    expect(byId(ROW_L).trackingDiagnostics.trace.declaredSide).toBe("left");
    expect(byId(ROW_L).trackingDiagnostics.trace.unilateralWorkingHand).toBe("left");
    expect(byId(ROW_R).trackingDiagnostics.trace.declaredSide).toBe("right");
    expect(byId(ROW_R).trackingDiagnostics.trace.unilateralWorkingHand).toBe("right");
    expect(OVR_BENCH_PRESS_2026_11_10.sensor.reported.meanVelocityMps).toBe(BENCH_SENSOR_MEAN);
    expect(OVR_DUMBBELL_SHOULDER_PRESS_2026_11_10.sensor.reportedOverOurReps.meanVelocityMps).toBe(PRESS_SENSOR_MEAN);
  });

  it("each lift's own record carries its round-fourteen numbers", () => {
    expect(FITTED_OVERRIDES["Bench Press"]).toEqual(BENCH_OWN);
    expect(FITTED_OVERRIDES["Single-Arm Dumbbell Row"]).toEqual(ROW_OWN);
    expect(FITTED_OVERRIDES["Dumbbell Shoulder Press"]).toEqual(PRESS_OWN);
  });

  it("the window moves each take's mean toward the sensor and no rep count, and it reaches only its own lift", () => {
    const rows = ALL.map((id) => {
      const f = byId(id);
      const shared = replay(f, f.exerciseName, { driveOnsetFraction: SHARED_DRIVE_ONSET });
      const own = replay(f);
      const other = replay(f, "Incline Barbell Bench Press");
      const otherShared = replay(f, "Incline Barbell Bench Press", { driveOnsetFraction: SHARED_DRIVE_ONSET });
      return { id, shared, own, f, other, otherShared };
    });
    rows.forEach(({ id, shared, own, f, other, otherShared }) => {
      expect(own.repBreakdown.length, id).toBe(shared.repBreakdown.length);
      expect(Math.abs(meanErr(f, own.meanVelocityMps)), id).toBeLessThan(Math.abs(meanErr(f, shared.meanVelocityMps)));
      // The same trace read through a lift with no record of its own gives the shared answer.
      expect(other.meanVelocityMps, id).toBe(otherShared.meanVelocityMps);
    });
  });

  it("the scale steps, read off the ledger rows the replay test recomputes", () => {
    Object.entries(LIVE_ERROR_PCT).forEach(([id, pct]) => expect(ledgerRow(id).liveErrorPct, id).toBeCloseTo(pct, 1));
  });

  it("the press's height ruler is not a stature: hip-to-ankle over shoulder-to-hip is the lowest in the corpus", () => {
    expect(statureRatio(byId(PRESS))).toBeLessThan(STATURE_RATIO_FLOOR);
    [BENCH, ROW_L, ROW_R].forEach((id) => expect(statureRatio(byId(id)), id).toBeGreaterThan(STATURE_RATIO_FLOOR));
  });
});
