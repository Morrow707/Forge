// Tap-a-joint angle measurement for the video-analysis tool (see
// video-analysis-dialog.tsx) -- the same standard joint set OnForm's
// skeleton-linked angle tool exposes: tap near a joint, see its angle,
// and it re-measures every frame as the skeleton moves with the athlete.
import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { MIN_VISIBILITY, POSE_LANDMARKS, worldAngleAtVertex } from "./pose-tracking";

export type MeasurableJoint = {
  key: string;
  label: string;
  // [proximal, vertex, distal] landmark indices -- the angle is measured at
  // the middle one.
  triple: [number, number, number];
};

export const MEASURABLE_JOINTS: MeasurableJoint[] = [
  {
    key: "LEFT_ELBOW",
    label: "L Elbow",
    triple: [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_ELBOW, POSE_LANDMARKS.LEFT_WRIST],
  },
  {
    key: "RIGHT_ELBOW",
    label: "R Elbow",
    triple: [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_ELBOW, POSE_LANDMARKS.RIGHT_WRIST],
  },
  {
    key: "LEFT_SHOULDER",
    label: "L Shoulder",
    triple: [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_ELBOW],
  },
  {
    key: "RIGHT_SHOULDER",
    label: "R Shoulder",
    triple: [POSE_LANDMARKS.RIGHT_HIP, POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_ELBOW],
  },
  {
    key: "LEFT_HIP",
    label: "L Hip",
    triple: [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.LEFT_KNEE],
  },
  {
    key: "RIGHT_HIP",
    label: "R Hip",
    triple: [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_HIP, POSE_LANDMARKS.RIGHT_KNEE],
  },
  {
    key: "LEFT_KNEE",
    label: "L Knee",
    triple: [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.LEFT_KNEE, POSE_LANDMARKS.LEFT_ANKLE],
  },
  {
    key: "RIGHT_KNEE",
    label: "R Knee",
    triple: [POSE_LANDMARKS.RIGHT_HIP, POSE_LANDMARKS.RIGHT_KNEE, POSE_LANDMARKS.RIGHT_ANKLE],
  },
  {
    key: "LEFT_ANKLE",
    label: "L Ankle",
    triple: [POSE_LANDMARKS.LEFT_KNEE, POSE_LANDMARKS.LEFT_ANKLE, POSE_LANDMARKS.LEFT_FOOT_INDEX],
  },
  {
    key: "RIGHT_ANKLE",
    label: "R Ankle",
    triple: [POSE_LANDMARKS.RIGHT_KNEE, POSE_LANDMARKS.RIGHT_ANKLE, POSE_LANDMARKS.RIGHT_FOOT_INDEX],
  },
];

// Generous hit radius in normalized (0-1) space -- a fingertip on a phone
// screen covers a much bigger fraction of the frame than a mouse pointer, so
// this needs to be forgiving rather than pixel-precise.
const TAP_HIT_RADIUS = 0.08;

// Nearest measurable joint to a tap point, in the same 0-1 normalized space
// as landmarks -- null if nothing visible is close enough to plausibly be
// what the athlete meant to tap.
export function findNearestJoint(
  landmarks: NormalizedLandmark[],
  nx: number,
  ny: number,
): MeasurableJoint | null {
  let best: MeasurableJoint | null = null;
  let bestDist = TAP_HIT_RADIUS;
  for (const joint of MEASURABLE_JOINTS) {
    const p = landmarks[joint.triple[1]];
    if (!p || p.visibility < MIN_VISIBILITY) continue;
    const dist = Math.hypot(p.x - nx, p.y - ny);
    if (dist < bestDist) {
      bestDist = dist;
      best = joint;
    }
  }
  return best;
}

// The joint's current inside angle (0-180) plus the point to label it at, or
// null for a frame where one of the three landmarks isn't visible enough to
// trust -- callers should just skip drawing that frame's label rather than
// showing a stale or fabricated number. Unlike the fully free-form tap-
// anywhere angle tool (which measures whatever points the athlete tapped,
// never real body landmarks, so image-space is the correct space for it --
// see angleAtVertex's own comment), this measures an actual joint, so the
// angle VALUE comes from worldLandmarks the same way the automated knee-
// angle pipeline does. `landmarks` (image-space) is only used for `at`,
// where to draw the label on screen -- that's just an on-screen position,
// not a measurement, so it stays in the space the canvas already draws in.
// landmarks (2D image-space) is optional -- ARKit's body-tracking bridge
// (see ar-body-landmarks.ts) only ever produces world-space Landmark[],
// never 2D data, so a caller reading ARKit joints passes null here. `at`
// (a screen-space point for drawing the joint marker) is only meaningful
// when 2D data exists, so it's null in that case too -- the angle itself
// (insideDeg, computed from worldLandmarks alone) is unaffected either
// way. Visibility falls back to the world landmarks' own visibility field
// (populated by the ARKit bridge with real tracking confidence) when 2D
// isn't available, rather than skipping the check entirely.
export function measureJoint(
  landmarks: NormalizedLandmark[] | null,
  worldLandmarks: Landmark[],
  joint: MeasurableJoint,
): { insideDeg: number; at: { x: number; y: number } | null } | null {
  const [ai, bi, ci] = joint.triple;
  const wa = worldLandmarks[ai];
  const wb = worldLandmarks[bi];
  const wc = worldLandmarks[ci];
  if (!wa || !wb || !wc) return null;
  const a = landmarks?.[ai];
  const b = landmarks?.[bi];
  const c = landmarks?.[ci];
  if (a && b && c) {
    if (a.visibility < MIN_VISIBILITY || b.visibility < MIN_VISIBILITY || c.visibility < MIN_VISIBILITY) return null;
  } else if (
    (wa.visibility ?? 1) < MIN_VISIBILITY ||
    (wb.visibility ?? 1) < MIN_VISIBILITY ||
    (wc.visibility ?? 1) < MIN_VISIBILITY
  ) {
    return null;
  }
  return { insideDeg: worldAngleAtVertex(wa, wb, wc), at: a && b ? { x: b.x, y: b.y } : null };
}
