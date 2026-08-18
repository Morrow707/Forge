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
import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { POSE_LANDMARKS, percentile } from "./pose-tracking";
import {
  DEFAULT_SKILL_FAULT_THRESHOLDS,
  type SkillFaultThresholds,
} from "@shared/skill-fault-thresholds";

export type SprintCheckpoint = {
  x: number;
  // Real-world distance from the PREVIOUS checkpoint to this one, in
  // yards -- required on every checkpoint except the first (nothing
  // precedes it, so there's no "segment" to give a distance). A straight
  // two-checkpoint sprint puts the whole distance on the second (and only)
  // checkpoint; a multi-checkpoint drill with direction reversals (a
  // 5-10-5 shuttle -- see SPRINT_PRESETS) gives each leg its own real
  // distance, since a reversal course doesn't cover equal ground each leg.
  segmentDistanceYards?: number;
};

export type SprintCalibration = {
  // In crossing order -- checkpoints[0] is the start line, the last entry
  // is the finish line. Two checkpoints is a straight-line sprint; more
  // support a multi-segment drill with direction reversals (see
  // checkpointDirection below, which computes direction PER SEGMENT rather
  // than once for the whole calibration -- a global direction, the prior
  // design, is wrong the moment a course doubles back on itself).
  checkpoints: SprintCheckpoint[];
};

export type SprintPoint = { t: number; x: number };

export type SprintSplit = {
  fromCheckpoint: number;
  toCheckpoint: number;
  elapsedSeconds: number;
  distanceYards: number;
};

export type SprintResult = {
  totalElapsedSeconds: number;
  totalDistanceYards: number;
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

// Direction of travel THROUGH checkpoint[index] -- the segment from the
// previous checkpoint to this one, except for checkpoint 0, which has no
// previous segment of its own: it borrows segment 0->1's direction, since
// crossing the start line happens in the same direction as the first leg
// that follows it.
function checkpointDirection(checkpoints: SprintCheckpoint[], index: number): 1 | -1 {
  const from = index === 0 ? 0 : index - 1;
  const to = index === 0 ? 1 : index;
  return checkpoints[to].x >= checkpoints[from].x ? 1 : -1;
}

// Finds the frame-to-frame crossing of each checkpoint's x-line, in order,
// interpolating sub-frame timing linearly between the two straddling
// frames. Direction is computed per segment (see checkpointDirection), not
// once for the whole run, so a course with direction reversals (a shuttle)
// works the same as a straight sprint -- each leg just needs its own two
// checkpoints crossed in order, whichever way that particular leg runs.
export function detectSprintCrossings(
  points: SprintPoint[],
  calibration: SprintCalibration,
): SprintResult | null {
  const checkpoints = calibration.checkpoints;
  if (checkpoints.length < 2 || points.length < 2) return null;
  if (checkpoints.slice(1).some((cp) => !cp.segmentDistanceYards || cp.segmentDistanceYards <= 0)) return null;

  let checkpointIdx = 0;
  const crossingTimes: number[] = [];
  for (let i = 1; i < points.length && checkpointIdx < checkpoints.length; i++) {
    const direction = checkpointDirection(checkpoints, checkpointIdx);
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
  let totalDistanceYards = 0;
  for (let i = 1; i < crossingTimes.length; i++) {
    const distanceYards = checkpoints[i].segmentDistanceYards ?? 0;
    totalDistanceYards += distanceYards;
    splits.push({
      fromCheckpoint: i - 1,
      toCheckpoint: i,
      elapsedSeconds: Math.round(((crossingTimes[i] - crossingTimes[i - 1]) / 1000) * 1000) / 1000,
      distanceYards,
    });
  }
  const totalElapsedSeconds =
    Math.round(((crossingTimes[crossingTimes.length - 1] - crossingTimes[0]) / 1000) * 1000) / 1000;
  if (totalElapsedSeconds <= 0) return null;

  return {
    totalElapsedSeconds,
    totalDistanceYards,
    splits,
    avgSpeedYardsPerSec: Math.round((totalDistanceYards / totalElapsedSeconds) * 100) / 100,
  };
}

// Named drill presets -- each gives its own checkpoint-tap count and, for a
// straight-line drill, the standard distance so the athlete doesn't have to
// type it. "custom" isn't listed here; it's just "manual distance entry,
// two checkpoints," the prior (and still supported) default behavior.
//
// tapCount is how many physical markers the athlete taps to calibrate --
// 2 for a straight sprint (start, finish), 3 for a 5-10-5 shuttle (center,
// right cone, left cone; the finish is the SAME physical spot as the
// start/center, so it isn't tapped a second time -- see
// checkpointsForShuttleTaps below).
export type SprintPreset = {
  id: string;
  label: string;
  tapCount: 2 | 3;
  // Only set for a straight-line (2-tap) preset -- a shuttle's distance is
  // fixed by its own segment structure (5+10+5), not a single number to
  // prefill.
  distanceYards?: number;
};

export const SPRINT_PRESETS: SprintPreset[] = [
  { id: "10yd", label: "10-yard split", tapCount: 2, distanceYards: 10 },
  { id: "20yd", label: "20-yard split", tapCount: 2, distanceYards: 20 },
  { id: "40yd", label: "40-yard dash", tapCount: 2, distanceYards: 40 },
  { id: "5-10-5", label: "5-10-5 shuttle", tapCount: 3 },
  { id: "custom", label: "Custom distance", tapCount: 2 },
];

// Builds the full 4-checkpoint calibration a 5-10-5 shuttle needs
// (start/center, right cone, left cone, finish/center again) from the 3
// physical taps the athlete actually makes -- center only gets tapped
// once, since the start and finish markers are the same physical spot.
// tapXs must be in tap order: [center, side A, side B]; which side is
// "right" vs "left" doesn't matter here, the crossing model only cares
// about each leg's own direction (see checkpointDirection), not
// screen-left/right labels.
export function checkpointsForShuttleTaps(tapXs: [number, number, number]): SprintCheckpoint[] {
  const [center, sideA, sideB] = tapXs;
  return [
    { x: center },
    { x: sideA, segmentDistanceYards: 5 },
    { x: sideB, segmentDistanceYards: 10 },
    { x: center, segmentDistanceYards: 5 },
  ];
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
//
// Front/behind view: lateral hip-height difference (normalized to hip
// width so it's scale-invariant) during single-leg stance phases --
// "hip drop" / contralateral pelvic drop, the same fault
// computeLegDriveAsymmetry already looks for in the strength tracker's
// squat/lunge context, applied here to the stance phase of a sprint
// stride instead of a squat rep.
//
// Both cutoffs are coach-adjustable (see shared/skill-fault-thresholds.ts)
// -- they started as fixed values picked from general sprint-coaching
// knowledge, not calibrated against any real athlete's data.
// Minimum real-world hip width (meters) for the front/behind hip-drop check
// to trust a frame's hip landmarks -- comfortably under any adult's true
// hip width (world landmarks track real anatomical scale regardless of
// camera angle, unlike an image-space projection, which is the whole
// reason this switched off normalized landmarks -- see below), so this only
// ever excludes a frame where both hip landmarks have collapsed onto
// (nearly) the same point from a tracking dropout.
const MIN_HIP_WIDTH_M = 0.1;

export function detectSprintFaults(
  frames: { landmarks: NormalizedLandmark[]; worldLandmarks: Landmark[] }[],
  cameraAngle: SprintCameraAngle,
  accelerationPhaseFraction = 1 / 3,
  thresholds: SkillFaultThresholds = DEFAULT_SKILL_FAULT_THRESHOLDS,
): SprintFault[] {
  const faults: SprintFault[] = [];
  if (frames.length < 4) return faults;

  if (cameraAngle === "side") {
    const accelFrameCount = Math.max(2, Math.round(frames.length * accelerationPhaseFraction));
    const leanAngles: number[] = [];
    for (const frame of frames.slice(0, accelFrameCount)) {
      const leftHip = frame.worldLandmarks[POSE_LANDMARKS.LEFT_HIP];
      const rightHip = frame.worldLandmarks[POSE_LANDMARKS.RIGHT_HIP];
      const leftShoulder = frame.worldLandmarks[POSE_LANDMARKS.LEFT_SHOULDER];
      const rightShoulder = frame.worldLandmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
      if (!leftHip || !rightHip || !leftShoulder || !rightShoulder) continue;
      // Real-world meters, not normalized image-space -- a normalized
      // frame's x and y axes are each independently divided by frame width
      // vs. height, so on portrait video (or with any camera tilt) an angle
      // computed by mixing the two comes out distorted. World landmarks
      // have no such distortion, same reasoning and same fix as
      // pose-tracking.ts's torso-lean/bar-tilt calculations. Unsigned via
      // acos(|dy|/magnitude) -- this direction doesn't need to know which
      // way world-Y's sign points, since flipping it only flips dy's sign,
      // never |dy|.
      const dx = (leftShoulder.x + rightShoulder.x) / 2 - (leftHip.x + rightHip.x) / 2;
      const dy = (leftShoulder.y + rightShoulder.y) / 2 - (leftHip.y + rightHip.y) / 2;
      const dz = (leftShoulder.z + rightShoulder.z) / 2 - (leftHip.z + rightHip.z) / 2;
      const magnitude = Math.hypot(dx, dy, dz);
      if (magnitude === 0) continue;
      leanAngles.push((Math.acos(Math.min(1, Math.abs(dy) / magnitude)) * 180) / Math.PI);
    }
    if (leanAngles.length > 0) {
      const avgLean = leanAngles.reduce((a, b) => a + b, 0) / leanAngles.length;
      if (avgLean < thresholds.minAccelerationLeanDeg) {
        faults.push({
          code: "upright_acceleration",
          label: "Running upright too early -- drive forward harder out of the start",
        });
      }
    }
  } else {
    const hipDropRatios: number[] = [];
    for (const frame of frames) {
      const leftHip = frame.worldLandmarks[POSE_LANDMARKS.LEFT_HIP];
      const rightHip = frame.worldLandmarks[POSE_LANDMARKS.RIGHT_HIP];
      if (!leftHip || !rightHip) continue;
      // Also switched to world landmarks: the ratio mixes a y-based
      // numerator with an x-based denominator, which is just as exposed to
      // the aspect-ratio distortion above as an explicit angle would be --
      // normalizing by hip width doesn't cancel it out, since width (x) and
      // drop (y) are each divided by a different, generally-unequal frame
      // dimension in image-space.
      const hipWidth = Math.abs(leftHip.x - rightHip.x);
      if (hipWidth < MIN_HIP_WIDTH_M) continue;
      hipDropRatios.push(Math.abs(leftHip.y - rightHip.y) / hipWidth);
    }
    if (hipDropRatios.length > 0) {
      // 95th percentile, not a raw max -- see percentile's own comment in
      // pose-tracking.ts. A single misdetected hip landmark (a stride's
      // occlusion moment, a tracking dropout) shouldn't get to single-
      // handedly flag an otherwise-clean sprint.
      const maxDrop = percentile(hipDropRatios, 0.95);
      if (maxDrop > thresholds.hipDropRatioThreshold) {
        faults.push({
          code: "hip_drop",
          label: "Hip drop during stance -- work on single-leg glute strength",
        });
      }
    }
  }

  return faults;
}
