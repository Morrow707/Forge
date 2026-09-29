import { describe, it, expect } from "vitest";
import { depthRulerScale, fovDegFromActiveFormat } from "./body-3d-ruler";
import { OVR_BENCH_SET5_2026_09_29, OVR_BENCH_SET6_2026_09_29 } from "./tracker-ground-truth";

// The depth ruler is recorded, not ranked -- see body-3d-ruler.ts. What this pins is the
// arithmetic and the two takes it was read against: 8% low at 2.80m and at 3.18m. If a later
// change moves either number, the calibration notes are wrong and somebody should know.
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

  it("was 8% low against the sensor on both 2026-09-29 takes -- a constant, which is the point", () => {
    for (const set of [OVR_BENCH_SET5_2026_09_29, OVR_BENCH_SET6_2026_09_29]) {
      const ratio = set.rulers.depthRuler / set.rulers.sensorImplied;
      expect(ratio).toBeGreaterThan(0.9);
      expect(ratio).toBeLessThan(0.95);
    }
  });
});

import { reconcileScaleEstimates, type ScaleEstimate } from "./pose-tracking";
import { DEPTH_RULER_BIAS } from "./body-3d-ruler";

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
