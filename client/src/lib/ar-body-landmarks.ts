// Bridges ArCameraPreviewPlugin.swift's "bodyTracking" joints (real-world
// meters, ARKit's own joint-name strings) into the same Landmark[] shape
// pose-tracking.ts's worldLandmarks already are -- lets the existing
// velocity/asymmetry/angle math (deriveBarPoint, worldAngleAtVertex,
// computeLegDriveAsymmetry, etc., all in pose-tracking.ts/bar-tracking.ts)
// run against ARKit's 3D joints instead of MediaPipe's, with no changes to
// that math itself. That math is all difference-based (a frame's velocity
// is a position DELTA over time, an angle is a dot product between two
// DIFFERENCE vectors) rather than anything using absolute distance from a
// fixed origin, so it doesn't care whether the origin is MediaPipe's
// per-frame hip-center or ARKit's absolute world origin -- the numbers
// transfer correctly as long as this bridge feeds it points in the same
// units (meters) and a consistent axis convention.
//
// Two things here are informed guesses, not confirmed facts, and both need
// checking against the /dev/ar-preview-test page's raw joint dump on a real
// device before trusting any metric built on top of this bridge:
//
// 1. Joint name strings. ARKit's 3D body-tracking skeleton
//    (ARSkeletonDefinition.defaultBody3D) only exposes a handful of joints
//    as named Swift constants (root/head/leftHand/rightHand/leftFoot/
//    rightFoot) -- everything else is a bare string from jointNames with no
//    public documentation of the exact spelling. The candidates below are
//    a best-effort guess at Apple's naming convention (standard biped-rig
//    style: left_shoulder_1_joint, left_forearm_joint, left_hand_joint,
//    left_upLeg_joint, left_leg_joint, left_foot_joint, and mirrored for
//    right/head), each checked by exact match first and a looser
//    keyword-substring match second so a slightly-wrong guess still has a
//    real chance of matching whatever the actual string turns out to be.
//
// 2. The Y-axis flip. MediaPipe's worldLandmarks appear to increase Y
//    *downward* (jump-tracking.ts negates a raw Y delta to get a
//    human-readable "positive = higher" value), while ARKit's world Y is
//    gravity-aligned and increases *upward* -- feeding ARKit joints
//    straight through without flipping Y would silently invert every
//    depth-direction-sensitive read (concentric vs. eccentric, jump height
//    sign, etc.). This negates Y to match MediaPipe's convention so the
//    existing math's sign assumptions keep holding; X/Z are passed through
//    unflipped since every velocity/distance calculation in
//    pose-tracking.ts/bar-tracking.ts uses Math.hypot (squared
//    differences), which is unaffected by an X/Z sign flip either way.
import type { Landmark } from "@mediapipe/tasks-vision";
import { POSE_LANDMARKS } from "./pose-tracking";
import type { BodyTrackingJoint } from "./native-ar-preview";

type LandmarkKey = keyof typeof POSE_LANDMARKS;

const JOINT_CANDIDATES: Partial<Record<LandmarkKey, { exact: string[]; keyword: string }>> = {
  NOSE: { exact: ["head_joint"], keyword: "head" },
  LEFT_SHOULDER: { exact: ["left_shoulder_1_joint"], keyword: "left_shoulder" },
  RIGHT_SHOULDER: { exact: ["right_shoulder_1_joint"], keyword: "right_shoulder" },
  LEFT_ELBOW: { exact: ["left_forearm_joint"], keyword: "left_forearm" },
  RIGHT_ELBOW: { exact: ["right_forearm_joint"], keyword: "right_forearm" },
  LEFT_WRIST: { exact: ["left_hand_joint"], keyword: "left_hand" },
  RIGHT_WRIST: { exact: ["right_hand_joint"], keyword: "right_hand" },
  LEFT_HIP: { exact: ["left_upLeg_joint", "left_upleg_joint"], keyword: "left_upleg" },
  RIGHT_HIP: { exact: ["right_upLeg_joint", "right_upleg_joint"], keyword: "right_upleg" },
  LEFT_KNEE: { exact: ["left_leg_joint"], keyword: "left_leg" },
  RIGHT_KNEE: { exact: ["right_leg_joint"], keyword: "right_leg" },
  LEFT_ANKLE: { exact: ["left_foot_joint"], keyword: "left_foot" },
  RIGHT_ANKLE: { exact: ["right_foot_joint"], keyword: "right_foot" },
};

function findJoint(
  joints: BodyTrackingJoint[],
  byName: Map<string, BodyTrackingJoint>,
  candidates: { exact: string[]; keyword: string },
): BodyTrackingJoint | null {
  for (const name of candidates.exact) {
    const exact = byName.get(name);
    if (exact) return exact;
  }
  const lowerKeyword = candidates.keyword.toLowerCase();
  return joints.find((j) => j.name.toLowerCase().includes(lowerKeyword)) ?? null;
}

// Empty/zero, zero-visibility landmarks for every BlazePose index this
// bridge doesn't (and can't -- ARKit's skeleton has no equivalent) fill in,
// e.g. individual fingers/eyes/mouth corners -- matches how a real
// MediaPipe detection already reports a landmark pose-tracking.ts's own
// `visible()` gate treats as absent, not a crash-inducing hole in the array.
function emptyLandmarks(): Landmark[] {
  return Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
}

export function arJointsToWorldLandmarks(joints: BodyTrackingJoint[]): Landmark[] {
  const byName = new Map(joints.map((j) => [j.name, j] as const));
  const landmarks = emptyLandmarks();
  for (const key of Object.keys(JOINT_CANDIDATES) as LandmarkKey[]) {
    const candidates = JOINT_CANDIDATES[key];
    if (!candidates) continue;
    const match = findJoint(joints, byName, candidates);
    if (!match) continue;
    landmarks[POSE_LANDMARKS[key]] = { x: match.x, y: -match.y, z: match.z, visibility: 1 };
  }
  return landmarks;
}
