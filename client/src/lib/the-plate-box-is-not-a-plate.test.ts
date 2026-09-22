import { describe, expect, it } from "vitest";
import {
  OVR_BENCH_SIDE_ON_2026_09_22 as SIDE,
  OVR_BENCH_HEAD_ON_2026_09_22 as HEAD,
  inchesToCm,
} from "./tracker-ground-truth";

// BEFORE ANYONE BUILDS A RULER ON THE PLATE BOX, READ WHAT SIZE IT IS.
//
// The plan is to treat the plate as a circular fiducial: a circle projects to an ellipse whose
// major axis is the true 450mm diameter at any viewing angle, so the box's longer side becomes
// an angle-invariant ruler. The geometry is right, and it is the correct direction.
//
// What it cannot be built on is THESE boxes. The bar sensor gives the true scale for both of
// Scott's 2026-09-22 takes, and run through it the detected "plate" is about two metres across.
// It is the rack, the bench frame or a plate on the floor -- not a plate on his bar. Feeding its
// major axis in as a 450mm diameter would size the picture roughly six times too small, which is
// worse than the 1.28x the shoulder ruler is out by today, and it would arrive looking confident.
//
// So the ellipse ruler needs a plate the detector has actually found on the BAR. That is a
// detection problem before it is a geometry problem, and this file exists so the two do not get
// confused again.
const trueScaleFrom = (sensorRomIn: number, forgeRomCm: number, forgeScale: number) => {
  const romPx = forgeRomCm / 100 / forgeScale;
  return inchesToCm(sensorRomIn) / 100 / romPx;
};

describe("the box the detector called a plate", () => {
  it("is about two metres across on the side-on take", () => {
    const scale = trueScaleFrom(SIDE.sensor.reported.romIn, SIDE.forge.romCm, SIDE.diagnostics.scaleFactorMPerUnit);
    // The plate box on that take, from the export: 290.95 x 532.70px.
    const longEdgeM = 532.7 * scale;
    expect(longEdgeM).toBeGreaterThan(1.5);
    // A 450mm plate is 0.45m. Nothing within a factor of four of it.
    expect(longEdgeM / 0.45).toBeGreaterThan(4);
  });

  it("is about two metres across on the head-on take too, so it is not one bad frame", () => {
    const scale = trueScaleFrom(HEAD.sensor.romIn, HEAD.forge.romCm, HEAD.diagnostics.scaleFactorMPerUnit);
    expect(HEAD.diagnostics.plateMeasuredPx * scale).toBeGreaterThan(1.5);
  });

  it("puts the scale error at 1.28x and the shoulder foreshortening that explains it", () => {
    const scale = trueScaleFrom(SIDE.sensor.reported.romIn, SIDE.forge.romCm, SIDE.diagnostics.scaleFactorMPerUnit);
    // Reported scale over true scale: every distance on the take is out by this.
    expect(SIDE.diagnostics.scaleFactorMPerUnit / scale).toBeCloseTo(1.28, 1);
    // And the cause: 87.96px of shoulder was read as a full 0.438m span when it was really 0.34m
    // of it -- a foreshortening of about 0.78, which is a camera roughly 39 degrees off square.
    const realShoulderSpanM = SIDE.diagnostics.shoulderMeasuredPx * scale;
    expect(realShoulderSpanM).toBeCloseTo(0.34, 1);
    expect(realShoulderSpanM / 0.438).toBeCloseTo(0.78, 1);
  });

  it("agrees with the head-on take about how wide his shoulders really are", () => {
    // The two takes measured 87.96px and 115.33px of shoulder. Through each take's own true
    // scale they come out at 0.34m and 0.39m -- the same man, seen from two angles, both
    // foreshortened, the head-on one less so. That is the signature of an angle problem rather
    // than a broken landmark, and it is why the fix is an angle-invariant ruler.
    const s1 = SIDE.diagnostics.shoulderMeasuredPx
      * trueScaleFrom(SIDE.sensor.reported.romIn, SIDE.forge.romCm, SIDE.diagnostics.scaleFactorMPerUnit);
    const s2 = HEAD.diagnostics.shoulderMeasuredPx
      * trueScaleFrom(HEAD.sensor.romIn, HEAD.forge.romCm, HEAD.diagnostics.scaleFactorMPerUnit);
    expect(s1).toBeLessThan(0.438);
    expect(s2).toBeLessThan(0.438);
    expect(s2).toBeGreaterThan(s1);
  });
});
