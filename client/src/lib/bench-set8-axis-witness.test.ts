import { describe, it, expect } from "vitest";
import {
  reconcileMovementAxis,
  summarizeTrackedSet,
  MAX_GRIP_AXIS_FROM_VERTICAL_DEG,
  type TrackedPoint,
} from "./bar-tracking";
import { firstMoveForExercise, romBucketForExercise } from "./exercise-camera-profile";
import capture from "./__fixtures__/bench-set8-2026-09-29.json";
import { OVR_BENCH_SET8_2026_09_29 } from "./tracker-ground-truth";

// Set 8 beside OVR, build 574, 2026-09-29. The grip axis came out 78 degrees from the image
// vertical and the whole take was rotated onto it: nine "reps" of 44-119cm at 2.03 m/s against
// the sensor's ten of 36cm at 0.76. The stored trace is in that wrong frame, so the fixture is
// un-rotated back to the device's raw frame first, then segmented the way build 575 does.
const stored = (capture as any)[0];
const storedAxis: { x: number; y: number } = stored.trackingDiagnostics.calibration.movementAxis;

function deviceFrame(): TrackedPoint[] {
  return stored.barPathTrace.map((p: { t: number; x: number; y: number; c: number }) => {
    const along = p.y / 100;
    const across = p.x / 100;
    return {
      t: p.t,
      x: along * storedAxis.x - across * storedAxis.y,
      y: along * storedAxis.y + across * storedAxis.x,
      z: 0,
      confidence: p.c,
    };
  });
}

function segment(axis: { x: number; y: number } | null) {
  return summarizeTrackedSet(
    deviceFrame(),
    stored.loadKg,
    stored.heightIn,
    firstMoveForExercise(stored.exerciseName),
    [],
    1,
    false,
    romBucketForExercise(stored.exerciseName),
    axis,
    stored.loggedReps,
  );
}

describe("the grip axis is a witness held against the image vertical", () => {
  it("the stored axis really was 78 degrees from vertical, and is refused even with no roll to read", () => {
    const w = reconcileMovementAxis(storedAxis, null);
    expect(w.gripAxisFromVerticalDeg).toBeGreaterThan(MAX_GRIP_AXIS_FROM_VERTICAL_DEG);
    expect(w.source).toBe("vertical_over_grip");
    expect(w.axis).toEqual({ x: 0, y: 1 });
  });

  it("with the phone's roll read and small, gravity is the axis and the grip is only recorded", () => {
    const w = reconcileMovementAxis(storedAxis, -2.7);
    expect(w.source).toBe("gravity");
    expect(w.axis).toEqual({ x: 0, y: 1 });
    expect(w.gripAxisFromVerticalDeg).toBeGreaterThan(70);
    // Set 9: 28 degrees from vertical under a 4-degree roll. Gravity, not the grip.
    expect(reconcileMovementAxis({ x: -0.4703, y: 0.8825 }, -4.2).source).toBe("gravity");
    expect(reconcileMovementAxis(null, 3).source).toBe("gravity");
  });

  it("without a roll, a grip axis near vertical is kept, sign either way, and no grip keeps the covariance", () => {
    expect(reconcileMovementAxis({ x: -0.1458, y: 0.9893 }, null).source).toBe("grip");
    expect(reconcileMovementAxis({ x: 0.2846, y: -0.9587 }, null).source).toBe("grip");
    expect(reconcileMovementAxis({ x: -0.1458, y: 0.9893 }, null).gripAxisFromVerticalDeg).toBeCloseTo(8.4, 0);
    expect(reconcileMovementAxis(null, null)).toEqual({ axis: null, source: "trace_covariance", gripAxisFromVerticalDeg: null });
    // A phone rolled past the limit hands the question back to the grip.
    expect(reconcileMovementAxis({ x: -0.1458, y: 0.9893 }, 40).source).toBe("grip");
  });

  it("reproduces the device's wrong answer under the grip axis, so the fault is the axis", () => {
    const m = segment(storedAxis)!;
    expect(m.meanVelocityMps).toBeGreaterThan(1.8);
    expect(m.romCm).toBeGreaterThan(50);
  });

  it("finds the sensor's ten at its range of motion under the reconciled axis", () => {
    const m = segment(reconcileMovementAxis(storedAxis, -2.7).axis)!;
    const sensorRomCm = OVR_BENCH_SET8_2026_09_29.sensor.reported.romIn * 2.54;
    expect(m.repBreakdown.length).toBe(10);
    expect(m.romCm! / sensorRomCm).toBeGreaterThan(0.9);
    expect(m.romCm! / sensorRomCm).toBeLessThan(1.1);
    // 0.87 against 0.76: the same concentric-window residual as set 7, not the axis.
    expect(m.meanVelocityMps).toBeGreaterThan(0.7);
    expect(m.meanVelocityMps).toBeLessThan(1.0);
  });
});
