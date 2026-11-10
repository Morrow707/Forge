import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeTrackedSet } from "./bar-tracking";
import { firstMoveForExercise, romBucketForExercise } from "./exercise-camera-profile";
import { cameraTunablesFor, FITTED_OVERRIDES } from "@shared/camera-tunables-by-lift";
import { ledgerRow } from "@shared/accuracy-ledger";
import {
  OVR_BENCH_PRESS_SET3_2026_11_10,
  OVR_DUMBBELL_SHOULDER_PRESS_SET3_2026_11_10,
  OVR_SINGLE_ARM_DUMBBELL_ROW_SET3_2026_11_10,
} from "./tracker-ground-truth";

/* ROUND SIXTEEN, 2026-11-10, set 3 of the bench, the dumbbell press and the single-arm row on
 * build 732. Scott: "each exercise gets a fix" and "what the heck happened to my left side video
 * for rows? Right side captured all 8 but left only did 4??"
 *
 * The left row lost four pulls four ways: the pickup swallowed the first, the working wrist was
 * unseen for 1.36s (one pull inside the hole), the rep before that hole was deleted as a rack
 * move, and the last merged with the set-down. The third is a rule and is fixed here, shared: a
 * phantom phase that holds a hole in the trace does not end the set's run.
 *
 * Per-lift steps: bench depthRulerUncertainty 0.15; press body3DCorrectedUncertainty 0.12 and
 * driveOnsetFraction 0; row depthRulerUncertainty 0.6.
 *
 * Fixture: __fixtures__/ovr-2026-11-10-set3-export.json, trimmed from the 11-10 export at 20:05. */
type TracePoint = { t: number; x: number; y: number; c?: number };
type Fixture = {
  id: string; exerciseName: string; side: string | null; heightIn: number | null; loadKg: number | null; loggedReps: number | null;
  trackingDiagnostics: { calibration: { positionScaleCorrection: number | null } };
  barPathTrace: TracePoint[];
  shipped: { reps: number; romCm: number };
};
const fixtures: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-11-10-set3-export.json"), "utf8"));
const byId = (id: string): Fixture => {
  const f = fixtures.find((x) => x.id === id);
  if (!f) throw new Error(`no fixture ${id}`);
  return f;
};
const BENCH = "2026-11-10 Bench Press set 3";
const PRESS = "2026-11-10 Dumbbell Shoulder Press set 3";
const ROW_LEFT = "2026-11-10 Single-Arm Dumbbell Row set 5";
const ROW_RIGHT = "2026-11-10 Single-Arm Dumbbell Row set 6";

const BENCH_DEPTH = 0.15;
const PRESS_3D = 0.12;
const PRESS_DRIVE = 0;
const ROW_DEPTH = 0.6;
const PRESS_DRIVE_BEFORE = 0.01;
/** What the phone found on the left row, and what the trace-hole rule returns. */
const LEFT_ROW_REPS_ON_PHONE = 4;
const LEFT_ROW_REPS_NOW = 5;
const REPS_PER_SIDE = 8;
const PRESS_SET3_LIVE = 10.25;
const ROW_LEFT_LIVE = -35.4;
const ROW_RIGHT_LIVE = -28.31;
/** A bench rep on this take is cut off at the chest: the shortest the phone wrote, against the
 *  sensor's shortest press. */
const BENCH_SHORT_REP_CEILING_CM = 15;
/** The sensor's shortest press is more than twice the cut-off reps' length. */
const SENSOR_TO_CUT_REP_RATIO = 2;
const TRACE_UNITS_PER_UNIT = 100;
const CM_PER_IN = 2.54;

function replay(f: Fixture, patch: Record<string, number> = {}) {
  const points = f.barPathTrace.map((p) => ({ t: p.t, x: p.x / TRACE_UNITS_PER_UNIT, y: p.y / TRACE_UNITS_PER_UNIT, z: 0, confidence: p.c ?? 1 }));
  const tune = cameraTunablesFor(f.exerciseName, romBucketForExercise(f.exerciseName));
  Object.assign(tune.values, patch);
  const m = summarizeTrackedSet(points, f.loadKg ?? undefined, f.heightIn ?? undefined, firstMoveForExercise(f.exerciseName), [],
    f.trackingDiagnostics.calibration.positionScaleCorrection ?? 1, false, romBucketForExercise(f.exerciseName), { x: 0, y: 1 }, f.loggedReps ?? null, tune);
  if (!m) throw new Error(`${f.id}: no metrics`);
  return m;
}

describe("round sixteen: set 3 on build 732", () => {
  it("holds the four set-3 captures with the sensor's sides", () => {
    expect(fixtures.map((f) => f.id).sort()).toEqual([BENCH, PRESS, ROW_LEFT, ROW_RIGHT].sort());
    expect(byId(ROW_LEFT).side).toBe("left");
    expect(byId(ROW_RIGHT).side).toBe("right");
    expect(OVR_SINGLE_ARM_DUMBBELL_ROW_SET3_2026_11_10.sensor.left).toHaveLength(REPS_PER_SIDE);
    expect(OVR_SINGLE_ARM_DUMBBELL_ROW_SET3_2026_11_10.sensor.right).toHaveLength(REPS_PER_SIDE);
    expect(OVR_DUMBBELL_SHOULDER_PRESS_SET3_2026_11_10.sensor.reps).toHaveLength(OVR_DUMBBELL_SHOULDER_PRESS_SET3_2026_11_10.repsPerSet);
  });

  it("each lift's own record carries its round-sixteen number", () => {
    expect(FITTED_OVERRIDES["Bench Press"]).toMatchObject({ depthRulerUncertainty: BENCH_DEPTH });
    expect(FITTED_OVERRIDES["Dumbbell Shoulder Press"]).toMatchObject({ body3DCorrectedUncertainty: PRESS_3D, driveOnsetFraction: PRESS_DRIVE });
    expect(FITTED_OVERRIDES["Single-Arm Dumbbell Row"]).toMatchObject({ depthRulerUncertainty: ROW_DEPTH });
  });

  it("the left row: the phone found 4 of 8, and the rep beside the tracking hole comes back", () => {
    const f = byId(ROW_LEFT);
    expect(f.shipped.reps).toBe(LEFT_ROW_REPS_ON_PHONE);
    expect(replay(f).repBreakdown.length).toBe(LEFT_ROW_REPS_NOW);
    // The right side, with no hole, is untouched by the rule.
    expect(replay(byId(ROW_RIGHT)).repBreakdown.length).toBe(REPS_PER_SIDE);
  });

  it("the press's window moves set 3's mean toward the sensor and keeps the count", () => {
    const f = byId(PRESS);
    const s = OVR_DUMBBELL_SHOULDER_PRESS_SET3_2026_11_10.sensor.reportedOverOurReps;
    const errAt = (patch: Record<string, number>) => {
      const m = replay(f, patch);
      return Math.abs(((m.meanVelocityMps ?? Number.NaN) * s.romIn * CM_PER_IN) / (m.romCm ?? Number.NaN) / s.meanVelocityMps - 1);
    };
    expect(errAt({})).toBeLessThan(errAt({ driveOnsetFraction: PRESS_DRIVE_BEFORE }));
    expect(replay(f).repBreakdown.length).toBe(replay(f, { driveOnsetFraction: PRESS_DRIVE_BEFORE }).repBreakdown.length);
  });

  it("the bench's set 3 is a tracking hole at the chest, not a scale: it is not a ledger row", () => {
    const f = byId(BENCH);
    expect(Math.min(...replay(f).repBreakdown.map((r) => r.romCm ?? Number.POSITIVE_INFINITY))).toBeLessThan(BENCH_SHORT_REP_CEILING_CM);
    expect(Math.min(...OVR_BENCH_PRESS_SET3_2026_11_10.sensor.reps.map((r) => r.romIn * CM_PER_IN))).toBeGreaterThan(BENCH_SHORT_REP_CEILING_CM * SENSOR_TO_CUT_REP_RATIO);
    expect(() => ledgerRow("2026-11-10-bench-press-set-3")).toThrow();
  });

  it("the new ledger rows record the live pipeline", () => {
    expect(ledgerRow("2026-11-10-dumbbell-shoulder-press-set-3").liveErrorPct).toBeCloseTo(PRESS_SET3_LIVE, 1);
    expect(ledgerRow("2026-11-10-single-arm-dumbbell-row-set-3-left").liveErrorPct).toBeCloseTo(ROW_LEFT_LIVE, 1);
    expect(ledgerRow("2026-11-10-single-arm-dumbbell-row-set-3-right").liveErrorPct).toBeCloseTo(ROW_RIGHT_LIVE, 1);
  });
});
