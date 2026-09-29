import { describe, it, expect } from "vitest";
import { depthRulerScale, fovDegFromActiveFormat, DEPTH_RULER_BIAS } from "./body-3d-ruler";
import { OVR_BENCH_SET5_2026_09_29, OVR_BENCH_SET6_2026_09_29, OVR_BENCH_SET7_2026_09_29 } from "./tracker-ground-truth";

// The depth ruler is recorded, not ranked -- see body-3d-ruler.ts. What this pins is the
// arithmetic and the three takes it was read against: 8% low at 2.80m and 3.18m, 13% low at
// 2.67m. If a later change moves any of these, the calibration notes are wrong and somebody
// should know.
describe("the depth ruler", () => {
  it("reads the field of view off the plugin's own format line", () => {
    expect(fovDegFromActiveFormat("1920x1080 @ 120fps (high-rate) aspect 1.78 (16:9 fallback) fov 74.6deg (widest...)")).toBe(74.6);
    expect(fovDegFromActiveFormat(null)).toBeNull();
    expect(fovDegFromActiveFormat("no fov here")).toBeNull();
  });

  it("is metres per unit at the wrists' depth: Z x 2 tan(fov/2) over the long axis", () => {
    expect(depthRulerScale(2.804, 74.6, 1280)).toBeCloseTo(0.00334, 5);
    expect(depthRulerScale(3.184, 74.6, 1280)).toBeCloseTo(0.00379, 5);
    expect(depthRulerScale(null, 74.6, 1280)).toBeNull();
    expect(depthRulerScale(2.8, 74.6, 0)).toBeNull();
  });

  it("read 8%, 8% and 13% low on the three 2026-09-29 takes, and DEPTH_RULER_BIAS is their mean", () => {
    const sets = [OVR_BENCH_SET5_2026_09_29, OVR_BENCH_SET6_2026_09_29, OVR_BENCH_SET7_2026_09_29];
    const ratios = sets.map((set) => set.rulers.depthRuler / set.rulers.sensorImplied);
    for (const ratio of ratios) {
      expect(ratio).toBeGreaterThan(0.85);
      expect(ratio).toBeLessThan(0.95);
    }
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    expect(Math.abs(mean - DEPTH_RULER_BIAS)).toBeLessThan(0.01);
  });
});

import { reconcileScaleEstimates, type ScaleEstimate } from "./pose-tracking";

// The two sensor-paired takes, replayed through reconciliation with the zeroed depth ruler in
// the room. Set 6 had chosen the in-plane ruler alone at 26% low; set 5 had averaged in-plane
// and shoulders to 5% high. With the depth ruler zeroed, both land within 3% of the sensor.
describe("the zeroed depth ruler in reconciliation", () => {
  const take = (inPlane: number, shoulders: number, depth: number): ScaleEstimate[] => [
    { source: "body_3d", scale: inPlane, uncertaintyFraction: 0.08 },
    { source: "shoulder_width", scale: shoulders, uncertaintyFraction: 0.1 },
    { source: "depth", scale: depth / DEPTH_RULER_BIAS, uncertaintyFraction: 0.08 },
  ];

  it("set 6: clusters with the exact shoulder ruler instead of the in-plane ruler winning alone", () => {
    const v = reconcileScaleEstimates(take(OVR_BENCH_SET6_2026_09_29.rulers.inPlane3D, OVR_BENCH_SET6_2026_09_29.rulers.shoulderWidth, OVR_BENCH_SET6_2026_09_29.rulers.depthRuler));
    expect(v.scale! / OVR_BENCH_SET6_2026_09_29.rulers.sensorImplied).toBeGreaterThan(0.97);
    expect(v.scale! / OVR_BENCH_SET6_2026_09_29.rulers.sensorImplied).toBeLessThan(1.03);
  });

  it("set 5: within 3% of the sensor", () => {
    const v = reconcileScaleEstimates(take(OVR_BENCH_SET5_2026_09_29.rulers.inPlane3D, OVR_BENCH_SET5_2026_09_29.rulers.shoulderWidth, OVR_BENCH_SET5_2026_09_29.rulers.depthRuler));
    expect(v.scale! / OVR_BENCH_SET5_2026_09_29.rulers.sensorImplied).toBeGreaterThan(0.95);
    expect(v.scale! / OVR_BENCH_SET5_2026_09_29.rulers.sensorImplied).toBeLessThan(1.05);
  });

  it("set 7 (out of sample for the 0.92 zero, in sample for 0.9): within 5% of the sensor", () => {
    const v = reconcileScaleEstimates(take(OVR_BENCH_SET7_2026_09_29.rulers.inPlane3D, OVR_BENCH_SET7_2026_09_29.rulers.shoulderWidth, OVR_BENCH_SET7_2026_09_29.rulers.depthRuler));
    expect(v.scale! / OVR_BENCH_SET7_2026_09_29.rulers.sensorImplied).toBeGreaterThan(0.95);
    expect(v.scale! / OVR_BENCH_SET7_2026_09_29.rulers.sensorImplied).toBeLessThan(1.05);
  });

  it("two body rulers that disagree with no anchored ruler present are blended, not ranked", () => {
    const v = reconcileScaleEstimates([
      { source: "body_3d", scale: 0.003, uncertaintyFraction: 0.08 },
      { source: "shoulder_width", scale: 0.0041, uncertaintyFraction: 0.1 },
    ]);
    expect(v.blended).toBe(true);
    expect(v.scale).toBeCloseTo(0.00355, 5);
  });

  it("a plate in the room still wins the cluster; body rulers are not blended over it", () => {
    const v = reconcileScaleEstimates([
      { source: "plate", scale: 0.0041, uncertaintyFraction: 0.05 },
      { source: "body_3d", scale: 0.003, uncertaintyFraction: 0.08 },
      { source: "shoulder_width", scale: 0.0034, uncertaintyFraction: 0.1 },
    ]);
    expect(v.blended).toBeFalsy();
    expect(v.agreedSources).toContain("plate");
  });
});
