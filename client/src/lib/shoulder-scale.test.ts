import { describe, it, expect } from "vitest";
import { shoulderWidthScaleFromFrames } from "./pose-tracking";
import type { Landmark } from "@mediapipe/tasks-vision";

const HEIGHT_IN = 70; // 1.778m, so ~0.409m across the shoulders

/** Frames of a lifter whose shoulders sit `across` apart in pixel space and `depth` apart in
 *  the estimated depth axis. Depth near zero is square to the lens; large depth is turned away. */
function frames(across: number, depth = 0, count = 40) {
  return Array.from({ length: count }, () => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
    lm[11] = { x: -across / 2, y: 0, z: -depth / 2, visibility: 1 };
    lm[12] = { x: across / 2, y: 0, z: depth / 2, visibility: 1 };
    return { worldLandmarks: lm };
  });
}

describe("shoulderWidthScaleFromFrames", () => {
  it("gives a bench press a scale where body length could never provide one", () => {
    // Shoulders 0.409m of real breadth spanning 0.5 units of pixel space.
    const result = shoulderWidthScaleFromFrames(frames(0.5), HEIGHT_IN)!;
    expect(result).not.toBeNull();
    // 40cm of real bar travel should read back as roughly 40cm.
    expect(0.489 * result.scale).toBeCloseTo(0.4, 2);
  });

  it("scales with the athlete, not with a constant", () => {
    const tall = shoulderWidthScaleFromFrames(frames(0.5), 76)!;
    const short = shoulderWidthScaleFromFrames(frames(0.5), 62)!;
    expect(tall.scale).toBeGreaterThan(short.scale);
  });

  it("carries an honest uncertainty rather than pretending to be exact", () => {
    const result = shoulderWidthScaleFromFrames(frames(0.5), HEIGHT_IN)!;
    expect(result.uncertaintyFraction).toBeGreaterThan(0.05);
    expect(result.uncertaintyFraction).toBeLessThan(0.2);
  });

  it("refuses when the shoulders are turned away, since the width is foreshortened too", () => {
    // One shoulder well behind the other: their apparent width means nothing.
    expect(shoulderWidthScaleFromFrames(frames(0.2, 0.5), HEIGHT_IN)).toBeNull();
  });

  it("refuses without a height on file, which is the one thing it cannot infer", () => {
    expect(shoulderWidthScaleFromFrames(frames(0.5), null)).toBeNull();
    expect(shoulderWidthScaleFromFrames(frames(0.5), 0)).toBeNull();
  });

  it("refuses on too few usable frames rather than trusting one reading", () => {
    expect(shoulderWidthScaleFromFrames(frames(0.5, 0, 3), HEIGHT_IN)).toBeNull();
  });

  it("ignores frames where a shoulder was not tracked", () => {
    const mixed = frames(0.5, 0, 30);
    for (let i = 0; i < 10; i++) {
      mixed[i].worldLandmarks[11] = { x: 0, y: 0, z: 0, visibility: 0 };
    }
    expect(shoulderWidthScaleFromFrames(mixed, HEIGHT_IN)).not.toBeNull();
  });
});
