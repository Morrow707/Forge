import { describe, it, expect } from "vitest";
import { barPointFromSides, summarizeTrackedSet, type TrackedPoint } from "./bar-tracking";

/** Ten bench presses, 36cm of travel, hands 60cm apart, 60fps, filmed slightly off square.
 *
 * The right hand is seen in RUNS -- present for a stretch, gone for a stretch -- which is how a
 * real side drops out. Scott's bench came back with the right hand on 316 of 747 frames against
 * the left's 628. A fast alternating flicker would be smoothed away and prove nothing; a run
 * holds the traced point at the wrong place long enough to look like movement.
 *
 * The bar tilt is the other half of why this bites. Filmed dead square the two grips sit one
 * above the other in the image, so swapping between a hand and the midpoint moves the point
 * sideways only and the segmenter never sees it. Nobody films dead square. At any real angle the
 * grip line carries some of the press direction with it, so the swap moves the point ALONG the
 * lift.
 */
function benchSet(
  opts: { onFrames: number; offFrames: number; tiltDeg: number; useMidpointFix: boolean },
) {
  const points: TrackedPoint[] = [];
  const fps = 60;
  const secondsPerRep = 3;
  const halfGrip = 0.3; // hands 60cm apart on the bar
  const tilt = (opts.tiltDeg * Math.PI) / 180;
  const gripX = halfGrip * Math.cos(tilt);
  const gripY = halfGrip * Math.sin(tilt);
  let lastHalfSpan: { x: number; y: number } | null = null;
  let frame = 0;
  for (let rep = 0; rep < 10; rep++) {
    for (let f = 0; f < secondsPerRep * fps; f++) {
      const phase = (f / (secondsPerRep * fps)) * 2 * Math.PI;
      const along = (0.36 / 2) * (1 - Math.cos(phase));
      const left = { x: -gripX, y: along - gripY, confidence: 0.9 };
      const inCycle = frame % (opts.onFrames + opts.offFrames);
      const right = inCycle < opts.onFrames ? { x: gripX, y: along + gripY, confidence: 0.9 } : null;

      let combined: { x: number; y: number; confidence: number } | null;
      if (opts.useMidpointFix) {
        const out = barPointFromSides(left, right, lastHalfSpan);
        combined = out.point;
        lastHalfSpan = out.halfSpan;
      } else {
        // What the trace used to do: the midpoint when both are there, the bare hand when not.
        combined =
          left && right
            ? { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2, confidence: 0.9 }
            : (left ?? right);
      }
      if (combined) {
        points.push({
          t: (frame / fps) * 1000,
          x: combined.x,
          y: combined.y,
          z: 0,
          confidence: combined.confidence,
        });
      }
      frame++;
    }
  }
  return points;
}

const AXIS = { x: 0, y: 1 };
const summarize = (pts: TrackedPoint[]) =>
  summarizeTrackedSet(pts, 61, 70, null, [], 1, false, "horizontal_press_or_row", AXIS)!;

// Four dropout patterns and three camera angles, all realistic, none of them cherry-picked to
// make the point -- the old behaviour fails on most of this grid and the new one on none of it.
const PATTERNS = [
  { onFrames: 30, offFrames: 30 },
  { onFrames: 45, offFrames: 25 },
  { onFrames: 20, offFrames: 40 },
  { onFrames: 60, offFrames: 60 },
];
const TILTS = [20, 30];

// The angle the bug still reproduces at. It used to reproduce at 20 and 30 as well; see the
// comment on the first test for what closed those and why the test was narrowed rather than
// relaxed.
const TILT_THAT_STILL_BREAKS = 45;

describe("a hand that comes and goes is not a rep", () => {
  // The bug, reproduced. Scott's ten-rep bench came back as 31 reps with a 9cm range of motion;
  // this grid landed between 20 and 29 reps at 20-27cm, which is the same failure.
  it("used to invent two or three reps out of every real one", () => {
    for (const pattern of PATTERNS.slice(0, 3)) {
      const old = summarize(
        benchSet({ ...pattern, tiltDeg: TILT_THAT_STILL_BREAKS, useMidpointFix: false }),
      );
      // THIS TEST HAS BEEN NARROWED TWICE, BOTH TIMES BECAUSE SOMETHING ELSE GOT BETTER, AND
      // THAT IS WORTH READING BEFORE NARROWING IT AGAIN.
      //
      // First the oversized-phantom filter: a lone-hand swap moves the traced point most of a
      // grip width along the lift, which lands well over twice a real rep, so the worst corner
      // came back at 14 rather than 20 and the threshold went from >15 to >12.
      //
      // Then the amplitude gate stopped being derived from the median of every reversal in the
      // take and became the median of the LARGE ones (segmentPhasesRelative). That is a much
      // better estimate of what a rep is, and it turns out to be good enough to absorb the
      // lone-hand swap outright at 0, 10, 20 and 30 degrees of tilt -- all four dropout
      // patterns come back at exactly 10 on the BROKEN trace. Only at 45 degrees, where the
      // grip line carries most of the press direction, is the swap still large enough to read
      // as a rep. The fourth pattern (60 on, 60 off, one swap per rep) resolves even there.
      //
      // So the honest statement is that the blast radius shrank, not that the bug went away.
      // The midpoint fix is still what resolves it -- the next test asserts 10 reps across the
      // WHOLE grid, 45 degrees included, and that is the assertion that must never be narrowed.
      expect(
        old.repBreakdown.length,
        `tilt ${TILT_THAT_STILL_BREAKS}, ${JSON.stringify(pattern)}`,
      ).toBeGreaterThan(12);
    }
  });

  it("counts the ten reps that were actually pressed, at every angle and dropout pattern", () => {
    for (const tiltDeg of [0, 10, 20, 30, 45]) {
      for (const pattern of PATTERNS) {
        const fixed = summarize(benchSet({ ...pattern, tiltDeg, useMidpointFix: true }));
        expect(fixed.repBreakdown.length, `tilt ${tiltDeg}, ${JSON.stringify(pattern)}`).toBe(10);
      }
    }
  });

  // Range of motion is what the over-segmentation quietly destroyed: three "reps" out of every
  // real one makes each a third as deep, which came out as 9cm and was then read as a calibration
  // fault it never was.
  it("keeps range of motion at the real 36cm rather than a fraction of it", () => {
    for (const tiltDeg of TILTS) {
      for (const pattern of PATTERNS) {
        const fixed = summarize(benchSet({ ...pattern, tiltDeg, useMidpointFix: true }));
        expect(fixed.romCm, `tilt ${tiltDeg}`).toBeCloseTo(36, 0);
      }
    }
  });
});

describe("barPointFromSides", () => {
  it("uses the real midpoint when both hands are there, and records the span", () => {
    const out = barPointFromSides(
      { x: -0.3, y: 0.9, confidence: 0.9 },
      { x: 0.3, y: 1.1, confidence: 0.9 },
      null,
    );
    expect(out.point!.x).toBeCloseTo(0, 6);
    expect(out.point!.y).toBeCloseTo(1, 6);
    expect(out.halfSpan!.x).toBeCloseTo(0.3, 6);
    expect(out.halfSpan!.y).toBeCloseTo(0.1, 6);
  });

  // The y half is what matters: on a tilted bar it is the part that lands ALONG the lift.
  it("carries a lone left hand out to where the middle of the bar is", () => {
    const out = barPointFromSides({ x: -0.3, y: 0.9, confidence: 0.9 }, null, { x: 0.3, y: 0.1 });
    expect(out.point!.x).toBeCloseTo(0, 6);
    expect(out.point!.y).toBeCloseTo(1, 6);
  });

  it("carries a lone right hand back the other way", () => {
    const out = barPointFromSides(null, { x: 0.3, y: 1.1, confidence: 0.9 }, { x: 0.3, y: 0.1 });
    expect(out.point!.x).toBeCloseTo(0, 6);
    expect(out.point!.y).toBeCloseTo(1, 6);
  });

  it("marks an inferred point as less trusted than a measured one", () => {
    const measured = barPointFromSides(
      { x: -0.3, y: 1, confidence: 0.9 },
      { x: 0.3, y: 1, confidence: 0.9 },
      null,
    );
    const inferred = barPointFromSides({ x: -0.3, y: 0.9, confidence: 0.9 }, null, { x: 0.3, y: 0.1 });
    expect(inferred.point!.confidence).toBeLessThan(measured.point!.confidence);
  });

  // Before either hand has been seen alongside the other there is no span to carry, and a bare
  // hand is still the best answer available.
  it("falls back to the bare hand when no span has been measured yet", () => {
    const out = barPointFromSides({ x: -0.3, y: 1, confidence: 0.9 }, null, null);
    expect(out.point!.x).toBe(-0.3);
  });

  it("reports nothing when neither hand was seen", () => {
    expect(barPointFromSides(null, null, { x: 0.3, y: 0.1 }).point).toBeNull();
  });
});
