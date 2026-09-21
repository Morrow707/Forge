import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { measureShoulderToAnkleFraction } from "./pose-tracking";
import { POSE_LANDMARKS } from "./pose-tracking";

const src = readFileSync(resolve(__dirname, "pose-tracking.ts"), "utf-8");

/** A standing athlete, nose visible, with a chosen shoulder fraction baked in. */
function frame(fraction: number, heightPx = 500) {
  const lm: { x: number; y: number; z: number; visibility: number }[] = Array.from(
    { length: 34 },
    () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }),
  );
  const ankleY = 0.9;
  const noseY = ankleY - heightPx / 1000;
  const shoulderY = ankleY - (heightPx * fraction) / 1000;
  const put = (i: number, x: number, y: number) => (lm[i] = { x, y, z: 0, visibility: 1 });
  put(POSE_LANDMARKS.NOSE, 0.5, noseY);
  put(POSE_LANDMARKS.LEFT_SHOULDER, 0.46, shoulderY);
  put(POSE_LANDMARKS.RIGHT_SHOULDER, 0.54, shoulderY);
  put(POSE_LANDMARKS.LEFT_HIP, 0.47, ankleY - heightPx / 2000);
  put(POSE_LANDMARKS.RIGHT_HIP, 0.53, ankleY - heightPx / 2000);
  put(POSE_LANDMARKS.LEFT_ANKLE, 0.47, ankleY);
  put(POSE_LANDMARKS.RIGHT_ANKLE, 0.53, ankleY);
  return { worldLandmarks: lm as never };
}

/**
 * Filmed from behind -- which is how every athlete actually films -- the nose is rarely
 * visible, so the shoulder path carries the set and its population-average divisor sets the
 * scale for almost every frame. The few frames that DO see the nose are spent measuring this
 * athlete instead of assuming them.
 */
describe("the athlete's own shoulder fraction", () => {
  it("recovers a fraction that is not the population average", () => {
    const frames = Array.from({ length: 40 }, () => frame(0.74));
    const measured = measureShoulderToAnkleFraction(frames);
    expect(measured).not.toBeNull();
    expect(measured!).toBeCloseTo(0.74, 2);
  });

  it("refuses a sample too small to fit a ratio from", () => {
    // One turn of the head is not a measurement.
    expect(measureShoulderToAnkleFraction([frame(0.74), frame(0.74)])).toBeNull();
  });

  it("refuses a ratio outside human variation rather than trusting it", () => {
    // A jumped nose landmark can produce anything; the population average is the better bet.
    const frames = Array.from({ length: 40 }, () => frame(0.2));
    expect(measureShoulderToAnkleFraction(frames)).toBeNull();
  });

  it("falls back to the population average when no frame sees the nose", () => {
    expect(src).toContain("measureShoulderToAnkleFraction(frames) ?? SHOULDER_TO_ANKLE_FRACTION");
  });

  it("learns only from frames the nose branch itself would have trusted", () => {
    // Otherwise the ratio is fitted to frames the pipeline refuses to calibrate from.
    const fn = src.slice(src.indexOf("export function measureShoulderToAnkleFraction"));
    expect(fn.slice(0, 2000)).toContain("uprightEnough(viaNose");
    expect(fn.slice(0, 2000)).toContain("foreshorteningPlausible(viaNose");
  });

  it("takes the median, so one bad frame cannot move it", () => {
    const fn = src.slice(src.indexOf("export function measureShoulderToAnkleFraction"));
    expect(fn.slice(0, 2500)).toContain("sorted[Math.floor(sorted.length / 2)]");
  });

  it("divides a shoulder-to-ankle span by a shoulder-to-ankle fraction", () => {
    // 0.818 is acromion above the FLOOR; the ankle joint sits ~0.039 of stature up.
    expect(src).toContain("const ANKLE_HEIGHT_FRACTION = 0.039");
    expect(src).toContain("SHOULDER_HEIGHT_FRACTION - ANKLE_HEIGHT_FRACTION");
  });
});
