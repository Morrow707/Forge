import { describe, it, expect } from "vitest";
import {
  ankleRiseFrom3D,
  ankle3DScaleErrorRatio,
  ANKLE_3D_RULER_UNCERTAINTY,
  MIN_ANKLE_STEP_M,
} from "./ankle-3d-ruler";

/* THE 3D ANKLE RULER, against the take that made Scott ask for it.
 *
 * 2026-10-04: a 24 inch (61cm) box jump read 44cm and nothing in the pipeline could say the
 * scale was wrong, because every witness on that take was a pixel measurement times the same
 * suspect ruler. Apple's 3D pose reports camera-space metres, so the step from standing on the
 * floor to standing on the box is a metre measurement with no scale in it at all, and its ratio
 * to the 2D rise is the error directly. Scott: "We have apples 3d built in, is it detecting the
 * difference between the floor and box? The change in height?"
 */
function frame(t: number, ankleCy: number, heightM = 1.75) {
  return {
    t,
    landmarks: [],
    worldLandmarks: [],
    body3DHeightM: heightM,
    body3DHeightSource: "reference" as const,
    body3DJoints: [
      { name: "leftAnkle", x: 0, y: 0, z: 0, cx: 0, cy: ankleCy, cz: 3, confidence: 1 },
      { name: "rightAnkle", x: 0, y: 0, z: 0, cx: 0.1, cy: ankleCy, cz: 3, confidence: 1 },
    ],
  } as never;
}

describe("the 3D ankle ruler", () => {
  it("measures the floor-to-box step in metres, with no pixel scale anywhere", () => {
    // Height on file equals the reference stature, so the correction is 1 and the step is read
    // straight off: three frames at 0.00 (the floor), three at 0.61 (a 24 inch box).
    const frames = [frame(0, 0), frame(1, 0.01), frame(2, 0), frame(3, 0.61), frame(4, 0.6), frame(5, 0.61)];
    const r = ankleRiseFrom3D(frames, 1.75 / 0.0254);
    expect(r.outcome).toBe("measured");
    expect(r.stepM).toBeCloseTo(0.61, 2);
    expect(r.framesAtFloor).toBe(3);
    expect(r.framesAtBox).toBe(3);
    expect(r.heightSource).toBe("reference_corrected");
  });

  it("gives the 2026-10-04 box jump's scale error as a ratio", () => {
    // The 3D says the step was 61cm; the 2D trace said 44cm. That is the whole diagnosis, and
    // it needs no agreement about what a pixel is worth.
    const frames = [frame(0, 0), frame(1, 0), frame(2, 0.61), frame(3, 0.61)];
    const r = ankleRiseFrom3D(frames, 1.75 / 0.0254);
    expect(ankle3DScaleErrorRatio(r, 44)).toBeCloseTo(0.721, 2);
  });

  it("never fabricates agreement when a witness is missing", () => {
    // A 1.0 here would read as "the two agree", which is the opposite of the truth.
    const r = ankleRiseFrom3D([frame(0, 0), frame(1, 0), frame(2, 0.61), frame(3, 0.61)], 1.75 / 0.0254);
    expect(ankle3DScaleErrorRatio(r, null)).toBeNull();
    expect(ankle3DScaleErrorRatio(r, 0)).toBeNull();
    const noStep = ankleRiseFrom3D([frame(0, 0), frame(1, 0)], 1.75 / 0.0254);
    expect(ankle3DScaleErrorRatio(noStep, 44)).toBeNull();
  });

  it("says WHY rather than returning a bare null, on every refusal path (Rule #1)", () => {
    expect(ankleRiseFrom3D([], 70).outcome).toBe("no_3d_frames");
    // ONE LEVEL ONLY reads as step_too_small, not no_second_level, and that is the right answer:
    // three ankle heights within the 5cm level tolerance ARE one level, so both clusters are the
    // same frames and the step between them is noise. "no_second_level" is for a take where one
    // of the two levels has too few frames to be a level at all -- a single frame caught on the
    // box, below MIN_ANKLE_LEVEL_FRAMES.
    expect(ankleRiseFrom3D([frame(0, 0), frame(1, 0), frame(2, 0.01)], 70).outcome).toBe("step_too_small");
    const oneFrameOnBox = ankleRiseFrom3D([frame(0, 0), frame(1, 0), frame(2, 0), frame(3, 0.61)], 70);
    expect(oneFrameOnBox.outcome).toBe("no_second_level");
    expect(oneFrameOnBox.framesAtBox).toBe(1);
    // Two levels but the step is noise, not a box.
    const tiny = ankleRiseFrom3D([frame(0, 0), frame(1, 0), frame(2, 0.06), frame(3, 0.06)], 70);
    expect(tiny.outcome).toBe("step_too_small");
    expect(tiny.floorLevelM).not.toBeNull();
    // And a frame set with 3D joints that carry no camera-space coordinates.
    const noCamera = [{ t: 0, landmarks: [], worldLandmarks: [], body3DJoints: [{ name: "leftAnkle", x: 0, y: 0, z: 0, confidence: 1 }] }] as never;
    expect(ankleRiseFrom3D(noCamera, 70).outcome).toBe("no_camera_space");
  });

  it("does not assume which way camera-space y points", () => {
    // Never checked against a sensor, and the bar-path axis bugs all came from assuming a sign.
    // A box ABOVE the floor in +y and one in -y must give the same step.
    const up = ankleRiseFrom3D([frame(0, 0), frame(1, 0), frame(2, 0.61), frame(3, 0.61)], 1.75 / 0.0254);
    const down = ankleRiseFrom3D([frame(0, 0), frame(1, 0), frame(2, -0.61), frame(3, -0.61)], 1.75 / 0.0254);
    expect(up.stepM).toBeCloseTo(down.stepM!, 3);
    // And the floor is decided by where the EARLY frames sit, not by the sign.
    expect(up.framesAtFloor).toBe(2);
    expect(down.framesAtFloor).toBe(2);
  });

  it("corrects a reference skeleton by the athlete's height", () => {
    // Vision scaled to a 1.75m reference; the athlete is 2.00m, so every metre is 1.143x.
    const frames = [frame(0, 0, 1.75), frame(1, 0, 1.75), frame(2, 0.5, 1.75), frame(3, 0.5, 1.75)];
    const r = ankleRiseFrom3D(frames, 2.0 / 0.0254);
    expect(r.correction).toBeCloseTo(1.143, 2);
    expect(r.stepM).toBeCloseTo(0.5 * 1.143, 2);
  });

  it("states an honest uncertainty rather than a tight one", () => {
    // The mistake HEIGHT_RULER_UNCERTAINTY's 0.05 made: an unvalidated ruler claiming to be the
    // most reliable in the system. This reads off the same drifting skeleton as every other 3D
    // measurement, so it carries the same 0.2 until a sensor pairing says otherwise.
    expect(ANKLE_3D_RULER_UNCERTAINTY).toBe(0.2);
    expect(MIN_ANKLE_STEP_M).toBeLessThan(0.3);
  });

  it("is read by the jump tracker and declared in the schema", () => {
    // A field the client sends and the schema does not declare is stripped silently -- that has
    // cost three takes. Both halves pinned.
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const dialog = readFileSync("client/src/components/av-jump-tracker-dialog.tsx", "utf8");
    expect(dialog).toContain("ankleRiseFrom3D(nativeRawFrames, heightIn)");
    expect(dialog).toContain("ankle3D:");
    expect(readFileSync("shared/schema.ts", "utf8")).toContain("ankle3D: z");
  });
});
