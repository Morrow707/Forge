// Sprint/agility timing for the Skills camera tracker. Deliberately not
// built on the same continuous world-space position tracking as
// bar-tracking.ts/jump-tracking.ts: MediaPipe's worldLandmarks are
// hip-centered per frame (real-world scale of the athlete's own body, not
// of the field), so they can't tell you how far someone has traveled down
// a track. A sprint only needs two or more discrete events -- "crossed the
// start line," "crossed the finish line" -- which is a much more tractable
// problem than continuous distance tracking: track a single reference
// point's normalized screen-x position over time, and detect the frame
// where it crosses each checkpoint's screen-x position. The real-world
// distance between checkpoints comes from the coach (marker/known-distance
// calibration), not from the camera.
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { POSE_LANDMARKS } from "./pose-tracking";

export type SprintCheckpoint = { x: number };

export type SprintCalibration = {
  // In crossing order -- checkpoints[0] is the start line, the last entry
  // is the finish line. Two checkpoints is the common case (straight-line
  // sprint); more support future multi-segment/shuttle splits.
  checkpoints: SprintCheckpoint[];
  distanceYards: number;
};

export type SprintPoint = { t: number; x: number };

export type SprintSplit = {
  fromCheckpoint: number;
  toCheckpoint: number;
  elapsedSeconds: number;
};

export type SprintResult = {
  totalElapsedSeconds: number;
  splits: SprintSplit[];
  avgSpeedYardsPerSec: number;
};

// Hip midpoint in normalized (0-1) image space -- a stable single reference
// point for tracking horizontal position across a sprint, the same way the
// exercise tracker uses wrist/ankle midpoints for their respective modes.
export function deriveSprintReferencePoint(landmarks: NormalizedLandmark[]): { x: number } | null {
  const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
  if (!leftHip || !rightHip) return null;
  if ((leftHip.visibility ?? 1) < 0.4 || (rightHip.visibility ?? 1) < 0.4) return null;
  return { x: (leftHip.x + rightHip.x) / 2 };
}

// Finds the frame-to-frame crossing of each checkpoint's x-line, in order,
// interpolating sub-frame timing linearly between the two straddling
// frames. Direction (increasing vs decreasing x) is inferred from the
// checkpoints' own order, so a run in either screen direction works as
// long as the coach marked start-then-finish in that order.
export function detectSprintCrossings(
  points: SprintPoint[],
  calibration: SprintCalibration,
): SprintResult | null {
  const checkpoints = calibration.checkpoints;
  if (checkpoints.length < 2 || points.length < 2) return null;
  const direction = checkpoints[checkpoints.length - 1].x >= checkpoints[0].x ? 1 : -1;

  let checkpointIdx = 0;
  const crossingTimes: number[] = [];
  for (let i = 1; i < points.length && checkpointIdx < checkpoints.length; i++) {
    const targetX = checkpoints[checkpointIdx].x;
    const prev = points[i - 1];
    const curr = points[i];
    const crossed =
      direction === 1 ? prev.x < targetX && curr.x >= targetX : prev.x > targetX && curr.x <= targetX;
    if (crossed) {
      const span = curr.x - prev.x;
      const frac = span !== 0 ? (targetX - prev.x) / span : 0;
      crossingTimes.push(prev.t + frac * (curr.t - prev.t));
      checkpointIdx++;
    }
  }
  if (crossingTimes.length < 2) return null;

  const splits: SprintSplit[] = [];
  for (let i = 1; i < crossingTimes.length; i++) {
    splits.push({
      fromCheckpoint: i - 1,
      toCheckpoint: i,
      elapsedSeconds: Math.round(((crossingTimes[i] - crossingTimes[i - 1]) / 1000) * 1000) / 1000,
    });
  }
  const totalElapsedSeconds =
    Math.round(((crossingTimes[crossingTimes.length - 1] - crossingTimes[0]) / 1000) * 1000) / 1000;
  if (totalElapsedSeconds <= 0) return null;

  return {
    totalElapsedSeconds,
    splits,
    avgSpeedYardsPerSec: Math.round((calibration.distanceYards / totalElapsedSeconds) * 100) / 100,
  };
}

export type SprintFault = { code: string; label: string };

// Which faults are even measurable depends entirely on camera angle -- this
// is the concrete backing for the mandatory angle warning shown before
// every capture (see SprintTrackerDialog): side view sees forward lean,
// front/behind view sees hip drop, and each view is blind to the other's
// fault.
export type SprintCameraAngle = "side" | "front_behind";

// Side view: forward lean angle (hip-to-shoulder line vs. vertical) during
// the first third of the sprint, i.e. the acceleration phase. Insufficient
// forward lean during acceleration -- running too upright too early -- is
// one of the most common and most coachable sprint-mechanics faults, well
// established in sprint coaching (e.g. the standard "45-degree drive
// phase" cue). This flags the opposite failure mode (too upright), not
// "too much lean," since excessive lean is comparatively rare and much
// harder to define a safe threshold for without a controlled setup.
const MIN_ACCELERATION_LEAN_DEGREES = 12;

// Front/behind view: lateral hip-height difference (normalized to hip
// width so it's scale-invariant) during single-leg stance phases --
// "hip drop" / contralateral pelvic drop, the same fault
// computeLegDriveAsymmetry already looks for in the strength tracker's
// squat/lunge context, applied here to the stance phase of a sprint
// stride instead of a squat rep.
const HIP_DROP_RATIO_THRESHOLD = 0.12;

export function detectSprintFaults(
  frames: { landmarks: NormalizedLandmark[] }[],
  cameraAngle: SprintCameraAngle,
  accelerationPhaseFraction = 1 / 3,
): SprintFault[] {
  const faults: SprintFault[] = [];
  if (frames.length < 4) return faults;

  if (cameraAngle === "side") {
    const accelFrameCount = Math.max(2, Math.round(frames.length * accelerationPhaseFraction));
    const leanAngles: number[] = [];
    for (const frame of frames.slice(0, accelFrameCount)) {
      const leftHip = frame.landmarks[POSE_LANDMARKS.LEFT_HIP];
      const rightHip = frame.landmarks[POSE_LANDMARKS.RIGHT_HIP];
      const leftShoulder = frame.landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
      const rightShoulder = frame.landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
      if (!leftHip || !rightHip || !leftShoulder || !rightShoulder) continue;
      const hipX = (leftHip.x + rightHip.x) / 2;
      const hipY = (leftHip.y + rightHip.y) / 2;
      const shoulderX = (leftShoulder.x + rightShoulder.x) / 2;
      const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
      // Image y grows downward, so a torso leaning "forward" (in either
      // screen direction) has a nonzero horizontal offset between hip and
      // shoulder relative to their vertical separation -- atan2 of that
      // ratio gives degrees from vertical regardless of which way the
      // athlete is running across the frame.
      const dx = Math.abs(shoulderX - hipX);
      const dy = Math.abs(hipY - shoulderY);
      if (dy === 0) continue;
      leanAngles.push((Math.atan2(dx, dy) * 180) / Math.PI);
    }
    if (leanAngles.length > 0) {
      const avgLean = leanAngles.reduce((a, b) => a + b, 0) / leanAngles.length;
      if (avgLean < MIN_ACCELERATION_LEAN_DEGREES) {
        faults.push({
          code: "upright_acceleration",
          label: "Running upright too early -- drive forward harder out of the start",
        });
      }
    }
  } else {
    const hipDropRatios: number[] = [];
    for (const frame of frames) {
      const leftHip = frame.landmarks[POSE_LANDMARKS.LEFT_HIP];
      const rightHip = frame.landmarks[POSE_LANDMARKS.RIGHT_HIP];
      if (!leftHip || !rightHip) continue;
      const hipWidth = Math.abs(leftHip.x - rightHip.x);
      if (hipWidth < 0.02) continue;
      hipDropRatios.push(Math.abs(leftHip.y - rightHip.y) / hipWidth);
    }
    if (hipDropRatios.length > 0) {
      const maxDrop = Math.max(...hipDropRatios);
      if (maxDrop > HIP_DROP_RATIO_THRESHOLD) {
        faults.push({
          code: "hip_drop",
          label: "Hip drop during stance -- work on single-leg glute strength",
        });
      }
    }
  }

  return faults;
}
