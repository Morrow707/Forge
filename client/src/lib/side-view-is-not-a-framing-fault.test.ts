import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assessSubjectFacing, assessCameraAlignment } from "./pose-tracking";
import { expectedCameraView } from "./exercise-camera-profile";

/**
 * THE CORRECT CAMERA ANGLE MUST NOT SCORE WORSE THAN THE WRONG ONE.
 *
 * assessCameraAlignment asks one question -- "is the athlete squared up to the lens?" -- and
 * treats every other answer as a fault worth trust points. That is the right question for a
 * front-view lift and the exact wrong one for a side-view lift, which is nearly every barbell
 * movement: a correct side view puts one shoulder behind the other by definition. The take came
 * back "unknown", computeRepTrustScores docked it 10 points, and the note read "Camera framing
 * couldn't be confirmed" -- for footage filmed exactly as the app's own guidance asks.
 *
 * The fix is a three-part agreement, and all three parts have to keep agreeing or it silently
 * stops working:
 *
 *   1. expectedCameraView() says this lift wants a side view.
 *   2. assessSubjectFacing() -- a SEPARATE reader from assessCameraAlignment, measuring shoulder
 *      spread against torso length in x/y only -- says the footage IS side-on.
 *   3. av-bar-tracker-dialog.tsx passes "ok" to computeRepTrustScores instead of the alignment
 *      reason when 1 and 2 both hold.
 *
 * Parts 1 and 2 are covered by camera-view-match.test.ts. Part 3 is the wiring, it lives in a
 * dialog that cannot be rendered in this Node suite, and nothing asserted it -- so the two
 * readers could go on agreeing perfectly while the take was docked anyway. It is a text scan
 * and it knows it, the same trade refused-capture-survives.test.ts already makes for the same
 * reason.
 *
 * NOT asserted here, because it is not true today and this file will not pretend otherwise: the
 * web/MediaPipe twin, bar-tracker-dialog.tsx, still passes its raw alignment reason through with
 * no side-view exemption. On that path z is real, so a side-on athlete reads "angled" rather
 * than "unknown" and is docked 15 rather than 10. Same bug, other branch, reported separately.
 */

const dialog = readFileSync(
  join(__dirname, "..", "components", "av-bar-tracker-dialog.tsx"),
  "utf8",
);

describe("the AV bar dialog does not report a correct side view as a framing fault", () => {
  it("passes 'ok' instead of the alignment reason when the lift wants a side view and got one", () => {
    // The whole conditional, whitespace-insensitive, so a reformat does not fail it but a
    // dropped clause or an inverted comparison does.
    const compact = dialog.replace(/\s+/g, " ");
    expect(compact).toContain(
      `expectedCameraView(exerciseName) === "side" && subjectFacing === "side_on" ? "ok" : alignmentReason`,
    );
  });

  it("feeds that conditional from assessSubjectFacing, not from assessCameraAlignment", () => {
    // The independence is the point. If subjectFacing were ever derived from the same reader
    // that produced the fault, the exemption would be the fault excusing itself.
    expect(dialog).toMatch(/subjectFacing\s*=\s*assessSubjectFacing\(/);
    expect(dialog).toContain("assessCameraAlignment");
  });

  it("keeps both readers exported and answering different questions", () => {
    // A squared-up body: assessSubjectFacing calls it facing_camera, and assessCameraAlignment
    // has no complaint. A side-on body: assessSubjectFacing calls it side_on -- which is the
    // signal the exemption rides on, and the one assessCameraAlignment cannot produce.
    const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
    const squared = [...lm];
    squared[11] = { x: -0.2, y: 0.5, z: 0, visibility: 0.9 };
    squared[12] = { x: 0.2, y: 0.5, z: 0, visibility: 0.9 };
    squared[23] = { x: -0.1, y: 0.1, z: 0, visibility: 0.9 };
    squared[24] = { x: 0.1, y: 0.1, z: 0, visibility: 0.9 };
    expect(assessSubjectFacing(squared as never)).toBe("facing_camera");
    expect(assessCameraAlignment(squared as never).reason).toBe("ok");

    const sideOn = [...squared];
    sideOn[11] = { x: -0.02, y: 0.5, z: 0, visibility: 0.9 };
    sideOn[12] = { x: 0.02, y: 0.5, z: 0, visibility: 0.9 };
    expect(assessSubjectFacing(sideOn as never)).toBe("side_on");
  });

  it("agrees with the exercise profile that the barbell lifts want a side view", () => {
    // Part 1 of the three-part agreement, restated here so this file fails as a unit if the
    // classification ever moves under it.
    expect(expectedCameraView("Back Squat")).toBe("side");
    expect(expectedCameraView("Bench Press")).toBe("side");
  });
});
