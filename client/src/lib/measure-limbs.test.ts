import { describe, it, expect } from "vitest";
import { measureLimbsInMetres } from "./measure-limbs";
import { POSE_LANDMARKS } from "./pose-tracking";
import { MIN_LIMB_SAMPLES } from "@shared/athlete-body-model";

/** One frame with the left arm laid out at a given projected length. */
function frame(upperArmUnits: number) {
  const worldLandmarks: any[] = Array.from({ length: 40 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0,
  }));
  const put = (i: number, x: number, y: number) =>
    (worldLandmarks[i] = { x, y, z: 0, visibility: 1 });
  put(POSE_LANDMARKS.LEFT_SHOULDER, 0, 0);
  put(POSE_LANDMARKS.LEFT_ELBOW, upperArmUnits, 0);
  return { worldLandmarks };
}

describe("measuring an athlete's bones off a take with a real ruler", () => {
  it("measures nothing without a trustworthy scale", () => {
    const frames = Array.from({ length: 60 }, () => frame(100));
    expect(measureLimbsInMetres(frames, null)).toEqual({});
    expect(measureLimbsInMetres(frames, 0)).toEqual({});
  });

  it("claims nothing from too few frames", () => {
    const frames = Array.from({ length: MIN_LIMB_SAMPLES - 1 }, () => frame(100));
    expect(measureLimbsInMetres(frames, 0.003).upperArm).toBeUndefined();
  });

  it("converts a measured span into metres", () => {
    const frames = Array.from({ length: 60 }, () => frame(100));
    expect(measureLimbsInMetres(frames, 0.0033).upperArm).toBeCloseTo(0.33, 3);
  });

  it("TAKES THE LONGEST READING, because a limb seen at an angle projects short", () => {
    // A bone can never project longer than it is. So the largest reading across hundreds of
    // frames is the square-on one. A mean or a median sits among the foreshortened readings and
    // reports a bone SHORTER than the athlete's, which inflates metres-per-pixel and every
    // distance downstream -- the exact error the body model exists to remove.
    const frames = [
      ...Array.from({ length: 50 }, () => frame(60)), // foreshortened, the majority
      ...Array.from({ length: 10 }, () => frame(100)), // square to the lens
    ];
    expect(measureLimbsInMetres(frames, 0.0033).upperArm).toBeCloseTo(0.33, 2);
  });

  it("is not defined by one landmark that flew off the athlete", () => {
    const frames = [...Array.from({ length: 60 }, () => frame(100)), frame(100000)];
    expect(measureLimbsInMetres(frames, 0.0033).upperArm).toBeCloseTo(0.33, 2);
  });

  it("skips a limb the camera never saw rather than guessing it", () => {
    const out = measureLimbsInMetres(Array.from({ length: 60 }, () => frame(100)), 0.0033);
    expect(out.upperArm).toBeDefined();
    // Nothing put a knee or an ankle in these frames.
    expect(out.femur).toBeUndefined();
    expect(out.shin).toBeUndefined();
  });
});
