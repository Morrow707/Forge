import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* THE 3D POSE AND THE HAND POSE MUST NOT LAND ON THE SAME FRAME.
 *
 * Both Vision gates in AvBodyTrackingPlugin.swift were `strideIndex % stride == 0`, and every
 * stride pair the app ships has one stride dividing the other -- the bar tracker runs
 * body3DStride 120 with handPoseStride 12, the jump tracker 120 with 24. So every 3D-pose frame
 * was also a hand-pose frame, including frame 0, which is the frame that sets the live path's
 * cadence baseline.
 *
 * The 2026-10-04 diagnostics priced it: the 3D pose was 3.6s over 28 frames (~129ms) on top of
 * a ~40ms body pose, on a SERIAL queue whose target interval is 33ms. The Back Squat's
 * maxInterFrameGap was 0.48s and it failed the gap gate and paid for a second full read.
 *
 * This is a Rule #2 speed-up, so what the test really pins is that nothing was REMOVED: both
 * strides are unchanged and both sensors still run, on as many frames as before. The guard
 * exists because the natural "fix" is to raise a stride or switch a sensor off, which Rule #2
 * forbids, and because a future stride pair could reintroduce the collision.
 */
const swift = readFileSync(join(process.cwd(), "ios/App/App/AvBodyTrackingPlugin.swift"), "utf8");

function stridesFrom(file: string, constName: string) {
  const src = readFileSync(join(process.cwd(), file), "utf8");
  const m = src.match(
    new RegExp(`${constName} = \\{ body3DStride: (\\d+), handPoseStride: (\\d+) \\}`),
  );
  if (!m) throw new Error(`${constName} not found in ${file} -- renamed, or the shape changed`);
  return { body3D: Number(m[1]), handPose: Number(m[2]) };
}

describe("the two expensive Vision sensors never run on the same frame", () => {
  it("offsets the 3D pose's phase instead of sharing the hand pose's", () => {
    expect(swift).toContain("strideIndex % ctx.body3DDetectionStride == ctx.body3DPhaseOffset");
    expect(swift).toContain("var body3DPhaseOffset: Int { handPoseStride > 1 ? 1 % body3DDetectionStride : 0 }");
    // The hand pose keeps phase 0; if both ever became offsets they could collide again.
    expect(swift).toContain("let runHandPose = strideIndex % ctx.handPoseStride == 0");
  });

  it.each([
    ["client/src/components/av-bar-tracker-dialog.tsx", "BAR_SENSOR_STRIDES"],
    ["client/src/components/av-jump-tracker-dialog.tsx", "JUMP_SENSOR_STRIDES"],
  ])("%s: the shipped strides cannot collide under the offset", (file, constName) => {
    const { body3D, handPose } = stridesFrom(file, constName);
    // Rule #2: a sensor is thinned, never switched off. A stride of 0 or a removed entry is the
    // failure this half catches.
    expect(body3D).toBeGreaterThan(0);
    expect(handPose).toBeGreaterThan(0);
    const offset = handPose > 1 ? 1 % body3D : 0;
    // Replay the two gates over a take's worth of sampled frames and assert no frame runs both.
    const collisions: number[] = [];
    for (let strideIndex = 0; strideIndex < body3D * 4; strideIndex += 1) {
      if (strideIndex % body3D === offset && strideIndex % handPose === 0) collisions.push(strideIndex);
    }
    expect(collisions).toEqual([]);
  });

  it("would have collided on every 3D frame before the offset", () => {
    // The bug, stated as a test, so "offset 1" cannot be read as arbitrary.
    const { body3D, handPose } = stridesFrom(
      "client/src/components/av-bar-tracker-dialog.tsx",
      "BAR_SENSOR_STRIDES",
    );
    expect(body3D % handPose).toBe(0);
  });
});
