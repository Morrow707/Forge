// On-device body pose estimation for the camera tracker -- replaces the old
// colored-tape-marker centroid tracker with MediaPipe's PoseLandmarker
// (BlazePose, 33 landmarks), so nothing needs to be stuck on the bar
// anymore and the tracker gets a real skeleton instead of one blob.
// Runs entirely client-side (WASM/WebGL), same privacy story as before:
// only derived numbers ever leave the device, never video or frames.
import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";

// Self-hosted (see scripts/copy-mediapipe-wasm.mjs) rather than pointed at a
// public CDN -- same-origin, no external dependency at runtime, and the PWA
// service worker can cache it like any other static asset.
const WASM_BASE_PATH = "/mediapipe-wasm";
// Google's own hosting for the model weights -- small enough (~5.5MB) that
// self-hosting isn't worth the repo bloat; this URL is Google's documented,
// stable distribution point for MediaPipe models.
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

// BlazePose's fixed 33-point topology.
export const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

const MIN_VISIBILITY = 0.5;

export type PoseFrame = { t: number; landmarks: NormalizedLandmark[] };

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

// Loaded once per page session and reused across every tracked set --
// re-initializing the WASM runtime and re-downloading the model on every
// "Track this set" tap would make the setup step feel broken.
export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(WASM_BASE_PATH).then((fileset) =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      }),
    );
  }
  return landmarkerPromise;
}

function visible(lm: NormalizedLandmark | undefined): lm is NormalizedLandmark {
  return !!lm && lm.visibility >= MIN_VISIBILITY;
}

// The tracker's "bar point" was always really a stand-in for whatever the
// athlete is moving -- the wrist midpoint is that same stand-in without
// needing a physical marker: for barbell/dumbbell lifts it tracks the
// implement almost exactly, and for bodyweight moves it still tracks the
// athlete's own path.
export function deriveBarPoint(
  landmarks: NormalizedLandmark[],
  frameWidth: number,
  frameHeight: number,
): { x: number; y: number } | null {
  const left = landmarks[POSE_LANDMARKS.LEFT_WRIST];
  const right = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
  const points = [left, right].filter(visible);
  if (points.length === 0) return null;
  const x = points.reduce((a, p) => a + p.x, 0) / points.length;
  const y = points.reduce((a, p) => a + p.y, 0) / points.length;
  return { x: x * frameWidth, y: y * frameHeight };
}

// Signed tilt of the wrist-to-wrist line from horizontal, in degrees -- 0 is
// level, positive means the right hand is lower than the left. This is the
// same idea as an oriented bounding box around the bar (its rotation angle
// relative to horizontal), but reuses landmarks we already track every
// frame instead of needing a separate rotated-object detector. Only
// meaningful when the hands are meaningfully apart horizontally (i.e. an
// actual barbell/handle grip), so returns null for single-arm work or any
// frame where the hands are stacked rather than spread on a bar.
export function computeBarTiltDegrees(landmarks: NormalizedLandmark[]): number | null {
  const left = landmarks[POSE_LANDMARKS.LEFT_WRIST];
  const right = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
  if (!visible(left) || !visible(right)) return null;
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  if (Math.abs(dx) < 0.05) return null;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

// Each wrist's own screen-space position, independent of deriveBarPoint's
// averaged midpoint -- lets the caller track left/right separately for an
// asymmetry view instead of only the combined bar path.
export function deriveWristPoints(
  landmarks: NormalizedLandmark[],
  frameWidth: number,
  frameHeight: number,
): { left: { x: number; y: number } | null; right: { x: number; y: number } | null } {
  const left = landmarks[POSE_LANDMARKS.LEFT_WRIST];
  const right = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
  return {
    left: visible(left) ? { x: left.x * frameWidth, y: left.y * frameHeight } : null,
    right: visible(right) ? { x: right.x * frameWidth, y: right.y * frameHeight } : null,
  };
}

// Angle in degrees at vertex `b`, given three normalized-space points.
function angleAtVertex(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.hypot(v1.x, v1.y);
  const mag2 = Math.hypot(v2.x, v2.y);
  if (mag1 === 0 || mag2 === 0) return 180;
  const cos = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

// Knee angle(s) visible in a single frame (0, 1, or 2 -- whichever legs are
// in frame), shared by detectFormFaults (aggregates across a whole set) and
// computeRepDepths (aggregates within one rep's time window).
function frameKneeAngles(lm: NormalizedLandmark[]): number[] {
  const angles: number[] = [];
  const lHip = lm[POSE_LANDMARKS.LEFT_HIP];
  const rHip = lm[POSE_LANDMARKS.RIGHT_HIP];
  const lKnee = lm[POSE_LANDMARKS.LEFT_KNEE];
  const rKnee = lm[POSE_LANDMARKS.RIGHT_KNEE];
  const lAnkle = lm[POSE_LANDMARKS.LEFT_ANKLE];
  const rAnkle = lm[POSE_LANDMARKS.RIGHT_ANKLE];
  if (visible(lHip) && visible(lKnee) && visible(lAnkle)) angles.push(angleAtVertex(lHip, lKnee, lAnkle));
  if (visible(rHip) && visible(rKnee) && visible(rAnkle)) angles.push(angleAtVertex(rHip, rKnee, rAnkle));
  return angles;
}

// Deepest (smallest) knee angle reached within each rep's time window --
// the per-rep companion to the set-wide "shallow_depth" fault, so depth
// consistency across a set (creeping shallower as fatigue sets in) is
// visible rep-by-rep instead of only as one worst-case flag for the set.
// Returns null for a rep where no leg was in frame for its whole window.
export function computeRepDepths(
  frames: PoseFrame[],
  repWindows: { startT: number; endT: number }[],
): (number | null)[] {
  return repWindows.map(({ startT, endT }) => {
    let minAngle: number | null = null;
    for (const frame of frames) {
      if (frame.t < startT || frame.t > endT) continue;
      for (const angle of frameKneeAngles(frame.landmarks)) {
        if (minAngle === null || angle < minAngle) minAngle = angle;
      }
    }
    return minAngle === null ? null : Math.round(minAngle);
  });
}

export type FormFault = {
  code: "shallow_depth" | "knee_valgus" | "forward_lean" | "bar_path_drift" | "bar_tilt";
  label: string;
};

// Heuristic biomechanics over a whole tracked set, not a single frame --
// these fire on the WORST point observed across the set (e.g. the most
// caved-in a knee got on any rep), so a single sloppy rep among five clean
// ones still gets flagged. Deliberately conservative: only checks that are
// broadly applicable (or explicitly gated off when the movement pattern
// doesn't apply) so this never nags about a fault that doesn't make sense
// for the exercise being tracked.
export function detectFormFaults(
  frames: PoseFrame[],
  barPathDeviationCm: number,
): FormFault[] {
  const faults: FormFault[] = [];
  if (frames.length < 6) return faults;

  const kneeAngles: number[] = [];
  const valgusRatios: number[] = [];
  const torsoAngles: number[] = [];
  const tiltAngles: number[] = [];

  for (const frame of frames) {
    const lm = frame.landmarks;
    const tilt = computeBarTiltDegrees(lm);
    if (tilt != null) tiltAngles.push(tilt);

    const lKnee = lm[POSE_LANDMARKS.LEFT_KNEE];
    const rKnee = lm[POSE_LANDMARKS.RIGHT_KNEE];
    const lAnkle = lm[POSE_LANDMARKS.LEFT_ANKLE];
    const rAnkle = lm[POSE_LANDMARKS.RIGHT_ANKLE];
    const lHip = lm[POSE_LANDMARKS.LEFT_HIP];
    const rHip = lm[POSE_LANDMARKS.RIGHT_HIP];
    const lShoulder = lm[POSE_LANDMARKS.LEFT_SHOULDER];
    const rShoulder = lm[POSE_LANDMARKS.RIGHT_SHOULDER];

    kneeAngles.push(...frameKneeAngles(lm));

    // Valgus proxy: knee width vs. ankle width -- a healthy squat keeps
    // knees tracking roughly over the ankles, so this ratio stays near 1;
    // it drops well below 1 when the knees cave inward past the ankles.
    if (visible(lKnee) && visible(rKnee) && visible(lAnkle) && visible(rAnkle)) {
      const kneeWidth = Math.abs(lKnee.x - rKnee.x);
      const ankleWidth = Math.abs(lAnkle.x - rAnkle.x);
      if (ankleWidth > 0.02) valgusRatios.push(kneeWidth / ankleWidth);
    }

    if (visible(lShoulder) && visible(rShoulder) && visible(lHip) && visible(rHip)) {
      const shoulderMid = { x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2 };
      const hipMid = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
      // Angle of the torso line from vertical (0deg = perfectly upright).
      const dx = shoulderMid.x - hipMid.x;
      const dy = shoulderMid.y - hipMid.y;
      torsoAngles.push((Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI);
    }
  }

  const minKneeAngle = kneeAngles.length ? Math.min(...kneeAngles) : 180;
  const kneeRangeOfMotion = kneeAngles.length ? Math.max(...kneeAngles) - minKneeAngle : 0;
  // Only a squat/lunge-pattern movement bends the knee this much -- skip
  // lower-body checks entirely for presses, rows, etc. where knees barely
  // move, so those never get a nonsensical "shallow depth" flag.
  const isKneeDrivenMovement = kneeRangeOfMotion > 25;

  if (isKneeDrivenMovement && minKneeAngle > 100) {
    faults.push({
      code: "shallow_depth",
      label: `Depth: knees only reached ~${Math.round(minKneeAngle)}° -- aim to break parallel`,
    });
  }

  if (isKneeDrivenMovement && valgusRatios.length) {
    const minValgusRatio = Math.min(...valgusRatios);
    if (minValgusRatio < 0.75) {
      faults.push({
        code: "knee_valgus",
        label: "Knees caved inward past the ankles on at least one rep",
      });
    }
  }

  if (isKneeDrivenMovement && torsoAngles.length) {
    const maxTorsoAngle = Math.max(...torsoAngles);
    if (maxTorsoAngle > 45) {
      faults.push({
        code: "forward_lean",
        label: `Excessive forward lean (~${Math.round(maxTorsoAngle)}° from vertical) at the bottom`,
      });
    }
  }

  if (barPathDeviationCm > 8) {
    faults.push({
      code: "bar_path_drift",
      label: `Bar drifted ${barPathDeviationCm}cm off a straight vertical line`,
    });
  }

  if (tiltAngles.length) {
    // Worst (largest-magnitude) tilt observed, keeping its sign so the
    // label can say which side was dropping.
    const worstTilt = tiltAngles.reduce((worst, t) => (Math.abs(t) > Math.abs(worst) ? t : worst), 0);
    if (Math.abs(worstTilt) > 7) {
      const side = worstTilt > 0 ? "right" : "left";
      faults.push({
        code: "bar_tilt",
        label: `Bar tilted ~${Math.round(Math.abs(worstTilt))}° (${side} side dropping)`,
      });
    }
  }

  return faults;
}

export type MovementPattern = "squat" | "deadlift" | "overhead_press" | "horizontal_press_or_row" | "unknown";

export type MovementGuess = { pattern: MovementPattern; label: string };

// Rule-based motion-signature guess from joint range-of-motion, not a
// trained classifier -- there's no labeled dataset or training pipeline
// here, just a handful of heuristics on top of landmarks we already have.
// Deliberately coarse (can't reliably tell a bench press from a row with a
// single camera and no idea which way it's pointed) and always shown as an
// informational guess/sanity-check, never used to silently relabel
// anything the athlete tracked.
export function guessMovementPattern(frames: PoseFrame[]): MovementGuess {
  if (frames.length < 6) return { pattern: "unknown", label: "Not enough motion to guess" };

  let kneeMin = 180;
  let kneeMax = 0;
  let torsoMax = 0;
  let wristYMin = 1;
  let wristYMax = 0;
  let wristAboveShoulderCount = 0;
  let wristSampleCount = 0;

  for (const frame of frames) {
    const lm = frame.landmarks;
    for (const angle of frameKneeAngles(lm)) {
      kneeMin = Math.min(kneeMin, angle);
      kneeMax = Math.max(kneeMax, angle);
    }

    const lShoulder = lm[POSE_LANDMARKS.LEFT_SHOULDER];
    const rShoulder = lm[POSE_LANDMARKS.RIGHT_SHOULDER];
    const lHip = lm[POSE_LANDMARKS.LEFT_HIP];
    const rHip = lm[POSE_LANDMARKS.RIGHT_HIP];
    if (visible(lShoulder) && visible(rShoulder) && visible(lHip) && visible(rHip)) {
      const shoulderMid = { x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2 };
      const hipMid = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
      const dx = shoulderMid.x - hipMid.x;
      const dy = shoulderMid.y - hipMid.y;
      torsoMax = Math.max(torsoMax, (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI);

      for (const w of [lm[POSE_LANDMARKS.LEFT_WRIST], lm[POSE_LANDMARKS.RIGHT_WRIST]]) {
        if (!visible(w)) continue;
        wristSampleCount += 1;
        wristYMin = Math.min(wristYMin, w.y);
        wristYMax = Math.max(wristYMax, w.y);
        if (w.y < shoulderMid.y) wristAboveShoulderCount += 1;
      }
    }
  }

  const kneeRangeOfMotion = kneeMax - kneeMin;
  const wristVerticalRange = wristYMax - wristYMin;
  const wristMostlyOverhead = wristSampleCount > 0 && wristAboveShoulderCount / wristSampleCount > 0.6;

  if (kneeRangeOfMotion > 30) {
    // Both fold the knees and hips substantially -- a deadlift keeps the
    // torso pitched forward well past a squat's comparatively upright depth.
    if (torsoMax > 40) return { pattern: "deadlift", label: "Deadlift" };
    return { pattern: "squat", label: "Squat" };
  }

  if (kneeRangeOfMotion < 15 && wristVerticalRange > 0.08) {
    if (wristMostlyOverhead) return { pattern: "overhead_press", label: "Overhead Press" };
    return { pattern: "horizontal_press_or_row", label: "Bench Press / Row" };
  }

  return { pattern: "unknown", label: "Couldn't guess a movement pattern" };
}
