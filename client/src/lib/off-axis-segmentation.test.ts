import { describe, it, expect } from "vitest";
import {
  dominantAxisFrame,
  dominantAxisProjection,
  repAmplitudeGateCm,
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

/** The same set with a slow wander added -- the athlete settling, the tracker easing on and off
 *  the bar over half a minute. This is the shape that made a real take come back with FEWER reps
 *  than plain image-vertical would have found: the drift outgrows the reps, so an axis chosen by
 *  total spread locks onto the wander and flattens the reps it was meant to recover. */
function benchSetWithDrift(tiltDeg: number, driftM = 0.5) {
  const points = benchSet(tiltDeg);
  const last = points.length - 1;
  return points.map((p, i) => ({ ...p, x: p.x + (driftM * i) / last }));
}

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
      expect(metrics.peakVelocityMps).toBeCloseTo(square.peakVelocityMps!, 2);
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
      expect(metrics.barPathDeviationCm!).toBeLessThan(1);
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

describe("a slow wander does not become the movement axis", () => {
  it("still finds the reps when drift is bigger than the reps themselves", () => {
    // Half a metre of wander against 36cm of press, at an angle where the press is nearly
    // edge-on. Chosen by total spread, the axis would be the wander.
    const drifting = summarizeTrackedSet(benchSetWithDrift(75), 61)!;
    expect(drifting.repBreakdown.length).toBeGreaterThanOrEqual(8);
  });

  it("keeps reporting the real range of motion through the drift", () => {
    const drifting = summarizeTrackedSet(benchSetWithDrift(75), 61)!;
    expect(drifting.repBreakdown[2].romCm).toBeGreaterThan(30);
    expect(drifting.repBreakdown[2].romCm).toBeLessThan(42);
  });

  it("picks the same axis with and without the wander", () => {
    const clean = dominantAxisFrame(benchSet(75).map((p) => ({ x: p.x, y: p.y })));
    const drifting = dominantAxisFrame(benchSetWithDrift(75).map((p) => ({ x: p.x, y: p.y })));
    const cleanRange = Math.max(...clean.along) - Math.min(...clean.along);
    const driftingSwing =
      Math.max(...drifting.along.slice(0, 200)) - Math.min(...drifting.along.slice(0, 200));
    expect(driftingSwing).toBeCloseTo(cleanRange, 1);
  });
});

describe("repAmplitudeGateCm", () => {
  const HEIGHT_IN = 70;

  it("puts the bench gate under even an arched, wide-grip rep", () => {
    // Published one-way bench travel is 14-19in for an average adult, but a pronounced arch with
    // a maximum-width grip can cut it to 6-10in (15-25cm). A gate inside that range rejects real
    // reps, which is the failure this replaces.
    const gate = repAmplitudeGateCm("horizontal_press_or_row", HEIGHT_IN);
    expect(gate).toBeLessThan(15);
    expect(gate).toBeGreaterThanOrEqual(8);
  });

  it("is lower than the flat 20cm it replaces for a bench", () => {
    expect(repAmplitudeGateCm("horizontal_press_or_row", HEIGHT_IN)).toBeLessThan(
      repAmplitudeGateCm(null, HEIGHT_IN),
    );
  });

  it("asks more of a squat than of a bench, because a squat moves further", () => {
    expect(repAmplitudeGateCm("squat", HEIGHT_IN)).toBeGreaterThan(
      repAmplitudeGateCm("horizontal_press_or_row", HEIGHT_IN),
    );
  });

  it("scales with the athlete", () => {
    expect(repAmplitudeGateCm("squat", 76)).toBeGreaterThan(repAmplitudeGateCm("squat", 62));
  });

  it("never drops to a wobble, even for the smallest movements", () => {
    // A calf raise's impossibility floor is 0.01 of height, under 2cm. That is noise, not a rep.
    expect(repAmplitudeGateCm("ankle_or_shrug", HEIGHT_IN)).toBeGreaterThanOrEqual(8);
  });

  it("keeps the old flat gate when the movement is unknown", () => {
    expect(repAmplitudeGateCm(null, HEIGHT_IN)).toBeCloseTo(20 * (HEIGHT_IN / 69), 5);
  });

  it("finds the reps of an 18-inch bench press that a 20cm gate would have merged", () => {
    // Scott's actual set: about 18in each way, ten reps in thirty seconds. Simulated here at a
    // scale read 60% too small, which is what a calibration resolving on a fifth of the frames
    // does -- 46cm of real travel arriving as 18cm, just under the flat gate.
    const underRead = benchSet(0, 0.18);
    const flatGate = summarizeTrackedSet(underRead, 61, 70)!;
    const movementGate = summarizeTrackedSet(
      underRead,
      61,
      70,
      undefined,
      [],
      1,
      false,
      "horizontal_press_or_row",
    )!;
    expect(flatGate.repBreakdown.length).toBeLessThan(3);
    expect(movementGate.repBreakdown.length).toBeGreaterThanOrEqual(8);
  });
});
