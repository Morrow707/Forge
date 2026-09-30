import { describe, it, expect } from "vitest";
import { reconcileMovementAxis, summarizeTrackedSet, type TrackedPoint } from "./bar-tracking";
import { firstMoveForExercise, romBucketForExercise } from "./exercise-camera-profile";
import capture from "./__fixtures__/bench-set9-2026-09-30.json";
import { OVR_BENCH_SET9_2026_09_30 } from "./tracker-ground-truth";

// Set 9 beside OVR, build 575, 2026-09-30. The bar tilted 28 degrees in frame under
// perspective (the near plate lower and larger than the far one), the phone rolled 4 degrees.
// The grip's perpendicular rotated the trace 28 degrees off the lift: 7 reps at 1.04 m/s
// against the sensor's 10 at 0.80. Along gravity the same trace gives ten.
const stored = (capture as any)[0];
const storedAxis: { x: number; y: number } = stored.trackingDiagnostics.calibration.movementAxis;

function deviceFrame(): TrackedPoint[] {
  return stored.barPathTrace.map((p: { t: number; x: number; y: number; c: number }) => {
    const along = p.y / 100;
    const across = p.x / 100;
    return { t: p.t, x: along * storedAxis.x - across * storedAxis.y, y: along * storedAxis.y + across * storedAxis.x, z: 0, confidence: p.c };
  });
}

function segment(axis: { x: number; y: number } | null) {
  return summarizeTrackedSet(deviceFrame(), stored.loadKg, stored.heightIn, firstMoveForExercise(stored.exerciseName), [], 1, false, romBucketForExercise(stored.exerciseName), axis, stored.loggedReps);
}

describe("set 9: a bar tilted by perspective still travels along gravity", () => {
  it("the grip axis loses reps; gravity finds the sensor's ten", () => {
    expect(segment(storedAxis)!.repBreakdown.length).toBeLessThan(10);
    const w = reconcileMovementAxis(storedAxis, OVR_BENCH_SET9_2026_09_30.forgeOnDevice.cameraRollDeg);
    expect(w.source).toBe("gravity");
    const m = segment(w.axis)!;
    expect(m.repBreakdown.length).toBe(10);
    expect(m.meanVelocityMps).toBeGreaterThan(0.8);
    expect(m.meanVelocityMps).toBeLessThan(1.2);
  });
});
