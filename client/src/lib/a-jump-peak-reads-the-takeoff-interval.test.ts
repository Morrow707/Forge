import { describe, expect, it } from "vitest";
import { measureCountermovement } from "./jump-tracking";

/** ROUND EIGHTEEN, 2026-11-16 (RULE #6, the box jump's fix): the hip is fastest at the moment the
 *  feet leave, and the difference that ENDS at the takeoff sample is the interval before it. Rep
 *  6 of the 11-16 box set read 2.33 m/s where its own witness trace read 2.80 one sample later
 *  and the OVR 2.86. The peak now reads through one sample past takeoff. */
describe("a jump's peak reads the interval across takeoff", () => {
  // y is down: standing at 1.0, a dip to 1.25, then a drive whose fastest 33ms interval is the
  // one that crosses the detected takeoff sample.
  const ys = [1.0, 1.0, 1.0, 1.08, 1.17, 1.25, 1.25, 1.22, 1.16, 1.08, 1.01, 0.90, 0.85, 0.83, 0.84];
  const pts = ys.map((y, i) => ({ t: i * 33.4, x: 0, y, z: 0, confidence: 1 }));
  const takeoffT = pts[10].t; // the fastest interval is 10 -> 11 (0.11m in 33.4ms)

  it("the peak includes the interval that ends one sample after takeoff", () => {
    const cm = measureCountermovement(pts, ys, null, takeoffT)!;
    expect(cm).not.toBeNull();
    expect(cm.concentricPeakVelocityMps).toBeCloseTo(0.11 / 0.0334, 1);
  });

  it("never reads past that one interval", () => {
    const cm = measureCountermovement(pts, ys, null, pts[9].t)!;
    // takeoff at 9 reads through 10 only: the 9 -> 10 interval, never 10 -> 11
    expect(cm.concentricPeakVelocityMps).toBeLessThan(0.11 / 0.0334 - 0.5);
  });
});
