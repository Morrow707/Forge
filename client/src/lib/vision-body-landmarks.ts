// Bridges AvBodyTrackingPlugin.swift's "poseFrame" joints (Vision framework's
// VNDetectHumanBodyPoseRequest, normalized 0-1 image-space coordinates) into the same
// Landmark[] shape pose-tracking.ts's worldLandmarks already are -- directly parallel to
// ar-body-landmarks.ts, which does the same job for ARKit's real-world-meter joints. See that
// file's own comment for the shared rationale: the existing velocity/asymmetry/angle math
// (deriveBarPoint, worldAngleAtVertex, etc.) is entirely difference-based, so it runs
// correctly against any consistent-units, consistent-sign-convention set of 3D points fed
// into the worldLandmarks slot -- it doesn't need them to be real-world meters specifically.
// Like every production ARKit tracker dialog (see e.g. ar-bar-tracker-dialog.tsx's own
// `landmarks: []`), only worldLandmarks gets populated here -- the normalized-image-space
// `landmarks` slot stays empty, matching the established pattern rather than inventing a
// second path nothing currently needs.
//
// Two things this bridge has to get right that ar-body-landmarks.ts didn't have to worry
// about, because ARKit's joints were already real, aspect-correct 3D world points:
//
// 1. Aspect-ratio distortion. Vision's raw joint coordinates are normalized independently per
//    axis (x divided by frame width, y divided by frame height) -- exactly the "normalized
//    image-space landmarks" case pose-tracking.ts's own PoseFrame comment warns distorts any
//    angle computation (knee angle, torso lean, bar tilt -- anything mixing an x-component
//    with a y-component) on non-square video, which portrait phone video always is.
//    Multiplying x by frameWidth and y by frameHeight (both supplied per-frame by the native
//    side -- see native-av-preview.ts's PoseFrame type, and AvBodyTrackingPlugin.swift's own
//    comment on why those are the UPRIGHT, already-orientation-corrected dimensions, not the
//    raw sensor buffer's) converts both axes into the same physical/pixel unit, removing that
//    distortion -- proportionally correct, even though not yet real-world-scaled. That's
//    Phase 5's job, via the exact same scaleWorldLandmarks() hook ARKit's real-meter values
//    already flow through unmodified.
//
// 2. The Y-axis flip. Vision's normalized y increases UPWARD from the bottom of the frame
//    (Vision's own coordinate convention) -- the opposite of the "y increases downward"
//    convention this app's worldLandmarks assume (see ar-body-landmarks.ts's own comment on
//    why ARKit's gravity-aligned Y needed the same kind of flip, for the same underlying
//    reason: matching MediaPipe's own raw sign convention so existing sign assumptions keep
//    holding). Negated here after the pixel-space scaling above. X is passed through
//    unflipped, same reasoning as ar-body-landmarks.ts: every velocity/distance calculation
//    uses Math.hypot (squared differences), unaffected by a consistent sign convention either
//    way.
//
// z is always 0 -- Vision is 2D-only, no depth information exists to report. Every metric
// that genuinely needs real-world scale (bar velocity, jump height, wrist speed) stays
// uncalibrated until Phase 5's known-object/athlete-height calibration multiplies these
// pixel-space values by a real scale factor.
import type { Landmark } from "@mediapipe/tasks-vision";
import { POSE_LANDMARKS } from "./pose-tracking";
import type { PoseFrame as NativePoseFrame } from "./native-av-preview";

type LandmarkKey = keyof typeof POSE_LANDMARKS;

// Vision's own documented JointName strings (see AvBodyTrackingPlugin.swift's
// bodyPoseJoints) mapped to the matching BlazePose index -- unlike ARKit's undocumented
// joint-name strings (which needed on-device discovery to nail down), this is a direct,
// confirmed 1:1 mapping straight from Apple's public API. "neck" and "root" (Vision's mid-hip
// point) have no direct BlazePose equivalent and are left unmapped, same as every other index
// this bridge can't fill in (fingers, mouth corners, individual eyes-inner/outer).
const JOINT_NAME_TO_LANDMARK: Partial<Record<string, LandmarkKey>> = {
  nose: "NOSE",
  leftEye: "LEFT_EYE",
  rightEye: "RIGHT_EYE",
  leftEar: "LEFT_EAR",
  rightEar: "RIGHT_EAR",
  leftShoulder: "LEFT_SHOULDER",
  rightShoulder: "RIGHT_SHOULDER",
  leftElbow: "LEFT_ELBOW",
  rightElbow: "RIGHT_ELBOW",
  leftWrist: "LEFT_WRIST",
  rightWrist: "RIGHT_WRIST",
  leftHip: "LEFT_HIP",
  rightHip: "RIGHT_HIP",
  leftKnee: "LEFT_KNEE",
  rightKnee: "RIGHT_KNEE",
  leftAnkle: "LEFT_ANKLE",
  rightAnkle: "RIGHT_ANKLE",
};

// Matches ArCameraPreviewPlugin's own per-joint confidence floor philosophy -- a very-low-
// confidence point is worse than no point at all (garbage position feeding straight into
// angle/velocity math), so it's dropped rather than passed through with a low visibility
// score. pose-tracking.ts's own MIN_VISIBILITY (0.5) is the gate that actually decides
// whether a frame's landmark is usable; this is a cheaper, earlier floor purely against
// reporting a wild position at all.
const MIN_JOINT_CONFIDENCE = 0.1;

// Same empty/zero, zero-visibility convention as ar-body-landmarks.ts's emptyLandmarks() --
// every BlazePose index this bridge doesn't (or can't) fill in reads as absent to
// pose-tracking.ts's own visible() gate, not a crash-inducing hole in the array.
function emptyLandmarks(): Landmark[] {
  return Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
}

export function visionJointsToWorldLandmarks(frame: NativePoseFrame): Landmark[] {
  const landmarks = emptyLandmarks();
  if (!frame.tracked) return landmarks;
  for (const joint of frame.joints) {
    const key = JOINT_NAME_TO_LANDMARK[joint.name];
    if (!key || joint.confidence < MIN_JOINT_CONFIDENCE) continue;
    landmarks[POSE_LANDMARKS[key]] = {
      x: joint.x * frame.frameWidth,
      y: -(joint.y * frame.frameHeight),
      z: 0,
      visibility: joint.confidence,
    };
  }
  return landmarks;
}

// Phase 5: same pixel-scale + Y-flip transform as visionJointsToWorldLandmarks above, applied
// to AvImplementTracker.swift's own leftImplement/rightImplement output instead of a body
// joint -- see native-av-preview.ts's PoseImplement comment for why that's reported in the
// identical raw Vision convention a joint is. Landing it in this same pixel-space,
// consistent-sign-convention unit as worldLandmarks' own wrist entry (not yet real-world
// meters -- see this file's header comment on why that's still fine for difference-based math)
// is what lets av-bar-tracker-dialog.tsx fuse the two directly, the same way
// bar-tracker-dialog.tsx fuses ImplementTracker's meters against deriveBarPoint's own meters,
// and ar-bar-tracker-dialog.tsx fuses ArImplementTracker's ARKit world meters. Returns null on
// a frame with no lock (the field is omitted, not a zeroed point -- never treat a missing
// implement as "at the origin").
export type ImplementPoint = {
  x: number;
  y: number;
  z: number;
  confidence: number;
  color?: { r: number; g: number; b: number };
};

export function visionImplementToPoint(
  implement: { x: number; y: number; confidence: number; color?: { r: number; g: number; b: number } } | undefined,
  frame: NativePoseFrame,
): ImplementPoint | null {
  if (!implement) return null;
  return {
    x: implement.x * frame.frameWidth,
    y: -(implement.y * frame.frameHeight),
    z: 0,
    confidence: implement.confidence,
    color: implement.color,
  };
}
