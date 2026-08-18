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

export const MIN_VISIBILITY = 0.5;

// Stricter than MIN_VISIBILITY above -- used only by isFullBodyInFrame's
// "is anyone actually here" gate, not by anything mid-tracking. Getting
// this gate wrong is worse than getting a mid-rep confidence check wrong:
// a real athlete briefly losing a landmark to occlusion just means one
// noisier frame, but a false "yes, a person is in frame" on an empty rack
// (a rack's hanging bands/straps and other loosely humanoid-shaped gym
// clutter can accidentally clear a lower bar) starts a whole set on
// nothing, so the presence check alone gets held to a tighter standard.
const PRESENCE_MIN_VISIBILITY = 0.75;

// landmarks (normalized image-space) still drive same-axis ratio checks
// (valgus: knee width over ankle width, both x-only) -- an x-only or y-only
// comparison stays scale-invariant under 2D projection. Anything that
// measures an actual angle -- a joint's inside angle (knee, elbow, hip...),
// or an angle FROM VERTICAL (torso lean, bar tilt, the squat/deadlift
// movement-pattern guess) -- mixes an x-component with a y-component, and
// needs worldLandmarks instead: a normalized image's x and y axes are each
// independently divided by frame width/height, so on any non-square video
// -- portrait phone video, essentially always -- that mismatched scaling
// bends the angle, and gets worse again with any camera tilt.
// worldLandmarks (real-world meters, hip-centered) sidestep that entirely,
// and also drive every absolute-distance metric (bar path, velocity, ROM,
// power) -- see deriveBarPoint et al. below.
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

let offlineLandmarkerPromise: Promise<PoseLandmarker> | null = null;

// A third, independent PoseLandmarker instance for video-pose-analysis.ts's
// offline analyzeVideoPose() pass -- same "never share state with a live
// tracker" reasoning as getRoiPoseLandmarker() above, for a different
// cross-talk hazard this time: analyzeVideoPose() has no cancellation tied
// to VideoAnalysisDialog's lifecycle, so closing that dialog before its
// several-second analysis finishes leaves the pass running in the
// background, still feeding whatever instance it holds. If that were the
// SAME instance a live tracker's tick() loop started moments later is
// feeding real performance.now() timestamps to, the two unsynchronized
// sequences (live: real wall-clock time; offline: clip-relative time
// seeded once at analysis start) can interleave out of order --
// MediaPipe's VIDEO mode rejects any call whose timestamp doesn't strictly
// exceed the last one it saw for that instance ("New timestamp is equal or
// less than the last one", straight from the compiled graph runner), and
// whichever side loses that race gets its call rejected. For a live
// tracker's tick(), that's a thrown exception mid-frame -- which kills its
// self-perpetuating requestAnimationFrame(tick) chain silently, with
// nothing telling the athlete or coach tracking just froze. A dedicated
// instance here removes the shared state entirely, same fix as the
// ROI-refine pass above.
export function getOfflinePoseLandmarker(): Promise<PoseLandmarker> {
  if (!offlineLandmarkerPromise) {
    offlineLandmarkerPromise = FilesetResolver.forVisionTasks(WASM_BASE_PATH).then((fileset) =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      }),
    );
  }
  return offlineLandmarkerPromise;
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
  if (!requireBothWrists) return averageWorldPoint([left, right]);
  if (visible(left) && visible(right)) return averageWorldPoint([left, right]);
  // Exactly one side occluded on an otherwise-rigid two-handed bar (a rack
  // post blocking one hand, a heavy plate stack in the way) -- mirror the
  // confident wrist across the body's own midline instead of losing the
  // frame. World landmarks are hip-centered, so x=0 IS that midline;
  // averaging a real point with its own mirror image always collapses to
  // x=0 exactly, which is the bar's CENTER under a roughly even grip --
  // the same assumption bar-tilt/valgus already lean on for a real barbell
  // (see usesSharedBarEquipment, the only caller that ever sets
  // requireBothWrists true). This covers a different failure mode than
  // interpolateOcclusionGap: that smooths a BRIEF dropout with a confident
  // frame on both sides of the gap, but can't help a SUSTAINED one-side
  // occlusion with no recovery point to interpolate toward (one hand
  // blocked for a whole set, not just a few frames).
  const visibleWrist = visible(left) ? left : visible(right) ? right : null;
  if (!visibleWrist) return null;
  return { x: 0, y: visibleWrist.y, z: visibleWrist.z };
}

// Confidence companion to deriveBarPoint above -- same wrist selection
// logic (both averaged, or the one confident wrist in a mirrored read),
// but returns how much to trust that position (the pose model's own
// per-landmark visibility score, 0-1) rather than the position itself.
// bar-tracker-dialog.tsx uses this to weight the wrist-derived position
// against the implement tracker's own confidence when fusing the two into
// one tracked point every frame -- a genuine blend, not an either/or
// switch, so a marginally-visible wrist still gets some say even once the
// implement tracker is fully confident, and vice versa.
export function barPointConfidence(worldLandmarks: Landmark[], requireBothWrists = false): number {
  const left = worldLandmarks[POSE_LANDMARKS.LEFT_WRIST];
  const right = worldLandmarks[POSE_LANDMARKS.RIGHT_WRIST];
  if (!requireBothWrists) {
    const vis = [left, right].filter(visible);
    return vis.length ? vis.reduce((a, p) => a + p.visibility, 0) / vis.length : 0;
  }
  if (visible(left) && visible(right)) return (left.visibility + right.visibility) / 2;
  const visibleWrist = visible(left) ? left : visible(right) ? right : null;
  return visibleWrist ? visibleWrist.visibility : 0;
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

// Same normalized image-space concept as deriveNormalizedWristPoint above,
// but each wrist kept separate rather than averaged into one midpoint --
// world-space deriveWristPoints' own sibling. Seeds a per-side implement
// tracker (bar-tracker-dialog.tsx runs one for the left grip and one for
// the right) so each side's motion search starts from ITS OWN wrist
// instead of the combined midpoint, which for a wide grip could be
// nowhere near either individual hand.
export function deriveNormalizedWristPoints(
  landmarks: NormalizedLandmark[],
): { left: { x: number; y: number } | null; right: { x: number; y: number } | null } {
  const left = landmarks[POSE_LANDMARKS.LEFT_WRIST];
  const right = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
  return {
    left: visible(left) ? { x: left.x, y: left.y } : null,
    right: visible(right) ? { x: right.x, y: right.y } : null,
  };
}

// Single-side confidence companion to deriveWristPoints -- how much to
// trust JUST the left or right wrist's own position (the pose model's
// visibility score for that one landmark), for fusing it against that
// side's own implement tracker rather than the combined bar-point
// confidence barPointConfidence above already covers.
export function wristConfidence(worldLandmarks: Landmark[], side: "left" | "right"): number {
  const lm = worldLandmarks[side === "left" ? POSE_LANDMARKS.LEFT_WRIST : POSE_LANDMARKS.RIGHT_WRIST];
  return visible(lm) ? lm.visibility : 0;
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

// A controlled barbell rep -- squat, deadlift, press, row -- never has the
// bar tilted this far off horizontal while still being lifted; well past
// this and the plates would already be scraping the floor or the bar would
// be visibly rolling out of the grip. atan(dy/dx) is extremely sensitive
// once dx is small (exactly the regime MIN_BAR_GRIP_SEPARATION_M's floor
// only partially guards against -- a modest few cm of dy jitter on a dx
// just above that floor is enough to swing the angle past 50 degrees), so a
// reading beyond this ceiling is categorically a tracking artifact (a
// misdetected wrist for one frame, hands read as nearly stacked from a
// camera angle) rather than a real tilt -- rejected the same way an
// implausible velocity reading is now excluded in bar-tracking.ts, instead
// of being reported as the set's "worst tilt."
const MAX_PLAUSIBLE_BAR_TILT_DEG = 30;

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
  return tiltDegreesFromPoints(left, right, verticalSign);
}

// Same core math as computeBarTiltDegrees above, split out to take two
// explicit world-space points instead of a full landmarks array -- lets a
// caller feed in something OTHER than the raw pose wrist landmarks (e.g.
// bar-tracker-dialog.tsx's own left/right implement-tracker fusion, which
// produces a point per side that's already been corroborated against a
// second, independent signal) without duplicating the angle formula.
// Doesn't itself gate on visibility (a plain WorldPoint has none to check)
// -- callers that DO have visibility to check (like computeBarTiltDegrees
// above) do so before calling in.
export function tiltDegreesFromPoints(
  left: { x: number; y: number },
  right: { x: number; y: number },
  verticalSign: 1 | -1,
): number | null {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  if (Math.abs(dx) < MIN_BAR_GRIP_SEPARATION_M) return null;
  const magnitude = Math.abs((Math.atan(dy / dx) * 180) / Math.PI);
  if (magnitude > MAX_PLAUSIBLE_BAR_TILT_DEG) return null;
  const correctedDy = verticalSign * dy;
  if (correctedDy > 0) return magnitude;
  if (correctedDy < 0) return -magnitude;
  return 0;
}

// ---------- Automatic real-world scale calibration ----------
// MediaPipe's worldLandmarks claim to be real-world meters, but they're
// actually scaled by the model's own LEARNED, population-average body-
// proportion prior -- not measured against anything in the actual scene.
// That's the root cause behind velocity/distance numbers drifting off in
// either direction (too fast for one athlete's setup, too slow for
// another's): the model's "average adult" assumption is never exactly
// right for a specific person. The athlete's real height is already on
// file and isn't subject to that ambiguity at all -- comparing MediaPipe's
// own implied height (read off the same landmarks, at the exact moment
// isFullBodyInFrame already confirms they're standing fully visible before
// a set starts) against their real height gives a direct correction ratio,
// with no new sensor, permission, or interruption to the athlete.

// Nose-to-ankle span understates true standing height by roughly the
// nose-to-crown distance -- average adult anthropometric data puts that
// around 11-12cm. This is an approximation, not a per-athlete measurement,
// but the correction this feeds is itself just a nudge toward this
// specific athlete's proportions (see MAX/MIN_PLAUSIBLE_SCALE_CORRECTION
// below) -- it doesn't need to be exact, just close enough to meaningfully
// improve on trusting the population-average guess outright.
const NOSE_TO_CROWN_M = 0.12;

// MediaPipe's implied standing height, in meters, from the same landmarks
// already being read every frame -- null whenever nose or either ankle
// isn't confidently visible (mid-squat depth, an ankle out of frame),
// which is exactly why this is only ever sampled during the readiness
// check's "standing fully visible" moment, not during tracking itself.
export function computeImpliedStandingHeightM(
  worldLandmarks: Landmark[],
  verticalSign: 1 | -1,
): number | null {
  const nose = worldLandmarks[POSE_LANDMARKS.NOSE];
  const lAnkle = worldLandmarks[POSE_LANDMARKS.LEFT_ANKLE];
  const rAnkle = worldLandmarks[POSE_LANDMARKS.RIGHT_ANKLE];
  if (!visible(nose) || !visible(lAnkle) || !visible(rAnkle)) return null;
  const ankleY = (lAnkle.y + rAnkle.y) / 2;
  const span = verticalSign * (ankleY - nose.y);
  if (span <= 0) return null;
  return span + NOSE_TO_CROWN_M;
}

// A correction outside this band is more likely a noisy or off-angle
// reading than a genuine 15%+ miss on MediaPipe's own body-proportion
// model -- in that case the caller skips correction for this session
// entirely (falls back to exactly today's uncorrected behavior) rather
// than risk applying a bad multiplier with false confidence. Same "don't
// trust a number that looks wrong just because a formula produced it"
// stance as every other plausibility gate added this round.
const MIN_PLAUSIBLE_SCALE_CORRECTION = 0.85;
const MAX_PLAUSIBLE_SCALE_CORRECTION = 1.15;

export function computeHeightScaleCorrection(
  worldLandmarks: Landmark[],
  verticalSign: 1 | -1,
  athleteHeightIn: number | null | undefined,
): number | null {
  if (!athleteHeightIn || athleteHeightIn <= 0) return null;
  const impliedHeightM = computeImpliedStandingHeightM(worldLandmarks, verticalSign);
  if (impliedHeightM == null) return null;
  const trueHeightM = athleteHeightIn * 0.0254;
  const factor = trueHeightM / impliedHeightM;
  if (factor < MIN_PLAUSIBLE_SCALE_CORRECTION || factor > MAX_PLAUSIBLE_SCALE_CORRECTION) return null;
  return factor;
}

// Applied once per frame to the raw worldLandmarks the moment they come
// back from detectForVideo -- every downstream consumer (bar-point
// derivation, tilt, grip width, joint angles, jump ankle point) already
// reads worldLandmarks as its source of truth, so scaling here is the one
// place a correction needs to happen for it to propagate through the
// entire existing pipeline with no other call site touched.
export function scaleWorldLandmarks(worldLandmarks: Landmark[], factor: number): Landmark[] {
  return worldLandmarks.map((lm) => ({ ...lm, x: lm.x * factor, y: lm.y * factor, z: lm.z * factor }));
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
  return FULL_BODY_CHECKPOINTS.every((i) => {
    const lm = landmarks[i];
    return !!lm && lm.visibility >= PRESENCE_MIN_VISIBILITY;
  });
}

// Same PRESENCE_MIN_VISIBILITY bar as isFullBodyInFrame, but over the torso
// only (nose, shoulders, hips) rather than all 9 of its checkpoints --
// ankles/knees legitimately drop below MIN_VISIBILITY mid-rep (the bottom
// of a squat, a jump's flight), so holding every DURING-tracking frame to
// isFullBodyInFrame's full standard would reject good frames along with bad
// ones. The torso essentially never does for any framing this feature
// supports, so it's the right bar for an ongoing "is this still actually a
// person" check. Unlike isFullBodyInFrame (used once, to gate auto-start),
// this runs every tracked frame: MediaPipe's pose model can occasionally
// return a low-confidence "person" on a strongly rectangular, loosely
// humanoid object -- a plyo box's stacked edges, a rack's hanging straps --
// and isFullBodyInFrame's own comment already names this exact failure mode
// for the one-time auto-start check; nothing before this caught it for
// every frame afterward, which is how a false detection on a box mid-set
// could get drawn as a skeleton and folded into the tracked trace.
const TORSO_PRESENCE_CHECKPOINTS = [
  POSE_LANDMARKS.NOSE,
  POSE_LANDMARKS.LEFT_SHOULDER,
  POSE_LANDMARKS.RIGHT_SHOULDER,
  POSE_LANDMARKS.LEFT_HIP,
  POSE_LANDMARKS.RIGHT_HIP,
];
export function isPlausibleHumanFrame(landmarks: NormalizedLandmark[]): boolean {
  return TORSO_PRESENCE_CHECKPOINTS.every((i) => {
    const lm = landmarks[i];
    return !!lm && lm.visibility >= PRESENCE_MIN_VISIBILITY;
  });
}

// A hip-midpoint jump this large between one tracked frame and the next
// isn't a real athlete moving fast -- even an explosive jump's hips cover
// real ground more slowly, frame to frame at a typical tracking rate, than
// this. It's the signature of a different failure: MediaPipe's PoseLandmarker
// runs in single-subject mode (numPoses: 1, see getPoseLandmarker), which
// only ever reports ONE person, but has no notion of "the same one as last
// frame" -- a spotter stepping into frame, or a background lifter walking
// past, can make its one detection jump onto them instead of continuing to
// track the athlete. Untuned against real footage (this environment has no
// camera to test against) -- treat as a starting point to revisit once
// tried against a real gym-noise scene.
const MAX_SUBJECT_JUMP_FRACTION = 0.3;

// Companion check to isPlausibleHumanFrame, not a replacement -- that one
// asks "is this a person at all," this one asks "is it plausibly the SAME
// one as the last confidently-tracked frame." Hip midpoint specifically
// because it's present and stable in every mode this file serves
// (bar-tracker-dialog.tsx tracks wrists, sprint/mechanics track hips
// directly) -- a mode-specific point like a single wrist would go
// untracked, and therefore unusable for this check, on frames where only
// the OTHER wrist happens to be visible. lastConfidentLandmarks is null
// before the first confident frame of a set, which this passes
// permissively (nothing to compare continuity against yet). Exported for
// SubjectContinuityGate below, which is what callers actually use.
export function isPlausibleSubjectContinuity(
  landmarks: NormalizedLandmark[],
  lastConfidentLandmarks: NormalizedLandmark[] | null,
): boolean {
  if (!lastConfidentLandmarks) return true;
  const lHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
  const prevLHip = lastConfidentLandmarks[POSE_LANDMARKS.LEFT_HIP];
  const prevRHip = lastConfidentLandmarks[POSE_LANDMARKS.RIGHT_HIP];
  if (!visible(lHip) || !visible(rHip) || !visible(prevLHip) || !visible(prevRHip)) return true;
  const hipX = (lHip.x + rHip.x) / 2;
  const hipY = (lHip.y + rHip.y) / 2;
  const prevHipX = (prevLHip.x + prevRHip.x) / 2;
  const prevHipY = (prevLHip.y + prevRHip.y) / 2;
  return Math.hypot(hipX - prevHipX, hipY - prevHipY) <= MAX_SUBJECT_JUMP_FRACTION;
}

// A real person detected in frame, just implausibly far from where the
// gate last confidently saw someone, for this many consecutive frames --
// past this, the gate stops comparing against what's now a stale position
// and lets the next confident frame re-lock fresh. Without this, a genuine
// gap (the athlete steps out of frame and back in somewhere else, not a
// different person replacing them) would leave the gate permanently
// rejecting them, since nothing would ever again be "close enough" to a
// position from before the gap.
const CONTINUITY_RESET_STREAK = 20;

// Stateful wrapper combining isPlausibleHumanFrame + isPlausibleSubjectContinuity
// into the one call site every MediaPipe tracker dialog's tick loop already
// makes -- same "instantiate once per dialog via useRef, call .reset() at
// the same points PoseSmoother/ImplementTracker already get reset" pattern
// this codebase already uses for exactly this kind of per-set tracking state.
export class SubjectContinuityGate {
  private lastConfident: NormalizedLandmark[] | null = null;
  private rejectStreak = 0;

  reset(): void {
    this.lastConfident = null;
    this.rejectStreak = 0;
  }

  // rawLandmarks straight off detection.landmarks[0] -- returns them back
  // unchanged if trusted, null otherwise (same shape the old inline
  // `rawLandmarks && isPlausibleHumanFrame(rawLandmarks) ? rawLandmarks :
  // null` ternary already produced, so this is a drop-in replacement for it).
  admit(rawLandmarks: NormalizedLandmark[] | null): NormalizedLandmark[] | null {
    if (!rawLandmarks || !isPlausibleHumanFrame(rawLandmarks)) return null;
    if (!isPlausibleSubjectContinuity(rawLandmarks, this.lastConfident)) {
      this.rejectStreak += 1;
      if (this.rejectStreak > CONTINUITY_RESET_STREAK) {
        this.lastConfident = null;
        this.rejectStreak = 0;
      }
      return null;
    }
    this.lastConfident = rawLandmarks;
    this.rejectStreak = 0;
    return rawLandmarks;
  }
}

export type CameraAlignment = { aligned: boolean; reason: "ok" | "angled" | "axial" | "unknown" };

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
  if (depthGap / shoulderWidth > 0.5) return { aligned: false, reason: "angled" };

  // A second, unrelated way to be misaligned that the shoulder check above
  // can't see: the camera pointed along the athlete's body -- filming a
  // bench press from the feet (or the head) instead of the side. Shoulders
  // can still sit level with each other in that framing (it isn't a
  // left/right rotation at all), but the body's whole length collapses
  // toward the lens instead of spreading across the frame, which is just as
  // fatal for bar-path/velocity accuracy: nearly all real motion becomes
  // toward/away from the camera, exactly where a single 2D camera has the
  // least ability to resolve position, and is the likeliest explanation for
  // wildly inflated velocity/drift numbers and flickering ("ghost") skeleton
  // detections. Ankle-to-shoulder is the longest stable segment available
  // (spans the whole body), compared as its own-plane spread (x/y -- however
  // that segment happens to be oriented in the image) against its depth (z)
  // spread: a good side view keeps that segment roughly in the camera's
  // image plane (small z change along its length); an axial shot points it
  // straight at the lens instead (z change dominates). No division needed
  // (and no risk of a div-by-zero on a compact pose) since both sides are
  // compared directly; the 0.2m floor on the depth term keeps ordinary pose
  // noise or a curled-up position from tripping this on their own.
  const lAnkle = worldLandmarks[POSE_LANDMARKS.LEFT_ANKLE];
  const rAnkle = worldLandmarks[POSE_LANDMARKS.RIGHT_ANKLE];
  if (visible(lAnkle) && visible(rAnkle)) {
    const ankleMidZ = (lAnkle.z + rAnkle.z) / 2;
    const shoulderMidZ = (lShoulder.z + rShoulder.z) / 2;
    const ankleMidX = (lAnkle.x + rAnkle.x) / 2;
    const ankleMidY = (lAnkle.y + rAnkle.y) / 2;
    const shoulderMidX = (lShoulder.x + rShoulder.x) / 2;
    const shoulderMidY = (lShoulder.y + rShoulder.y) / 2;
    const acrossFrame = Math.hypot(shoulderMidX - ankleMidX, shoulderMidY - ankleMidY);
    const towardCamera = Math.abs(shoulderMidZ - ankleMidZ);
    if (towardCamera > 0.2 && towardCamera > acrossFrame) {
      return { aligned: false, reason: "axial" };
    }
  }

  return { aligned: true, reason: "ok" };
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

// Same 3-point inside-angle formula as angleAtVertex, but for real-world
// (meters) points instead of normalized image-space ones -- angleAtVertex's
// dot-product math mixes an x-component and a y-component exactly the way
// the torso-lean/bar-tilt calculations above used to, so it's just as
// exposed to portrait video's aspect-ratio distortion for ANY joint angle,
// not only "angle from vertical." angleAtVertex itself stays as-is (it's
// shared with joint-angles.ts's fully free-form tap-anywhere tool, which
// measures points that were never real body landmarks in the first place --
// see that file's own comment), but every joint angle actually measured off
// the skeleton -- automated knee angle below, and the tap-a-joint tool's
// preset joints -- needs this version instead.
export function worldAngleAtVertex(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number },
): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = Math.hypot(v1.x, v1.y, v1.z);
  const mag2 = Math.hypot(v2.x, v2.y, v2.z);
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
// already use for the equivalent position/velocity failure mode. Exported
// for sprint-tracking.ts/mechanics-tracking.ts, whose own fault/metric
// calculations used to take a raw max/min straight off every frame with no
// such protection -- the same single-bad-frame vulnerability this function
// was written to close here, just not yet closed there.
export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[idx];
}

// Knee angle(s) visible in a single frame (0, 1, or 2 -- whichever legs are
// in frame), shared by detectFormFaults (aggregates across a whole set) and
// computeRepDepths (aggregates within one rep's time window). Takes world
// landmarks, not image-space -- see worldAngleAtVertex's own comment for
// why a knee's real inside angle needs the same fix torso lean/bar tilt got.
// Exported so mechanics-tracking.ts can reuse it for a jump shot's
// knee-bend load depth, the same generic joint-angle reasoning as
// worldAngleAtVertex itself.
export function frameKneeAngles(worldLm: Landmark[]): number[] {
  const angles: number[] = [];
  const lHip = worldLm[POSE_LANDMARKS.LEFT_HIP];
  const rHip = worldLm[POSE_LANDMARKS.RIGHT_HIP];
  const lKnee = worldLm[POSE_LANDMARKS.LEFT_KNEE];
  const rKnee = worldLm[POSE_LANDMARKS.RIGHT_KNEE];
  const lAnkle = worldLm[POSE_LANDMARKS.LEFT_ANKLE];
  const rAnkle = worldLm[POSE_LANDMARKS.RIGHT_ANKLE];
  if (visible(lHip) && visible(lKnee) && visible(lAnkle)) angles.push(worldAngleAtVertex(lHip, lKnee, lAnkle));
  if (visible(rHip) && visible(rKnee) && visible(rAnkle)) angles.push(worldAngleAtVertex(rHip, rKnee, rAnkle));
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
      angles.push(...frameKneeAngles(frame.worldLandmarks));
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
// a given angle came from. Same world-landmark reasoning as frameKneeAngles.
function frameKneeAnglesBySide(worldLm: Landmark[]): { left: number | null; right: number | null } {
  const lHip = worldLm[POSE_LANDMARKS.LEFT_HIP];
  const rHip = worldLm[POSE_LANDMARKS.RIGHT_HIP];
  const lKnee = worldLm[POSE_LANDMARKS.LEFT_KNEE];
  const rKnee = worldLm[POSE_LANDMARKS.RIGHT_KNEE];
  const lAnkle = worldLm[POSE_LANDMARKS.LEFT_ANKLE];
  const rAnkle = worldLm[POSE_LANDMARKS.RIGHT_ANKLE];
  return {
    left: visible(lHip) && visible(lKnee) && visible(lAnkle) ? worldAngleAtVertex(lHip, lKnee, lAnkle) : null,
    right: visible(rHip) && visible(rKnee) && visible(rAnkle) ? worldAngleAtVertex(rHip, rKnee, rAnkle) : null,
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
      for (const angle of frameKneeAngles(frame.worldLandmarks)) {
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
      const sides = frameKneeAnglesBySide(frame.worldLandmarks);
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

export type LandingAsymmetryEntry = {
  // Which foot's ankle touched down first -- "even" when both land within
  // MIN_TRUSTWORTHY_LANDING_OFFSET_MS of each other (not trustworthy as a
  // real lead, just per-frame sampling noise).
  leadingFoot: "left" | "right" | "even";
  timingOffsetMs: number;
};

// Comfortably above one frame's worth of timing noise at a real-time
// tracked frame rate -- a smaller gap than this isn't trustworthy as "one
// foot actually landed first" rather than sampling jitter.
const MIN_TRUSTWORTHY_LANDING_OFFSET_MS = 30;

// Per-foot ground-contact timing around a jump's own detected landing
// moment (JumpRep.landingT, itself measured off the COMBINED ankle
// midpoint -- see jump-tracking.ts's takeoff/landing state machine) --
// a direct read on whether the athlete favors one leg on landing, the
// companion question to computeLegDriveAsymmetry's "which leg drives
// harder" for the concentric phase of a squat. Touchdown for a single
// ankle is that ankle's own local Y MAXIMUM within the window (world-Y
// increases toward the ground, same convention this file's torso-lean/
// bar-tilt math already uses -- see worldVerticalSign's own comment): the
// foot descends until ground contact stops it, so the highest raw Y value
// it reaches in the window is the moment it actually landed.
//
// Only genuinely trustworthy with real per-frame 3D ankle positions --
// MediaPipe's are noisy enough at typical frame rates that a small timing
// offset between two ankles is mostly sensor jitter, not a real lead.
// ARKit's tracked joints make this a real signal for the first time (see
// ArJumpTrackerDialog's own comment on where this gets wired in).
export function computeLandingAsymmetry(
  frames: PoseFrame[],
  landings: { landingT: number }[],
  // How far around landingT to search for each ankle's own local max --
  // wide enough to catch a foot that touches down slightly before/after
  // the combined trace's own detected landing moment, tight enough to stay
  // within this landing, not spill into the next rep's.
  windowMs = 250,
): (LandingAsymmetryEntry | null)[] {
  return landings.map(({ landingT }) => {
    const windowFrames = frames.filter((f) => f.t >= landingT - windowMs && f.t <= landingT + windowMs);
    if (windowFrames.length < 4) return null;

    let leftMaxY = -Infinity;
    let leftMaxT = 0;
    let rightMaxY = -Infinity;
    let rightMaxT = 0;
    for (const frame of windowFrames) {
      const left = frame.worldLandmarks[POSE_LANDMARKS.LEFT_ANKLE];
      const right = frame.worldLandmarks[POSE_LANDMARKS.RIGHT_ANKLE];
      if (visible(left) && left.y > leftMaxY) {
        leftMaxY = left.y;
        leftMaxT = frame.t;
      }
      if (visible(right) && right.y > rightMaxY) {
        rightMaxY = right.y;
        rightMaxT = frame.t;
      }
    }
    if (leftMaxY === -Infinity || rightMaxY === -Infinity) return null;

    const offsetMs = Math.round(rightMaxT - leftMaxT);
    if (Math.abs(offsetMs) < MIN_TRUSTWORTHY_LANDING_OFFSET_MS) {
      return { leadingFoot: "even", timingOffsetMs: 0 };
    }
    return {
      leadingFoot: offsetMs > 0 ? "left" : "right",
      timingOffsetMs: Math.abs(offsetMs),
    };
  });
}

export type FormFault = {
  code:
    | "shallow_depth"
    | "knee_valgus"
    | "forward_lean"
    | "bar_path_drift"
    | "bar_tilt"
    | "grip_shift"
    | "pelvic_drop"
    | "ankle_mobility_limit"
    | "arm_fallout"
    | "thoracic_extension_loss"
    | "lockout_symmetry"
    | "lockout_lean";
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
// a bench press is just wrong regardless of what the numbers say. Exported
// so bar-tracker-dialog.tsx can gate loading the (separate, second-model)
// ROI landmarker off the same list -- knee/hip/ankle refinement is only
// ever useful for the same movements this already gates knee faults to.
export const LOWER_BODY_MOVEMENT_TYPES = new Set(["Squat", "Hinge", "Lunge"]);

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
  // Already-fused tilt readings from live tracking (bar-tracker-dialog.tsx
  // runs a left AND a right implement tracker, each corroborated against
  // its own wrist, and computes tilt from those two fused points every
  // frame -- see leftImplementTrackerRef's own comment). When provided,
  // used INSTEAD of recomputing tilt from these frames' raw, single-source
  // wrist landmarks below, so the SAVED fault benefits from the same
  // cross-corroborated signal the live readout already does, rather than
  // a strictly worse one. Left undefined by any caller that doesn't have
  // it (falls back to the frame-by-frame raw computation, the prior
  // behavior) -- this can be threaded through gradually the same way
  // movementType/equipment were.
  precomputedTiltDegrees?: number[],
  // Lateral (x-only) separation between the same two fused left/right grip
  // points, in meters, one reading per tracked frame -- lets a genuine
  // regrip (hand sliding to a new position on the bar mid-set) surface as
  // its own fault instead of silently changing what "the grip" means
  // partway through a set. No raw-landmark fallback exists for this one
  // (it's new, not a replacement for prior behavior), so it's simply
  // skipped when not provided.
  gripWidthReadings?: number[],
): FormFault[] {
  const faults: FormFault[] = [];
  if (frames.length < 6) return faults;

  const usesSharedBar = context === "lift" && usesSharedBarEquipment(equipment);

  const kneeAngles: number[] = [];
  const valgusRatios: number[] = [];
  const torsoAngles: number[] = [];
  const tiltAngles: number[] = precomputedTiltDegrees ? [...precomputedTiltDegrees] : [];
  // Lateral hip-height difference vs. hip width, same math and same
  // physical sign (Trendelenburg/pelvic drop) as sprint-tracking.ts's
  // hip_drop fault, applied here to a squat/lunge's stance instead of a
  // sprint stride. 3D (not x-only) since this file's own convention --
  // knee_valgus above -- already established 3D Euclidean distances as the
  // camera-angle-independent way to do a same-frame width/width ratio.
  const hipDropRatios: number[] = [];
  // Real-world (meters) heel-above-toe rise, same-frame and camera-angle-
  // independent for the same reason as hipDropRatios above -- a classic
  // ankle-dorsiflexion-restriction compensation (heel lifts off the ground
  // to fake extra depth). One reading per visible foot per frame.
  const heelRiseReadings: number[] = [];
  // Torso lean restricted to frames where both wrists are overhead (see
  // frameIsOverhead below) -- an overhead squat's lockout standard is
  // stricter than a back squat's, and a press's lockout moment is the only
  // part of the rep where "leaning off vertical" is even a meaningful
  // question (mid-rack position naturally isn't upright the same way).
  const lockoutTorsoAngles: number[] = [];
  let overheadFrameCount = 0;
  let trackedOverheadFrameCount = 0;
  // Highest point (smallest vertical-sign-corrected y) each wrist reaches
  // during the capture -- "top of rep" for a press's lockout. The two
  // don't need to come from the same frame for a symmetry comparison to be
  // meaningful (each side's own best height is what a coach means by
  // "how high did that arm lock out"), same reasoning peakWristSpeedMps's
  // sibling metrics in mechanics-tracking.ts use for per-side extremes.
  let topLeftWristCorrectedY = Infinity;
  let topRightWristCorrectedY = Infinity;

  // Best current reading of which way world-Y points "up" -- refined every
  // frame it can be (see worldVerticalSign), held from the last confident
  // frame otherwise, same pattern bar-tracker-dialog.tsx's verticalSignRef
  // uses live. Bar tilt's sign needs this, and so does everything below
  // that asks "is this point higher than that one" (overhead detection,
  // heel rise, top-of-rep wrist height) -- torso lean is the one exception,
  // unsigned and unaffected by which way world-Y points.
  let currentVerticalSign: 1 | -1 = 1;

  for (const frame of frames) {
    const worldLm = frame.worldLandmarks;
    const sign = worldVerticalSign(worldLm);
    if (sign != null) currentVerticalSign = sign;

    if (usesSharedBar && !precomputedTiltDegrees) {
      const tilt = computeBarTiltDegrees(worldLm, currentVerticalSign);
      if (tilt != null) tiltAngles.push(tilt);
    }

    // "Overhead" for this frame: both wrists higher (smaller corrected y)
    // than the nose -- a vertical-only comparison, so it needs no facing-
    // direction assumption the way a forward/backward check would (see the
    // module's own weightTransferPct comment on why that's avoided). Feeds
    // arm_fallout (Squat) and gates lockout_lean/lockoutTorsoAngles (Press)
    // below; top-of-rep wrist height feeds lockout_symmetry regardless of
    // whether this specific frame reads as "overhead."
    const nose3d = worldLm[POSE_LANDMARKS.NOSE];
    const lWrist3d = worldLm[POSE_LANDMARKS.LEFT_WRIST];
    const rWrist3d = worldLm[POSE_LANDMARKS.RIGHT_WRIST];
    let frameIsOverhead = false;
    if (visible(lWrist3d) && visible(rWrist3d)) {
      const leftCorrectedY = currentVerticalSign * lWrist3d.y;
      const rightCorrectedY = currentVerticalSign * rWrist3d.y;
      topLeftWristCorrectedY = Math.min(topLeftWristCorrectedY, leftCorrectedY);
      topRightWristCorrectedY = Math.min(topRightWristCorrectedY, rightCorrectedY);
      if (visible(nose3d)) {
        const noseCorrectedY = currentVerticalSign * nose3d.y;
        frameIsOverhead = leftCorrectedY < noseCorrectedY && rightCorrectedY < noseCorrectedY;
        trackedOverheadFrameCount++;
        if (frameIsOverhead) overheadFrameCount++;
      }
    }

    const lKnee3d = worldLm[POSE_LANDMARKS.LEFT_KNEE];
    const rKnee3d = worldLm[POSE_LANDMARKS.RIGHT_KNEE];
    const lAnkle3d = worldLm[POSE_LANDMARKS.LEFT_ANKLE];
    const rAnkle3d = worldLm[POSE_LANDMARKS.RIGHT_ANKLE];

    kneeAngles.push(...frameKneeAngles(worldLm));

    // Valgus proxy: knee width vs. ankle width -- a healthy squat keeps
    // knees tracking roughly over the ankles, so this ratio stays near 1;
    // it drops well below 1 when the knees cave inward past the ankles.
    // Real-world 3D distance (not image-space x) so this works off ARKit's
    // world-only joints (no 2D landmarks to fall back on) and, as a bonus,
    // stops implicitly assuming a face-on camera angle -- a 3D Euclidean
    // width/width ratio is unaffected by the camera's viewing angle the way
    // a single image-axis difference is.
    if (visible(lKnee3d) && visible(rKnee3d) && visible(lAnkle3d) && visible(rAnkle3d)) {
      const kneeWidth = Math.hypot(lKnee3d.x - rKnee3d.x, lKnee3d.y - rKnee3d.y, lKnee3d.z - rKnee3d.z);
      const ankleWidth = Math.hypot(lAnkle3d.x - rAnkle3d.x, lAnkle3d.y - rAnkle3d.y, lAnkle3d.z - rAnkle3d.z);
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
        const leanDeg = (Math.acos(Math.min(1, Math.abs(dy) / magnitude)) * 180) / Math.PI;
        torsoAngles.push(leanDeg);
        if (frameIsOverhead) lockoutTorsoAngles.push(leanDeg);
      }
    }

    // Pelvic drop (Trendelenburg sign): lateral hip-height difference vs.
    // hip width -- see hipDropRatios' own comment above. Reuses the hip
    // landmarks already fetched for torso lean just above.
    if (visible(lHip3d) && visible(rHip3d)) {
      const hipWidth = Math.hypot(lHip3d.x - rHip3d.x, lHip3d.y - rHip3d.y, lHip3d.z - rHip3d.z);
      if (hipWidth > 0.05) hipDropRatios.push(Math.abs(lHip3d.y - rHip3d.y) / hipWidth);
    }

    // Heel rise: heel higher (smaller corrected y) than the same foot's
    // toe -- see heelRiseReadings' own comment above.
    const lHeel3d = worldLm[POSE_LANDMARKS.LEFT_HEEL];
    const rHeel3d = worldLm[POSE_LANDMARKS.RIGHT_HEEL];
    const lToe3d = worldLm[POSE_LANDMARKS.LEFT_FOOT_INDEX];
    const rToe3d = worldLm[POSE_LANDMARKS.RIGHT_FOOT_INDEX];
    if (visible(lHeel3d) && visible(lToe3d)) {
      heelRiseReadings.push(currentVerticalSign * (lToe3d.y - lHeel3d.y));
    }
    if (visible(rHeel3d) && visible(rToe3d)) {
      heelRiseReadings.push(currentVerticalSign * (rToe3d.y - rHeel3d.y));
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

  // "Overhead" for the SET as a whole: most tracked frames had both wrists
  // above the nose (see frameIsOverhead in the loop above) -- an overhead
  // squat (arm_fallout, the stricter thoracic_extension_loss threshold
  // below) or a standing overhead press (lockout_lean), as opposed to a
  // back squat or a bench/horizontal press where this fraction should
  // naturally stay low.
  const overheadFraction =
    trackedOverheadFrameCount > 0 ? overheadFrameCount / trackedOverheadFrameCount : 0;
  const isOverheadSet = overheadFraction > 0.5;

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

  if (isKneeDrivenMovement && hipDropRatios.length) {
    // 95th percentile, not a raw max -- same noise protection as valgus
    // and every other worst-point-of-the-set check in this function.
    const maxHipDropRatio = percentile(hipDropRatios, 0.95);
    // Same cutoff as sprint-tracking.ts's DEFAULT_SKILL_FAULT_THRESHOLDS.
    // hipDropRatioThreshold -- same physical sign (Trendelenburg), same
    // reasonable default.
    if (maxHipDropRatio > 0.12) {
      faults.push({
        code: "pelvic_drop",
        label: "Hip dropped on one side during the rep -- work on single-leg glute strength",
      });
    }
  }

  if (context === "lift" && isKneeDrivenMovement && heelRiseReadings.length) {
    const maxHeelRise = percentile(heelRiseReadings, 0.95);
    // 3cm is a small but real, deliberately conservative heel-off-the-
    // ground reading -- comfortably past ordinary per-frame landmark
    // jitter (this is a same-frame, real-world-meters measurement, same
    // reliability class as the knee/ankle width readings above), well
    // under a heel actually coming up onto the toes.
    if (maxHeelRise > 0.03) {
      faults.push({
        code: "ankle_mobility_limit",
        label: "Heel lifted off the ground at depth -- likely limited ankle dorsiflexion",
      });
    }
  }

  if (isKneeDrivenMovement && torsoAngles.length) {
    const maxTorsoAngle = percentile(torsoAngles, 0.95);
    // An overhead squat's lockout standard is stricter than a back squat's
    // -- losing the overhead position needs a lower bar to flag, and the
    // more specific coaching cue, than the generic forward_lean threshold
    // below gives. The two are mutually exclusive per set, not stacked:
    // an overhead squat that also clears the higher forward_lean bar isn't
    // additionally flagged for it, the OHS-specific fault already covers
    // the same underlying angle more precisely.
    if (movementType === "Squat" && isOverheadSet) {
      if (maxTorsoAngle > 30) {
        faults.push({
          code: "thoracic_extension_loss",
          label: `Losing thoracic extension -- torso rounded ~${Math.round(maxTorsoAngle)}° from vertical, more than an overhead squat can afford`,
        });
      }
    } else if (maxTorsoAngle > 45) {
      faults.push({
        code: "forward_lean",
        label: `Excessive forward lean (~${Math.round(maxTorsoAngle)}° from vertical) at the bottom`,
      });
    }
  }

  // Wrists drifted out of the overhead position at some point during a
  // set that was mostly overhead -- the vertical-only definition of
  // "overhead" above sidesteps needing a forward/backward facing-direction
  // assumption (see weightTransferPct's own comment on why that's
  // avoided), so this reads as "arms came down," not "arms moved forward."
  if (movementType === "Squat" && isOverheadSet) {
    const dropoutFraction = 1 - overheadFraction;
    if (dropoutFraction > 0.15) {
      faults.push({
        code: "arm_fallout",
        label: "Arms drifted down from overhead at some point during the squat",
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

  // 5th/95th spread rather than raw min/max, same reasoning as everywhere
  // else in this function -- a couple of noisy frames at either end
  // shouldn't read as a regrip that never happened. A shoulder-width grip
  // is comfortably under half a meter; an 8cm swing between the widest and
  // narrowest readings across a whole set is well past ordinary per-frame
  // jitter and into "the hands actually moved to a different spot on the
  // bar" territory.
  if (usesSharedBar && gripWidthReadings && gripWidthReadings.length) {
    const narrowest = percentile(gripWidthReadings, 0.05);
    const widest = percentile(gripWidthReadings, 0.95);
    if (widest - narrowest > 0.08) {
      faults.push({
        code: "grip_shift",
        label: `Grip width shifted ~${Math.round((widest - narrowest) * 100)}cm during the set`,
      });
    }
  }

  // Top-of-rep wrist-height symmetry -- the non-barbell (dumbbell/kettlebell/
  // bodyweight) equivalent of bar_tilt above, which only fires for a shared
  // bar. Deliberately skipped when usesSharedBar: a barbell press's two
  // hands can't lock out at different heights (they're on the same rigid
  // bar), so bar_tilt already owns that signal there and this would just
  // duplicate it under a different name.
  if (
    movementType === "Press" &&
    !usesSharedBar &&
    topLeftWristCorrectedY !== Infinity &&
    topRightWristCorrectedY !== Infinity
  ) {
    const symmetryDiffM = Math.abs(topLeftWristCorrectedY - topRightWristCorrectedY);
    if (symmetryDiffM > 0.06) {
      const higherSide = topLeftWristCorrectedY < topRightWristCorrectedY ? "left" : "right";
      faults.push({
        code: "lockout_symmetry",
        label: `One arm locked out ~${Math.round(symmetryDiffM * 100)}cm higher than the other (${higherSide})`,
      });
    }
  }

  // Torso lean restricted to the lockout moment itself (lockoutTorsoAngles
  // only collects frames where both wrists were overhead) -- a standing
  // overhead press's only meaningful "leaning off vertical" question,
  // unlike a bench press where lying flat is the correct, neutral position
  // (see guessMovementPattern's own comment on that same distinction).
  if (movementType === "Press" && isOverheadSet && lockoutTorsoAngles.length) {
    const maxLockoutLean = percentile(lockoutTorsoAngles, 0.95);
    if (maxLockoutLean > 20) {
      faults.push({
        code: "lockout_lean",
        label: `Leaning ~${Math.round(maxLockoutLean)}° off vertical at lockout -- check for an excessive arch or lean instead of a straight bar path overhead`,
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
//
// movementType (optional, same taxonomy detectFormFaults gates on) is the
// hard gate for the squat/deadlift branch below -- without it, a bench
// press reliably mislabels as "Deadlift": kneeRangeOfMotion can drift past
// 30 from nothing more than pose noise in legs that are just stabilizing,
// not the focus of the movement, and torsoMax (angle from VERTICAL) reads
// close to 90deg on essentially every rep regardless of form, because the
// torso's correct, neutral orientation for a lying-down press IS
// horizontal -- there's no camera angle or fix to the angle math that
// changes that, it's the wrong question to ask of a supine exercise.
// Left undefined by any caller that doesn't have it, same gradual-
// threading fallback detectFormFaults already established.
export function guessMovementPattern(frames: PoseFrame[], movementType?: string | null): MovementGuess {
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
    for (const angle of frameKneeAngles(worldLm)) {
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
  // Only worth attempting the squat/deadlift guess when the exercise is
  // unknown (preserving the old fallback for callers without
  // movementType) or already known to be a lower-body pattern -- see this
  // function's own comment above for why a known non-lower-body
  // movementType (Push, Pull, Carry...) makes this branch's signals
  // meaningless rather than just noisy.
  const canGuessLowerBody = movementType == null || LOWER_BODY_MOVEMENT_TYPES.has(movementType);

  if (canGuessLowerBody && kneeRangeOfMotion > 30) {
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
