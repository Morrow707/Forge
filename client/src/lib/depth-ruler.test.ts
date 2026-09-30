import { describe, it, expect } from "vitest";
import { depthRulerScale, fovDegFromActiveFormat, DEPTH_RULER_BIAS, DEPTH_RULER_UNCERTAINTY, BODY_3D_CORRECTED_UNCERTAINTY } from "./body-3d-ruler";
import { OVR_BENCH_SET5_2026_09_29, OVR_BENCH_SET6_2026_09_29, OVR_BENCH_SET7_2026_09_29, OVR_BENCH_SET8_2026_09_29, OVR_BENCH_SET11_2026_09_30 } from "./tracker-ground-truth";

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

  it("read 8%, 8%, 13% and 15% low on the four 2026-09-29 takes, and DEPTH_RULER_BIAS is their mean", () => {
    const sets = [OVR_BENCH_SET5_2026_09_29, OVR_BENCH_SET6_2026_09_29, OVR_BENCH_SET7_2026_09_29, OVR_BENCH_SET8_2026_09_29];
    const ratios = sets.map((set) => set.rulers.depthRuler / set.rulers.sensorImplied);
    for (const ratio of ratios) {
      expect(ratio).toBeGreaterThan(0.84);
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

// A blend is inverse-variance weighted since build 578 (reconcileScaleEstimates): the expected
// value of a mix is computed the same way here rather than as a plain mean.
const weighted = (es: { scale: number; uncertaintyFraction: number }[]) => {
  const w = (e: { uncertaintyFraction: number }) => 1 / Math.max(0.01, e.uncertaintyFraction) ** 2;
  return es.reduce((s, e) => s + e.scale * w(e), 0) / es.reduce((s, e) => s + w(e), 0);
};

describe("the zeroed depth ruler in reconciliation", () => {
  const take = (inPlane: number, shoulders: number, depth: number): ScaleEstimate[] => [
    { source: "body_3d", scale: inPlane, uncertaintyFraction: BODY_3D_CORRECTED_UNCERTAINTY },
    { source: "shoulder_width", scale: shoulders, uncertaintyFraction: 0.1 },
    { source: "depth", scale: depth / DEPTH_RULER_BIAS, uncertaintyFraction: DEPTH_RULER_UNCERTAINTY },
  ];

  it("set 6: clusters with the exact shoulder ruler instead of the in-plane ruler winning alone", () => {
    const v = reconcileScaleEstimates(take(OVR_BENCH_SET6_2026_09_29.rulers.inPlane3D, OVR_BENCH_SET6_2026_09_29.rulers.shoulderWidth, OVR_BENCH_SET6_2026_09_29.rulers.depthRuler));
    // 0.97 under the weighted blend of build 578 (see reconcileScaleEstimates).
    expect(v.scale! / OVR_BENCH_SET6_2026_09_29.rulers.sensorImplied).toBeGreaterThan(0.95);
    expect(v.scale! / OVR_BENCH_SET6_2026_09_29.rulers.sensorImplied).toBeLessThan(1.05);
  });

  it("set 5: within 15% of the sensor -- the one take where the shoulder ruler itself was 16% high", () => {
    // Was within 5% under the plain mean. Under the weighted blend (build 578) the shoulder
    // ruler carries most of the weight, because on six other sensor-paired benches it was the
    // ruler that held to a few percent; on this one it read 1.16 and the blend lands at 1.12.
    // Recorded as the price of the weighting, not hidden by a wider `take`.
    const v = reconcileScaleEstimates(take(OVR_BENCH_SET5_2026_09_29.rulers.inPlane3D, OVR_BENCH_SET5_2026_09_29.rulers.shoulderWidth, OVR_BENCH_SET5_2026_09_29.rulers.depthRuler));
    expect(v.scale! / OVR_BENCH_SET5_2026_09_29.rulers.sensorImplied).toBeGreaterThan(1.0);
    expect(v.scale! / OVR_BENCH_SET5_2026_09_29.rulers.sensorImplied).toBeLessThan(1.15);
  });

  it("set 11: the two 3D-pose rulers agreeing low no longer outvote the shoulder ruler", () => {
    const r = OVR_BENCH_SET11_2026_09_30.rulers;
    const v = reconcileScaleEstimates(take(r.inPlane3D, r.shoulderWidth!, r.depthRuler));
    // Both 3D-pose rulers sit near 0.72 of the sensor; a plain vote of the three gave 0.73
    // on the device. One vote for the pair, weighted by evidence, gives 0.95.
    expect(v.scale! / r.sensorImplied).toBeGreaterThan(0.9);
    expect(v.scale! / r.sensorImplied).toBeLessThan(1.05);
    expect(v.agreedSources).toContain("shoulder_width");
  });

  it("set 7 (out of sample for the 0.92 zero, in sample for 0.9): within 5% of the sensor", () => {
    const v = reconcileScaleEstimates(take(OVR_BENCH_SET7_2026_09_29.rulers.inPlane3D, OVR_BENCH_SET7_2026_09_29.rulers.shoulderWidth, OVR_BENCH_SET7_2026_09_29.rulers.depthRuler));
    expect(v.scale! / OVR_BENCH_SET7_2026_09_29.rulers.sensorImplied).toBeGreaterThan(0.95);
    expect(v.scale! / OVR_BENCH_SET7_2026_09_29.rulers.sensorImplied).toBeLessThan(1.05);
  });

  it("two body rulers that disagree with no anchored ruler present are blended, not ranked", () => {
    const pair = [
      { source: "body_3d" as const, scale: 0.003, uncertaintyFraction: 0.08 },
      { source: "shoulder_width" as const, scale: 0.0041, uncertaintyFraction: 0.1 },
    ];
    const v = reconcileScaleEstimates(pair);
    expect(v.blended).toBe(true);
    expect(v.scale).toBeCloseTo(weighted(pair), 6);
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
