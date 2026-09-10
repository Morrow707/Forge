import { describe, it, expect } from "vitest";
import {
  calibrateFromFrames,
  calibrationMethodBreakdown,
  isKnownSupineMovement,
  POSE_LANDMARKS,
} from "./pose-tracking";
import type { Landmark } from "@mediapipe/tasks-vision";

// Every fixture below sets z to 0, because that is what the real iOS path produces:
// visionJointsToWorldLandmarks fills z with 0 (Vision's 2D body-pose request has no depth),
// and calibration runs on those landmarks. Anything that has to survive a real camera angle
// has to survive with no depth information at all.
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

const HEIGHT_IN = 70;
const HEIGHT_M = HEIGHT_IN * 0.0254;
// Biacromial breadth is ~0.245 of standing height (Drillis & Contini), so a body seen at
// its true length runs ~4.1 on the height-to-shoulder ratio, well clear of the 2.5 floor.
const SHOULDER_HALF = 0.1225;

// Standing, head above ankles: the case that has always worked and must not change.
function standingFrame() {
  return frameFrom({
    [POSE_LANDMARKS.NOSE]: [0, 0],
    [POSE_LANDMARKS.LEFT_SHOULDER]: [-SHOULDER_HALF, 0.15],
    [POSE_LANDMARKS.RIGHT_SHOULDER]: [SHOULDER_HALF, 0.15],
    [POSE_LANDMARKS.LEFT_HIP]: [-0.1, 0.5],
    [POSE_LANDMARKS.RIGHT_HIP]: [0.1, 0.5],
    [POSE_LANDMARKS.LEFT_ANKLE]: [-0.1, 1.0],
    [POSE_LANDMARKS.RIGHT_ANKLE]: [0.1, 1.0],
  });
}

// Bench, camera square to the side at bench height. The body lies ACROSS the frame at
// very close to its true length -- almost none of it vertical, but nothing foreshortened
// either. This is the angle that can be calibrated.
function supineSideOnFrame() {
  return frameFrom({
    [POSE_LANDMARKS.NOSE]: [0, 0],
    [POSE_LANDMARKS.LEFT_SHOULDER]: [0.15, -SHOULDER_HALF],
    [POSE_LANDMARKS.RIGHT_SHOULDER]: [0.15, SHOULDER_HALF],
    [POSE_LANDMARKS.LEFT_HIP]: [0.5, -0.1],
    [POSE_LANDMARKS.RIGHT_HIP]: [0.5, 0.1],
    [POSE_LANDMARKS.LEFT_ANKLE]: [1.0, -0.1],
    [POSE_LANDMARKS.RIGHT_ANKLE]: [1.0, 0.1],
  });
}

// Bench, camera at the foot of the bench looking up the body. On a depthless 2D pose this
// body runs up and down the frame exactly like a standing one, so direction alone cannot
// tell them apart -- but it is the most foreshortened view there is, head-to-ankle
// collapsed to a fraction of its real length.
function supineEndOnFrame() {
  return frameFrom({
    [POSE_LANDMARKS.NOSE]: [0, 0],
    [POSE_LANDMARKS.LEFT_SHOULDER]: [-SHOULDER_HALF, 0.05],
    [POSE_LANDMARKS.RIGHT_SHOULDER]: [SHOULDER_HALF, 0.05],
    [POSE_LANDMARKS.LEFT_HIP]: [-0.1, 0.18],
    [POSE_LANDMARKS.RIGHT_HIP]: [0.1, 0.18],
    [POSE_LANDMARKS.LEFT_ANKLE]: [-0.1, 0.3],
    [POSE_LANDMARKS.RIGHT_ANKLE]: [0.1, 0.3],
  });
}

// The angle the failing bench set was actually filmed from: off the corner of the bench and
// raised, looking down at roughly 45 degrees. Diagonal across the frame and foreshortened.
function supineObliqueFrame() {
  return frameFrom({
    [POSE_LANDMARKS.NOSE]: [0, 0],
    [POSE_LANDMARKS.LEFT_SHOULDER]: [0.06, 0.02],
    [POSE_LANDMARKS.RIGHT_SHOULDER]: [0.14, 0.14],
    [POSE_LANDMARKS.LEFT_HIP]: [0.2, 0.2],
    [POSE_LANDMARKS.RIGHT_HIP]: [0.28, 0.28],
    [POSE_LANDMARKS.LEFT_ANKLE]: [0.35, 0.35],
    [POSE_LANDMARKS.RIGHT_ANKLE]: [0.42, 0.42],
  });
}

const take = (f: () => { worldLandmarks: Landmark[] }) => Array.from({ length: 30 }, f);

describe("height calibration", () => {
  it("calibrates a standing athlete", () => {
    // Head-to-ankle spans exactly 1.0 unit, so the scale is the athlete's height in metres.
    expect(calibrateFromFrames(take(standingFrame), HEIGHT_IN)).toBeCloseTo(HEIGHT_M, 5);
  });

  it("calibrates a side-on bench set off the body's full length", () => {
    // Same 1.0-unit body, lying down instead of standing -- same answer.
    expect(calibrateFromFrames(take(supineSideOnFrame), HEIGHT_IN)).toBeCloseTo(HEIGHT_M, 5);
  });

  it("refuses an end-on bench set rather than inflating the scale", () => {
    expect(calibrateFromFrames(take(supineEndOnFrame), HEIGHT_IN)).toBeNull();
  });

  it("refuses the oblique raised angle the failing set was filmed from", () => {
    expect(calibrateFromFrames(take(supineObliqueFrame), HEIGHT_IN)).toBeNull();
  });
});

// A back squat at depth: still upright, still the same person, but the nose-to-ankle span has
// collapsed to two thirds of standing height. Both guards let this through on purpose -- the
// body IS vertical, and 0.667 / 0.245 is 2.7 against a 2.5 floor -- which is exactly why the
// estimator, not the guards, has to be the thing that handles it.
function squatBottomFrame() {
  return frameFrom({
    [POSE_LANDMARKS.NOSE]: [0, 0.333],
    [POSE_LANDMARKS.LEFT_SHOULDER]: [-SHOULDER_HALF, 0.43],
    [POSE_LANDMARKS.RIGHT_SHOULDER]: [SHOULDER_HALF, 0.43],
    [POSE_LANDMARKS.LEFT_HIP]: [-0.1, 0.85],
    [POSE_LANDMARKS.RIGHT_HIP]: [0.1, 0.85],
    [POSE_LANDMARKS.LEFT_ANKLE]: [-0.1, 1.0],
    [POSE_LANDMARKS.RIGHT_ANKLE]: [0.1, 1.0],
  });
}

describe("a movement that compresses the athlete", () => {
  // A real set spends most of its frames somewhere other than fully stood up -- the descent,
  // the bottom, the drive back. Standing frames are the minority, and a median walks straight
  // into the majority.
  const squatSet = [
    ...Array.from({ length: 6 }, standingFrame),
    ...Array.from({ length: 24 }, squatBottomFrame),
  ];

  it("calibrates a squat off the athlete standing, not off the athlete at depth", () => {
    // The right answer is the standing one. Reading it off the bottom would return HEIGHT_M
    // divided by 0.667 -- half a metre per unit against a true 1.78, every distance,
    // velocity and power number for the set inflated by the same 1.5x.
    expect(calibrateFromFrames(squatSet, HEIGHT_IN)!).toBeCloseTo(HEIGHT_M, 5);
  });

  it("does not take the single most extended frame either", () => {
    // One landmark glitch that stretches a span would otherwise become the scale for the
    // whole set. A tenth-percentile read ignores a lone outlier; a pure minimum takes it.
    const withGlitch = [
      ...squatSet,
      frameFrom({
        [POSE_LANDMARKS.NOSE]: [0, -1.0],
        [POSE_LANDMARKS.LEFT_SHOULDER]: [-SHOULDER_HALF, 0.15],
        [POSE_LANDMARKS.RIGHT_SHOULDER]: [SHOULDER_HALF, 0.15],
        [POSE_LANDMARKS.LEFT_ANKLE]: [-0.1, 1.0],
        [POSE_LANDMARKS.RIGHT_ANKLE]: [0.1, 1.0],
      }),
    ];
    expect(calibrateFromFrames(withGlitch, HEIGHT_IN)!).toBeCloseTo(HEIGHT_M, 5);
  });
});

describe("what the old code did", () => {
  // The regression this suite exists for: a bench set reported 154cm of range of motion
  // against 39cm actually pressed. The vertical leftover of a horizontal body was being
  // divided into a real height.
  it("would have inflated the end-on scale over 3x", () => {
    const lm = supineEndOnFrame().worldLandmarks;
    const verticalSpan =
      (lm[POSE_LANDMARKS.LEFT_ANKLE].y + lm[POSE_LANDMARKS.RIGHT_ANKLE].y) / 2 - lm[POSE_LANDMARKS.NOSE].y;
    expect(HEIGHT_M / verticalSpan / HEIGHT_M).toBeGreaterThan(3);
  });

  it("could not have caught the end-on view by direction alone", () => {
    const lm = supineEndOnFrame().worldLandmarks;
    const dy = (lm[POSE_LANDMARKS.LEFT_ANKLE].y + lm[POSE_LANDMARKS.RIGHT_ANKLE].y) / 2 - lm[POSE_LANDMARKS.NOSE].y;
    const dx = (lm[POSE_LANDMARKS.LEFT_ANKLE].x + lm[POSE_LANDMARKS.RIGHT_ANKLE].x) / 2 - lm[POSE_LANDMARKS.NOSE].x;
    // Runs essentially straight up the frame, indistinguishable from standing by direction.
    expect(dy / Math.hypot(dx, dy)).toBeGreaterThan(0.99);
  });
});

describe("diagnostics agree with the real path", () => {
  it("reports nose-to-ankle for a standing take", () => {
    const b = calibrationMethodBreakdown(take(standingFrame));
    expect(b.noseToAnkleFrames).toBe(30);
    expect(b.unresolvedFrames).toBe(0);
  });

  it("reports an end-on take as unresolved, not as a successful calibration", () => {
    const b = calibrationMethodBreakdown(take(supineEndOnFrame));
    expect(b.noseToAnkleFrames).toBe(0);
    expect(b.shoulderToAnkleFrames).toBe(0);
    expect(b.unresolvedFrames).toBe(30);
  });
});

describe("isKnownSupineMovement", () => {
  it("recognises the movements an athlete performs lying down", () => {
    for (const name of [
      "Bench Press",
      "bench press",
      "Incline Bench Press",
      "Close-Grip Bench Press",
      "Floor Press",
      "Machine Chest Fly",
      "Dumbbell Chest Flye",
      "Skull Crusher",
      "Lying Triceps Extension",
      "Supine Row",
      "Hip Thrust",
      "Glute Bridge",
    ]) {
      expect(isKnownSupineMovement(name), name).toBe(true);
    }
  });

  it("leaves standing movements alone, including ones a pattern matcher would group with presses", () => {
    for (const name of [
      "Back Squat",
      "Front Squat",
      "Deadlift",
      "Pendlay Row",
      "Barbell Row",
      "Overhead Press",
      "Push Press",
      "Box Jump",
      "Power Clean",
      "Snatch",
    ]) {
      expect(isKnownSupineMovement(name), name).toBe(false);
    }
  });

  it("defaults to false for anything unrecognised, so nothing changes by accident", () => {
    expect(isKnownSupineMovement("Some New Exercise")).toBe(false);
    expect(isKnownSupineMovement("")).toBe(false);
    expect(isKnownSupineMovement(null)).toBe(false);
    expect(isKnownSupineMovement(undefined)).toBe(false);
  });
});
