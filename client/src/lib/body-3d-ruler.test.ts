import { describe, it, expect } from "vitest";
import {
  BODY_3D_CORRECTED_UNCERTAINTY,
  BODY_3D_MEASURED_UNCERTAINTY,
  BODY_3D_UNCORRECTED_UNCERTAINTY,
  MIN_BODY_3D_FRAMES,
  body3DBoneLengthsM,
  body3DScaleFromFrames,
} from "./body-3d-ruler";
import type { PoseFrame as NativePoseFrame } from "./native-av-preview";

// A skeleton Vision scaled to a 1.80m reference. Femur 0.45m, shin 0.42m, torso 0.50m, upper
// arm 0.30m, forearm 0.26m, shoulders 0.38m. Joints are placed so every bone length is exact.
function skeleton(scaleBy = 1) {
  const j = (name: string, x: number, y: number, z: number) => ({
    name,
    x: x * scaleBy,
    y: y * scaleBy,
    z: z * scaleBy,
    confidence: 1,
  });
  return [
    j("leftShoulder", -0.19, 0.5, 0), j("rightShoulder", 0.19, 0.5, 0),
    j("leftHip", -0.19, 0.0, 0), j("rightHip", 0.19, 0.0, 0),
    j("leftKnee", -0.19, -0.45, 0), j("rightKnee", 0.19, -0.45, 0),
    j("leftAnkle", -0.19, -0.87, 0), j("rightAnkle", 0.19, -0.87, 0),
    j("leftElbow", -0.19, 0.2, 0), j("rightElbow", 0.19, 0.2, 0),
    j("leftWrist", -0.19, -0.06, 0), j("rightWrist", 0.19, -0.06, 0),
  ];
}

function frames(
  n: number,
  opts: { source?: "measured" | "reference"; heightM?: number; scaleBy?: number } = {},
): NativePoseFrame[] {
  return Array.from({ length: n }, (_, i) => ({
    frameIndex: i,
    timestamp: i / 30,
    tracked: true,
    joints: [],
    frameWidth: 1280,
    frameHeight: 720,
    body3DJoints: skeleton(opts.scaleBy),
    body3DHeightM: opts.heightM ?? 1.8,
    body3DHeightSource: opts.source ?? "reference",
  })) as NativePoseFrame[];
}

// The same bones' longest projections in the tracker's units. The femur at 450 units means the
// take is at 0.001 m/unit if the skeleton is right.
const SPANS = { femur: 450, shin: 420, torso: 500, upperArm: 300, forearm: 260, shoulderWidth: 380 };

describe("the 3D skeleton as a ruler", () => {
  it("measures each bone in metres from the 3D joints, as a median over frames", () => {
    const bones = body3DBoneLengthsM(frames(6));
    expect(bones.framesWithPose).toBe(6);
    expect(bones.femur).toBeCloseTo(0.45, 6);
    expect(bones.torso).toBeCloseTo(0.5, 6);
    expect(bones.shoulderWidth).toBeCloseTo(0.38, 6);
  });

  it("corrects a reference-scaled skeleton by the athlete's known height", () => {
    // Vision assumed 1.80m; the athlete is 75in = 1.905m. Every bone grows by 1.0583.
    const r = body3DScaleFromFrames(frames(6), 75, SPANS);
    expect(r.heightSource).toBe("reference_corrected");
    expect(r.limb).toBe("torso");
    expect(r.metres).toBeCloseTo(0.5 * (1.905 / 1.8), 3);
    expect(r.scale).toBeCloseTo((0.5 * (1.905 / 1.8)) / 500, 8);
    expect(r.uncertaintyFraction).toBe(BODY_3D_CORRECTED_UNCERTAINTY);
  });

  it("takes a depth-measured skeleton as it is, whatever height is on file", () => {
    const r = body3DScaleFromFrames(frames(6, { source: "measured" }), 75, SPANS);
    expect(r.heightSource).toBe("measured");
    expect(r.scale).toBeCloseTo(0.5 / 500, 8);
    expect(r.uncertaintyFraction).toBe(BODY_3D_MEASURED_UNCERTAINTY);
  });

  it("still offers a number with no height on file, at a wider stated uncertainty (Rule #1)", () => {
    const r = body3DScaleFromFrames(frames(6), null, SPANS);
    expect(r.scale).toBeCloseTo(0.5 / 500, 8);
    expect(r.heightSource).toBe("reference_uncorrected");
    expect(r.uncertaintyFraction).toBe(BODY_3D_UNCORRECTED_UNCERTAINTY);
  });

  it("refuses an implausible correction but keeps the uncorrected ruler", () => {
    // A height typed as 190 (cm) in an inches field would ask for a 2.7x correction.
    const r = body3DScaleFromFrames(frames(6), 190, SPANS);
    expect(r.rejectedBecause).toBe("implausible_correction");
    expect(r.heightSource).toBe("reference_uncorrected");
    expect(r.scale).toBeCloseTo(0.5 / 500, 8);
  });

  it("does not care which way the athlete is turned: the 3D bone is the same length", () => {
    // The same skeleton rotated 60 degrees about the vertical. The 2D projection would shrink;
    // the 3D lengths do not, so the ruler is unchanged.
    const rotated = frames(6).map((f) => ({
      ...f,
      body3DJoints: f.body3DJoints!.map((j) => ({
        ...j,
        x: j.x * Math.cos(Math.PI / 3) - j.z * Math.sin(Math.PI / 3),
        z: j.x * Math.sin(Math.PI / 3) + j.z * Math.cos(Math.PI / 3),
      })),
    }));
    const a = body3DScaleFromFrames(frames(6), 75, SPANS);
    const b = body3DScaleFromFrames(rotated, 75, SPANS);
    expect(b.scale).toBeCloseTo(a.scale!, 8);
  });

  it("says why when it cannot rule", () => {
    expect(body3DScaleFromFrames(frames(MIN_BODY_3D_FRAMES - 1), 75, SPANS).rejectedBecause).toBe("no_3d_frames");
    expect(body3DScaleFromFrames(frames(6), 75, {}).rejectedBecause).toBe("no_2d_span");
    expect(body3DScaleFromFrames([], 75, SPANS).scale).toBeNull();
  });
});
