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
    expect(empty).toEqual({ torsoFromVerticalDeg: null, heightToShoulderRatio: null, framesUsed: 0 });
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
