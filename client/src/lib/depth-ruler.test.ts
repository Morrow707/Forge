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
