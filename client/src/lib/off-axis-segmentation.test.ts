import { describe, it, expect } from "vitest";
import {
  dominantAxisFrame,
  dominantAxisProjection,
  segmentPhases,
  summarizeTrackedSet,
} from "./bar-tracking";

/** Ten bench reps, 36cm of press, 60fps -- the set Scott filmed.
 *
 * `tiltDeg` rotates the whole trace within the image plane, which is what walking the phone
 * around the bench does to it. 0 is the square side view the app asks for. At 75 degrees only
 * about a quarter of the press still points up the frame, which is the foot-of-the-bench take
 * that came back as two reps of eleven seconds. */
function benchSet(tiltDeg: number, romM = 0.36) {
  const points: { x: number; y: number; z: number; t: number; confidence: number }[] = [];
  const rad = (tiltDeg * Math.PI) / 180;
  const secondsPerRep = 3.3;
  const fps = 60;
  for (let rep = 0; rep < 10; rep++) {
    for (let f = 0; f < secondsPerRep * fps; f++) {
      const phase = (f / (secondsPerRep * fps)) * 2 * Math.PI;
      const along = (romM / 2) * (1 - Math.cos(phase));
      points.push({
        x: along * Math.sin(rad),
        y: along * Math.cos(rad),
        z: 0,
        t: (rep * secondsPerRep + f / fps) * 1000,
        confidence: 0.9,
      });
    }
  }
  return points;
}

const ANGLES = [0, 30, 60, 75, 85];

describe("a set measures the same from any angle", () => {
  // The point of the movement-axis frame: what the numbers say must not depend on where the
  // phone was standing. Each of these is checked against the square side view, the one camera
  // position the app's own guidance asks for and the only one with validated numbers behind it.
  const square = summarizeTrackedSet(benchSet(0), 61)!;

  it("reports the same range of motion", () => {
    for (const angle of ANGLES) {
      const metrics = summarizeTrackedSet(benchSet(angle), 61)!;
      expect(metrics.repBreakdown[2].romCm).toBeCloseTo(square.repBreakdown[2].romCm, 1);
    }
  });

  it("reports the same peak velocity", () => {
    for (const angle of ANGLES) {
      const metrics = summarizeTrackedSet(benchSet(angle), 61)!;
      expect(metrics.peakVelocityMps).toBeCloseTo(square.peakVelocityMps, 2);
    }
  });

  it("reports the same peak power", () => {
    for (const angle of ANGLES) {
      const metrics = summarizeTrackedSet(benchSet(angle), 61)!;
      expect(metrics.peakPowerWatts).toBe(square.peakPowerWatts);
    }
  });

  it("does not read a straight press filmed at an angle as bar drift", () => {
    // Measured off raw image-x, the lift itself would count as drift: at 75 degrees the press
    // puts 35cm of travel into x. Perpendicular to the movement axis there is none, which is
    // the truth about this trace.
    for (const angle of ANGLES) {
      const metrics = summarizeTrackedSet(benchSet(angle), 61)!;
      expect(metrics.barPathDeviationCm).toBeLessThan(1);
    }
  });

  it("finds a full set of reps at every angle, not a handful", () => {
    for (const angle of ANGLES) {
      const metrics = summarizeTrackedSet(benchSet(angle), 61)!;
      expect(metrics.repBreakdown.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("counted almost nothing at that angle before, which is the bug this fixes", () => {
    // The shipped behaviour, reproduced directly: segment raw image-vertical against the same
    // 20cm rep gate. Ten reps, and it cannot find four.
    const ys = benchSet(75).map((p) => p.y);
    expect(segmentPhases(ys, 0.2).length).toBeLessThan(4);
  });
});

describe("dominantAxisFrame", () => {
  it("leaves a vertical trace exactly alone", () => {
    const points = benchSet(0).map((p) => ({ x: p.x, y: p.y }));
    const projected = dominantAxisProjection(points);
    for (let i = 0; i < points.length; i++) {
      expect(projected[i]).toBeCloseTo(points[i].y, 6);
    }
  });

  it("recovers the true range from a tilted trace", () => {
    const points = benchSet(70).map((p) => ({ x: p.x, y: p.y }));
    const apparent = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
    const { along } = dominantAxisFrame(points);
    expect(apparent).toBeLessThan(0.15);
    expect(Math.max(...along) - Math.min(...along)).toBeCloseTo(0.36, 2);
  });

  it("puts nothing across the axis when the movement is a straight line", () => {
    const { across } = dominantAxisFrame(benchSet(70).map((p) => ({ x: p.x, y: p.y })));
    expect(Math.max(...across) - Math.min(...across)).toBeLessThan(0.005);
  });

  it("keeps the polarity of y, so up is still up", () => {
    const points = benchSet(70).map((p) => ({ x: p.x, y: p.y }));
    const { along } = dominantAxisFrame(points);
    const topIdx = points.reduce((best, p, i) => (p.y > points[best].y ? i : best), 0);
    const bottomIdx = points.reduce((best, p, i) => (p.y < points[best].y ? i : best), 0);
    expect(along[topIdx]).toBeGreaterThan(along[bottomIdx]);
  });

  it("falls back to y when the trace has no dominant direction", () => {
    // Even scatter has no movement axis; picking one would be picking a direction out of noise.
    const points = Array.from({ length: 200 }, (_, i) => ({
      x: Math.sin(i * 2.399),
      y: Math.cos(i * 2.399),
    }));
    const { along } = dominantAxisFrame(points);
    for (let i = 0; i < points.length; i++) {
      expect(along[i]).toBeCloseTo(points[i].y, 6);
    }
  });
});
