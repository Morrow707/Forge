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
import { POSE_LANDMARKS, MIN_VISIBILITY, percentile, visible } from "./pose-tracking";
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
  // How many same-direction crossings of this checkpoint's line to ignore
  // before counting one as the real event. Unset/0 means "the first
  // matching crossing is the real one" -- true for every straight sprint
  // and the 5-10-5 shuttle. Needed for a drill whose start and finish are
  // the SAME physical line and whose middle sends the reference point back
  // past that line, in the finish direction, before the real finish (a
  // 3-cone/L-drill: explode off the line, later return to touch it, then
  // sprint back OUT toward the far cone a second time -- past the same
  // line, same direction as the true finish -- before finally sprinting
  // through it for real). See checkpointsForThreeConeTap.
  skipCrossings?: number;
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
  // True when this result (or any one split within it) implies a speed no
  // human has ever run -- almost always a checkpoint-crossing glitch (a
  // false detection, a reference-point jump), not a real time. Flagged, not
  // rejected outright: same "warn, don't silently decide" precedent as
  // jump-tracking.ts's likelyTrackingGlitch, since this function runs fresh
  // on every live-capture frame (see detectSprintCrossings' callers) --
  // returning null here instead of a flagged result risks the same
  // corrupted early points producing the same rejected crossing forever,
  // silently hanging the capture with no feedback. A flagged-but-visible
  // result the athlete can see and choose to retake is strictly better than
  // a capture that never finishes.
  likelyGlitch: boolean;
  // True when fewer checkpoints were crossed than the drill defines -- the athlete stopped
  // short, cut a cone, or the reference point was lost on a later leg.
  //
  // The arithmetic is still self-consistent when this is set: totalDistanceYards only sums the
  // legs that were actually detected, so the speed is right for the ground covered. The problem
  // is what it is CALLED. A 5-10-5 whose two return legs never registered was reported as a
  // finished 5-10-5 carrying one split, and there is no way to tell that from a real one by
  // looking at the number. Flagged rather than rejected, same reasoning as likelyGlitch above.
  incompleteDrill: boolean;
  crossingsFound: number;
  crossingsExpected: number;
  // Wall-clock gap, in ms, between the two frames each checkpoint crossing
  // was interpolated between -- one entry per crossing, in crossing order.
  // The crossing instant is only ever known to within this gap, so the
  // worst one against the measured elapsed time is a real precision bound
  // on the whole result rather than a heuristic: a 33ms straddle on a 5.2s
  // 40 is nothing, the same 33ms on a 0.4s split is 8%. Feeds
  // capture-trust.ts's crossingTrustScore (ARC-1); nothing else reads it,
  // and a manually-scrubbed result has none (see the dialogs' own manual
  // fallback, which is timed by eye, not by frame).
  crossingFrameGapsMs: number[];
};

// Usain Bolt's peak instantaneous speed (~12.4 m/s) is the fastest speed
// any human has ever been recorded moving under their own power. This is
// set well above that -- generous the same way bar-tracking.ts's own
// physical ceilings are generous -- so it only ever catches a genuine
// tracking glitch (a checkpoint falsely detected a frame or two off,
// producing a near-zero elapsed time for real ground covered), never a
// real elite sprint. Untuned against real footage (this sandbox has no
// camera to test against) -- same caveat as every other plausibility
// ceiling in this app.
export const MAX_PLAUSIBLE_SPRINT_SPEED_YARDS_PER_SEC = 15;

// Hip midpoint in normalized (0-1) image space -- a stable single reference
// point for tracking horizontal position across a sprint, the same way the
// exercise tracker uses wrist/ankle midpoints for their respective modes.
export function deriveSprintReferencePoint(landmarks: NormalizedLandmark[]): { x: number } | null {
  const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
  if (!leftHip || !rightHip) return null;
  // MIN_VISIBILITY, not a locally-hardcoded threshold -- this used to be
  // its own 0.4 cutoff, inconsistent with the 0.5 bar-tracking, jump-
  // tracking, mechanics-tracking, and rotation-tracking all use for the
  // identical "trust this frame's landmark" judgment call, with no comment
  // explaining the divergence. A less-strict bar here meant a sprint's
  // checkpoint-crossing reference point could trust a shakier hip reading
  // than every other tracker in the app would.
  if ((leftHip.visibility ?? 1) < MIN_VISIBILITY || (rightHip.visibility ?? 1) < MIN_VISIBILITY) return null;
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
  let skipRemaining = checkpoints[0]?.skipCrossings ?? 0;
  const crossingTimes: number[] = [];
  // Positionally aligned with crossingTimes -- see SprintResult's own field comment.
  const crossingFrameGapsMs: number[] = [];
  for (let i = 1; i < points.length && checkpointIdx < checkpoints.length; i++) {
    const direction = checkpointDirection(checkpoints, checkpointIdx);
    const targetX = checkpoints[checkpointIdx].x;
    const prev = points[i - 1];
    const curr = points[i];
    const crossed =
      direction === 1 ? prev.x < targetX && curr.x >= targetX : prev.x > targetX && curr.x <= targetX;
    if (crossed) {
      if (skipRemaining > 0) {
        skipRemaining--;
        continue;
      }
      const span = curr.x - prev.x;
      const frac = span !== 0 ? (targetX - prev.x) / span : 0;
      crossingTimes.push(prev.t + frac * (curr.t - prev.t));
      crossingFrameGapsMs.push(curr.t - prev.t);
      checkpointIdx++;
      skipRemaining = checkpoints[checkpointIdx]?.skipCrossings ?? 0;
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

  const avgSpeedYardsPerSec = Math.round((totalDistanceYards / totalElapsedSeconds) * 100) / 100;
  const incompleteDrill = crossingTimes.length < checkpoints.length;
  // Checked against the whole run AND each individual split -- a shuttle or
  // 3-cone drill's overall average can look reasonable while one glitched
  // leg (a checkpoint crossed a frame too early) is individually impossible.
  const likelyGlitch =
    avgSpeedYardsPerSec > MAX_PLAUSIBLE_SPRINT_SPEED_YARDS_PER_SEC ||
    splits.some(
      (s) => s.elapsedSeconds > 0 && s.distanceYards / s.elapsedSeconds > MAX_PLAUSIBLE_SPRINT_SPEED_YARDS_PER_SEC,
    );

  return {
    totalElapsedSeconds,
    totalDistanceYards,
    splits,
    avgSpeedYardsPerSec,
    likelyGlitch,
    incompleteDrill,
    crossingsFound: crossingTimes.length,
    crossingsExpected: checkpoints.length,
    crossingFrameGapsMs,
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
  tapCount: 1 | 2 | 3;
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
  { id: "3-cone", label: "3-cone drill", tapCount: 1 },
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

// Builds the 2-checkpoint calibration a 3-cone/L-drill needs from the
// single physical tap the athlete makes -- start and finish are the SAME
// physical line (the athlete explodes off it, then sprints back through it
// at the very end), so there's only one marker to tap, unlike the 5-10-5
// shuttle's three distinct cones. The finish checkpoint skips the first
// same-direction crossing of that line (see SprintCheckpoint.skipCrossings)
// since the drill's middle also sends the athlete back out past the start
// line -- toward the far cone a second time -- before the real finish.
// segmentDistanceYards is an approximate total path length (5 + 5 out-and-
// back, plus the two diagonal legs around the L), not a precise number --
// the elapsed time is the headline figure here, the same way a combine
// table reports 3-cone as a single time, never a pace.
export function checkpointsForThreeConeTap(tapX: number): SprintCheckpoint[] {
  return [{ x: tapX }, { x: tapX, segmentDistanceYards: 30, skipCrossings: 1 }];
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
      if (!visible(leftHip) || !visible(rightHip) || !visible(leftShoulder) || !visible(rightShoulder)) continue;
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
      if (!visible(leftHip) || !visible(rightHip)) continue;
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
