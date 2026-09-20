import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assessSubjectFacing,
  assessCameraAlignment,
  alignmentReasonWithoutDepth,
  trustAlignmentReason,
  subjectFacingFromFrames,
} from "./pose-tracking";
import { expectedCameraView } from "./exercise-camera-profile";
import type { Landmark } from "@mediapipe/tasks-vision";

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
 *   3. BOTH tracker dialogs pass their alignment reason through trustAlignmentReason(), which
 *      answers "ok" when 1 and 2 both hold.
 *
 * Parts 1 and 2 are covered by camera-view-match.test.ts. Part 3 is the wiring, it lives in two
 * dialogs that cannot be rendered in this Node suite, and until 2026-09-20 only ONE of them had
 * it: the web/MediaPipe twin passed its raw alignment reason straight through, and on that path
 * z is real, so a side-on athlete read "angled" and was docked 15 rather than 10. The exemption
 * is a shared helper now and this scans both files for the call. Text scans, and they know it --
 * the same trade refused-capture-survives.test.ts makes for the same reason.
 *
 * Also asserted: the native path no longer asks assessCameraAlignment at all. Its landmarks have
 * z pinned to 0, so that reader could only ever say "ok" or "unknown", and it said "unknown" for
 * every correct side view. alignmentReasonWithoutDepth answers from what that path CAN measure.
 */

const avDialog = readFileSync(join(__dirname, "..", "components", "av-bar-tracker-dialog.tsx"), "utf8");
const webDialog = readFileSync(join(__dirname, "..", "components", "bar-tracker-dialog.tsx"), "utf8");

function body(shoulderHalfX: number): Landmark[] {
  const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 })) as Landmark[];
  lm[11] = { x: -shoulderHalfX, y: 0.5, z: 0, visibility: 0.9 } as Landmark;
  lm[12] = { x: shoulderHalfX, y: 0.5, z: 0, visibility: 0.9 } as Landmark;
  lm[23] = { x: -0.1, y: 0.1, z: 0, visibility: 0.9 } as Landmark;
  lm[24] = { x: 0.1, y: 0.1, z: 0, visibility: 0.9 } as Landmark;
  return lm;
}
const squared = body(0.2);
const sideOn = body(0.02);
const empty = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 })) as Landmark[];

describe("trustAlignmentReason: the shared exemption", () => {
  it("answers 'ok' when the lift wants a side view and got one, whatever the reader said", () => {
    expect(trustAlignmentReason("angled", "side_on", "side")).toBe("ok");
    expect(trustAlignmentReason("unknown", "side_on", "side")).toBe("ok");
  });

  it("passes the reason through in every other case", () => {
    expect(trustAlignmentReason("angled", "oblique", "side")).toBe("angled");
    expect(trustAlignmentReason("angled", "side_on", "front")).toBe("angled");
    expect(trustAlignmentReason("unknown", "unknown", "side")).toBe("unknown");
    expect(trustAlignmentReason(null, "side_on", null)).toBeNull();
  });
});

describe("alignmentReasonWithoutDepth: a real answer for the path with no z", () => {
  it("confirms the framing the lift wants", () => {
    expect(alignmentReasonWithoutDepth("side_on", "side")).toBe("ok");
    expect(alignmentReasonWithoutDepth("facing_camera", "front")).toBe("ok");
    expect(alignmentReasonWithoutDepth("side_on", "either")).toBe("ok");
    expect(alignmentReasonWithoutDepth("oblique", null)).toBe("ok");
  });

  it("calls head-on for a side lift 'axial', which computeRepTrustScores does not dock", () => {
    // cameraViewMismatch already tells the athlete what that framing costs (one axis). It is a
    // legitimate angle, not a fault worth trust points.
    expect(alignmentReasonWithoutDepth("facing_camera", "side")).toBe("axial");
  });

  it("calls an oblique or wrong-way view 'angled', and no body at all 'unknown'", () => {
    expect(alignmentReasonWithoutDepth("oblique", "side")).toBe("angled");
    expect(alignmentReasonWithoutDepth("side_on", "front")).toBe("angled");
    expect(alignmentReasonWithoutDepth("unknown", "side")).toBe("unknown");
  });

  it("is the answer assessCameraAlignment cannot give on depthless landmarks", () => {
    // On z=0 landmarks the old reader calls a side view "unknown" -- the absence of depth,
    // reported as a framing fault. The new one calls it what it is.
    expect(assessCameraAlignment(sideOn).reason).toBe("unknown");
    expect(alignmentReasonWithoutDepth(assessSubjectFacing(sideOn), "side")).toBe("ok");
  });
});

describe("subjectFacingFromFrames keeps asking past an untracked first frame", () => {
  it("returns the first frame that answers, not frame 0's 'unknown'", () => {
    expect(subjectFacingFromFrames([{ worldLandmarks: empty }, { worldLandmarks: sideOn }])).toBe("side_on");
  });
  it("is 'unknown' only when no frame answered", () => {
    expect(subjectFacingFromFrames([{ worldLandmarks: empty }])).toBe("unknown");
    expect(subjectFacingFromFrames([])).toBe("unknown");
  });
});

describe("both tracker dialogs route their alignment reason through the shared exemption", () => {
  it.each([
    ["av-bar-tracker-dialog.tsx", avDialog],
    ["bar-tracker-dialog.tsx", webDialog],
  ])("%s calls trustAlignmentReason with expectedCameraView(exerciseName)", (_name, src) => {
    const compact = src.replace(/\s+/g, " ");
    expect(compact).toContain("trustAlignmentReason(");
    const callIdx = compact.indexOf("trustAlignmentReason(");
    const window = compact.slice(callIdx, callIdx + 400);
    expect(window).toContain("expectedCameraView(exerciseName)");
    // And it is the value handed to computeRepTrustScores, not computed and dropped.
    const trustIdx = compact.indexOf("computeRepTrustScores(");
    expect(callIdx).toBeGreaterThan(trustIdx);
  });

  it("the native dialog no longer pins its verdict on frame 0 or asks a reader that needs z", () => {
    expect(avDialog).not.toMatch(/if \(alignmentReason == null\) alignmentReason = assessCameraAlignment/);
    expect(avDialog).not.toMatch(/assessCameraAlignment\(/);
    expect(avDialog).toContain("alignmentReasonWithoutDepth(");
    // The facing read keeps retrying while unknown -- the shape the alignment read now shares.
    expect(avDialog).toMatch(/if \(subjectFacing == null \|\| subjectFacing === "unknown"\)/);
  });

  it("the web dialog feeds the exemption from the frames' facing, not from the alignment reader", () => {
    // The independence is the point. If subjectFacing were ever derived from the same reader
    // that produced the fault, the exemption would be the fault excusing itself.
    expect(webDialog).toContain("subjectFacingFromFrames(framesRef.current)");
    expect(webDialog).toContain("assessCameraAlignment");
  });

  it("keeps both readers exported and answering different questions", () => {
    expect(assessSubjectFacing(squared)).toBe("facing_camera");
    expect(assessCameraAlignment(squared).reason).toBe("ok");
    expect(assessSubjectFacing(sideOn)).toBe("side_on");
  });

  it("agrees with the exercise profile that the barbell lifts want a side view", () => {
    expect(expectedCameraView("Back Squat")).toBe("side");
    expect(expectedCameraView("Bench Press")).toBe("side");
  });
});
