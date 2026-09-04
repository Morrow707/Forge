import { describe, it, expect } from "vitest";
import { calibrateFromFrames, calibrationMethodBreakdown, POSE_LANDMARKS } from "./pose-tracking";
import type { Landmark } from "@mediapipe/tasks-vision";

// Vision/MediaPipe hand back a fixed-length landmark array; only the joints the
// calibration path actually reads need to be real, but every index has to exist.
function frameFrom(points: Record<number, [number, number, number]>): { worldLandmarks: Landmark[] } {
  const worldLandmarks: Landmark[] = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0,
  })) as Landmark[];
  for (const [index, [x, y, z]] of Object.entries(points)) {
    worldLandmarks[Number(index)] = { x, y, z, visibility: 0.99 } as Landmark;
  }
  return { worldLandmarks };
}

// y grows downward (ankles below the head), which is what worldVerticalSign reports
// as sign 1 -- shoulders above hips.
function standingFrame(): { worldLandmarks: Landmark[] } {
  return frameFrom({
    [POSE_LANDMARKS.NOSE]: [0, 0, 0],
    [POSE_LANDMARKS.LEFT_SHOULDER]: [-0.2, 0.15, 0],
    [POSE_LANDMARKS.RIGHT_SHOULDER]: [0.2, 0.15, 0],
    [POSE_LANDMARKS.LEFT_HIP]: [-0.15, 0.5, 0],
    [POSE_LANDMARKS.RIGHT_HIP]: [0.15, 0.5, 0],
    [POSE_LANDMARKS.LEFT_ANKLE]: [-0.15, 1.0, 0],
    [POSE_LANDMARKS.RIGHT_ANKLE]: [0.15, 1.0, 0],
  });
}

// Lying flat on a bench, camera behind the head: the body runs mostly along the
// camera's depth axis, so head-to-ankle is a long segment whose VERTICAL component
// is only the small leftover from bench incline and camera tilt. Shoulders still
// read slightly "above" hips, so this take calibrates rather than being rejected
// for having no vertical sign at all.
function supineFrame(): { worldLandmarks: Landmark[] } {
  return frameFrom({
    [POSE_LANDMARKS.NOSE]: [0, 0, 0],
    [POSE_LANDMARKS.LEFT_SHOULDER]: [-0.2, 0.02, 0.2],
    [POSE_LANDMARKS.RIGHT_SHOULDER]: [0.2, 0.02, 0.2],
    [POSE_LANDMARKS.LEFT_HIP]: [-0.15, 0.06, 0.6],
    [POSE_LANDMARKS.RIGHT_HIP]: [0.15, 0.06, 0.6],
    [POSE_LANDMARKS.LEFT_ANKLE]: [-0.15, 0.12, 1.2],
    [POSE_LANDMARKS.RIGHT_ANKLE]: [0.15, 0.12, 1.2],
  });
}

const HEIGHT_IN = 70;

describe("height calibration", () => {
  it("calibrates a standing athlete to metres per pixel-unit", () => {
    const frames = Array.from({ length: 30 }, standingFrame);
    const scale = calibrateFromFrames(frames, HEIGHT_IN);
    // Head-to-ankle spans exactly 1.0 unit here, so the scale is just the athlete's
    // real height in metres.
    expect(scale).toBeCloseTo(70 * 0.0254, 5);
  });

  it("refuses to calibrate a supine athlete rather than inflating the scale", () => {
    const frames = Array.from({ length: 30 }, supineFrame);
    expect(calibrateFromFrames(frames, HEIGHT_IN)).toBeNull();
  });

  // The regression this exists for. A bench set reported 154cm of range of motion
  // against 39cm actually pressed; the vertical leftover of a horizontal body was
  // being divided into a real height. Left unguarded, this frame calibrates to
  // ~15x the standing scale.
  it("would otherwise have produced a wildly inflated scale", () => {
    const supine = supineFrame().worldLandmarks;
    const noseToAnkleVertical =
      (supine[POSE_LANDMARKS.LEFT_ANKLE].y + supine[POSE_LANDMARKS.RIGHT_ANKLE].y) / 2 -
      supine[POSE_LANDMARKS.NOSE].y;
    const unguardedScale = HEIGHT_IN * 0.0254 / noseToAnkleVertical;
    const standingScale = HEIGHT_IN * 0.0254 / 1.0;
    expect(unguardedScale / standingScale).toBeGreaterThan(4);
  });

  it("reports a supine take as unresolved instead of claiming nose-to-ankle worked", () => {
    const breakdown = calibrationMethodBreakdown(Array.from({ length: 30 }, supineFrame));
    expect(breakdown.noseToAnkleFrames).toBe(0);
    expect(breakdown.shoulderToAnkleFrames).toBe(0);
    expect(breakdown.unresolvedFrames).toBe(30);
  });

  it("still reports nose-to-ankle for a standing take", () => {
    const breakdown = calibrationMethodBreakdown(Array.from({ length: 30 }, standingFrame));
    expect(breakdown.noseToAnkleFrames).toBe(30);
    expect(breakdown.unresolvedFrames).toBe(0);
  });
});
