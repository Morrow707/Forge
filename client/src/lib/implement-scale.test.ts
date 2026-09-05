import { describe, it, expect } from "vitest";
import { shoulderPixelsPerMeter } from "./implement-tracking";
import type { NormalizedLandmark, Landmark } from "@mediapipe/tasks-vision";

const LEFT_SHOULDER = 11, RIGHT_SHOULDER = 12;

function frames(normDx: number, normDy: number, worldDx: number, worldDy: number) {
  const norm: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  const world: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  norm[LEFT_SHOULDER] = { x: 0.5 - normDx / 2, y: 0.5 - normDy / 2, z: 0, visibility: 1 };
  norm[RIGHT_SHOULDER] = { x: 0.5 + normDx / 2, y: 0.5 + normDy / 2, z: 0, visibility: 1 };
  world[LEFT_SHOULDER] = { x: -worldDx / 2, y: -worldDy / 2, z: 0, visibility: 1 };
  world[RIGHT_SHOULDER] = { x: worldDx / 2, y: worldDy / 2, z: 0, visibility: 1 };
  return { norm, world };
}

describe("shoulderPixelsPerMeter", () => {
  // Normalized landmarks are normalized per axis, so multiplying x by width and y by height
  // recovers true pixels. Given real frame dimensions the result is a genuine isotropic scale --
  // this is what the tracker's own internal call site passes, and it is correct.
  it("gives a true pixels-per-metre when handed real frame dimensions", () => {
    // Shoulders 0.25 of the frame wide on a 800px-wide frame = 200px, spanning 0.4m.
    const { norm, world } = frames(0.25, 0, 0.4, 0);
    expect(shoulderPixelsPerMeter(norm, world, 800, 1600)).toBeCloseTo(200 / 0.4, 6);
  });

  // The bug: passing 1,1 measures the shoulder span in normalized-x units, then that scale was
  // used on a VERTICAL offset whose normalized unit spans a different physical length.
  it("is orientation-dependent when handed 1x1, which is why callers must not", () => {
    const { norm, world } = frames(0.25, 0, 0.4, 0);
    const horizontal = shoulderPixelsPerMeter(norm, world, 1, 1)!;
    const vertical = shoulderPixelsPerMeter(
      frames(0, 0.25, 0, 0.4).norm,
      frames(0, 0.25, 0, 0.4).world,
      1,
      1,
    )!;
    // Identical in normalized space, which is exactly the problem: the same number is being
    // asked to convert both axes when one normalized unit is 1.78x the other in real length.
    expect(horizontal).toBeCloseTo(vertical, 6);
    // With real dimensions the two are correctly different.
    const hReal = shoulderPixelsPerMeter(norm, world, 800, 1600)!;
    const vReal = shoulderPixelsPerMeter(frames(0, 0.25, 0, 0.4).norm, frames(0, 0.25, 0, 0.4).world, 800, 1600)!;
    expect(hReal).not.toBeCloseTo(vReal, 1);
    expect(vReal / hReal).toBeCloseTo(1600 / 800, 6);
  });

  it("refuses when the shoulders are too close together to trust", () => {
    const { norm, world } = frames(0.25, 0, 0.01, 0);
    expect(shoulderPixelsPerMeter(norm, world, 800, 1600)).toBeNull();
  });
});
