import { describe, it, expect } from "vitest";
import {
  dominantAxisFrame,
  dominantAxisProjection,
  repAmplitudeGateCm,
  movementAxisFromGrip,
  dropAcrossAxisOutliers,
  concentricIsUpward,
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
    // The constant gate, applied directly, is what used to decide this and what still decides it
    // on a set too short for the relative gate to have anything to average.
    const flatGate = segmentPhases(
      underRead.map((p) => p.y),
      repAmplitudeGateCm(null, 70) / 100,
    );
    const movementGate = segmentPhases(
      underRead.map((p) => p.y),
      repAmplitudeGateCm("horizontal_press_or_row", 70) / 100,
    );
    expect(flatGate.length).toBeLessThan(3);
    expect(movementGate.length).toBeGreaterThanOrEqual(16);
    // And the whole pipeline, where the set's own reps now lead, finds them regardless.
    expect(summarizeTrackedSet(underRead, 61, 70)!.repBreakdown.length).toBeGreaterThanOrEqual(8);
  });
});

/** The two hands at each instant, for a bar tilted `barDeg` across the frame and pressed
 *  perpendicular to itself -- which is what a barbell actually does. */
function benchGripPairs(barDeg: number, romM = 0.36, gripM = 0.8) {
  const bar = (barDeg * Math.PI) / 180;
  // The press runs perpendicular to the bar.
  const push = bar + Math.PI / 2;
  const pairs: { left: { x: number; y: number }; right: { x: number; y: number } }[] = [];
  const points: { x: number; y: number; z: number; t: number; confidence: number }[] = [];
  const fps = 60;
  const secondsPerRep = 3.3;
  for (let rep = 0; rep < 10; rep++) {
    for (let f = 0; f < secondsPerRep * fps; f++) {
      const along = (romM / 2) * (1 - Math.cos((f / (secondsPerRep * fps)) * 2 * Math.PI));
      const cx = along * Math.cos(push);
      const cy = along * Math.sin(push);
      const hx = (gripM / 2) * Math.cos(bar);
      const hy = (gripM / 2) * Math.sin(bar);
      pairs.push({ left: { x: cx - hx, y: cy - hy }, right: { x: cx + hx, y: cy + hy } });
      points.push({
        x: cx,
        y: cy,
        z: 0,
        t: (rep * secondsPerRep + f / fps) * 1000,
        confidence: 0.9,
      });
    }
  }
  return { pairs, points };
}

describe("movementAxisFromGrip", () => {
  it("reads the press as perpendicular to the bar", () => {
    for (const barDeg of [0, 20, 45, 70]) {
      const { pairs } = benchGripPairs(barDeg);
      const axis = movementAxisFromGrip(pairs)!;
      const bar = (barDeg * Math.PI) / 180;
      // Perpendicular means the dot product with the bar's own direction is zero.
      expect(Math.abs(axis.x * Math.cos(bar) + axis.y * Math.sin(bar))).toBeLessThan(0.02);
    }
  });

  it("points the axis the same way as y, so up stays up", () => {
    expect(movementAxisFromGrip(benchGripPairs(30).pairs)!.y).toBeGreaterThan(0);
  });

  it("ignores frames where the two hands collapsed onto each other", () => {
    const { pairs } = benchGripPairs(0);
    const collapsed = Array.from({ length: 40 }, () => ({
      left: { x: 0.5, y: 0.2 },
      right: { x: 0.5, y: 0.2 },
    }));
    const axis = movementAxisFromGrip([...pairs, ...collapsed])!;
    const clean = movementAxisFromGrip(pairs)!;
    expect(axis.x).toBeCloseTo(clean.x, 2);
    expect(axis.y).toBeCloseTo(clean.y, 2);
  });

  it("says nothing rather than guessing from too few pairs", () => {
    expect(movementAxisFromGrip(benchGripPairs(0).pairs.slice(0, 5))).toBeNull();
  });

  it("recovers the full range of a press the trace alone under-reads", () => {
    // The bar nearly edge-on in frame, so image-vertical sees a fraction of the real press.
    const { pairs, points } = benchGripPairs(70);
    const axis = movementAxisFromGrip(pairs)!;
    const { along } = dominantAxisFrame(
      points.map((p) => ({ x: p.x, y: p.y })),
      axis,
    );
    const apparent = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
    expect(apparent).toBeLessThan(0.15);
    expect(Math.max(...along) - Math.min(...along)).toBeCloseTo(0.36, 2);
  });
});

/** A grinding set: the press up is SLOW and the lowering is quick. Real, and the exact shape
 *  the "faster half is the concentric" heuristic gets backwards. */
function grindingSet(barDeg = 0, romM = 0.36, gripM = 0.8) {
  const bar = (barDeg * Math.PI) / 180;
  const push = bar + Math.PI / 2;
  const pairs: { left: { x: number; y: number }; right: { x: number; y: number } }[] = [];
  const points: { x: number; y: number; z: number; t: number; confidence: number }[] = [];
  const fps = 60;
  const downSeconds = 0.8;
  const upSeconds = 2.6;
  let t = 0;
  const emit = (along: number) => {
    const cx = along * Math.cos(push);
    const cy = along * Math.sin(push);
    const hx = (gripM / 2) * Math.cos(bar);
    const hy = (gripM / 2) * Math.sin(bar);
    pairs.push({ left: { x: cx - hx, y: cy - hy }, right: { x: cx + hx, y: cy + hy } });
    points.push({ x: cx, y: cy, z: 0, t: t * 1000, confidence: 0.9 });
    t += 1 / fps;
  };
  for (let rep = 0; rep < 8; rep++) {
    // Lockout down to the chest, quickly.
    for (let f = 0; f < downSeconds * fps; f++) emit(romM * (1 - f / (downSeconds * fps)));
    // Chest back to lockout, slowly.
    for (let f = 0; f < upSeconds * fps; f++) emit(romM * (f / (upSeconds * fps)));
  }
  return { pairs, points };
}

describe("a slow concentric is still the concentric", () => {
  it("labels a grinding press by direction, not by which half was faster", () => {
    const { pairs, points } = grindingSet();
    const metrics = summarizeTrackedSet(
      points,
      61,
      70,
      undefined,
      [],
      1,
      false,
      "horizontal_press_or_row",
      movementAxisFromGrip(pairs),
    )!;
    // The press up takes 2.6s and the lowering 0.8s. Reading the slow half as the concentric is
    // the whole point; the speed heuristic would report these the other way round.
    expect(metrics.concentricSeconds).toBeGreaterThan(metrics.eccentricSeconds);
    expect(metrics.concentricSeconds).toBeGreaterThan(2);
    expect(metrics.eccentricSeconds).toBeLessThan(1.5);
  });

  it("gets it backwards without the bar's direction, which is the bug", () => {
    const { points } = grindingSet();
    const guessed = summarizeTrackedSet(points, 61, 70)!;
    expect(guessed.concentricSeconds).toBeLessThan(guessed.eccentricSeconds);
  });

  it("still reads an ordinary fast-concentric press the right way round", () => {
    const { pairs, points } = benchGripPairs(0);
    const metrics = summarizeTrackedSet(
      points,
      61,
      70,
      undefined,
      [],
      1,
      false,
      "horizontal_press_or_row",
      movementAxisFromGrip(pairs),
    )!;
    expect(metrics.repBreakdown.length).toBeGreaterThanOrEqual(8);
    expect(metrics.concentricSeconds).toBeGreaterThan(0);
  });

  it("knows a lat pulldown's concentric goes the other way", () => {
    expect(concentricIsUpward("vertical_pull")).toBe(false);
    expect(concentricIsUpward("horizontal_press_or_row")).toBe(true);
    expect(concentricIsUpward("squat")).toBe(true);
    expect(concentricIsUpward(null)).toBe(true);
  });
});


// ---------------------------------------------------------------------------
// The rear-view squat that reported 186cm of travel along the movement axis
// and 150cm across it.
// ---------------------------------------------------------------------------

describe("dropAcrossAxisOutliers", () => {
  const AXIS = { x: 0, y: 1 };
  // A clean vertical rep: the bar goes down and up, sitting on one line across the frame.
  const cleanRep = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      t: i * 16,
      x: 0.01,
      y: 0.4 * Math.sin((i / n) * Math.PI * 2),
      z: 0,
      confidence: 0.9,
    }));

  it("leaves a bar that stayed on its line alone", () => {
    const trace = cleanRep(60);
    const { kept, dropped } = dropAcrossAxisOutliers(trace, AXIS);
    expect(dropped).toBe(0);
    expect(kept).toHaveLength(60);
  });

  it("throws out the frames where the point left the bar", () => {
    // Six frames where the tracked midpoint swung most of a metre sideways -- the shape the real
    // take produced when one of the two grip reads jumped onto something else.
    const trace = cleanRep(60);
    for (const i of [10, 11, 30, 31, 50, 51]) trace[i] = { ...trace[i], x: 0.9 };
    const { kept, dropped } = dropAcrossAxisOutliers(trace, AXIS);
    expect(dropped).toBe(6);
    expect(kept.every((p) => p.x < 0.5)).toBe(true);
  });

  it("keeps everything rather than thin a trace that is mostly off the line", () => {
    // If most of the take sits that far off the median, the axis is what is wrong -- and
    // replacing one bad answer with no answer is not an improvement.
    const trace = cleanRep(60).map((p, i) => (i % 2 === 0 ? { ...p, x: 1.5 } : p));
    const { kept, dropped } = dropAcrossAxisOutliers(trace, AXIS);
    expect(dropped).toBe(0);
    expect(kept).toHaveLength(60);
  });

  it("does nothing without a measured axis", () => {
    const trace = cleanRep(60);
    expect(dropAcrossAxisOutliers(trace, null).dropped).toBe(0);
  });
});
