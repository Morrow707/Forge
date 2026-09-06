import { describe, it, expect } from "vitest";
import { computeLegDriveAsymmetry, POSE_LANDMARKS, type PoseFrame } from "./pose-tracking";

// PoseFrame.t is milliseconds everywhere in this pipeline -- both callers of
// computeLegDriveAsymmetry build it from a performance.now() delta
// (bar-tracker-dialog) or a native frame timestamp scaled to ms
// (av-bar-tracker-dialog). This file pins that contract, because the function
// used to compare those millisecond deltas against a threshold in seconds:
// the short-window guard then passed for any window at all, and the reported
// deg/sec rates came out 1000x low, rounding to a flat 0.

// Knee at the origin, hip straight up, ankle swung out by `angleDeg` in the
// XY plane -- gives an exact hip-knee-ankle angle to drive the rates from.
function legLandmarks(leftAngleDeg: number, rightAngleDeg: number) {
  const lm: { x: number; y: number; z: number; visibility: number }[] = [];
  for (let i = 0; i < 33; i++) lm.push({ x: 0, y: 0, z: 0, visibility: 1 });
  const place = (hip: number, knee: number, ankle: number, angleDeg: number, xOffset: number) => {
    const r = (angleDeg * Math.PI) / 180;
    lm[hip] = { x: xOffset, y: 1, z: 0, visibility: 1 };
    lm[knee] = { x: xOffset, y: 0, z: 0, visibility: 1 };
    lm[ankle] = { x: xOffset + Math.sin(r), y: Math.cos(r), z: 0, visibility: 1 };
  };
  place(POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.LEFT_KNEE, POSE_LANDMARKS.LEFT_ANKLE, leftAngleDeg, -0.2);
  place(POSE_LANDMARKS.RIGHT_HIP, POSE_LANDMARKS.RIGHT_KNEE, POSE_LANDMARKS.RIGHT_ANKLE, rightAngleDeg, 0.2);
  return lm;
}

// A one-second drive sampled at 100ms, left opening 90 deg and right 45 deg.
function driveFrames(): PoseFrame[] {
  const frames: PoseFrame[] = [];
  for (let i = 0; i <= 10; i++) {
    const f = i / 10;
    frames.push({
      t: i * 100,
      landmarks: [],
      worldLandmarks: legLandmarks(90 + 90 * f, 90 + 45 * f) as any,
    });
  }
  return frames;
}

describe("computeLegDriveAsymmetry treats frame timestamps as milliseconds", () => {
  it("reports drive rates in degrees per second, not per millisecond", () => {
    const [rep] = computeLegDriveAsymmetry(driveFrames(), [{ startT: 0, endT: 1000 }]);
    expect(rep).not.toBeNull();
    // 90 degrees over one second, not 90/1000.
    expect(rep!.leftDriveDegPerSec).toBeGreaterThan(80);
    expect(rep!.leftDriveDegPerSec).toBeLessThan(100);
    expect(rep!.rightDriveDegPerSec).toBeGreaterThan(38);
    expect(rep!.rightDriveDegPerSec).toBeLessThan(52);
    expect(rep!.dominantSide).toBe("left");
    expect(rep!.asymmetryPercent).toBeGreaterThan(40);
  });

  it("still rejects a window too short to trust", () => {
    // Three frames 20ms apart: comfortably under the 150ms floor. Read as
    // seconds, 0.04 cleared a 0.15 threshold in the wrong unit and this
    // noise-width window produced a confident-looking number.
    const frames: PoseFrame[] = [0, 20, 40].map((t, i) => ({
      t,
      landmarks: [],
      worldLandmarks: legLandmarks(90 + i * 5, 90 + i * 2) as any,
    }));
    const [rep] = computeLegDriveAsymmetry(frames, [{ startT: 0, endT: 40 }]);
    expect(rep).toBeNull();
  });
});
