/* A SIDE-ON BENCH PRESS IS NOT A HEAD-ON TAKE, AND THE PIPELINE SAID IT WAS.
 *
 * Scott, 2026-10-06, on the build 632 comparison: "No I did not film the bench from head end, I
 * have filmed every single bench press from this angle, every single one." The export read
 * `cameraView.subjectFacing: "facing_camera"` and carried the head-on note, and that wrong
 * sentence was read as evidence for an hour.
 *
 * The cause is one line in assessSubjectFacing: shoulder spread was measured along the IMAGE's
 * horizontal and divided by a torso length measured in any direction. On an upright athlete
 * those agree. On a SUPINE athlete the body's long axis is horizontal, so landmark error ALONG
 * the body lands in x and is counted as shoulder breadth. Measuring the spread ACROSS THE BODY
 * instead is rotation-invariant and moves no threshold.
 */
import { describe, expect, it } from "vitest";
import { assessSubjectFacing, POSE_LANDMARKS } from "./pose-tracking";
import type { Landmark } from "@mediapipe/tasks-vision";

/** An athlete whose torso runs along `axis` with the shoulders `across` apart perpendicular to
 *  it, plus `along` of landmark error sliding one shoulder down the body. */
function body(axis: "upright" | "supine", across: number, along = 0): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  const place = (i: number, perp: number, down: number) =>
    axis === "upright"
      ? (lm[i] = { x: perp, y: down, z: 0, visibility: 1 })
      : (lm[i] = { x: down, y: perp, z: 0, visibility: 1 });
  place(POSE_LANDMARKS.LEFT_SHOULDER, -across / 2, 0);
  place(POSE_LANDMARKS.RIGHT_SHOULDER, across / 2, along);
  place(POSE_LANDMARKS.LEFT_HIP, -across / 2, 0.6);
  place(POSE_LANDMARKS.RIGHT_HIP, across / 2, 0.6);
  return lm;
}

describe("assessSubjectFacing reads the spread across the body", () => {
  it("calls a side-on supine athlete side_on, however much error runs along the body", () => {
    // The shoulders are stacked down the lens (no real breadth) and one landmark has slid 0.5
    // along the body -- the shape that produced the bench's 112.9-unit span.
    expect(assessSubjectFacing(body("supine", 0.02, 0.5))).toBe("side_on");
  });

  it("still calls a genuinely head-on athlete facing_camera, supine or upright", () => {
    expect(assessSubjectFacing(body("upright", 0.5))).toBe("facing_camera");
    expect(assessSubjectFacing(body("supine", 0.5))).toBe("facing_camera");
  });

  it("is unchanged on an upright athlete, which is every standing lift ever filmed", () => {
    // Upright: the torso axis IS the image vertical, so the across-body component is the x-spread.
    for (const across of [0.05, 0.18, 0.25, 0.42, 0.6]) {
      const upright = assessSubjectFacing(body("upright", across));
      const rotated = assessSubjectFacing(body("supine", across));
      expect(rotated).toBe(upright);
    }
  });

  it("answers the same whichever way round the body is, which is the whole fix", () => {
    expect(assessSubjectFacing(body("supine", 0.1, 0.8))).toBe(
      assessSubjectFacing(body("upright", 0.1, 0.8)),
    );
  });
});
