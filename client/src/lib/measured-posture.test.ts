import { describe, it, expect } from "vitest";
import { measurePostureFromFrames } from "./pose-tracking";

/* THE FRAMES' OWN ACCOUNT OF POSTURE, which until now nothing recorded.
 *
 * Posture decides which rulers a take gets: `bent_over` and `seated` drop the height ruler
 * entirely. It has only ever come from the exercise NAME, and two takes in two days show that
 * table wrong in both directions -- the RDL mapped standing when it is a hinge (height ruler
 * wrongly present, -7.0% of the sensor), and a lift logged as a seated "Barbell Shoulder Press"
 * filmed beside an OVR that recorded a PUSH PRESS, which is standing (height ruler wrongly
 * absent). This records what the body looked like so the next pairing can tell which it was.
 *
 * Landmarks here are in image coordinates: y runs DOWNWARD, which is what makes a standing
 * torso's hip->shoulder vector have a negative dy and a large magnitude.
 */
const P = { LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12, LEFT_HIP: 23, RIGHT_HIP: 24, LEFT_ANKLE: 27, RIGHT_ANKLE: 28 };

function frame(parts: Record<number, [number, number]>) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  for (const [i, [x, y]] of Object.entries(parts)) {
    lm[Number(i)] = { x, y, z: 0, visibility: 0.99 };
  }
  return { worldLandmarks: lm as any };
}

// Shoulders 40 wide. Hips directly below the shoulders by 60 => an upright torso.
const standing = frame({
  [P.LEFT_SHOULDER]: [80, 100], [P.RIGHT_SHOULDER]: [120, 100],
  [P.LEFT_HIP]: [85, 160], [P.RIGHT_HIP]: [115, 160],
  [P.LEFT_ANKLE]: [85, 300], [P.RIGHT_ANKLE]: [115, 300],
});
// Shoulders well FORWARD of the hips and at nearly the same height => a hinge.
const hinged = frame({
  [P.LEFT_SHOULDER]: [80, 150], [P.RIGHT_SHOULDER]: [120, 150],
  [P.LEFT_HIP]: [185, 160], [P.RIGHT_HIP]: [215, 160],
  [P.LEFT_ANKLE]: [195, 300], [P.RIGHT_ANKLE]: [205, 300],
});
// Upright torso, but the ankles sit up under the knees, so the vertical extent collapses.
const seated = frame({
  [P.LEFT_SHOULDER]: [80, 100], [P.RIGHT_SHOULDER]: [120, 100],
  [P.LEFT_HIP]: [85, 160], [P.RIGHT_HIP]: [115, 160],
  [P.LEFT_ANKLE]: [85, 180], [P.RIGHT_ANKLE]: [115, 180],
});

describe("measurePostureFromFrames", () => {
  it("reads a standing torso as near vertical, with a full-length body", () => {
    const m = measurePostureFromFrames([standing, standing, standing]);
    expect(m.torsoFromVerticalDeg!).toBeLessThan(15);
    // (300 - 100) / 40 = 5.0, comfortably above MIN_HEIGHT_TO_SHOULDER_RATIO's 2.5.
    expect(m.heightToShoulderRatio!).toBeGreaterThan(2.5);
    expect(m.framesUsed).toBe(3);
  });

  it("reads a hinged torso as near horizontal, which is what a row and an RDL are", () => {
    const m = measurePostureFromFrames([hinged, hinged, hinged]);
    expect(m.torsoFromVerticalDeg!).toBeGreaterThan(60);
  });

  /* The case the torso angle CANNOT see, and the reason there are two numbers: a seated
   * athlete's torso is as upright as a standing one. The ratio is what separates them. */
  it("separates seated from standing, which the torso angle alone cannot", () => {
    const sit = measurePostureFromFrames([seated, seated]);
    const stand = measurePostureFromFrames([standing, standing]);
    expect(Math.abs(sit.torsoFromVerticalDeg! - stand.torsoFromVerticalDeg!)).toBeLessThan(5);
    expect(sit.heightToShoulderRatio!).toBeLessThan(2.5);
    expect(stand.heightToShoulderRatio!).toBeGreaterThan(2.5);
  });

  /* RULE #1: it measures and never refuses. A take with nothing readable returns nulls and a
   * frame count, and the pipeline carries on -- nothing downstream reads these to choose a
   * ruler, which is the whole point until there is evidence enough to let the frames outvote
   * the library. */
  it("returns nulls rather than throwing when there is nothing to measure", () => {
    const empty = measurePostureFromFrames([]);
    // Exact shape on purpose: every field null and none of them undefined or 0. A reader of
    // the export cannot tell "measured zero degrees" from "could not measure" if a missing
    // field arrives as 0, and zod would strip an undeclared one silently either way.
    expect(empty).toEqual({
      torsoFromVerticalDeg: null,
      torsoFromVerticalP90Deg: null,
      torsoAtLongestSpanDeg: null,
      heightToShoulderRatio: null,
      framesUsed: 0,
    });
    const blind = measurePostureFromFrames([frame({})]);
    expect(blind.torsoFromVerticalDeg).toBeNull();
    expect(blind.heightToShoulderRatio).toBeNull();
  });

  it("is recorded beside the posture the exercise claimed, and overrides nothing", () => {
    const src = readFileSync(join(process.cwd(), "client/src/components/av-bar-tracker-dialog.tsx"), "utf8");
    expect(src).toContain("const measuredPosture = measurePostureFromFrames(calibrationInput);");
    expect(src).toContain("      posture,");
    expect(src).toContain("      measuredPosture,");
    // Nothing reads it back to pick a ruler. If that changes, this file is where the decision
    // gets argued, with the pairings that justify it.
    expect(src).not.toMatch(/measuredPosture\.(torsoFromVerticalDeg|heightToShoulderRatio)\s*[<>]/);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

/* A MEDIAN ANSWERS "WHAT POSTURE WAS HE IN MOST OF THE TIME". NOBODY IS ASKING THAT.
 *
 * Scott filmed a Romanian deadlift on 2026-10-08 and torsoFromVerticalDeg came back 7.13 over
 * 436 frames, beside a field comment promising "approaching 90 on a hinge" and a commit message
 * claiming this field would have caught the mislabelled RDL of 2026-10-05. It would not have.
 * The statistic is a median and an athlete doing RDLs is UPRIGHT BETWEEN REPS, through the
 * setup and at the finish; the bottom of the rep is a minority of frames by construction. The
 * separation from a squat was real (7.13 against the same session's 1.06) and far too small for
 * anyone to act on against a stated expectation of 90.
 *
 * Nothing is removed -- the median still ships, and every reader of it keeps working. Two
 * statistics are added that CAN answer the two questions anyone actually has, and both measure
 * and gate nothing (Rule #1).
 */
describe("a hinge is visible at its extreme, not at its median", () => {
  // A set the way one is really filmed: mostly upright (setup, lockouts, the finish) with the
  // hinge itself a minority of the frames. The 2026-10-08 RDL in miniature.
  const aRealSet = [
    ...Array(12).fill(standing),
    ...Array(4).fill(hinged),
    ...Array(8).fill(standing),
  ];

  it("THE MEDIAN MISSES IT: a hinged set reads near-upright on the old field", () => {
    // This is the bug, pinned as a fact rather than argued. If this ever starts failing because
    // the median became large, the two fields below are no longer load-bearing and this whole
    // block should be revisited rather than bumped.
    const m = measurePostureFromFrames(aRealSet);
    expect(m.torsoFromVerticalDeg!).toBeLessThan(20);
  });

  it("the 90th percentile sees it", () => {
    const m = measurePostureFromFrames(aRealSet);
    expect(m.torsoFromVerticalP90Deg!).toBeGreaterThan(50);
    // And it stays quiet on a set that really is upright throughout -- otherwise it would just
    // be a different number that is always large, which diagnoses nothing.
    const upright = measurePostureFromFrames(Array(24).fill(standing));
    expect(upright.torsoFromVerticalP90Deg!).toBeLessThan(15);
  });

  it("the longest-span angle reports the posture of the frames the HEIGHT RULER picks", () => {
    // The ruler takes the HEIGHT_RULER_EXTENSION_PERCENTILE-th smallest scale, and scale is
    // height over span, so it is decided by the longest spans -- the athlete at maximum
    // extension. On a set that is upright at full extension, that is an upright reading.
    const m = measurePostureFromFrames(aRealSet);
    expect(m.torsoAtLongestSpanDeg).not.toBeNull();
    expect(m.torsoAtLongestSpanDeg!).toBeLessThan(20);
  });

  it("the decile is SHARED with the ruler, so the diagnostic cannot drift from what it reports on", () => {
    const src = readFileSync(join(process.cwd(), "client/src/lib/pose-tracking.ts"), "utf8");
    // One declaration, and BOTH readers named. Not a count of mentions: a count is satisfied by
    // the wrong three occurrences, and it goes red when someone adds a sentence to a comment --
    // which is exactly how this assertion failed the first time it ran.
    expect(src.match(/export const HEIGHT_RULER_EXTENSION_PERCENTILE = /g) ?? []).toHaveLength(1);
    // The ruler picks its scale with it...
    expect(src).toContain("Math.floor(sorted.length * HEIGHT_RULER_EXTENSION_PERCENTILE)");
    // ...and the diagnostic picks the frames it reports on with the same one.
    expect(src).toContain("Math.floor(bySpanDesc.length * HEIGHT_RULER_EXTENSION_PERCENTILE)");
    // And neither has a bare literal left behind, which is how two numbers that must agree
    // start disagreeing.
    expect(src).not.toContain("Math.floor(sorted.length * 0.1)");
  });

  it("is declared in the schema, because zod strips what it does not declare", () => {
    // This has bitten twice: takes were filmed specifically to read a diagnostic the insert had
    // already dropped, silently, with no error anywhere.
    const schema = readFileSync(join(process.cwd(), "shared/schema.ts"), "utf8");
    expect(schema).toContain("torsoFromVerticalP90Deg: z.number().optional().nullable()");
    expect(schema).toContain("torsoAtLongestSpanDeg: z.number().optional().nullable()");
  });

  it("measures and gates nothing", () => {
    // Same standing as every other posture field: one mislabelled take is not evidence enough
    // to let the frames outvote the library, and a posture that flipped mid-pipeline would move
    // every ruler under it at once.
    const src = readFileSync(join(process.cwd(), "client/src/lib/pose-tracking.ts"), "utf8");
    const consumers = src.match(/torsoFromVerticalP90Deg|torsoAtLongestSpanDeg/g) ?? [];
    // Declared in the type, assigned in the return, and (for the span one) its local. Nothing
    // reads either back to make a decision.
    expect(src).not.toMatch(/if \([^)]*torsoFromVerticalP90Deg/);
    expect(src).not.toMatch(/if \([^)]*torsoAtLongestSpanDeg/);
    expect(consumers.length).toBeGreaterThan(0);
  });
});
