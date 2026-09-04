// On-device body pose estimation for the camera tracker -- replaces the old
// colored-tape-marker centroid tracker with MediaPipe's PoseLandmarker
// (BlazePose, 33 landmarks), so nothing needs to be stuck on the bar
// anymore and the tracker gets a real skeleton instead of one blob.
// Runs entirely client-side (WASM/WebGL), same privacy story as before:
// only derived numbers ever leave the device, never video or frames.
import { FilesetResolver, PoseLandmarker, type Landmark, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { formatDistanceCm, loadDistanceUnitPref } from "./distance-unit";

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

export function visible<T extends { visibility: number }>(lm: T | undefined): lm is T {
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

// Same {score, label, notes} shape bar-tracking.ts's own per-rep RepTrustScore already uses, for
// a best-of-set mode (med-ball, kb-swing, swing) that has exactly one confidence reading for the
// whole set rather than one per rep.
export type SetTrustScore = {
  score: number;
  label: "high" | "medium" | "low";
  notes: string[];
};

export type BlendedSpeedResult = {
  speedMps: number;
  trust: SetTrustScore;
};

// Confidence-weighted blend of two INDEPENDENT speed estimates for the same motion, rather than
// picking one and discarding the other -- generalizes bar_path/full's own frame-by-frame position
// fusion (av-bar-tracker-dialog.tsx's fuseSide, which blends an implement reading against wrist
// confidence every frame) to a single post-hoc blend for the best-of-set modes, where the two
// signals come from two separate analyses (an object tracker's own trace vs. a body-joint-derived
// proxy) instead of one continuous fused trace. Deliberately NOT position-level fusion the way
// fuseSide is: a thrown med-ball leaves the hand at release, so assuming the object and the wrist
// stay rigidly co-located (what position fusion assumes) breaks down at exactly the moment that
// matters most. Either signal may be absent -- the present one is used alone at reduced
// confidence rather than reporting nothing. Agreement thresholds are honest, untuned-against-
// real-footage guesses (no camera in this sandbox to calibrate against), same caveat as every
// other plausibility constant in this pipeline (see MAX_PLAUSIBLE_BALL_SPEED_MPS's own comment in
// av-medball-tracker-dialog.tsx).
export function blendSpeedEstimates(
  objectSignal: { speedMps: number; confidence: number } | null,
  proxySignal: { speedMps: number; confidence: number } | null,
  objectMissingNote: string,
  proxyMissingNote: string,
): BlendedSpeedResult | null {
  if (objectSignal == null && proxySignal == null) return null;
  if (objectSignal == null) {
    return { speedMps: proxySignal!.speedMps, trust: { score: 55, label: "medium", notes: [objectMissingNote] } };
  }
  if (proxySignal == null) {
    return { speedMps: objectSignal.speedMps, trust: { score: 65, label: "medium", notes: [proxyMissingNote] } };
  }
  const totalWeight = objectSignal.confidence + proxySignal.confidence;
  const blended =
    totalWeight > 0
      ? (objectSignal.speedMps * objectSignal.confidence + proxySignal.speedMps * proxySignal.confidence) /
        totalWeight
      : (objectSignal.speedMps + proxySignal.speedMps) / 2;
  const speedMps = Math.round(blended * 100) / 100;
  const bigger = Math.max(objectSignal.speedMps, proxySignal.speedMps);
  const agreementRatio = bigger > 0 ? Math.min(objectSignal.speedMps, proxySignal.speedMps) / bigger : 1;
  if (agreementRatio >= 0.75) {
    return { speedMps, trust: { score: 90, label: "high", notes: [] } };
  }
  if (agreementRatio >= 0.5) {
    return {
      speedMps,
      trust: {
        score: 60,
        label: "medium",
        notes: ["Object-tracked speed and body-motion speed only partly agreed this set"],
      },
    };
  }
  return {
    speedMps,
    trust: {
      score: 30,
      label: "low",
      notes: [
        `Object-tracked speed (${objectSignal.speedMps.toFixed(1)} m/s) and body-motion speed ` +
          `(${proxySignal.speedMps.toFixed(1)} m/s) disagreed significantly this set -- treat with caution`,
      ],
    },
  };
}

// A single time window within a longer recording that a throw-type motion (med-ball, kb-swing)
// actually happened in -- the equivalent of bar-tracking.ts's own RepBreakdown.startT/endT for a
// cyclic lift, just detected differently. A barbell rep is a direction reversal in a continuous
// motion (segmentPhases' concentric/eccentric split); a thrown implement's reps are each their
// own separate event with real dead time between them (the athlete resets, picks the ball back
// up), so this segments on sustained above-threshold speed instead of a direction change.
// startT/endT are in the same units as the samples passed in -- milliseconds, matching every
// other startT/endT in this pipeline (RepBreakdown, jump-tracking.ts's own windows, every AV
// tracker dialog's own `t = f.timestamp * 1000`), NOT seconds.
export type ThrowRepWindow = { repNumber: number; startT: number; endT: number };

// Below this speed, the implement isn't being thrown -- it's being held, carried back to the
// start position, or handed off between reps. Deliberately low relative to
// MAX_PLAUSIBLE_BALL_SPEED_MPS (av-medball-tracker-dialog.tsx) -- this only has to separate
// "actively throwing" from "not," not judge how hard any given throw was. Untuned against real
// footage, same caveat as every other plausibility constant in this pipeline.
const THROW_ACTIVE_SPEED_FLOOR_MPS = 1.2;

// Once the speed trace drops back under the floor, it has to stay there this long before a NEW
// above-floor stretch counts as a separate rep rather than a continuation of the same one --
// without this, a single throw's own natural speed dip mid-motion (deceleration through release,
// into the follow-through, before the arm re-accelerates to reset) would split one real throw
// into two counted reps. Milliseconds, not seconds -- see ThrowRepWindow's own comment on why.
const MIN_REP_GAP_MS = 350;

// Below this duration, an above-floor stretch is more likely a tracking spike (the implement
// tracker briefly locking onto something wrong) than a real throw -- a real throw's
// acceleration-to-release arc takes measurably longer than one bad frame reading a false speed.
// Milliseconds, not seconds -- see ThrowRepWindow's own comment on why.
const MIN_REP_DURATION_MS = 120;

// Segments a chronological speed trace (frame-to-frame speed samples, already computed by the
// caller from whichever signal best reflects the implement's own motion -- the ball's tracked
// position for med-ball, same idea for kb-swing) into individual rep windows. samples[].t must be
// milliseconds (see ThrowRepWindow's own comment) -- every other timestamp field in this pipeline
// already is, so callers building a trace from an existing frames/points array (which already
// carry a millisecond t) need no conversion. Merges near-adjacent above-floor stretches
// (MIN_REP_GAP_MS) and drops anything too short to be a real throw (MIN_REP_DURATION_MS) -- same
// "phantom phase" filtering bar-tracking.ts's own segmentPhases already does for cyclic lifts,
// adapted to event-based motion instead of direction reversals. Returns zero windows (not a
// fallback single window) when nothing in the trace ever clears the floor -- callers decide what
// "no reps detected" means for them, same "no number is better than a wrong one" stance every
// other signal in this file takes.
export function detectThrowReps(samples: { t: number; speed: number }[]): ThrowRepWindow[] {
  if (samples.length === 0) return [];
  const sorted = [...samples].sort((a, b) => a.t - b.t);

  type RawWindow = { startT: number; endT: number };
  const raw: RawWindow[] = [];
  let current: RawWindow | null = null;
  for (const s of sorted) {
    if (s.speed >= THROW_ACTIVE_SPEED_FLOOR_MPS) {
      if (current == null) {
        current = { startT: s.t, endT: s.t };
      } else {
        current.endT = s.t;
      }
    } else if (current != null) {
      raw.push(current);
      current = null;
    }
  }
  if (current != null) raw.push(current);

  const merged: RawWindow[] = [];
  for (const w of raw) {
    const last = merged[merged.length - 1];
    if (last && w.startT - last.endT <= MIN_REP_GAP_MS) {
      last.endT = w.endT;
    } else {
      merged.push({ ...w });
    }
  }

  return merged
    .filter((w) => w.endT - w.startT >= MIN_REP_DURATION_MS)
    .map((w, i) => ({ repNumber: i + 1, startT: w.startT, endT: w.endT }));
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

// ---------- Vision pipeline calibration (units-crossing, not a nudge) ----------
// computeHeightScaleCorrection above assumes worldLandmarks are ALREADY approximately
// real-world meters (true for MediaPipe and ARKit alike) and just nudges that estimate
// toward this specific athlete's proportions -- factor stays near 1.0, and anything outside
// [0.85, 1.15] is rejected as noise rather than a genuine correction. Vision-sourced
// worldLandmarks (see vision-body-landmarks.ts) are NOT in that position at all: Vision has
// no depth information whatsoever, so its worldLandmarks-slot values are pixel-space (an
// arbitrary unit with zero inherent relationship to meters) until calibrated for the first
// time. Reusing computeHeightScaleCorrection as-is here would either be meaningless (its
// hardcoded NOSE_TO_CROWN_M is a real-meters anthropometric constant, not a pixel-space one)
// or would simply always return null (a pixel-space "height" of a few hundred/thousand units
// vs. a real height in meters is nowhere near the plausibility band's near-1.0 window) --
// this is a genuinely different calibration problem: bootstrapping meters-per-pixel-unit from
// scratch, not nudging an existing metric estimate.

// Average shoulder (acromion) height as a fraction of standing height --
// Drillis & Contini's widely-cited anthropometric proportions, the same
// family of "body segment as a fraction of stature" data ergonomics/
// biomechanics references use. Only reached as a FALLBACK below when no
// frame ever showed the athlete's whole body (nose to ankles) at once --
// real people vary around this average more than a direct height
// measurement does, so this is deliberately less precise than the primary
// method, not a replacement for it.
const SHOULDER_HEIGHT_FRACTION = 0.818;

// Same nose-to-ankle-span idea as computeImpliedStandingHeightM, but returns the RAW pixel-
// space span with no anthropometric NOSE_TO_CROWN_M add-on -- that 0.12m constant is
// real-meters-specific, and estimating its pixel-space equivalent would need a scale factor
// this function's own job is to produce, a circular dependency not worth introducing for a
// small, consistent underestimate of true standing height.
//
// Falls back to a shoulder-to-ankle span (scaled by SHOULDER_HEIGHT_FRACTION above) when nose
// isn't visible in any frame that has both ankles -- a phone mounted at a typical rack-facing
// distance/height clips the top of the frame (the head, especially mid-rep when it tips down or
// reaches overhead) far more often than it clips the feet, and requiring the exact nose-to-ankle
// reading meant an athlete had to consciously stand back and check themselves fully into frame
// before every single set for calibration to work at all. Shoulders are the most reliably
// visible landmark pair in an ordinary lifting frame (already relied on elsewhere for exactly
// this reason -- see implement-tracking.ts's own shoulderPixelsPerMeter), so this fallback
// succeeds in most of the cases the strict version used to reject outright.
// How much of a head-to-ankle segment's total length has to lie along the vertical axis
// before that segment's VERTICAL component can stand in for the athlete's standing height.
//
// This whole calibration reads one number off the frame -- the vertical drop from head (or
// shoulders) to ankles -- and calls it the athlete's height. That identity only holds while
// they are actually upright. Lying on a bench, head-to-ankle is a mostly HORIZONTAL span, and
// its vertical component is just the leftovers: bench incline, camera tilt, perspective. That
// leftover is still a positive number, so the bare `span > 0` test this used to do accepted
// it, divided a real 1.8m height by a fraction of the pixels it should have, and handed every
// downstream metric a scale several times too large.
//
// Confirmed against a real field report -- bench press, camera behind the head, athlete's
// height on file. Reported 154cm of range of motion against 39cm actually pressed (~4x), and
// the same 4x rode through into velocity, power, bar-path deviation and the "bar drifted 29.4
// in" form fault. It also doubled the rep count: BASE_MIN_REP_AMPLITUDE_CM (bar-tracking.ts)
// rejects reversals under 20cm as noise, and at 4x the athlete's ordinary 5cm of wobble clears
// that floor, so 9 real reps segmented into 18. Every one of those numbers was presented with
// no indication anything was wrong, because nothing checked.
//
// 0.75 sits well clear of both cases rather than splitting them: a standing athlete runs
// ~0.97-1.0 here (head directly above ankles), and supine runs near zero. Deep squats and
// hinges compress the ratio, but calibrateFromFrames takes a MEDIAN across every frame of the
// take, and the setup/lockout frames that bracket any barbell set are upright -- so this costs
// those lifts sample count, not calibration.
const MIN_UPRIGHT_VERTICAL_FRACTION = 0.75;

// True when the head-to-ankle segment is upright enough for its vertical component to mean
// what impliedStandingHeightPixels needs it to mean. Compares against the segment's own full
// 3D length rather than any absolute threshold, so it is independent of the athlete's real
// height, their distance from the camera, and the units of whatever pipeline produced these
// landmarks.
function uprightEnough(verticalSpan: number, head: Landmark, ankleY: number, ankleX: number, ankleZ: number): boolean {
  const dx = head.x - ankleX;
  const dy = head.y - ankleY;
  const dz = head.z - ankleZ;
  const totalLength = Math.hypot(dx, dy, dz);
  if (!(totalLength > 0)) return false;
  return verticalSpan / totalLength >= MIN_UPRIGHT_VERTICAL_FRACTION;
}

// Biacromial (shoulder-to-shoulder) breadth as a fraction of standing height -- same
// Drillis & Contini anthropometric family as SHOULDER_HEIGHT_FRACTION above. A standing
// athlete's height is therefore about 4.1x their shoulder width.
const SHOULDER_BREADTH_FRACTION = 0.245;

// The floor on impliedHeight / shoulderWidth before a frame is trusted to be showing a
// body at something like its true length.
//
// uprightEnough above is necessary but NOT sufficient, and on the 2D Vision path it is
// weaker than it looks: visionJointsToWorldLandmarks fills z with 0 (Vision's 2D request
// has no depth), so that check reduces to "which way does this body run across the IMAGE."
// It correctly rejects a supine athlete filmed from the side of the bench, whose body lies
// across the frame -- but a supine athlete filmed end-on, from the foot or the head of the
// bench, runs UP AND DOWN the frame just like a standing one. Direction alone waves that
// through, and it is the single most foreshortened view there is: the body points straight
// away from the lens, so head-to-ankle collapses to a fraction of its real length and the
// scale inflates by exactly that fraction.
//
// Shoulder width is the check that catches it, because it is roughly perpendicular to the
// body's long axis: rotating a body away from the camera about its left-right axis
// foreshortens head-to-ankle while leaving shoulder width alone. So the RATIO between them
// measures foreshortening directly, and it is free of everything that would otherwise have
// to be known -- the athlete's real height, their distance from the lens, the units of
// whatever pipeline produced the landmarks.
//
// 2.5 against an anatomical ~4.1 leaves generous room for real build variation, a shoulder
// width itself partly foreshortened, and ordinary perspective, while still sitting far
// above the ~1-2 an end-on supine frame produces. A standing athlete filmed from the side
// has overlapping shoulders and a tiny shoulder width, which only pushes this ratio up.
const MIN_HEIGHT_TO_SHOULDER_RATIO = 2.5;

// Whether the implied standing height is anatomically consistent with the shoulder width
// measured on the same frame. Returns true when shoulder width can't be measured at all --
// this is a check for a specific, identifiable failure, not another visibility gate.
function foreshorteningPlausible(impliedHeight: number, worldLandmarks: Landmark[]): boolean {
  const lShoulder = worldLandmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rShoulder = worldLandmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  if (!visible(lShoulder) || !visible(rShoulder)) return true;
  const shoulderWidth = Math.hypot(
    lShoulder.x - rShoulder.x,
    lShoulder.y - rShoulder.y,
    lShoulder.z - rShoulder.z,
  );
  if (!(shoulderWidth > 0)) return true;
  return impliedHeight / shoulderWidth >= MIN_HEIGHT_TO_SHOULDER_RATIO;
}

function impliedStandingHeightPixels(worldLandmarks: Landmark[], verticalSign: 1 | -1): number | null {
  const lAnkle = worldLandmarks[POSE_LANDMARKS.LEFT_ANKLE];
  const rAnkle = worldLandmarks[POSE_LANDMARKS.RIGHT_ANKLE];
  if (!visible(lAnkle) || !visible(rAnkle)) return null;
  const ankleY = (lAnkle.y + rAnkle.y) / 2;
  const ankleX = (lAnkle.x + rAnkle.x) / 2;
  const ankleZ = (lAnkle.z + rAnkle.z) / 2;

  const nose = worldLandmarks[POSE_LANDMARKS.NOSE];
  if (visible(nose)) {
    const span = verticalSign * (ankleY - nose.y);
    if (
      span > 0 &&
      uprightEnough(span, nose, ankleY, ankleX, ankleZ) &&
      foreshorteningPlausible(span, worldLandmarks)
    ) {
      return span;
    }
  }

  const lShoulder = worldLandmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rShoulder = worldLandmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  if (visible(lShoulder) && visible(rShoulder)) {
    const shoulderY = (lShoulder.y + rShoulder.y) / 2;
    const shoulderToAnkle = verticalSign * (ankleY - shoulderY);
    const shoulderMid: Landmark = {
      ...lShoulder,
      x: (lShoulder.x + rShoulder.x) / 2,
      y: shoulderY,
      z: (lShoulder.z + rShoulder.z) / 2,
    };
    const impliedHeight = shoulderToAnkle / SHOULDER_HEIGHT_FRACTION;
    if (
      shoulderToAnkle > 0 &&
      uprightEnough(shoulderToAnkle, shoulderMid, ankleY, ankleX, ankleZ) &&
      foreshorteningPlausible(impliedHeight, worldLandmarks)
    ) {
      return impliedHeight;
    }
  }

  // Neither upright branch could resolve this frame. Before giving up, the one remaining
  // case worth trying is a body that is lying down but still shown at its true length --
  // see supineInPlaneHeightPixels. Reached for every upright failure, not just a failed
  // uprightEnough check: a body square-on to a side camera has a vertical span of almost
  // exactly zero, so it falls out at the `span > 0` tests above long before orientation is
  // ever considered.
  return supineInPlaneHeightPixels(worldLandmarks, ankleX, ankleY, ankleZ);
}

// Above this share of its own length lying along the vertical axis, a body is not "lying
// down" in any useful sense and the supine branch below must not touch it. Deliberately far
// below MIN_UPRIGHT_VERTICAL_FRACTION rather than just under it, so the two leave a wide
// band of nothing between them: a body in that band (an athlete folded at the bottom of a
// deep squat, a hinge) calibrates through neither, which is the correct answer for both.
// Without that gap the supine branch would happily accept a squat's bottom frames, whose
// straight-line head-to-ankle distance is barely half a real standing height, and inflate
// the scale for the one lift this pipeline measures best today.
const MAX_SUPINE_VERTICAL_FRACTION = 0.35;

// The one case where a lying athlete CAN still be calibrated from their own height: filmed
// from the side, their head-to-ankle segment lies flat in the image plane at very close to
// its true length, even though almost none of it is vertical. Measure that segment's full
// length instead of its vertical component, and the athlete's real height maps onto it the
// same way it maps onto a standing body's vertical drop.
//
// This is what makes a side-on bench press measurable at all. It deliberately does NOT help
// the end-on view (camera at the foot or head of the bench): there the same segment points
// straight away from the lens, and foreshorteningPlausible rejects it -- correctly, since
// there is no information in that frame about how long the body really is.
//
// UNVALIDATED against real footage (this environment has no camera). The geometry is sound
// and the foreshortening guard is the same one the upright path uses, but treat the numbers
// it produces as provisional until a side-on set has been shot against a bar sensor -- see
// docs/camera-tracking-notes.md.
function supineInPlaneHeightPixels(
  worldLandmarks: Landmark[],
  ankleX: number,
  ankleY: number,
  ankleZ: number,
): number | null {
  const nose = worldLandmarks[POSE_LANDMARKS.NOSE];
  if (!visible(nose)) return null;
  const totalLength = Math.hypot(nose.x - ankleX, nose.y - ankleY, nose.z - ankleZ);
  if (!(totalLength > 0)) return null;
  const verticalFraction = Math.abs(nose.y - ankleY) / totalLength;
  if (verticalFraction > MAX_SUPINE_VERTICAL_FRACTION) return null;
  // Same anatomical check as every other branch, and here it is doing the whole job: it is
  // what separates a body lying ACROSS the frame at true length (side-on, ratio ~4) from one
  // pointing AWAY from the lens (end-on, ratio ~1).
  if (!foreshorteningPlausible(totalLength, worldLandmarks)) return null;
  return totalLength;
}

// Diagnostic-only mirror of impliedStandingHeightPixels' own branching, for the AR Diagnosis
// admin page (see tracking-diagnostics.ts) -- reports which method each frame actually
// resolved calibration through (or neither) without touching calibrateFromFrames' own
// median-of-samples math at all. Deliberately a separate pass over the same frames rather
// than threading a method tag through the real calibration path -- calibrateFromFrames has
// six call sites across every AV tracker dialog, and this keeps that path's behavior
// completely unchanged while still answering "why didn't this calibrate" for a failed set.
export function calibrationMethodBreakdown(
  frames: { worldLandmarks: Landmark[] }[],
): {
  noseToAnkleFrames: number;
  shoulderToAnkleFrames: number;
  supineFullLengthFrames: number;
  unresolvedFrames: number;
} {
  let noseToAnkleFrames = 0;
  let shoulderToAnkleFrames = 0;
  let supineFullLengthFrames = 0;
  let unresolvedFrames = 0;
  let lastSign: 1 | -1 = 1;
  for (const f of frames) {
    const sign: 1 | -1 = worldVerticalSign(f.worldLandmarks) ?? lastSign;
    lastSign = sign;
    const lAnkle = f.worldLandmarks[POSE_LANDMARKS.LEFT_ANKLE];
    const rAnkle = f.worldLandmarks[POSE_LANDMARKS.RIGHT_ANKLE];
    if (!visible(lAnkle) || !visible(rAnkle)) {
      unresolvedFrames++;
      continue;
    }
    const ankleY = (lAnkle.y + rAnkle.y) / 2;
    const ankleX = (lAnkle.x + rAnkle.x) / 2;
    const ankleZ = (lAnkle.z + rAnkle.z) / 2;
    const nose = f.worldLandmarks[POSE_LANDMARKS.NOSE];
    const noseSpan = visible(nose) ? sign * (ankleY - nose.y) : 0;
    // Same MIN_UPRIGHT_VERTICAL_FRACTION gate the real path applies, so a supine take reports
    // as unresolved here instead of claiming a calibration method that was actually rejected.
    // Without this the diagnostics actively mislead: the field report that found the supine
    // bug read "calibration succeeded -- nose-to-ankle on 140/781 frames" for a bench set
    // whose scale was ~4x wrong.
    if (
      visible(nose) &&
      noseSpan > 0 &&
      uprightEnough(noseSpan, nose, ankleY, ankleX, ankleZ) &&
      foreshorteningPlausible(noseSpan, f.worldLandmarks)
    ) {
      noseToAnkleFrames++;
      continue;
    }
    const lShoulder = f.worldLandmarks[POSE_LANDMARKS.LEFT_SHOULDER];
    const rShoulder = f.worldLandmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
    if (visible(lShoulder) && visible(rShoulder)) {
      const shoulderY = (lShoulder.y + rShoulder.y) / 2;
      const shoulderSpan = sign * (ankleY - shoulderY);
      const shoulderMid: Landmark = {
        ...lShoulder,
        x: (lShoulder.x + rShoulder.x) / 2,
        y: shoulderY,
        z: (lShoulder.z + rShoulder.z) / 2,
      };
      if (
        shoulderSpan > 0 &&
        uprightEnough(shoulderSpan, shoulderMid, ankleY, ankleX, ankleZ) &&
        foreshorteningPlausible(shoulderSpan / SHOULDER_HEIGHT_FRACTION, f.worldLandmarks)
      ) {
        shoulderToAnkleFrames++;
        continue;
      }
    }
    // Same last-resort branch the real path takes -- a lying body shown at true length.
    if (supineInPlaneHeightPixels(f.worldLandmarks, ankleX, ankleY, ankleZ) != null) {
      supineFullLengthFrames++;
    } else {
      unresolvedFrames++;
    }
  }
  return { noseToAnkleFrames, shoulderToAnkleFrames, supineFullLengthFrames, unresolvedFrames };
}

// First of Vision's two calibration mechanisms: the athlete's own known real height compared
// against their implied height in the pipeline's pixel-space units, at the same "standing
// fully visible" moment computeImpliedStandingHeightM's callers already sample from. Returns
// meters-per-pixel-unit (feed straight into scaleWorldLandmarks, same application point every
// other calibration mode already uses) -- not a near-1.0 nudge, so no plausibility band is
// applied here the way computeHeightScaleCorrection's is; a wildly-off reading (a bad angle,
// partial occlusion) shows up downstream as an implausible scaled metric instead, the same
// "flag, don't silently reject" stance this app takes elsewhere (e.g. SprintResult's own
// likelyGlitch) rather than a magic band tuned for a units problem this function doesn't have.
export function computePixelToMeterScale(
  worldLandmarks: Landmark[],
  verticalSign: 1 | -1,
  athleteHeightIn: number | null | undefined,
): number | null {
  if (!athleteHeightIn || athleteHeightIn <= 0) return null;
  const impliedHeightPixels = impliedStandingHeightPixels(worldLandmarks, verticalSign);
  if (impliedHeightPixels == null) return null;
  const trueHeightM = athleteHeightIn * 0.0254;
  return trueHeightM / impliedHeightPixels;
}

// Second calibration mechanism: a known-size reference object (a bumper plate, a regulation
// ball) visible in frame, instead of the athlete's own height -- same units-crossing ratio,
// given a measured pixel-space size (in this bridge's pixel-space units, whatever produced
// it -- Vision object detection is a separate, later piece of work) and the object's real,
// known size. Deliberately generic over what "size" means (a diameter, a side length) --
// callers are responsible for measuring and supplying consistent units on both sides.
//
// toleranceM is real, not decoration: a "known" plate size is only ever an assumption unless
// a coach has actually measured the specific plate on the bar. Bumper plates from different
// manufacturers (Rogue, Eleiko, Perform Better, off-brand) all target roughly the same
// training-standard diameter but don't cast identically -- treating that as one exact
// constant would silently understate error on every calibration that uses it. Passing 0 means
// the caller supplied a real measurement (a coach's own tape-measure reading), not an
// assumption -- the only case where uncertaintyFraction should come back 0.
export function computeReferenceObjectScale(
  measuredPixelSize: number,
  knownRealSizeM: number,
  toleranceM = 0,
): { scale: number; uncertaintyFraction: number } | null {
  if (!(measuredPixelSize > 0) || !(knownRealSizeM > 0) || toleranceM < 0) return null;
  return {
    scale: knownRealSizeM / measuredPixelSize,
    uncertaintyFraction: toleranceM / knownRealSizeM,
  };
}

// A named reference size with its own honest uncertainty, not a bare exact-looking number --
// see computeReferenceObjectScale's own comment on why a single constant would be dishonest
// here. "generic" entries are a best-effort assumption for when the coach hasn't confirmed
// exactly which plate/ball is on the bar; a coach-measured value should always be preferred
// (build a reference with toleranceM: 0 from that instead of looking one up here).
export type CalibrationReference = {
  id: string;
  label: string;
  nominalSizeM: number;
  toleranceM: number;
};

// Deliberately small, and every entry below is either a rules-regulated sport object or backed
// by a real, sourced spec number plus an independent confirming measurement -- no invented
// brand-specific "exact" diameters, which would repeat the exact mistake this whole mechanism
// exists to avoid, just one level more specific. A coach who knows their exact plate/ball
// should still prefer measuring it and calibrating with toleranceM: 0 over picking one of these.
export const CALIBRATION_REFERENCES: CalibrationReference[] = [
  {
    id: "bumper_plate_generic",
    label: "Bumper plate (brand unknown)",
    // 450mm / 17.7in is the near-universal training standard most bumper plate
    // manufacturers target regardless of weight (unlike solid metal plates, whose diameter
    // genuinely scales with load) -- IWF competition plates hold this to ~1mm, but training/
    // commercial plates commonly run a few mm off it from mold and rubber-thickness variance
    // across brands. ±1.8% covers that realistic spread without pretending to know which
    // brand is actually on the bar.
    nominalSizeM: 0.45,
    toleranceM: 0.008,
  },
  {
    id: "bumper_plate_perform_better",
    label: "Bumper plate (Perform Better)",
    // Unlike the generic entry above, this one has two independent, agreeing sources: Perform
    // Better's own First Place bumper line spec (17.7in / 450mm, constant across weights) and a
    // direct tape measurement of an actual 10lb plate from this app's own field-testing ("a
    // little more than 17.5in"). NOT every plate that says "bumper" on it holds this constant,
    // though -- a rubber-coated tri-grip/grip-style plate from the same gym measured 13in at
    // 25lb and 14.5in at 35lb, genuinely scaling with weight like a solid plate would. Only use
    // this entry when a true full-diameter bumper (not a grip-style plate) is confirmed on the
    // bar -- see computeReferenceObjectScale's own comment on why guessing which type is loaded
    // would be worse than not calibrating at all.
    nominalSizeM: 0.45,
    toleranceM: 0.006,
  },
  {
    id: "tri_grip_plate_25_35lb",
    label: "Tri-grip plate, 25-35lb (secondary set)",
    // Doesn't need to know the exact weight loaded to be useful -- this is barbell PATH
    // tracking, not weight identification, so a wide-but-real window across the family still
    // narrows the plausible real-world scale far more than no reference at all (same reasoning
    // as weighted_training_ball below). Two direct tape measurements from the same gym: 13in at
    // 25lb, 14.5in at 35lb, with 14.75in confirmed as the hard boundary before it becomes a
    // 45lb plate (see bumper_plate_perform_better's own comment on why this family scales with
    // weight at all, unlike a true bumper). Nominal sits at the midpoint of that confirmed
    // 13-14.75in span; deliberately does NOT extend to cover the 45lb plate, whose actual size
    // was never measured, only bounded below. Labeled "secondary set" because this gym's tri-
    // grip plates aren't used in unison with the primary Perform Better bumpers for tracked
    // lifts -- only small metal change plates (5lb/2.5lb) are.
    nominalSizeM: 0.3524,
    toleranceM: 0.0222,
  },
  {
    id: "baseball_regulation",
    label: "Baseball (regulation)",
    // MLB/NCAA Official Baseball Rule 3.02 fixes circumference at 9-9.25in, which works out to
    // ~72.8-74.8mm diameter -- a rules-regulated range, not a brand guess, so the tolerance here
    // is the legal spread itself (nominal at the range's midpoint) rather than an assumption.
    nominalSizeM: 0.0738,
    toleranceM: 0.001,
  },
  {
    id: "softball_regulation",
    label: "Softball (regulation, 12in)",
    // ASA/USA Softball & NCAA rules fix a 12in (fast-pitch/slow-pitch standard) softball's
    // circumference at 11.88-12.13in, which works out to ~96.1-98.1mm diameter -- same
    // "tolerance is the legal range itself" approach as baseball_regulation above. An 11in
    // softball also exists in some slow-pitch leagues (smaller, ~84-85mm) -- this entry is the
    // more common 12in size; a coach who knows it's the 11in variant should measure directly.
    nominalSizeM: 0.0971,
    toleranceM: 0.001,
  },
  {
    id: "weighted_training_ball",
    label: "Weighted training ball (baseball-to-softball range)",
    // For the weighted balls used in throwing drills (not a regulation game ball) -- these
    // genuinely vary in size ball-to-ball, roughly baseball-sized up through softball-sized,
    // with no single documented constant the way a regulation baseball or golf ball has. Rather
    // than invent a fake-precise number for an object that legitimately has none, this spans
    // the full baseball_regulation-to-softball_regulation range as one wide, honest confidence
    // window: nominal at the range's own midpoint, tolerance at half its spread (~72.8mm to
    // ~98.1mm across both entries' own sourced bounds -- see their own comments). A coach who
    // knows the specific ball's actual diameter should still measure it directly instead.
    nominalSizeM: 0.0855,
    toleranceM: 0.0127,
  },
  {
    id: "golf_ball_regulation",
    label: "Golf ball (regulation)",
    // USGA/R&A Rules of Golf, Equipment Rules set a hard MINIMUM diameter of 42.67mm -- no
    // stated maximum, but real manufactured balls cluster tightly at or just above it (going
    // bigger only costs performance), so this is one of the tightest-tolerance objects
    // available for calibration.
    nominalSizeM: 0.0427,
    toleranceM: 0.0001,
  },
  {
    id: "med_ball_giant_20lb",
    label: "Medicine ball, 20lb (Giant Lifting)",
    // Unlike a bumper plate or a sport-regulated ball, a medicine ball's diameter genuinely
    // grows with its weight AND varies by brand/line -- there's no single "medicine ball"
    // constant, so this entry only applies to THIS specific weight and brand, from a direct
    // tape measurement (~7in) of an actual ball, not a spec sheet. A different weight or brand
    // needs its own separately-measured entry, not an interpolation from this one.
    nominalSizeM: 0.1778,
    toleranceM: 0.005,
  },
  {
    id: "med_ball_giant_15lb",
    label: "Medicine ball, 15lb (Giant Lifting)",
    // No direct measurement of this one -- linearly interpolated between the two real anchors
    // that DO exist: the large unbranded slam-ball family's ~9.5in tile-grid read at 10lb
    // (large_med_ball_10_30lb below) and Giant Lifting's own direct 7in tape measurement at 20lb
    // (med_ball_giant_20lb above). Those two anchors are different product lines (a soft
    // training slam ball vs. Giant's denser line), so this is a genuine extrapolation across
    // brands, not a same-product interpolation -- by explicit instruction rather than a
    // measurement. nominalSizeM sits at the exact midpoint; toleranceM is set to reach exactly
    // the two source anchors (7in-9.5in) rather than some smaller invented band, so the stated
    // confidence never claims more than "somewhere between the two real numbers we have."
    nominalSizeM: 0.2095,
    toleranceM: 0.0318,
  },
  {
    id: "large_med_ball_10_30lb",
    label: "Med/slam ball, 10-30lb (large family)",
    // Unlike med_ball_giant_20lb above (a direct tape measurement of one specific ball), this
    // covers three unbranded slam balls (10lb, 15lb, 30lb) plus a Perform Better "PB Extreme"
    // 20lb ball, estimated from tile-grid photos (25in puzzle-piece tiles, same floor as the
    // baseball/golf-ball reference shots) rather than a tape reading directly against the ball
    // -- a real but lower-precision method, so this carries a wider tolerance than the
    // tape-measured entries elsewhere in this file. Confirmed directly: these balls are
    // "roughly the same size" across that whole weight range -- weight comes from density, not
    // a bigger ball, the same reasoning that makes a competition kettlebell's body diameter
    // weight-invariant. Nominal sits near the middle of the individual tile-grid estimates
    // (~8.5-11in across the four balls); tolerance is wide enough to cover that real spread
    // honestly rather than claim a precision this method doesn't have.
    nominalSizeM: 0.2413,
    toleranceM: 0.0254,
  },
  {
    id: "hard_med_ball_2lb",
    label: "Hard med ball, 2lb",
    // A distinctly different, much smaller class from the "large" family above -- a small,
    // dense, low-weight training ball, not a scaled-down version of the same product.
    // Tile-grid estimate only (no tape reading), same lower-confidence caveat as
    // large_med_ball_10_30lb.
    nominalSizeM: 0.1651,
    toleranceM: 0.019,
  },
];

// Real-world diameter band a genuine medicine/slam ball can plausibly fall within, in meters --
// NOT an invented number: derived directly from this file's own CALIBRATION_REFERENCES entries
// for the medicine-ball family above (med_ball_giant_20lb, med_ball_giant_15lb,
// large_med_ball_10_30lb, hard_med_ball_2lb), taking the widest span any of their own
// nominalSizeM +/- toleranceM bands reaches. If a new measured med-ball reference is ever added
// above, this band should be revisited against it too rather than left to drift out of sync.
export const MED_BALL_PLAUSIBLE_DIAMETER_RANGE_M = { min: 0.14, max: 0.27 };

// Converts a CoreML-detected implement's own bounding box into an estimated real-world
// diameter, using whatever pixels-per-meter scale calibrateFromFrames/computeReferenceObjectScale
// already computed for this clip -- see AvBodyTrackingPlugin.swift's AvCoreMlImplementDetector
// for where the box itself comes from and native-av-preview.ts's PoseCoreMlImplement for its
// shape (normalized 0-1 width/height, same convention as every other coordinate this bridge
// hands back). Takes the larger of width/height in pixels rather than an average -- a ball's
// box should be roughly square, and the larger side is slightly more robust to partial
// occlusion clipping one edge than an average would be.
export function estimateImplementDiameterM(
  box: { width: number; height: number },
  frameWidth: number,
  frameHeight: number,
  metersPerPixel: number,
): number {
  const boxDiameterPx = Math.max(box.width * frameWidth, box.height * frameHeight);
  return boxDiameterPx * metersPerPixel;
}

// Cross-checks an estimated implement diameter against MED_BALL_PLAUSIBLE_DIAMETER_RANGE_M --
// e.g. a detection reading ~45cm across is far more likely a weight plate than a medicine ball,
// even if the CoreML model itself was confident. Deliberately approximate, not a hard gate: the
// calibration scale is anchored to the athlete's body plane, while a thrown ball is often at a
// different depth in the scene at the moment of release, so this can only ever be a soft
// corroborating signal -- same role as implement-appearance-memory.ts's color check plays for
// the motion-diff tracker, never something tracking is rejected over on its own.
export function isPlausibleMedBallSize(diameterM: number): boolean {
  return (
    diameterM >= MED_BALL_PLAUSIBLE_DIAMETER_RANGE_M.min &&
    diameterM <= MED_BALL_PLAUSIBLE_DIAMETER_RANGE_M.max
  );
}

// Turns an uncertainty fraction into the same kind of plain-language note
// bar-tracking.ts's RepTrustScore.notes already surfaces for every other source of tracking
// uncertainty (position-fusion confidence, tracker disagreement, camera alignment) -- this is
// that pattern's calibration-side equivalent, not a new one-off. Returns null for a
// coach-confirmed exact measurement (uncertaintyFraction 0), since there's nothing to caveat.
export function calibrationConfidenceNote(uncertaintyFraction: number): string | null {
  if (uncertaintyFraction <= 0) return null;
  const pct = Math.round(uncertaintyFraction * 1000) / 10;
  return `Calibrated from a generic size assumption (±${pct}%) -- confirm the exact plate/ball size for tighter accuracy.`;
}

// Not enough samples to trust a correction -- same "don't apply a bad multiplier with false
// confidence" bar the ARKit-era height correction (MIN/MAX_PLAUSIBLE_SCALE_CORRECTION above)
// already established as a working precedent for this app, applied to the units-crossing
// case instead of the near-1.0-nudge case.
export const MIN_CALIBRATION_SAMPLES = 5;

// Shared by every AV-pipeline tracker dialog that needs metric calibration (Jump, Mechanics,
// Swing today) -- was duplicated near-identically across all three before this: walks every
// tracked frame's raw (pixel-space) worldLandmarks, tracks vertical sign per-frame the same
// way live ARKit tracking does (worldVerticalSign can return null on a single noisy frame;
// falls back to the last known-good sign rather than defaulting to a guess), and returns the
// median of every valid computePixelToMeterScale sample. Consolidated here so a fix to this
// logic (or the sample-count bar) lands in one place, not three separately-drifting copies.
export function calibrateFromFrames(
  frames: { worldLandmarks: Landmark[] }[],
  heightIn: number | null | undefined,
): number | null {
  if (!heightIn || heightIn <= 0) return null;
  let lastSign: 1 | -1 = 1;
  const samples: number[] = [];
  for (const f of frames) {
    const sign: 1 | -1 = worldVerticalSign(f.worldLandmarks) ?? lastSign;
    lastSign = sign;
    const candidate = computePixelToMeterScale(f.worldLandmarks, sign, heightIn);
    if (candidate != null) samples.push(candidate);
  }
  if (samples.length < MIN_CALIBRATION_SAMPLES) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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

// Hip angle (shoulder-hip-knee, the trunk-to-thigh angle), per side -- one joint up the leg chain
// from frameKneeAnglesBySide above, same worldAngleAtVertex math. Not wired into any fault
// threshold yet; exists so chainConsistencyPenalty below has a real hip reading to cross-check
// the knee against, the same "hip-knee-ankle should move together" reasoning this session's own
// kinetic-chain discussion settled on.
function frameHipAnglesBySide(worldLm: Landmark[]): { left: number | null; right: number | null } {
  const lShoulder = worldLm[POSE_LANDMARKS.LEFT_SHOULDER];
  const rShoulder = worldLm[POSE_LANDMARKS.RIGHT_SHOULDER];
  const lHip = worldLm[POSE_LANDMARKS.LEFT_HIP];
  const rHip = worldLm[POSE_LANDMARKS.RIGHT_HIP];
  const lKnee = worldLm[POSE_LANDMARKS.LEFT_KNEE];
  const rKnee = worldLm[POSE_LANDMARKS.RIGHT_KNEE];
  return {
    left: visible(lShoulder) && visible(lHip) && visible(lKnee) ? worldAngleAtVertex(lShoulder, lHip, lKnee) : null,
    right: visible(rShoulder) && visible(rHip) && visible(rKnee) ? worldAngleAtVertex(rShoulder, rHip, rKnee) : null,
  };
}

// Ankle angle (knee-ankle-foot, dorsi/plantarflexion) per side -- the third leg-chain joint,
// completing hip-knee-ankle.
function frameAnkleAnglesBySide(worldLm: Landmark[]): { left: number | null; right: number | null } {
  const lKnee = worldLm[POSE_LANDMARKS.LEFT_KNEE];
  const rKnee = worldLm[POSE_LANDMARKS.RIGHT_KNEE];
  const lAnkle = worldLm[POSE_LANDMARKS.LEFT_ANKLE];
  const rAnkle = worldLm[POSE_LANDMARKS.RIGHT_ANKLE];
  const lFoot = worldLm[POSE_LANDMARKS.LEFT_FOOT_INDEX];
  const rFoot = worldLm[POSE_LANDMARKS.RIGHT_FOOT_INDEX];
  return {
    left: visible(lKnee) && visible(lAnkle) && visible(lFoot) ? worldAngleAtVertex(lKnee, lAnkle, lFoot) : null,
    right: visible(rKnee) && visible(rAnkle) && visible(rFoot) ? worldAngleAtVertex(rKnee, rAnkle, rFoot) : null,
  };
}

// Elbow angle (shoulder-elbow-wrist) per side -- the arm chain's equivalent of knee angle.
function frameElbowAnglesBySide(worldLm: Landmark[]): { left: number | null; right: number | null } {
  const lShoulder = worldLm[POSE_LANDMARKS.LEFT_SHOULDER];
  const rShoulder = worldLm[POSE_LANDMARKS.RIGHT_SHOULDER];
  const lElbow = worldLm[POSE_LANDMARKS.LEFT_ELBOW];
  const rElbow = worldLm[POSE_LANDMARKS.RIGHT_ELBOW];
  const lWrist = worldLm[POSE_LANDMARKS.LEFT_WRIST];
  const rWrist = worldLm[POSE_LANDMARKS.RIGHT_WRIST];
  return {
    left: visible(lShoulder) && visible(lElbow) && visible(lWrist) ? worldAngleAtVertex(lShoulder, lElbow, lWrist) : null,
    right: visible(rShoulder) && visible(rElbow) && visible(rWrist) ? worldAngleAtVertex(rShoulder, rElbow, rWrist) : null,
  };
}

// Shoulder angle (elbow-shoulder-hip) per side -- the arm chain's proximal joint, completing
// shoulder-elbow-wrist the same way hip completes hip-knee-ankle for the leg.
function frameShoulderAnglesBySide(worldLm: Landmark[]): { left: number | null; right: number | null } {
  const lElbow = worldLm[POSE_LANDMARKS.LEFT_ELBOW];
  const rElbow = worldLm[POSE_LANDMARKS.RIGHT_ELBOW];
  const lShoulder = worldLm[POSE_LANDMARKS.LEFT_SHOULDER];
  const rShoulder = worldLm[POSE_LANDMARKS.RIGHT_SHOULDER];
  const lHip = worldLm[POSE_LANDMARKS.LEFT_HIP];
  const rHip = worldLm[POSE_LANDMARKS.RIGHT_HIP];
  return {
    left: visible(lElbow) && visible(lShoulder) && visible(lHip) ? worldAngleAtVertex(lElbow, lShoulder, lHip) : null,
    right: visible(rElbow) && visible(rShoulder) && visible(rHip) ? worldAngleAtVertex(rElbow, rShoulder, rHip) : null,
  };
}

// Wrist angle (elbow-wrist-index), completing the arm chain's third joint the same way ankle
// (knee-ankle-foot) completes the leg chain -- LEFT/RIGHT_INDEX are real landmarks in this
// skeleton (see POSE_LANDMARKS), just never used for an angle vertex until now.
function frameWristAnglesBySide(worldLm: Landmark[]): { left: number | null; right: number | null } {
  const lElbow = worldLm[POSE_LANDMARKS.LEFT_ELBOW];
  const rElbow = worldLm[POSE_LANDMARKS.RIGHT_ELBOW];
  const lWrist = worldLm[POSE_LANDMARKS.LEFT_WRIST];
  const rWrist = worldLm[POSE_LANDMARKS.RIGHT_WRIST];
  const lIndex = worldLm[POSE_LANDMARKS.LEFT_INDEX];
  const rIndex = worldLm[POSE_LANDMARKS.RIGHT_INDEX];
  return {
    left: visible(lElbow) && visible(lWrist) && visible(lIndex) ? worldAngleAtVertex(lElbow, lWrist, lIndex) : null,
    right: visible(rElbow) && visible(rWrist) && visible(rIndex) ? worldAngleAtVertex(rElbow, rWrist, rIndex) : null,
  };
}

// How much a rep's kinetic chain should dock a trust score for looking internally inconsistent --
// see this session's own "how does it all work in unison" discussion: a real per-point Vision
// confidence can stay deceptively high on a landmark that's still tracking the wrong local
// feature (a brief occlusion, a misdetection), so a joint moving noticeably less than its
// immediate neighbors in the same chain during the same rep window is a stronger tell than any
// single joint's own confidence score. This stays a coarse "did every joint in the chain show
// SOME real motion" gate rather than a precise inter-joint correlation model -- an actual
// biomechanical correlation threshold would need real reference footage this sandbox doesn't
// have (same honest-uncertainty stance as every other untuned constant in this pipeline).
const MIN_CHAIN_JOINT_RANGE_DEG = 8;
// A chain joint's range needs to fall at least this far below its most-mobile neighbor before
// it's flagged as suspiciously still, rather than ordinary rep-to-rep variation in how much any
// one joint contributes.
const CHAIN_RANGE_RATIO_FLOOR = 0.25;

export function chainConsistencyPenalty(
  frames: PoseFrame[],
  startT: number,
  endT: number,
  chain: "leg" | "arm",
): { penalty: number; note: string | null } {
  const anglesBySide: { name: string; bySide: (worldLm: Landmark[]) => { left: number | null; right: number | null } }[] =
    chain === "leg"
      ? [
          { name: "hip", bySide: frameHipAnglesBySide },
          { name: "knee", bySide: frameKneeAnglesBySide },
          { name: "ankle", bySide: frameAnkleAnglesBySide },
        ]
      : [
          { name: "shoulder", bySide: frameShoulderAnglesBySide },
          { name: "elbow", bySide: frameElbowAnglesBySide },
          { name: "wrist", bySide: frameWristAnglesBySide },
        ];

  const windowFrames = frames.filter((f) => f.t >= startT && f.t <= endT);
  if (windowFrames.length < 4) return { penalty: 0, note: null };

  const ranges = anglesBySide
    .map(({ name, bySide }) => {
      const values: number[] = [];
      for (const f of windowFrames) {
        const { left, right } = bySide(f.worldLandmarks);
        if (left != null) values.push(left);
        if (right != null) values.push(right);
      }
      if (values.length < 4) return null;
      return { name, range: Math.max(...values) - Math.min(...values) };
    })
    .filter((r): r is { name: string; range: number } => r != null);

  if (ranges.length < 2) return { penalty: 0, note: null };

  const maxRange = Math.max(...ranges.map((r) => r.range));
  if (maxRange < MIN_CHAIN_JOINT_RANGE_DEG) return { penalty: 0, note: null };

  const stillJoints = ranges.filter(
    (r) => r.range < MIN_CHAIN_JOINT_RANGE_DEG && r.range / maxRange < CHAIN_RANGE_RATIO_FLOOR,
  );
  if (stillJoints.length === 0) return { penalty: 0, note: null };

  return {
    penalty: Math.min(20, stillJoints.length * 10),
    note: `${stillJoints.map((j) => j.name).join("/")} showed little motion while other joints in the same chain moved a lot -- possible tracking glitch`,
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

// The five numbers detectFormFaults judges against, previously hardcoded
// inline. Field names match shared/schema.ts's movementProfiles columns
// exactly, so a fetched MovementProfile row can be passed straight in as
// overrides with no adapter -- a null field there means "use this default."
export interface FormFaultThresholds {
  minKneeAngleDeg: number;
  valgusRatioMin: number;
  maxTorsoLeanDeg: number;
  barPathDeviationMaxCm: number;
  barTiltMaxDeg: number;
}

const DEFAULT_FORM_FAULT_THRESHOLDS: FormFaultThresholds = {
  minKneeAngleDeg: 100,
  valgusRatioMin: 0.75,
  maxTorsoLeanDeg: 45,
  barPathDeviationMaxCm: 8,
  barTiltMaxDeg: 7,
};

// Every field on a MovementProfile is nullable (null = "use the default"),
// so this can't just be a spread -- an explicit null in overrides would
// otherwise clobber the default it's supposed to fall back to.
function resolveFormFaultThresholds(
  overrides?: Partial<Record<keyof FormFaultThresholds, number | null>> | null,
): FormFaultThresholds {
  if (!overrides) return DEFAULT_FORM_FAULT_THRESHOLDS;
  const resolved = { ...DEFAULT_FORM_FAULT_THRESHOLDS };
  for (const key of Object.keys(DEFAULT_FORM_FAULT_THRESHOLDS) as (keyof FormFaultThresholds)[]) {
    const value = overrides[key];
    if (value != null) resolved[key] = value;
  }
  return resolved;
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
  // Same rep windows summarizeTrackedSet's own repBreakdown already
  // establishes -- see bar-tracking.ts's summarizeTrackedSet for the full
  // reasoning (this is the identical problem, just for per-frame faults
  // instead of the aggregate bar-path deviation). `frames` spans the whole
  // Start Set-to-Stop Set window, including stepping back out of the rack
  // before the first rep and bending down to re-rack after the last one --
  // real motion, but not a rep, and a re-rack's forward bend easily clears
  // this function's own forward_lean threshold on its own. Left undefined
  // by any caller that doesn't have rep windows yet (falls back to every
  // frame, the prior behavior) -- same gradual-threading pattern as
  // movementType/equipment above.
  repWindows?: { startT: number; endT: number }[],
  // The active MovementProfile for movementType, when one's been applied --
  // undefined/null for everyone else, which resolves to the same defaults
  // this always used. See resolveFormFaultThresholds above.
  thresholdOverrides?: Partial<Record<keyof FormFaultThresholds, number | null>> | null,
): FormFault[] {
  const faults: FormFault[] = [];
  // Every distance-based fault label below respects the same device-level
  // cm/in preference distance-unit.ts already drives for jump height --
  // defaults to inches (see loadDistanceUnitPref's own comment), same as
  // this app's lbs-first posture everywhere else. Read once per call
  // rather than per-fault since it can't change mid-computation.
  const distanceUnit = loadDistanceUnitPref();
  const activeFrames =
    repWindows && repWindows.length > 0
      ? frames.filter((f) => repWindows.some((w) => f.t >= w.startT && f.t <= w.endT))
      : frames;
  if (activeFrames.length < 6) return faults;

  const thresholds = resolveFormFaultThresholds(thresholdOverrides);
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

  for (const frame of activeFrames) {
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
  // movementType, when known, is a HARD gate, not just a tiebreaker: a
  // Press never gets a knee/forward-lean/pelvic-drop fault no matter how
  // noisy the angle estimate got. There used to be a ROM-only fallback for
  // callers without movementType, but every current caller (bar-tracker-
  // dialog.tsx, ar-bar-tracker-dialog.tsx, ar-jump-tracker-dialog.tsx) does
  // pass it -- the only way this now reads as null is a real data gap (an
  // exercise saved through the coach edit form with Movement left blank).
  // Guessing "knee-driven" from ROM alone in that case is exactly backwards
  // for a lift lying flat on a bench: gravity-relative torso angle reads as
  // ~80-90deg from vertical by construction (the athlete IS horizontal),
  // and pose noise while supine easily crosses the 25deg ROM bar on its
  // own -- producing a squat-pattern "excessive forward lean"/"hip dropped"
  // fault on a bench press. Skipping the guess when movementType is
  // genuinely unknown is the safer failure mode here (a missed fault on a
  // rare unclassified exercise) than guessing wrong and reporting a fault
  // that contradicts the exercise's own name.
  const isKneeDrivenMovement =
    movementType != null && LOWER_BODY_MOVEMENT_TYPES.has(movementType) && kneeRangeOfMotion > 25;

  // "Overhead" for the SET as a whole: most tracked frames had both wrists
  // above the nose (see frameIsOverhead in the loop above) -- an overhead
  // squat (arm_fallout, the stricter thoracic_extension_loss threshold
  // below) or a standing overhead press (lockout_lean), as opposed to a
  // back squat or a bench/horizontal press where this fraction should
  // naturally stay low.
  const overheadFraction =
    trackedOverheadFrameCount > 0 ? overheadFrameCount / trackedOverheadFrameCount : 0;
  const isOverheadSet = overheadFraction > 0.5;

  if (context === "lift" && isKneeDrivenMovement && minKneeAngle > thresholds.minKneeAngleDeg) {
    faults.push({
      code: "shallow_depth",
      label: `Depth: knees only reached ~${Math.round(minKneeAngle)}° -- aim to break parallel`,
    });
  }

  if (isKneeDrivenMovement && valgusRatios.length) {
    const minValgusRatio = percentile(valgusRatios, 0.05);
    if (minValgusRatio < thresholds.valgusRatioMin) {
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
    } else if (maxTorsoAngle > thresholds.maxTorsoLeanDeg) {
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

  if (usesSharedBar && barPathDeviationCm > thresholds.barPathDeviationMaxCm) {
    faults.push({
      code: "bar_path_drift",
      label: `Bar drifted ${formatDistanceCm(barPathDeviationCm, distanceUnit)} off a straight vertical line`,
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
    if (Math.abs(worstTilt) > thresholds.barTiltMaxDeg) {
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
        label: `Grip width shifted ~${formatDistanceCm((widest - narrowest) * 100, distanceUnit)} during the set`,
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
        label: `One arm locked out ~${formatDistanceCm(symmetryDiffM * 100, distanceUnit)} higher than the other (${higherSide})`,
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
