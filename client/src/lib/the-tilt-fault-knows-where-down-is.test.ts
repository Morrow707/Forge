// THE BAR'S TILT IS MEASURED AGAINST GRAVITY, NOT AGAINST THE IMAGE.
//
// Scott, 2026-10-06, on a bench filmed from an angle that told him "Bar tilted ~28° toward the
// left arm": "this is the angle I filmed at, all camera systems need to be using gravity adjust
// to reference what down is, so weird angles down spawn a wrong tilt or shift number."
//
// Two rotations put a level bar on a slant in frame, and they need separating because gravity
// answers one and cannot answer the other:
//
//   ROLL, the phone turned. Every line in the image turns with it, so the bar against gravity is
//   the image angle MINUS the roll. CoreMotion measures it per take. That is the subtraction.
//
//   PERSPECTIVE, the phone off to one side. The near plate sits lower and larger in frame than
//   the far one and the wrist-to-wrist line rotates with the viewing geometry. Set 9 beside the
//   OVR is the measured case: phone upright, roll under 5 degrees, bar plumb, grip line 28
//   degrees off square -- the same number Scott was shown. Gravity cannot undo it, so the
//   COACHING CLAIM stands down instead.
//
// Rule #1 throughout: nothing is withheld but one sentence. The tilt readings, the trace, the
// range of motion and every other fault are written exactly as before.
import { describe, expect, it } from "vitest";

import { MAX_ROLL_FOR_IMAGE_VERTICAL_DEG } from "./bar-tracking";
import {
  MAX_ROLL_FOR_LEVEL_PHONE_DEG,
  MIN_PERSPECTIVE_GRIP_ROTATION_DEG,
  detectFormFaults,
  type PoseFrame,
} from "./pose-tracking";

// A frame set the tilt block can read: the fault takes its angles from `precomputedTiltDegrees`,
// so the frames only have to exist.
function frames(): PoseFrame[] {
  return Array.from({ length: 30 }, (_, i) => ({ t: i * 33, landmarks: [], worldLandmarks: [] }) as unknown as PoseFrame);
}

const WIDE_GRIP_PX = 400; // well clear of MIN_TILT_GRIP_SPAN_PX
const tiltFault = (f: { code: string; label: string }[]) => f.find((x) => x.code === "bar_tilt");

describe("the tilt fault knows where down is", () => {
  it("mirrors bar-tracking's roll limit exactly", () => {
    // Change one, change both -- the same arrangement the Swift arbiter port uses. Both mean the
    // roll below which the image vertical IS gravity.
    expect(MAX_ROLL_FOR_LEVEL_PHONE_DEG).toBe(MAX_ROLL_FOR_IMAGE_VERTICAL_DEG);
  });

  it("SUBTRACTS THE ROLL: a level bar filmed on a rolled phone is not a crooked bar", () => {
    // The bar is plumb; the phone is rolled 20 degrees, so every line in the image reads 20 off.
    const tilts = Array.from({ length: 20 }, () => 20);
    const withGravity = detectFormFaults(
      frames(), 0, "lift", "Push", "Barbell", tilts, undefined, undefined, undefined, WIDE_GRIP_PX, 20, 2,
    );
    expect(tiltFault(withGravity)).toBeUndefined();

    // And with no roll reading -- an older export, the web path -- behaviour is what it was.
    const withoutGravity = detectFormFaults(
      frames(), 0, "lift", "Push", "Barbell", tilts, undefined, undefined, undefined, WIDE_GRIP_PX, null, null,
    );
    expect(tiltFault(withoutGravity)?.label).toMatch(/20°/);
  });

  it("still catches a bar that really is down on one side, on a level phone", () => {
    // 18 degrees of real tilt, phone level, grip line square. This is the fault doing its job and
    // the gravity work must not disarm it.
    const found = detectFormFaults(
      frames(), 0, "lift", "Push", "Barbell", Array.from({ length: 20 }, () => 18), undefined, undefined, undefined,
      WIDE_GRIP_PX, 0, 2,
    );
    expect(tiltFault(found)?.label).toMatch(/18°.*right/);
  });

  it("catches a real tilt on a rolled phone once the roll is removed", () => {
    // Phone rolled 10, bar genuinely 18 down on one side: the image reads 28, gravity reads 18.
    const found = detectFormFaults(
      frames(), 0, "lift", "Push", "Barbell", Array.from({ length: 20 }, () => 28), undefined, undefined, undefined,
      WIDE_GRIP_PX, 10, 2,
    );
    expect(tiltFault(found)?.label).toMatch(/18°/);
  });

  it("STANDS DOWN when the rotation is perspective: Scott's 28 degrees, set 9's geometry", () => {
    // Phone upright (roll 4), grip line 28 degrees off square. Measured beside the OVR on set 9
    // with the bar going straight up and down, so the angle is the viewing geometry.
    const perspective = detectFormFaults(
      frames(), 0, "lift", "Push", "Barbell", Array.from({ length: 20 }, () => 28), undefined, undefined, undefined,
      WIDE_GRIP_PX, 4, 28,
    );
    expect(tiltFault(perspective)).toBeUndefined();
  });

  it("does NOT stand down when the phone is rolled far enough that the grip line should be off", () => {
    // Roll past the level limit: the grip line being off square is explained by the roll, which
    // the subtraction already handles, so the perspective rule must not also fire and swallow a
    // real finding.
    const rolled = detectFormFaults(
      frames(), 0, "lift", "Push", "Barbell", Array.from({ length: 20 }, () => 45), undefined, undefined, undefined,
      WIDE_GRIP_PX, MAX_ROLL_FOR_LEVEL_PHONE_DEG + 10, 30,
    );
    expect(tiltFault(rolled)).toBeDefined();
  });

  it("leaves every other fault alone, whatever the camera was doing", () => {
    // RULE #1, stated as an assertion: this touches ONE coaching sentence. A bar-path deviation
    // big enough to flag still flags on the same take the tilt claim stood down on.
    const faults = detectFormFaults(
      frames(), 60, "lift", "Push", "Barbell", Array.from({ length: 20 }, () => 28), undefined, undefined, undefined,
      WIDE_GRIP_PX, 4, 28,
    );
    expect(tiltFault(faults)).toBeUndefined();
    // The deviation fault on the same take is untouched: the take keeps every number and every
    // other finding. Only the one sentence about the bar's angle is withheld.
    expect(faults.some((f) => f.code === "bar_path_drift")).toBe(true);
  });

  it("keeps the perspective floor below what set 9 measured and above the fault threshold", () => {
    // If the floor rose above 28 it would never fire on the case it was built from; if it fell to
    // the fault's own threshold every honest tilt would be read as perspective.
    // Below the smallest perspective rotation the 2026-10-06 session measured (9.9 degrees on a
    // level phone), so every one of those takes is covered; the use site raises it to the fault's
    // own threshold, so it can never sit under what the fault calls a problem.
    expect(MIN_PERSPECTIVE_GRIP_ROTATION_DEG).toBeLessThan(9.9);
  });
});
