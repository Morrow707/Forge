import { describe, it, expect } from "vitest";
import {
  calibrateFromFrames,
  isDuplicateLandmarkFrame,
  DUPLICATE_FRAME_EPSILON,
  MIN_CALIBRATION_SAMPLES,
  POSE_LANDMARKS,
} from "./pose-tracking";
import type { Landmark } from "@mediapipe/tasks-vision";

/**
 * A STALLED CAMERA IS ONE SAMPLE, NOT TWENTY.
 *
 * calibrateFromFrames takes the tenth percentile of per-frame scales so that the athlete at
 * their most extended sets the scale, not the athlete at the bottom of a squat. That estimator
 * assumes each frame is one look at the athlete. A camera that stalls -- repeating the last
 * frame while the encoder catches up -- hands it the same landmark set over and over, and if
 * the stall lands at the bottom of a squat the compressed span is repeated enough to drag the
 * tenth percentile down into exactly the error the percentile was chosen to avoid.
 *
 * This is a dedup, not a threshold. The estimator and MIN_CALIBRATION_SAMPLES are untouched.
 */

const HEIGHT_IN = 70;
const SHOULDER_HALF = 0.1225;
const NOSE_TO_HIP = 0.4;

function frameFrom(points: Record<number, [number, number]>): { worldLandmarks: Landmark[] } {
  const worldLandmarks: Landmark[] = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0,
  })) as Landmark[];
  for (const [index, [x, y]] of Object.entries(points)) {
    worldLandmarks[Number(index)] = { x, y, z: 0, visibility: 0.99 } as Landmark;
  }
  return { worldLandmarks };
}

/** Standing tall (ankleY 1.0) or compressed toward a squat bottom (ankleY < 1.0). Nose to hip
 * stays anatomically fixed so the supine cross-check does not read the pose as folded. */
function bodyFrame(ankleY: number, jitter = 0) {
  return frameFrom({
    [POSE_LANDMARKS.NOSE]: [jitter, 0],
    [POSE_LANDMARKS.LEFT_SHOULDER]: [-SHOULDER_HALF + jitter, 0.15],
    [POSE_LANDMARKS.RIGHT_SHOULDER]: [SHOULDER_HALF + jitter, 0.15],
    [POSE_LANDMARKS.LEFT_HIP]: [-0.1 + jitter, NOSE_TO_HIP],
    [POSE_LANDMARKS.RIGHT_HIP]: [0.1 + jitter, NOSE_TO_HIP],
    [POSE_LANDMARKS.LEFT_ANKLE]: [-0.1 + jitter, ankleY],
    [POSE_LANDMARKS.RIGHT_ANKLE]: [0.1 + jitter, ankleY],
  });
}

/** Distinct standing frames -- each one jittered by far more than the epsilon, as a real
 * detection always is, so they count as separate samples. */
function distinctStanding(n: number) {
  return Array.from({ length: n }, (_, i) => bodyFrame(1.0, (i + 1) * 1e-3));
}

describe("isDuplicateLandmarkFrame", () => {
  it("matches the same detection served twice", () => {
    const a = bodyFrame(1.0).worldLandmarks;
    const b = bodyFrame(1.0).worldLandmarks;
    expect(isDuplicateLandmarkFrame(a, b)).toBe(true);
  });

  it("survives a float multiply on the way in, and nothing more", () => {
    const a = bodyFrame(1.0).worldLandmarks;
    const scaled = a.map((p) => ({ ...p, x: p.x * 1.0000000001 })) as Landmark[];
    expect(isDuplicateLandmarkFrame(a, scaled)).toBe(true);
    const moved = a.map((p) => ({ ...p, x: p.x + DUPLICATE_FRAME_EPSILON * 10 })) as Landmark[];
    expect(isDuplicateLandmarkFrame(a, moved)).toBe(false);
  });

  it("treats a change in visibility alone as a different frame", () => {
    const a = bodyFrame(1.0).worldLandmarks;
    const b = a.map((p, i) => (i === POSE_LANDMARKS.NOSE ? { ...p, visibility: 0.5 } : p)) as Landmark[];
    expect(isDuplicateLandmarkFrame(a, b)).toBe(false);
  });
});

describe("calibrateFromFrames drops repeated frames before the percentile", () => {
  it("N identical frames count once: alone they cannot clear the sample floor", () => {
    const repeated = Array.from({ length: MIN_CALIBRATION_SAMPLES * 4 }, () => bodyFrame(1.0));
    expect(calibrateFromFrames(repeated, HEIGHT_IN)).toBeNull();
    // Whereas the same number of DISTINCT frames calibrates.
    expect(calibrateFromFrames(distinctStanding(MIN_CALIBRATION_SAMPLES * 4), HEIGHT_IN)).not.toBeNull();
  });

  it("a stall at the bottom of a squat no longer drags the scale", () => {
    // The estimator is a tenth percentile: the smallest few scales, which is the athlete at
    // their tallest. Nine distinct standing frames, then one compressed frame repeated fifty
    // times by a stalled camera. Counted once, the stall is one of ten samples and the tenth
    // percentile stays on the standing frames; counted fifty times it IS the percentile.
    const standing = distinctStanding(9);
    const stalled = Array.from({ length: 50 }, () => bodyFrame(0.7));
    const clean = calibrateFromFrames(standing, HEIGHT_IN)!;
    const withStall = calibrateFromFrames([...standing, ...stalled], HEIGHT_IN)!;
    expect(withStall).toBeCloseTo(clean, 6);
    // Sanity: the compressed frame really does produce a larger scale, so the stall would have
    // moved the answer had it counted.
    const compressedOnly = calibrateFromFrames(
      Array.from({ length: MIN_CALIBRATION_SAMPLES }, (_, i) => bodyFrame(0.7, (i + 1) * 1e-3)),
      HEIGHT_IN,
    )!;
    expect(compressedOnly).toBeGreaterThan(clean);
  });

  it("only drops a frame identical to the one BEFORE it, never a non-adjacent repeat", () => {
    // Two honest frames that happen to match exactly ten frames apart are two looks. Only a
    // consecutive copy is a stall.
    const a = bodyFrame(1.0, 0.001);
    const b = bodyFrame(1.0, 0.002);
    const alternating = [a, b, a, b, a, b, a, b];
    expect(calibrateFromFrames(alternating, HEIGHT_IN)).not.toBeNull();
  });

  it("does not touch the estimator or the floor", () => {
    // Distinct frames give the same answer they always did: the tenth percentile of the scales.
    const frames = distinctStanding(MIN_CALIBRATION_SAMPLES);
    expect(calibrateFromFrames(frames, HEIGHT_IN)).not.toBeNull();
    expect(calibrateFromFrames(frames.slice(0, MIN_CALIBRATION_SAMPLES - 1), HEIGHT_IN)).toBeNull();
  });
});
