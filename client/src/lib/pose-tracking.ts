// On-device body pose estimation for the camera tracker -- replaces the old
// colored-tape-marker centroid tracker with MediaPipe's PoseLandmarker
// (BlazePose, 33 landmarks), so nothing needs to be stuck on the bar
// anymore and the tracker gets a real skeleton instead of one blob.
// Runs entirely client-side (WASM/WebGL), same privacy story as before:
// only derived numbers ever leave the device, never video or frames.
import { FilesetResolver, PoseLandmarker, type Landmark, type NormalizedLandmark } from "@mediapipe/tasks-vision";

// Self-hosted (see scripts/copy-mediapipe-wasm.mjs) rather than pointed at a
// public CDN -- same-origin, no external dependency at runtime, and the PWA
// service worker can cache it like any other static asset.
const WASM_BASE_PATH = "/mediapipe-wasm";
// Google's own hosting for the model weights -- the "full" tier trades some
// latency for meaningfully better landmark accuracy than "lite", which is
// worth it here since every set is tracked live but scored afterward (no
// video-call-style real-time constraint), and accurate landmarks matter more
// than a few extra milliseconds per frame for velocity/ROM/depth numbers a
// coach will actually make decisions from.
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";

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

// landmarks (normalized image-space) still drive same-axis ratio checks
// (knee angle, valgus) -- an x-only or y-only comparison stays scale-
// invariant under 2D projection. Anything that measures an angle FROM
// VERTICAL by mixing an x-component with a y-component (torso lean, bar
// tilt, the squat/deadlift movement-pattern guess) needs worldLandmarks
// instead: a normalized image's x and y axes are each independently divided
// by frame width/height, so on any non-square video -- portrait phone video,
// essentially always -- that mismatched scaling bends the angle, and gets
// worse again with any camera tilt. worldLandmarks (real-world meters,
// hip-centered) sidestep that entirely, and also drive every absolute-
// distance metric (bar path, velocity, ROM, power) -- see deriveBarPoint et
// al. below.
export type PoseFrame = { t: number; landmarks: NormalizedLandmark[]; worldLandmarks: Landmark[] };

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

let roiLandmarkerPromise: Promise<PoseLandmarker> | null = null;

// A second, independent PoseLandmarker instance for roi-refine.ts's
// crop-and-re-detect pass -- deliberately NOT the same instance
// getPoseLandmarker returns. MediaPipe's VIDEO running mode keeps
// temporal tracking state per instance, assuming each detectForVideo call
// is the next frame of one continuous video; feeding the same instance a
// same-timestamp, spatially-unrelated cropped image between ordinary
// full-frame calls would confuse that state rather than just costing
// extra compute. A second instance costs roughly double the model's
// memory footprint, which is the real tradeoff for the sharper lower-body
// read roi-refine.ts uses it for.
export function getRoiPoseLandmarker(): Promise<PoseLandmarker> {
  if (!roiLandmarkerPromise) {
    roiLandmarkerPromise = FilesetResolver.forVisionTasks(WASM_BASE_PATH).then((fileset) =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      }),
    );
  }
  return roiLandmarkerPromise;
}

function visible<T extends { visibility: number }>(lm: T | undefined): lm is T {
  return !!lm && lm.visibility >= MIN_VISIBILITY;
}

export type WorldPoint = { x: number; y: number; z: number };

function averageWorldPoint(points: (Landmark | undefined)[]): WorldPoint | null {
  const visiblePoints = points.filter(visible);
  if (visiblePoints.length === 0) return null;
  return {
    x: visiblePoints.reduce((a, p) => a + p.x, 0) / visiblePoints.length,
    y: visiblePoints.reduce((a, p) => a + p.y, 0) / visiblePoints.length,
    z: visiblePoints.reduce((a, p) => a + p.z, 0) / visiblePoints.length,
  };
}

// The tracker's "bar point" was always really a stand-in for whatever the
// athlete is moving -- the wrist midpoint is that same stand-in without
// needing a physical marker: for barbell/dumbbell lifts it tracks the
// implement almost exactly, and for bodyweight moves it still tracks the
// athlete's own path. Real-world meters (hip-centered origin), not pixels --
// no frame dimensions needed and no calibration step to derive a
// pixels-per-meter scale factor first.
//
// requireBothWrists (only meaningful for a real shared two-handed implement
// -- see usesSharedBarEquipment) skips averaging-whatever's-visible when
// only one wrist clears MIN_VISIBILITY: a real bar is rigid, so both hands
// should read together or not at all, and briefly falling back to a single
// wrist mid-set (a head turn or the other arm dipping behind the torso, both
// common on a back squat) silently shifts the "bar point" by about half a
// shoulder width for those frames -- not real motion, but indistinguishable
// from it once it's in the trace, and exactly the kind of spurious jump
// bar-path-deviation's percentile stat can't tell apart from a genuinely
// bad rep. Returning null for those frames instead lets the caller's own
// occlusion-gap interpolation (see interpolateOcclusionGap) smooth over the
// brief dropout the same way it already does for a chalk cloud or an arm
// crossing the bar, rather than baking the jump into the trace. Left off by
// default so bodyweight/dumbbell/unilateral tracking keeps its existing,
// more forgiving fallback -- a real single-visible-wrist frame is common
// and legitimate there, not just tracking noise.
export function deriveBarPoint(worldLandmarks: Landmark[], requireBothWrists = false): WorldPoint | null {
  const left = worldLandmarks[POSE_LANDMARKS.LEFT_WRIST];
  const right = worldLandmarks[POSE_LANDMARKS.RIGHT_WRIST];
  if (requireBothWrists && !(visible(left) && visible(right))) return null;
  return averageWorldPoint([left, right]);
}

// Same wrist-midpoint concept as deriveBarPoint above, but in normalized
// [0,1] image-space rather than real-world meters -- for implement-tracking.ts's
// motion-diff scan, which works directly in downscaled pixel space and has
// no use for a metric coordinate. Mirrors the same requireBothWrists
// gating so the two stay consistent when called together on the same
// frame (see bar-tracker-dialog.tsx's usesSharedBar).
export function deriveNormalizedWristPoint(
  landmarks: NormalizedLandmark[],
  requireBothWrists = false,
): { x: number; y: number } | null {
  const left = landmarks[POSE_LANDMARKS.LEFT_WRIST];
  const right = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
  if (requireBothWrists && !(visible(left) && visible(right))) return null;
  const points = [left, right].filter(visible);
  if (points.length === 0) return null;
  return {
    x: points.reduce((a, p) => a + p.x, 0) / points.length,
    y: points.reduce((a, p) => a + p.y, 0) / points.length,
  };
}

// World landmarks' vertical axis isn't documented as matching (or opposing)
// normalized image-space landmarks' "y grows downward" convention, and there
// is no way to confirm it empirically without a live camera + real body in
// front of it. Rather than hard-code an assumption that could silently
// invert every velocity/height number, this derives the sign from the
// athlete's own skeleton each time it's confidently readable: shoulders are
// physically above hips in every rep of every exercise this feature tracks,
// so whichever sign makes shoulderY < hipY (matching the image-space
// convention every downstream formula in bar-tracking.ts/jump-tracking.ts
// already assumes) is correct for this device/model. Returns null when the
// shoulder/hip gap is too small to trust (e.g. bent fully over), so the
// caller should keep its last confident reading rather than latch onto noise.
export function worldVerticalSign(worldLandmarks: Landmark[]): 1 | -1 | null {
  const lShoulder = worldLandmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rShoulder = worldLandmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const lHip = worldLandmarks[POSE_LANDMARKS.LEFT_HIP];
  const rHip = worldLandmarks[POSE_LANDMARKS.RIGHT_HIP];
  if (!visible(lShoulder) || !visible(rShoulder) || !visible(lHip) || !visible(rHip)) return null;
  const shoulderY = (lShoulder.y + rShoulder.y) / 2;
  const hipY = (lHip.y + rHip.y) / 2;
  if (Math.abs(shoulderY - hipY) < 0.05) return null;
  return shoulderY < hipY ? 1 : -1;
}

// Minimum real-world hand separation (meters) for computeBarTiltDegrees to
// trust the pair as an actual two-handed bar grip rather than a misdetected/
// collapsed wrist pair -- comfortably under even a narrow bench-press grip,
// generously under a full-width squat/deadlift grip, for an average adult.
const MIN_BAR_GRIP_SEPARATION_M = 0.15;

// Signed tilt of the wrist-to-wrist LINE from horizontal, in degrees -- 0 is
// level, positive means the right hand is lower than the left. This is the
// same idea as an oriented bounding box around the bar (its rotation angle
// relative to horizontal), but reuses landmarks we already track every
// frame instead of needing a separate rotated-object detector. Only
// meaningful when the hands are meaningfully apart horizontally (i.e. an
// actual barbell/handle grip), so returns null for single-arm work or any
// frame where the hands are stacked rather than spread on a bar.
//
// Takes worldLandmarks (real-world meters), not normalized image-space --
// image-space x/y are each independently normalized by frame width/height,
// which on portrait video (or with any camera tilt) distorts an angle
// computed by mixing the two, the same bug that inflated torso lean above.
// World-space has no such distortion.
//
// Deliberately atan(dy/dx), not atan2(dy,dx): a line has no direction, only
// slope, so the sign of dx (which wrist happens to be further right) must
// not affect the magnitude. atan2 over the full vector is direction-
// sensitive -- whenever the anatomical right wrist sits at a smaller x than
// the left (the ordinary case facing the camera, since screen-left is the
// athlete's own right), it reports an angle near +/-180 for what is
// actually a nearly level bar. atan(dy/dx) always lands in (-90, 90),
// correctly describing slope regardless of which wrist is on which side.
// Magnitude doesn't need vertical-sign correction either -- atan is odd, so
// flipping dy's sign only flips the result's sign, never its magnitude.
//
// The sign DOES need correction, though: world Y's up/down convention is
// ambiguous per worldVerticalSign's own comment, so `verticalSign` (the
// caller's best current reading, from worldVerticalSign) is applied to dy
// first to bring it into the same "larger = lower" convention the rest of
// the codebase already assumes before reading off which wrist is lower.
export function computeBarTiltDegrees(worldLandmarks: Landmark[], verticalSign: 1 | -1): number | null {
  const left = worldLandmarks[POSE_LANDMARKS.LEFT_WRIST];
  const right = worldLandmarks[POSE_LANDMARKS.RIGHT_WRIST];
  if (!visible(left) || !visible(right)) return null;
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  if (Math.abs(dx) < MIN_BAR_GRIP_SEPARATION_M) return null;
  const magnitude = Math.abs((Math.atan(dy / dx) * 180) / Math.PI);
  const correctedDy = verticalSign * dy;
  if (correctedDy > 0) return magnitude;
  if (correctedDy < 0) return -magnitude;
  return 0;
}

// Enough coverage from head to ankle that the wrist/ankle point the tracker
// actually follows is reliably readable through a full rep -- deliberately
// not every one of the 33 landmarks (a foot slightly out of frame shouldn't
// block auto-start; see isFullBodyInFrame below).
const FULL_BODY_CHECKPOINTS = [
  POSE_LANDMARKS.NOSE,
  POSE_LANDMARKS.LEFT_SHOULDER,
  POSE_LANDMARKS.RIGHT_SHOULDER,
  POSE_LANDMARKS.LEFT_HIP,
  POSE_LANDMARKS.RIGHT_HIP,
  POSE_LANDMARKS.LEFT_KNEE,
  POSE_LANDMARKS.RIGHT_KNEE,
  POSE_LANDMARKS.LEFT_ANKLE,
  POSE_LANDMARKS.RIGHT_ANKLE,
];

// Whether a whole person is currently readable in frame -- the automatic
// half of what used to be a manual "does this look right?" check a second
// person had to make by looking at the screen (the athlete, mid-lift, can't
// look at their own phone). Driving auto-start off this instead means
// propping the phone up and walking into position is enough; nobody has to
// watch the preview or tap anything.
export function isFullBodyInFrame(landmarks: NormalizedLandmark[]): boolean {
  return FULL_BODY_CHECKPOINTS.every((i) => visible(landmarks[i]));
}

export type CameraAlignment = { aligned: boolean; reason: "ok" | "angled" | "unknown" };

// Whether the camera is roughly square to the athlete rather than shooting
// from an oblique angle -- an angled camera is the single biggest source of
// bad bar-path/velocity numbers this pipeline has no other way to correct
// for (parallax makes a straight bar path look like it drifted, and
// foreshortens real distance travelled, which throws off velocity and ROM
// together). Uses the world-landmark depth (z) gap between the two
// shoulders as a proxy: squared up to the camera, both shoulders sit at
// roughly the same distance from the lens; rotated even a modest amount,
// one shoulder measurably nears the camera while the other falls away.
// Compared against shoulder WIDTH (x), not an absolute distance, so this
// self-scales for however far back the athlete happens to be standing.
export function assessCameraAlignment(worldLandmarks: Landmark[]): CameraAlignment {
  const lShoulder = worldLandmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rShoulder = worldLandmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  if (!visible(lShoulder) || !visible(rShoulder)) return { aligned: false, reason: "unknown" };
  const shoulderWidth = Math.abs(lShoulder.x - rShoulder.x);
  if (shoulderWidth < 0.05) return { aligned: false, reason: "unknown" };
  const depthGap = Math.abs(lShoulder.z - rShoulder.z);
  return depthGap / shoulderWidth > 0.5 ? { aligned: false, reason: "angled" } : { aligned: true, reason: "ok" };
}

// The tracked point for "jump" mode -- the ankle midpoint rather than the
// wrist midpoint, since a jump has no implement to follow and the ankle
// joint is the cleanest ground-contact proxy available from the skeleton
// (it barely moves vertically until push-off, unlike the hip or knee,
// which shift throughout the crouch). See jump-tracking.ts for how this
// point's trace becomes flight time, height, and distance.
export function deriveJumpPoint(worldLandmarks: Landmark[]): WorldPoint | null {
  return averageWorldPoint([worldLandmarks[POSE_LANDMARKS.LEFT_ANKLE], worldLandmarks[POSE_LANDMARKS.RIGHT_ANKLE]]);
}

// Each wrist's own real-world position, independent of deriveBarPoint's
// averaged midpoint -- lets the caller track left/right separately for an
// asymmetry view instead of only the combined bar path.
export function deriveWristPoints(
  worldLandmarks: Landmark[],
): { left: WorldPoint | null; right: WorldPoint | null } {
  const left = worldLandmarks[POSE_LANDMARKS.LEFT_WRIST];
  const right = worldLandmarks[POSE_LANDMARKS.RIGHT_WRIST];
  return {
    left: visible(left) ? { x: left.x, y: left.y, z: left.z } : null,
    right: visible(right) ? { x: right.x, y: right.y, z: right.z } : null,
  };
}

// Angle in degrees at vertex `b`, given three normalized-space points.
// Exported for joint-angles.ts (the video-review angle tool) -- everything
// else in this file only ever needs the inside angle these callers already
// compute, but a manually-placed or tapped-joint angle measurement wants the
// exact same math the rest of the pipeline already trusts.
export function angleAtVertex(
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

// Nth percentile (0-1) of a numeric array -- used wherever a single
// misdetected frame could otherwise dominate a min/max reduction taken
// across many frames: a knee/hip/ankle triple briefly reading as nearly
// collinear, a torso or bar-tilt angle spiking for one bad frame. Unmoved
// by the one or two worst samples in an otherwise-clean rep/set, the same
// reasoning bar-tracking.ts's robustPeakSpeed and barPathDeviationCm
// already use for the equivalent position/velocity failure mode.
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[idx];
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
    const angles: number[] = [];
    for (const frame of frames) {
      if (frame.t < startT || frame.t > endT) continue;
      angles.push(...frameKneeAngles(frame.landmarks));
    }
    if (angles.length === 0) return null;
    // 5th percentile, not a raw min -- see percentile's own comment: a
    // single misdetected frame reading as a near-0deg knee angle isn't
    // real anatomy, and shouldn't get to define the whole rep's depth.
    return Math.round(percentile(angles, 0.05));
  });
}

// Knee angle(s) kept per-side rather than pooled -- the leg-drive-asymmetry
// companion to frameKneeAngles above, which deliberately discards which leg
// a given angle came from.
function frameKneeAnglesBySide(lm: NormalizedLandmark[]): { left: number | null; right: number | null } {
  const lHip = lm[POSE_LANDMARKS.LEFT_HIP];
  const rHip = lm[POSE_LANDMARKS.RIGHT_HIP];
  const lKnee = lm[POSE_LANDMARKS.LEFT_KNEE];
  const rKnee = lm[POSE_LANDMARKS.RIGHT_KNEE];
  const lAnkle = lm[POSE_LANDMARKS.LEFT_ANKLE];
  const rAnkle = lm[POSE_LANDMARKS.RIGHT_ANKLE];
  return {
    left: visible(lHip) && visible(lKnee) && visible(lAnkle) ? angleAtVertex(lHip, lKnee, lAnkle) : null,
    right: visible(rHip) && visible(rKnee) && visible(rAnkle) ? angleAtVertex(rHip, rKnee, rAnkle) : null,
  };
}

export type LegDriveAsymmetry = {
  leftDriveDegPerSec: number;
  rightDriveDegPerSec: number;
  asymmetryPercent: number;
  dominantSide: "left" | "right";
};

// A rep's drive phase needs at least this much clean per-side data to trust
// a rate off it -- a shorter window makes tiny pose-noise jitter look like a
// huge angular velocity.
const MIN_DRIVE_DURATION_SEC = 0.15;

// How much harder one leg drove than the other during each rep's concentric
// (standing-up) phase, for bilateral lower-body lifts -- reuses the same
// hip-knee-ankle angle computeRepDepths already tracks, but keeps left and
// right separate through the drive instead of pooling them, since a real
// strength imbalance shows up as one knee extending measurably faster than
// the other on the way up, not as a difference in how deep either one got.
// Each rep window is the same whole-rep {startT, endT} computeRepDepths
// takes; the concentric-only sub-window is found here by locating the
// window's deepest (pooled) knee angle and measuring drive from there to
// the window's end.
// Returns null for a rep without enough clean per-side data to trust a
// comparison -- same "no number beats a fake-confident one" stance as
// computeForceVelocityProfile.
export function computeLegDriveAsymmetry(
  frames: PoseFrame[],
  repWindows: { startT: number; endT: number }[],
): (LegDriveAsymmetry | null)[] {
  return repWindows.map(({ startT, endT }) => {
    const windowFrames = frames.filter((f) => f.t >= startT && f.t <= endT);
    if (windowFrames.length < 4) return null;

    let bottomIdx = 0;
    let bottomAngle = Infinity;
    windowFrames.forEach((frame, i) => {
      for (const angle of frameKneeAngles(frame.landmarks)) {
        if (angle < bottomAngle) {
          bottomAngle = angle;
          bottomIdx = i;
        }
      }
    });
    const driveFrames = windowFrames.slice(bottomIdx);

    const left: { t: number; angle: number }[] = [];
    const right: { t: number; angle: number }[] = [];
    for (const frame of driveFrames) {
      const sides = frameKneeAnglesBySide(frame.landmarks);
      if (sides.left != null) left.push({ t: frame.t, angle: sides.left });
      if (sides.right != null) right.push({ t: frame.t, angle: sides.right });
    }
    if (left.length < 3 || right.length < 3) return null;

    const leftDuration = left[left.length - 1].t - left[0].t;
    const rightDuration = right[right.length - 1].t - right[0].t;
    if (leftDuration < MIN_DRIVE_DURATION_SEC || rightDuration < MIN_DRIVE_DURATION_SEC) return null;

    const leftRate = (left[left.length - 1].angle - left[0].angle) / leftDuration;
    const rightRate = (right[right.length - 1].angle - right[0].angle) / rightDuration;
    // Only a genuine drive (knee opening up) on both sides is comparable --
    // a rate at or below zero means the window missed the concentric phase
    // (pose noise, mistimed rep boundary) rather than a real slow leg.
    if (leftRate <= 0 || rightRate <= 0) return null;

    const faster = Math.max(leftRate, rightRate);
    const slower = Math.min(leftRate, rightRate);
    return {
      leftDriveDegPerSec: Math.round(leftRate),
      rightDriveDegPerSec: Math.round(rightRate),
      asymmetryPercent: Math.round(((faster - slower) / faster) * 100),
      dominantSide: leftRate > rightRate ? "left" : "right",
    } satisfies LegDriveAsymmetry;
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
// The only movementType values (see exercises.movementType) a knee-angle
// fault ever makes sense for -- a Press, Pull, Push, Carry, etc. can jitter
// past the raw knee-ROM heuristic below from pose noise alone (especially
// lying on a bench, where the knee-angle estimate is least reliable) with
// the knees never actually doing anything, and a "knees caving in" flag on
// a bench press is just wrong regardless of what the numbers say.
const LOWER_BODY_MOVEMENT_TYPES = new Set(["Squat", "Hinge", "Lunge"]);

// "Tilt" and "drifted off a straight line" only describe something real when
// both hands share one rigid implement -- for anything else (dumbbells,
// bodyweight, bands, machines with independent handles) each hand moves on
// its own, so the wrist-midpoint math just reports normal independent arm
// motion as if it were a fault. Same Barbell/Trap Bar convention
// workout.tsx's usesPlateCalc already uses for "this has plates to load."
const SHARED_BAR_EQUIPMENT = new Set(["Barbell", "Trap Bar"]);

// Exported so callers (the live tilt overlay, the review screen's "Bar Path
// Deviation" vs. "Hand Path Deviation" label) can apply the same gate
// detectFormFaults uses below, without duplicating the equipment list.
export function usesSharedBarEquipment(equipment?: string | null): boolean {
  return !!equipment && SHARED_BAR_EQUIPMENT.has(equipment);
}

export function detectFormFaults(
  frames: PoseFrame[],
  barPathDeviationCm: number,
  // "jump" landings/crouches are a different judgment call than a squat's:
  // a shallow countermovement is normal (even correct) for a vertical
  // jump, and there's no bar to drift off a straight line -- horizontal
  // travel during a jump might just be an intentional broad jump. Valgus
  // and forward-lean still apply to a jump's landing mechanics, so those
  // stay on regardless of context.
  context: "lift" | "jump" = "lift",
  // The tracked exercise's movementType, when known -- the primary gate for
  // whether lower-body checks apply at all. Left undefined by any caller
  // that doesn't have it (falls back to the ROM heuristic alone, the prior
  // behavior) rather than required, so this can be threaded through
  // gradually without breaking existing callers.
  movementType?: string | null,
  // The tracked exercise's equipment string, when known -- gates tilt/
  // path-drift off entirely for non-barbell equipment (see
  // SHARED_BAR_EQUIPMENT above). Left undefined by any caller that doesn't
  // have it, same gradual-threading reasoning as movementType.
  equipment?: string | null,
): FormFault[] {
  const faults: FormFault[] = [];
  if (frames.length < 6) return faults;

  const usesSharedBar = context === "lift" && usesSharedBarEquipment(equipment);

  const kneeAngles: number[] = [];
  const valgusRatios: number[] = [];
  const torsoAngles: number[] = [];
  const tiltAngles: number[] = [];

  // Best current reading of which way world-Y points "up" -- refined every
  // frame it can be (see worldVerticalSign), held from the last confident
  // frame otherwise, same pattern bar-tracker-dialog.tsx's verticalSignRef
  // uses live. Only bar tilt's sign needs this; torso lean below is
  // unsigned and doesn't care which way world-Y points.
  let currentVerticalSign: 1 | -1 = 1;

  for (const frame of frames) {
    const lm = frame.landmarks;
    const worldLm = frame.worldLandmarks;
    const sign = worldVerticalSign(worldLm);
    if (sign != null) currentVerticalSign = sign;

    if (usesSharedBar) {
      const tilt = computeBarTiltDegrees(worldLm, currentVerticalSign);
      if (tilt != null) tiltAngles.push(tilt);
    }

    const lKnee = lm[POSE_LANDMARKS.LEFT_KNEE];
    const rKnee = lm[POSE_LANDMARKS.RIGHT_KNEE];
    const lAnkle = lm[POSE_LANDMARKS.LEFT_ANKLE];
    const rAnkle = lm[POSE_LANDMARKS.RIGHT_ANKLE];

    kneeAngles.push(...frameKneeAngles(lm));

    // Valgus proxy: knee width vs. ankle width -- a healthy squat keeps
    // knees tracking roughly over the ankles, so this ratio stays near 1;
    // it drops well below 1 when the knees cave inward past the ankles.
    if (visible(lKnee) && visible(rKnee) && visible(lAnkle) && visible(rAnkle)) {
      const kneeWidth = Math.abs(lKnee.x - rKnee.x);
      const ankleWidth = Math.abs(lAnkle.x - rAnkle.x);
      if (ankleWidth > 0.02) valgusRatios.push(kneeWidth / ankleWidth);
    }

    // Torso lean from vertical, in real-world meters (see the PoseFrame
    // comment up top for why this can't be done in image-space). Unsigned
    // and computed via acos(|dy|/magnitude) rather than atan2 -- this needs
    // no vertical-sign correction at all, since flipping world-Y's sign
    // flips dy's sign but not |dy|, and magnitude (a plain 3D distance) is
    // sign-independent by construction.
    const lShoulder3d = worldLm[POSE_LANDMARKS.LEFT_SHOULDER];
    const rShoulder3d = worldLm[POSE_LANDMARKS.RIGHT_SHOULDER];
    const lHip3d = worldLm[POSE_LANDMARKS.LEFT_HIP];
    const rHip3d = worldLm[POSE_LANDMARKS.RIGHT_HIP];
    if (visible(lShoulder3d) && visible(rShoulder3d) && visible(lHip3d) && visible(rHip3d)) {
      const dx = (lShoulder3d.x + rShoulder3d.x) / 2 - (lHip3d.x + rHip3d.x) / 2;
      const dy = (lShoulder3d.y + rShoulder3d.y) / 2 - (lHip3d.y + rHip3d.y) / 2;
      const dz = (lShoulder3d.z + rShoulder3d.z) / 2 - (lHip3d.z + rHip3d.z) / 2;
      const magnitude = Math.hypot(dx, dy, dz);
      if (magnitude > 0) {
        torsoAngles.push((Math.acos(Math.min(1, Math.abs(dy) / magnitude)) * 180) / Math.PI);
      }
    }
  }

  // 5th/95th percentile rather than raw min/max -- see percentile's own
  // comment: a single misdetected frame shouldn't get to set the reported
  // depth or ROM for the whole set.
  const minKneeAngle = kneeAngles.length ? percentile(kneeAngles, 0.05) : 180;
  const kneeRangeOfMotion = kneeAngles.length ? percentile(kneeAngles, 0.95) - minKneeAngle : 0;
  // Only a squat/hinge/lunge-pattern movement bends the knee this much --
  // skip lower-body checks entirely for presses, rows, etc. where knees
  // barely move, so those never get a nonsensical "shallow depth" flag.
  // When movementType is known, it's the hard gate (a Press never gets a
  // knee fault no matter how noisy the angle estimate got); the ROM check
  // alone is only a fallback for callers that don't have movementType yet.
  const romSuggestsKneeDriven = kneeRangeOfMotion > 25;
  const isKneeDrivenMovement =
    movementType != null
      ? LOWER_BODY_MOVEMENT_TYPES.has(movementType) && romSuggestsKneeDriven
      : romSuggestsKneeDriven;

  if (context === "lift" && isKneeDrivenMovement && minKneeAngle > 100) {
    faults.push({
      code: "shallow_depth",
      label: `Depth: knees only reached ~${Math.round(minKneeAngle)}° -- aim to break parallel`,
    });
  }

  if (isKneeDrivenMovement && valgusRatios.length) {
    const minValgusRatio = percentile(valgusRatios, 0.05);
    if (minValgusRatio < 0.75) {
      faults.push({
        code: "knee_valgus",
        label: "Knees caved inward past the ankles on at least one rep",
      });
    }
  }

  if (isKneeDrivenMovement && torsoAngles.length) {
    const maxTorsoAngle = percentile(torsoAngles, 0.95);
    if (maxTorsoAngle > 45) {
      faults.push({
        code: "forward_lean",
        label: `Excessive forward lean (~${Math.round(maxTorsoAngle)}° from vertical) at the bottom`,
      });
    }
  }

  if (usesSharedBar && barPathDeviationCm > 8) {
    faults.push({
      code: "bar_path_drift",
      label: `Bar drifted ${barPathDeviationCm}cm off a straight vertical line`,
    });
  }

  if (tiltAngles.length) {
    // 95th percentile of |tilt|, not a raw max -- see percentile's own
    // comment. Sign comes from the first sample that reaches this robust
    // magnitude, so the label still says which side was actually dropping.
    const worstMagnitude = percentile(
      tiltAngles.map((t) => Math.abs(t)),
      0.95,
    );
    const worstTilt = tiltAngles.find((t) => Math.abs(t) >= worstMagnitude) ?? 0;
    if (Math.abs(worstTilt) > 7) {
      const side = worstTilt > 0 ? "right" : "left";
      faults.push({
        code: "bar_tilt",
        label: `Bar tilted ~${Math.round(Math.abs(worstTilt))}° toward the ${side} arm`,
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
  const torsoAngles: number[] = [];
  let wristYMin = 1;
  let wristYMax = 0;
  let wristAboveShoulderCount = 0;
  let wristSampleCount = 0;

  for (const frame of frames) {
    const lm = frame.landmarks;
    const worldLm = frame.worldLandmarks;
    for (const angle of frameKneeAngles(lm)) {
      kneeMin = Math.min(kneeMin, angle);
      kneeMax = Math.max(kneeMax, angle);
    }

    // Wrist-vs-shoulder height stays in image-space -- it's a same-axis (y
    // vs y) comparison within one frame, not an angle, so it isn't subject
    // to the aspect-ratio distortion torso lean below has to avoid.
    const lShoulder = lm[POSE_LANDMARKS.LEFT_SHOULDER];
    const rShoulder = lm[POSE_LANDMARKS.RIGHT_SHOULDER];
    if (visible(lShoulder) && visible(rShoulder)) {
      const shoulderMidY = (lShoulder.y + rShoulder.y) / 2;
      for (const w of [lm[POSE_LANDMARKS.LEFT_WRIST], lm[POSE_LANDMARKS.RIGHT_WRIST]]) {
        if (!visible(w)) continue;
        wristSampleCount += 1;
        wristYMin = Math.min(wristYMin, w.y);
        wristYMax = Math.max(wristYMax, w.y);
        if (w.y < shoulderMidY) wristAboveShoulderCount += 1;
      }
    }

    // Torso lean from vertical, in real-world meters -- same world-space,
    // unsigned acos(|dy|/magnitude) approach as detectFormFaults uses, and
    // for the same reason (image-space atan2 here is what previously
    // misread an upright squat as a deadlift-steep torso angle).
    const lShoulder3d = worldLm[POSE_LANDMARKS.LEFT_SHOULDER];
    const rShoulder3d = worldLm[POSE_LANDMARKS.RIGHT_SHOULDER];
    const lHip3d = worldLm[POSE_LANDMARKS.LEFT_HIP];
    const rHip3d = worldLm[POSE_LANDMARKS.RIGHT_HIP];
    if (visible(lShoulder3d) && visible(rShoulder3d) && visible(lHip3d) && visible(rHip3d)) {
      const dx = (lShoulder3d.x + rShoulder3d.x) / 2 - (lHip3d.x + rHip3d.x) / 2;
      const dy = (lShoulder3d.y + rShoulder3d.y) / 2 - (lHip3d.y + rHip3d.y) / 2;
      const dz = (lShoulder3d.z + rShoulder3d.z) / 2 - (lHip3d.z + rHip3d.z) / 2;
      const magnitude = Math.hypot(dx, dy, dz);
      if (magnitude > 0) {
        torsoAngles.push((Math.acos(Math.min(1, Math.abs(dy) / magnitude)) * 180) / Math.PI);
      }
    }
  }

  const kneeRangeOfMotion = kneeMax - kneeMin;
  const wristVerticalRange = wristYMax - wristYMin;
  const wristMostlyOverhead = wristSampleCount > 0 && wristAboveShoulderCount / wristSampleCount > 0.6;
  // 95th percentile, not a raw max -- see percentile's own comment: a
  // single misdetected frame shouldn't get to decide "deadlift" vs. "squat"
  // for the whole set.
  const torsoMax = torsoAngles.length ? percentile(torsoAngles, 0.95) : 0;

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
