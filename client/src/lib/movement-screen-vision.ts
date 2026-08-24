// Camera-assisted scoring for the Overhead Squat screen -- reuses the exact
// knee-angle/valgus/torso-lean math and thresholds detectFormFaults already
// applies to real tracked lifts (see pose-tracking.ts), just without the
// barbell-specific checks (bar path drift, bar tilt) a bodyweight overhead
// squat has no bar to produce. Always a SUGGESTION a coach reviews before
// it's saved as a manual score -- see OverheadSquatCaptureDialog -- never
// auto-committed, same safety net every other camera/AI-assisted feature in
// this app already relies on.
import { POSE_LANDMARKS, MIN_VISIBILITY, frameKneeAngles, type PoseFrame } from "./pose-tracking";

// Generic over NormalizedLandmark (2D, MediaPipe) and Landmark (3D world,
// both MediaPipe and the ARKit bridge) -- both shapes carry their own
// .visibility field.
function visible<T extends { visibility: number }>(lm: T | undefined): lm is T {
  return !!lm && lm.visibility >= MIN_VISIBILITY;
}

export type OverheadSquatFault = { code: string; label: string };
export type OverheadSquatAssessment = { faults: OverheadSquatFault[]; suggestedGrade: 1 | 2 | 3 };

// Needs a real rep's worth of frames to say anything -- same floor
// detectFormFaults uses, below which a knee-angle/torso-angle read is just
// noise from a half-second of standing still.
const MIN_FRAMES = 6;

export function assessOverheadSquat(frames: PoseFrame[]): OverheadSquatAssessment | null {
  if (frames.length < MIN_FRAMES) return null;

  const kneeAngles: number[] = [];
  const valgusRatios: number[] = [];
  const torsoAngles: number[] = [];

  for (const frame of frames) {
    const worldLm = frame.worldLandmarks;
    kneeAngles.push(...frameKneeAngles(worldLm));

    const lKnee = worldLm[POSE_LANDMARKS.LEFT_KNEE];
    const rKnee = worldLm[POSE_LANDMARKS.RIGHT_KNEE];
    const lAnkle = worldLm[POSE_LANDMARKS.LEFT_ANKLE];
    const rAnkle = worldLm[POSE_LANDMARKS.RIGHT_ANKLE];
    // Real-world 3D distance, not image-space x -- same fix already applied
    // to detectFormFaults' own valgus check in pose-tracking.ts. Works off
    // ARKit's world-only joints (no 2D landmarks to fall back on here), and
    // isn't implicitly assuming a face-on camera the way a single
    // image-axis difference is.
    if (visible(lKnee) && visible(rKnee) && visible(lAnkle) && visible(rAnkle)) {
      const kneeWidth = Math.hypot(lKnee.x - rKnee.x, lKnee.y - rKnee.y, lKnee.z - rKnee.z);
      const ankleWidth = Math.hypot(lAnkle.x - rAnkle.x, lAnkle.y - rAnkle.y, lAnkle.z - rAnkle.z);
      if (ankleWidth > 0.02) valgusRatios.push(kneeWidth / ankleWidth);
    }

    const lShoulder = worldLm[POSE_LANDMARKS.LEFT_SHOULDER];
    const rShoulder = worldLm[POSE_LANDMARKS.RIGHT_SHOULDER];
    const lHip = worldLm[POSE_LANDMARKS.LEFT_HIP];
    const rHip = worldLm[POSE_LANDMARKS.RIGHT_HIP];
    // Same acos(|dy|/magnitude) world-space torso-lean formula as
    // detectFormFaults -- needs no vertical-sign correction (see its own
    // comment in pose-tracking.ts) and, being a real 3D angle rather than
    // an image-space atan2, isn't distorted by portrait video or camera
    // tilt the way the old 2D version was.
    if (visible(lShoulder) && visible(rShoulder) && visible(lHip) && visible(rHip)) {
      const dx = (lShoulder.x + rShoulder.x) / 2 - (lHip.x + rHip.x) / 2;
      const dy = (lShoulder.y + rShoulder.y) / 2 - (lHip.y + rHip.y) / 2;
      const dz = (lShoulder.z + rShoulder.z) / 2 - (lHip.z + rHip.z) / 2;
      const magnitude = Math.hypot(dx, dy, dz);
      if (magnitude > 0) {
        torsoAngles.push((Math.acos(Math.min(1, Math.abs(dy) / magnitude)) * 180) / Math.PI);
      }
    }
  }

  const faults: OverheadSquatFault[] = [];
  const minKneeAngle = kneeAngles.length ? Math.min(...kneeAngles) : 180;
  if (minKneeAngle > 100) {
    faults.push({ code: "shallow_depth", label: `Depth: knees only reached ~${Math.round(minKneeAngle)}° -- aim to break parallel` });
  }
  if (valgusRatios.length && Math.min(...valgusRatios) < 0.75) {
    faults.push({ code: "knee_valgus", label: "Knees caved inward past the ankles" });
  }
  if (torsoAngles.length && Math.max(...torsoAngles) > 45) {
    faults.push({ code: "forward_lean", label: `Excessive forward lean (~${Math.round(Math.max(...torsoAngles))}° from vertical)` });
  }

  // 0 faults = clean (3), 1 = one compensation (2), 2+ = multiple (1).
  // Grade 0 (pain) can never come from a camera read -- that's always a
  // manual override.
  const suggestedGrade: 1 | 2 | 3 = faults.length === 0 ? 3 : faults.length === 1 ? 2 : 1;
  return { faults, suggestedGrade };
}

// ---------- Camera-assisted goniometer capture ----------
// Reuses joint-angles.ts's already-shipped MEASURABLE_JOINTS/measureJoint
// (the video-analysis tool's tap-a-joint angle math) rather than inventing a
// second angle calculation. Only movements where a single 2D/3D camera
// angle genuinely corresponds to the clinical measurement are mapped here --
// rotation (internal/external, pronation/supination) and deviation
// (radial/ulnar, inversion/eversion) need a reference plane a single camera
// view can't reliably resolve, so those stay manual-only.
//
// Each conversion turns MEASURABLE_JOINTS' raw "inside angle at the joint"
// (0° = fully folded, 180° = a straight line through the joint) into the
// clinical convention GONIOMETER_JOINTS' normalDegrees are written against
// (0° = anatomical neutral, increasing with the movement). Knee/hip/elbow
// flexion all use the same joint-straight = 180 = 0°-flexion relationship
// (see pose-tracking.ts's frameKneeAngles, which this already matches for
// knee); shoulder is the one joint where the raw inside angle already
// tracks clinical flexion/abduction directly, since the hip-shoulder-elbow
// triangle's "straight" position isn't anywhere near arm-at-side. Ankle
// pivots around 90° (foot roughly perpendicular to shin at neutral) instead
// of a straight line at all.
//
// This is an ESTIMATE, not a clinical-grade reading -- same "2D-camera
// model, less precise than a real instrument" honesty this app already
// gives bar-path/sprint tracking. It always lands in the goniometer form's
// own angle field for the coach to confirm or correct, never saves directly.
export type MeasurableJointKey =
  | "LEFT_SHOULDER"
  | "RIGHT_SHOULDER"
  | "LEFT_ELBOW"
  | "RIGHT_ELBOW"
  | "LEFT_HIP"
  | "RIGHT_HIP"
  | "LEFT_KNEE"
  | "RIGHT_KNEE"
  | "LEFT_ANKLE"
  | "RIGHT_ANKLE";

type CameraGoniometerJoint = {
  measurableJointKey: MeasurableJointKey;
  movements: Record<string, (insideAngleDeg: number) => number>;
};

const flexionFromStraight = (a: number) => Math.max(0, Math.round(180 - a));
const shoulderRaiseFromInside = (a: number) => Math.max(0, Math.round(a));
const dorsiflexionFromRightAngle = (a: number) => Math.max(0, Math.round(90 - a));
const plantarflexionFromRightAngle = (a: number) => Math.max(0, Math.round(a - 90));

export const GONIOMETER_CAMERA_JOINTS: Record<string, CameraGoniometerJoint> = {
  shoulder_left: { measurableJointKey: "LEFT_SHOULDER", movements: { flexion: shoulderRaiseFromInside, abduction: shoulderRaiseFromInside } },
  shoulder_right: { measurableJointKey: "RIGHT_SHOULDER", movements: { flexion: shoulderRaiseFromInside, abduction: shoulderRaiseFromInside } },
  elbow_left: { measurableJointKey: "LEFT_ELBOW", movements: { flexion: flexionFromStraight } },
  elbow_right: { measurableJointKey: "RIGHT_ELBOW", movements: { flexion: flexionFromStraight } },
  hip_left: { measurableJointKey: "LEFT_HIP", movements: { flexion: flexionFromStraight } },
  hip_right: { measurableJointKey: "RIGHT_HIP", movements: { flexion: flexionFromStraight } },
  knee_left: { measurableJointKey: "LEFT_KNEE", movements: { flexion: flexionFromStraight } },
  knee_right: { measurableJointKey: "RIGHT_KNEE", movements: { flexion: flexionFromStraight } },
  ankle_left: { measurableJointKey: "LEFT_ANKLE", movements: { dorsiflexion: dorsiflexionFromRightAngle, plantarflexion: plantarflexionFromRightAngle } },
  ankle_right: { measurableJointKey: "RIGHT_ANKLE", movements: { dorsiflexion: dorsiflexionFromRightAngle, plantarflexion: plantarflexionFromRightAngle } },
};

export function cameraGoniometerJointFor(jointKey: string): MeasurableJointKey | null {
  return GONIOMETER_CAMERA_JOINTS[jointKey]?.measurableJointKey ?? null;
}

export function cameraSupportsGoniometerMovement(jointKey: string, movementKey: string): boolean {
  return !!GONIOMETER_CAMERA_JOINTS[jointKey]?.movements[movementKey];
}

export function convertCameraAngle(jointKey: string, movementKey: string, insideAngleDeg: number): number | null {
  const fn = GONIOMETER_CAMERA_JOINTS[jointKey]?.movements[movementKey];
  return fn ? fn(insideAngleDeg) : null;
}
