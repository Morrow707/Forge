import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  summarizeTrackedSet,
  fuseSideVelocity,
  computeArmDriveAsymmetry,
  computeRepTrustScores,
  buildPathTrace,
  interpolateOcclusionGap,
  heightScaledAmplitudeCm,
  type TrackedPoint,
  type RepMetrics,
  type VelocitySample,
  type FirstPhaseHint,
} from "@/lib/bar-tracking";
import { lockCameraExposure } from "@/lib/camera-exposure";
import { ensureCameraPermission, onAppForeground, onAppBackground } from "@/lib/native-camera";
import {
  recordConfirmedAppearance,
  getRememberedAppearance,
  appearanceSimilarity,
  type ColorSignature,
} from "@/lib/implement-appearance-memory";
import { summarizeJumpSet, type JumpSetMetrics } from "@/lib/jump-tracking";
import { ImplementTracker } from "@/lib/implement-tracking";
import { getHandLandmarker, refineGripPoint } from "@/lib/hand-tracking";
import { PoseSmoother } from "@/lib/one-euro-filter";
import { hapticLight } from "@/lib/haptics";
import { recordedVideoType, videoFilenameForBlob } from "@/lib/video-recording";
import { burnTrackingOverlay, type OverlayRepMarker } from "@/lib/video-overlay";
import { refineLowerBodyLandmarks } from "@/lib/roi-refine";
import {
  getPoseLandmarker,
  getRoiPoseLandmarker,
  deriveBarPoint,
  deriveNormalizedWristPoint,
  deriveNormalizedWristPoints,
  deriveJumpPoint,
  deriveWristPoints,
  barPointConfidence,
  wristConfidence as singleWristConfidence,
  detectFormFaults,
  tiltDegreesFromPoints,
  computeRepDepths,
  computeLegDriveAsymmetry,
  guessMovementPattern,
  worldVerticalSign,
  isFullBodyInFrame,
  SubjectContinuityGate,
  computeHeightScaleCorrection,
  scaleWorldLandmarks,
  assessCameraAlignment,
  usesSharedBarEquipment,
  LOWER_BODY_MOVEMENT_TYPES,
  MIN_VISIBILITY,
  POSE_LANDMARKS,
  type PoseFrame,
  type MovementGuess,
  type MovementPattern,
  type CameraAlignment,
} from "@/lib/pose-tracking";
import {
  PoseLandmarker,
  type HandLandmarker,
  type NormalizedLandmark,
  type Landmark,
} from "@mediapipe/tasks-vision";
import {
  Camera,
  Video,
  Square,
  RotateCcw,
  Check,
  AlertTriangle,
  Sparkles,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis } from "recharts";
import { apiRequest } from "@/lib/queryClient";

type Step = "setup" | "tracking" | "review";

const SKELETON_COLOR = "#4ade80";
const TRAIL_COLOR = "#f97316";
const TRAIL_MAX_POINTS = 90;

// Loose keyword match from the exercise name to the handful of patterns
// guessMovementPattern can distinguish -- used only to flag an obvious
// mismatch ("tracking Bench Press but this moved like a Squat"), not to
// validate anything precisely. Exported for ar-bar-tracker-dialog.tsx,
// which needs the exact same mismatch check for computeRepTrustScores.
export function expectedPatternFromName(name: string): MovementPattern | null {
  const n = name.toLowerCase();
  if (n.includes("deadlift")) return "deadlift";
  if (n.includes("squat")) return "squat";
  if (/overhead|shoulder press|push press|military press/.test(n)) return "overhead_press";
  if (n.includes("bench") || n.includes("row") || n.includes("press")) return "horizontal_press_or_row";
  return null;
}

// The predetermined exercise's known starting posture, for
// summarizeTrackedSet's firstPhaseHint (see its own comment -- a
// tie-breaker only, never a hard override of the trace's own speed).
// Deliberately conservative: only returns a hint where the movementType
// taxonomy is unambiguous about what happens first.
//   - Squat/Lunge: starts standing or racked -- the first thing that
//     happens is the descent.
//   - Pull (a row): the handle/bar starts at arm's length -- the first
//     thing that happens is the pull in.
//   - Hinge whose name is a conventional/sumo/trap-bar deadlift: dead-stops
//     on the floor each rep -- the first thing that happens is the pull up.
//     Romanian deadlifts, stiff-leg deadlifts, and good mornings all carry
//     the same "Hinge" movementType but start standing and lower first, so
//     those are excluded by name rather than assumed away -- a plain
//     "Hinge" without a safely-identified conventional-deadlift name stays
//     unhinted, same as everything below.
//   - Everything else (an unidentified Hinge, Push, Press -- a bench press
//     starts at lockout and lowers first, an overhead press starts racked
//     and presses first, opposite directions under the same rough
//     taxonomy -- Carry, Rotation, Isometric, Combination, Activation,
//     Mobility, or no movementType at all) has no single safe answer, so
//     this returns null and the phase-speed comparison decides alone, same
//     as before this existed.
function inferFirstPhaseHint(movementType: string | null | undefined, exerciseName: string): FirstPhaseHint {
  if (movementType === "Squat" || movementType === "Lunge") return "eccentric";
  if (movementType === "Pull") return "concentric";
  if (movementType === "Hinge") {
    const n = exerciseName.toLowerCase();
    if (n.includes("deadlift") && !/romanian|rdl|stiff|good morning/.test(n)) return "concentric";
  }
  return null;
}

// A wrist reappearing after even a brief occlusion is exactly when a pose
// model is likeliest to misplace it for a frame or two -- and because bar
// tilt is an angle (atan(dy/dx)), even a modest position error on a single
// frame can read as a wild swing: as the two wrists' horizontal separation
// happens to read small that frame, the same formula that correctly reports
// a real near-vertical bar also reports a barely-off one as if it were
// dramatically tilted. The saved, end-of-set bar_tilt fault is already
// protected from this (see detectFormFaults's percentile trim across the
// whole set), but the LIVE on-screen readout updates straight off a single
// frame with nothing to catch a one-frame spike before it's already on
// screen. Median of the last few real readings instead of the newest one
// alone -- a single bad frame needs company before it can move the display,
// the same "no fake-confident number beats one bad frame" reasoning as the
// saved fault, just scoped down to a live-sized window instead of a whole
// set.
const LIVE_TILT_HISTORY_SIZE = 5;
function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
) {
  ctx.strokeStyle = SKELETON_COLOR;
  ctx.lineWidth = 3;
  ctx.fillStyle = SKELETON_COLOR;

  for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!a || !b || a.visibility < MIN_VISIBILITY || b.visibility < MIN_VISIBILITY) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }

  for (const lm of landmarks) {
    if (lm.visibility < MIN_VISIBILITY) continue;
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

type PixelPoint = { x: number; y: number };

function drawTrail(ctx: CanvasRenderingContext2D, trace: PixelPoint[]) {
  const points = trace.slice(-TRAIL_MAX_POINTS);
  if (points.length < 2) return;
  ctx.strokeStyle = TRAIL_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

// The on-screen trail overlay needs pixel coordinates to draw with
// ctx.lineTo, independent of the world-space (meters) trace
// summarizeTrackedSet/summarizeJumpSet use for the actual metrics -- this
// derives the same wrist/ankle midpoint but from the normalized image-space
// landmarks, purely for drawing.
function pixelPoint(
  landmarks: NormalizedLandmark[],
  indices: number[],
  width: number,
  height: number,
): PixelPoint | null {
  const points = indices
    .map((i) => landmarks[i])
    .filter((lm): lm is NormalizedLandmark => !!lm && lm.visibility >= MIN_VISIBILITY);
  if (points.length === 0) return null;
  const x = points.reduce((a, p) => a + p.x, 0) / points.length;
  const y = points.reduce((a, p) => a + p.y, 0) / points.length;
  return { x: x * width, y: y * height };
}

const WRIST_INDICES = [POSE_LANDMARKS.LEFT_WRIST, POSE_LANDMARKS.RIGHT_WRIST];
const ANKLE_INDICES = [POSE_LANDMARKS.LEFT_ANKLE, POSE_LANDMARKS.RIGHT_ANKLE];

function isJumpMetrics(r: RepMetrics | JumpSetMetrics): r is JumpSetMetrics {
  return "bestJumpHeightCm" in r;
}

// No real barbell/dumbbell/kettlebell path moves this fast -- even the most
// explosive lift (a push press's concentric phase) tops out around 2-2.5
// m/s. A frame-to-frame jump implying more than this is never the implement
// actually moving that fast; it's the pose model (or an implement tracker)
// briefly latching onto the wrong point for one frame -- often right as a
// wrist reappears from an occlusion. MAX_PLAUSIBLE_IMPLEMENT_OFFSET_M and
// MAX_PLAUSIBLE_GRIP_OFFSET_M below already catch a disagreement WITHIN one
// frame (tracker vs. wrist); neither catches a frame that's internally
// consistent but wildly far from the PREVIOUS frame, which is exactly what
// inflates peak velocity, fabricates phantom reps (a single bad frame reads
// as a whole extra zigzag to segmentPhases), and swings the live tilt/grip
// readings that fuse off these same points. Closes that gap the same way
// interpolateOcclusionGap already treats a dropped-then-recovered frame:
// skip the bad point outright rather than letting it stand, and let the
// next genuinely plausible frame become the new "last known good." Excludes
// jump mode -- ankle speed at landing/takeoff can legitimately run past
// this, the same reasoning interpolateOcclusionGap's own maxGapMs already
// gives jump mode more headroom for.
const MAX_PLAUSIBLE_VELOCITY_MPS = 4;

// A real two-handed grip on a barbell -- narrowest close-grip bench,
// widest wide-grip squat/deadlift -- always lands in here for an adult. A
// single-frame reading outside it means one side's fused grip point is
// wrong (a misdetected wrist briefly latching onto something else), not
// that the athlete actually regripped the bar mid-rep -- excluded before it
// can enter gripWidthReadingsRef and inflate detectFormFaults's percentile
// spread into a multi-decimeter "grip shift" that never happened.
const PLAUSIBLE_GRIP_WIDTH_RANGE_M: [number, number] = [0.15, 0.7];

// See the live jump counter's own comment, further down, for why jump mode
// needs a materially larger reversal size than lift mode's flat 4cm --
// summarizeJumpSet's real per-jump floor (BASE_MIN_FLIGHT_AMPLITUDE_CM) is
// 15cm; this stays a bit under that so the live count still responds
// promptly to a genuine jump despite having none of that function's
// settle/apex checks.
const LIVE_JUMP_REVERSAL_CM = 10;

function isPlausibleVelocity(
  prev: { x: number; y: number; t: number } | null,
  next: { x: number; y: number; t: number },
): boolean {
  if (!prev) return true;
  const dtSec = (next.t - prev.t) / 1000;
  if (dtSec <= 0) return true;
  const distanceM = Math.hypot(next.x - prev.x, next.y - prev.y);
  return distanceM / dtSec <= MAX_PLAUSIBLE_VELOCITY_MPS;
}

export function BarTrackerDialog({
  open,
  onOpenChange,
  mode,
  exerciseName,
  movementType,
  laterality,
  equipment,
  heightIn,
  targetReps,
  loadKg,
  recordVideo,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // "jump" tracks ankle position for flight phases instead of wrist/bar
  // position -- see jump-tracking.ts. No implement, no speed/power, just
  // height, distance, and ground-contact time.
  mode: "bar_path" | "full" | "jump";
  exerciseName: string;
  // The exercise's movementType (Squat/Hinge/Press/etc.) -- gates which
  // form faults even make sense to check for (see detectFormFaults).
  movementType?: string | null;
  // The exercise's equipment (Barbell/Dumbbell/Bodyweight/etc.) -- gates bar
  // tilt and bar-path-drift off entirely for anything that isn't a shared
  // two-handed implement (see SHARED_BAR_EQUIPMENT in pose-tracking.ts):
  // without a rigid bar connecting both hands, each hand moves on its own,
  // so a "tilt"/"drift" reading off the wrist midpoint is just describing
  // normal independent arm motion, not a form fault.
  equipment?: string | null;
  // The athlete's stored height (inches), when on file -- scales the
  // minimum rep/jump amplitude thresholds via heightScaledAmplitudeCm so a
  // notably shorter or taller athlete isn't measured against a flat,
  // average-height noise floor. Undefined falls back to that flat default.
  heightIn?: number | null;
  // "unilateral" exercises (single-leg squats, lunges) load one leg at a
  // time across reps/sets rather than both at once, so a same-rep left-vs-
  // right comparison wouldn't mean anything -- gates leg-drive asymmetry
  // tracking off for those, alongside the movementType check.
  laterality?: string | null;
  // Parsed from the prescribed rep scheme by the caller -- shown as
  // "3/5 reps" on the live overlay so the athlete knows where they are,
  // but never auto-stops tracking (a missed or mistimed rep shouldn't cut
  // the recording short); Stop is always a manual, deliberate tap.
  targetReps?: number;
  // This set's entered weight, converted to kg by the caller -- lets
  // summarizeTrackedSet estimate power output (mass * g * velocity).
  // Undefined for bodyweight-only sets, which just don't get a power
  // number, same as any other tracking-off metric. Unused in jump mode.
  loadKg?: number;
  // When the coach also wants a video (videoCheckEnabled), this dialog
  // becomes the athlete's single capture step for the set instead of a
  // separate FormVideoRecorderDialog flow -- recording real video
  // alongside the pose tracking that's already happening, uploaded only
  // once "Use This Data" is tapped. Off by default (undefined/false), which
  // keeps the existing "only derived numbers ever leave the device" privacy
  // behavior for exercises that track form but were never asked for video.
  recordVideo?: boolean;
  onCapture: (metrics: RepMetrics | JumpSetMetrics, videoUrl?: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  // World-space (meters) traces -- feed summarizeTrackedSet/summarizeJumpSet
  // for the actual metrics.
  const traceRef = useRef<TrackedPoint[]>([]);
  const leftTraceRef = useRef<TrackedPoint[]>([]);
  const rightTraceRef = useRef<TrackedPoint[]>([]);
  // Pixel-space trace, purely for the on-screen trail overlay -- see
  // pixelPoint() above.
  const pixelTraceRef = useRef<PixelPoint[]>([]);
  const framesRef = useRef<PoseFrame[]>([]);
  const startTimeRef = useRef<number>(0);
  const lastRepDirRef = useRef<1 | -1 | 0>(0);
  const repCountRef = useRef(0);
  // Throttles the live movement-mismatch check (see liveMismatchHint) --
  // guessMovementPattern rescans the whole frame history each call, so this
  // runs it every MISMATCH_CHECK_INTERVAL ticks rather than every frame.
  const mismatchTickCounterRef = useRef(0);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  // Optional -- see hand-tracking.ts's own comment. Left null until (and
  // unless) it finishes loading; every read site treats that as "hand
  // refinement isn't available this frame," never as an error.
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  // Optional -- see roi-refine.ts's own comment for why this is a
  // SEPARATE PoseLandmarker instance, never poseLandmarkerRef itself.
  const roiLandmarkerRef = useRef<PoseLandmarker | null>(null);
  // Throttles how often the ROI crop-and-refine pass actually runs (see
  // ROI_REFINE_INTERVAL below) -- knee/ankle angle doesn't move fast
  // enough at 30fps for every single frame to need its own full second
  // Pose inference.
  const roiTickCounterRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  // Which sign to multiply worldLandmarks' y by so "up" always means a
  // smaller value, matching the convention every formula in
  // bar-tracking.ts/jump-tracking.ts assumes -- see worldVerticalSign's own
  // comment for why this can't just be hard-coded. Refined continuously
  // from the moment the camera/model are ready (a ref, not state, so the
  // tracking rAF loop can read it synchronously) and self-corrects if an
  // early frame read it wrong.
  const verticalSignRef = useRef<1 | -1>(1);
  // Mirrors `step` for the previewTick/tick rAF loops -- those closures are
  // captured once (when the loop starts) and keep calling themselves
  // recursively, so reading React state `step` inside them would see
  // whatever it was at that moment forever, not its current value. See
  // changeStep() below, the only place this is written.
  const stepRef = useRef<Step>("setup");
  // One filter set per landmark stream, purely for what's drawn/read out
  // live -- see one-euro-filter.ts's own comment for why a moving average
  // (already used for the saved metrics) isn't a good fit for a live view.
  const displaySmootherRef = useRef(new PoseSmoother());
  const worldSmootherRef = useRef(new PoseSmoother());
  // Shared across previewTick and tick -- continuity should carry straight
  // through the setup-to-tracking transition, not reset at Start Set, since
  // it's still the same athlete standing in the same spot. See
  // SubjectContinuityGate's own comment.
  const subjectGateRef = useRef(new SubjectContinuityGate());
  const lastDisplayYRef = useRef<number | null>(null);
  const lastDisplayTRef = useRef(0);
  // Automatic pre-flight readiness: how long the athlete has continuously
  // been fully in frame with the camera roughly square to them -- once that
  // holds for READY_HOLD_MS, tracking starts on its own (see
  // beginAutoStart) instead of requiring someone to watch the screen and
  // tap Start Set, which never worked for an athlete tracking themselves
  // alone.
  const readyStartTimeRef = useRef<number | null>(null);
  const autoStartTriggeredRef = useRef(false);
  const autoStartTimersRef = useRef<number[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const recordedBlobRef = useRef<Blob | null>(null);
  // Stateful across frames within one tracked set -- see
  // implement-tracking.ts's own comment for why this replaces the old
  // wide-grip-only static edge detector.
  const implementTrackerRef = useRef(new ImplementTracker());
  // Two more instances, one per grip point, entirely separate from the
  // combined one above -- bar tilt needs two independently-tracked points
  // to compare (there's no such thing as "the tilt" of one point), and
  // fusing each side against ITS OWN wrist the same way the combined point
  // fuses against the wrist midpoint means a wrist that briefly misreads
  // during occlusion recovery (the actual cause of the "89 degrees" bug)
  // has a second, independent signal to fall back on for THAT side instead
  // of tilt reading straight off two raw, unfused landmarks. Kept
  // deliberately separate from implementTrackerRef above rather than
  // trying to unify all three into one system -- the combined tracker
  // drives position/velocity/ROM, already tuned and working; these two
  // only ever feed the tilt reading and the left/right symmetry traces
  // below, so a rough edge here can't put the primary numbers at risk.
  const leftImplementTrackerRef = useRef(new ImplementTracker());
  const rightImplementTrackerRef = useRef(new ImplementTracker());
  // Rolling buffer of the last few LIVE tilt readings (raw single-frame
  // tiltDegreesFromPoints output, only pushed when a frame actually
  // produced one) -- see liveTiltDeg's own comment below for why this
  // exists.
  const liveTiltHistoryRef = useRef<number[]>([]);
  // EVERY real tilt reading for the whole set, not just the last few --
  // passed to detectFormFaults at Stop as precomputedTiltDegrees, so the
  // SAVED bar_tilt fault is built from the same left/right-fused readings
  // the live display uses instead of recomputing tilt from raw, unfused
  // wrist landmarks the way it used to. Separate ref from the rolling
  // buffer above since they serve different windows (a handful of recent
  // frames for the live number, the entire set for the saved one).
  const tiltReadingsRef = useRef<number[]>([]);
  // Lateral separation between the same two fused grip points, one
  // reading per frame -- passed to detectFormFaults at Stop as
  // gripWidthReadings so a genuine mid-set regrip surfaces as its own
  // fault (see FormFault's "grip_shift" code). Only readings within
  // PLAUSIBLE_GRIP_WIDTH_RANGE_M (see its own comment near
  // MAX_PLAUSIBLE_VELOCITY_MPS above) are ever pushed here.
  const gripWidthReadingsRef = useRef<number[]>([]);
  // Candidate height-scale-correction readings (see computeHeightScaleCorrection's
  // own comment), collected every readiness-check frame while the athlete
  // stands fully visible during setup -- startTracking() takes the median of
  // whatever accumulated here and locks it into scaleCorrectionRef for the
  // upcoming set. Median, not the single latest reading, so one noisy frame
  // right before Start can't set a bad correction for the whole set.
  const heightCorrectionSamplesRef = useRef<number[]>([]);
  // The correction actually applied this set -- null means "no correction,"
  // either because heightIn isn't on file, no plausible reading was ever
  // sampled, or every sampled reading fell outside the plausible band. Every
  // consumer of worldLandmarks during tracking reads the SAME scaled copy
  // (see the main tick's own comment), so this is the one place the
  // correction needs to be threaded through.
  const scaleCorrectionRef = useRef<number | null>(null);
  // Last ACCEPTED fusedLeft/fusedRight point (see isPlausibleVelocity's own
  // comment), one per side -- fusedLeft/fusedRight are recomputed fresh
  // every frame rather than accumulated into a persistent array the way
  // traceRef is, so tracking "last known good" for the velocity-plausibility
  // check needs its own dedicated ref pair instead of reading trace[-1].
  const prevFusedLeftRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const prevFusedRightRef = useRef<{ x: number; y: number; t: number } | null>(null);
  // Midpoint of the same two fused grip points, one sample per frame --
  // a second, independently-tracked read on the bar's own vertical
  // position (two separate ImplementTracker locks, each fused against its
  // own wrist, averaged) alongside the primary trace's own wrist+bar
  // fusion. Passed to fuseSideVelocity at Stop so the reported peak/mean
  // velocity is a confidence-weighted blend of both, not just the primary
  // trace alone -- see fuseSideVelocity's own comment.
  const sideVelocitySamplesRef = useRef<VelocitySample[]>([]);
  // The same two fused grip points AGAIN, this time kept apart instead of
  // averaged -- sideVelocitySamplesRef above answers "how fast overall,"
  // these answer "how fast each arm on its own," which is what
  // computeArmDriveAsymmetry needs to compare left against right.
  const leftVelocitySamplesRef = useRef<VelocitySample[]>([]);
  const rightVelocitySamplesRef = useRef<VelocitySample[]>([]);
  // Timestamps of every tracker-vs-wrist disagreement rejection this set --
  // combined tracker and both per-side trackers all push here (see each
  // rejectLock() call site) -- feeds computeRepTrustScores the same way.
  const rejectionEventsRef = useRef<number[]>([]);
  // The most recent camera-alignment read from the setup step (see
  // evaluateAutoStartReadiness) -- frozen once tracking starts, since the
  // phone's physical position doesn't change mid-set, and used as a
  // whole-set input to computeRepTrustScores at Stop.
  const lastAlignmentReasonRef = useRef<CameraAlignment["reason"] | null>(null);
  // This exercise's remembered implement color, if any -- looked up once
  // when tracking starts (see startTracking) and held fixed for the whole
  // set, same "doesn't change mid-set" reasoning as lastAlignmentReasonRef
  // above. Null means no memory yet (first time tracking this exercise, or
  // localStorage unavailable), in which case appearance plays no role this
  // set -- see implement-appearance-memory.ts's own comment.
  const rememberedAppearanceRef = useRef<ColorSignature | null>(null);
  // Colors sampled from the combined tracker's lock whenever it's fully
  // confident this set (see LOCK_RAMP_FRAMES) -- averaged and saved back
  // into the appearance memory at Stop, so a single bad frame can't skew
  // what gets remembered the way recording every frame individually would.
  const confirmedColorSamplesRef = useRef<ColorSignature[]>([]);

  const [step, setStepState] = useState<Step>("setup");
  function changeStep(next: Step) {
    stepRef.current = next;
    setStepState(next);
  }
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [tilt, setTilt] = useState<number | null>(null);
  const [liveSpeed, setLiveSpeed] = useState(0);
  const [liveTiltDeg, setLiveTiltDeg] = useState<number | null>(null);
  const [repCount, setRepCount] = useState(0);
  const [poseVisible, setPoseVisible] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [alignmentHint, setAlignmentHint] = useState<string | null>(null);
  // Live counterpart to the Stop-time patternMismatch check below -- once at
  // least one rep has completed (so guessMovementPattern has an actual
  // range-of-motion sample instead of a handful of noisy early frames), this
  // flags an exercise/motion mismatch WHILE the athlete can still fix it
  // (wrong exercise selected, camera picked up someone else's set) instead
  // of only after the whole set is already logged.
  const [liveMismatchHint, setLiveMismatchHint] = useState<string | null>(null);
  // Whether the implement tracker found confident motion this frame --
  // purely informational, so the athlete can see whether tracking is
  // reading the actual barbell/dumbbell/kettlebell/etc. or has fallen back
  // to the plain wrist estimate (e.g. a bodyweight exercise with nothing
  // held, poor lighting, or a moment with no motion to key off of).
  const [implementDetected, setImplementDetected] = useState(false);
  const [result, setResult] = useState<RepMetrics | JumpSetMetrics | null>(null);
  const [movementGuess, setMovementGuess] = useState<MovementGuess | null>(null);
  // "overlay" runs in real time (roughly the clip's own duration, since it
  // plays the recording through to draw each frame) BEFORE any network
  // activity starts -- a flat "Saving..." across both phases would read as
  // stuck for a long set with no visible progress, so the button label
  // tracks which phase is actually happening.
  const [savePhase, setSavePhase] = useState<"idle" | "overlay" | "uploading">("idle");
  const [overlayProgress, setOverlayProgress] = useState(0);

  // Whether tilt/bar-path-drift mean anything for what's being tracked --
  // see usesSharedBarEquipment's own comment. Gates the live tilt readout
  // below the same way detectFormFaults gates the saved bar_tilt/
  // bar_path_drift faults at Stop.
  const usesSharedBar = mode !== "jump" && usesSharedBarEquipment(equipment);

  useEffect(() => {
    if (!open) return;
    changeStep("setup");
    setCameraError(null);
    setResult(null);
    setMovementGuess(null);
    setRepCount(0);
    repCountRef.current = 0;
    traceRef.current = [];
    leftTraceRef.current = [];
    rightTraceRef.current = [];
    pixelTraceRef.current = [];
    framesRef.current = [];
    lastVideoTimeRef.current = -1;
    setLiveTiltDeg(null);
    liveTiltHistoryRef.current = [];
    tiltReadingsRef.current = [];
    gripWidthReadingsRef.current = [];
    heightCorrectionSamplesRef.current = [];
    scaleCorrectionRef.current = null;
    prevFusedLeftRef.current = null;
    prevFusedRightRef.current = null;
    sideVelocitySamplesRef.current = [];
    leftVelocitySamplesRef.current = [];
    rightVelocitySamplesRef.current = [];
    rejectionEventsRef.current = [];
    lastAlignmentReasonRef.current = null;
    rememberedAppearanceRef.current = null;
    confirmedColorSamplesRef.current = [];
    setImplementDetected(false);
    verticalSignRef.current = 1;
    displaySmootherRef.current.reset();
    worldSmootherRef.current.reset();
    subjectGateRef.current.reset();
    implementTrackerRef.current.reset();
    leftImplementTrackerRef.current.reset();
    rightImplementTrackerRef.current.reset();
    lastDisplayYRef.current = null;
    readyStartTimeRef.current = null;
    autoStartTriggeredRef.current = false;
    autoStartTimersRef.current.forEach((id) => window.clearTimeout(id));
    autoStartTimersRef.current = [];
    setCountdown(null);
    setAlignmentHint(null);
    setLiveMismatchHint(null);
    mismatchTickCounterRef.current = 0;
    videoChunksRef.current = [];
    recordedBlobRef.current = null;
    setSavePhase("idle");

    setModelLoading(true);
    getPoseLandmarker()
      .then((landmarker) => {
        poseLandmarkerRef.current = landmarker;
        setModelLoading(false);
        // Starts as soon as the model's ready (the camera stream may still
        // be loading -- previewTick's own guard just keeps polling until
        // both are) rather than waiting for a dedicated "get set up" step,
        // so the skeleton overlay and auto-calibration are already live by
        // the time the athlete looks at the setup screen.
        previewTick();
      })
      .catch(() => {
        setCameraError("Couldn't load the pose-tracking model -- check your connection and retry.");
        setModelLoading(false);
      });

    // Loaded in parallel, never blocking on it -- hand tracking is a
    // refinement (see hand-tracking.ts), not a requirement, so a slow or
    // failed load here shouldn't hold up Pose or show an error the
    // athlete would have no way to act on.
    handLandmarkerRef.current = null;
    getHandLandmarker()
      .then((landmarker) => {
        handLandmarkerRef.current = landmarker;
      })
      .catch(() => {
        // Silently stays null -- tick() already treats that as "fall back
        // to Pose's own wrist point."
      });

    // Same non-blocking, optional-refinement loading as hand tracking
    // above -- see roi-refine.ts's own comment. Only actually worth a
    // second full pose model's worth of GPU/WASM memory for the movements
    // that ever read a refined knee/hip/ankle landmark back (see
    // LOWER_BODY_MOVEMENT_TYPES's own comment, plus jump mode's landing-
    // mechanics valgus/lean checks) -- loading it unconditionally on every
    // tracked set meant a single bench-press session permanently doubled
    // the app's resident pose-model footprint for the rest of the page
    // session, for a refinement that press never uses.
    roiLandmarkerRef.current = null;
    roiTickCounterRef.current = 0;
    const needsRoiRefine = mode === "jump" || (movementType != null && LOWER_BODY_MOVEMENT_TYPES.has(movementType));
    if (needsRoiRefine) {
      getRoiPoseLandmarker()
        .then((landmarker) => {
          roiLandmarkerRef.current = landmarker;
        })
        .catch(() => {
          // Silently stays null -- tick() already treats that as "skip the
          // ROI refinement pass, keep the full-frame landmarks as-is."
        });
    }

    // The dialog can close (or this effect can otherwise tear down) before
    // an in-flight getUserMedia() call resolves -- without this guard, a
    // late-arriving stream from acquireCamera() would still get attached
    // and left running via attachStream, orphaned, with nothing left to
    // ever stop it since this effect's own cleanup already ran.
    let stopped = false;
    const attachStream = (stream: MediaStream) => {
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      // Soft (ideal) constraints below don't guarantee 60fps -- the device
      // may have negotiated 30 anyway. Every velocity/flight-time
      // calculation already derives dt from consecutive frames' own
      // timestamps rather than assuming a fixed interval, so this log is
      // purely diagnostic (confirming what a given device actually granted
      // in the field), never something the math depends on.
      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack?.getSettings();
      if (settings) {
        console.debug(
          `[camera-tracker] negotiated ${settings.width}x${settings.height} @ ${settings.frameRate}fps`,
        );
      }
      // Best-effort, Chrome/Android-only -- see lockCameraExposure's own
      // comment. Never awaited: a fast rep can start tracking well before
      // this settles, and there's nothing useful to block on here anyway.
      if (videoTrack) void lockCameraExposure(videoTrack);
    };
    // Video-only, always -- jump mode used to also request the mic here for
    // an optional landing-audio confirmation signal, but on iOS that
    // silently interrupts (and doesn't resume) whatever music the athlete
    // had playing, just to capture a signal that was only ever a
    // supplementary confirmation and never a requirement. Not a trade worth
    // making for every jump-mode session, so the feature's gone entirely.
    //
    // frameRate/width/height are all `ideal`, not `exact` -- a hard
    // requirement throws OverconstrainedError on hardware that can't meet
    // it, which would turn "prefer 60fps" into "camera doesn't open on an
    // older phone." 720p is requested (not 1080p) because pushing for both
    // high resolution AND 60fps on a phone's ISP commonly forces it back
    // down to 30fps anyway -- 720p has plenty of pixel density for
    // MediaPipe's landmark model and leaves the bandwidth headroom to
    // actually land 60fps, which is what velocity/flight-time precision on
    // a fast rep or jump actually benefits from. `min: 30` keeps a floor
    // under only-mildly-capable hardware without insisting on 60. Portrait
    // (720x1280, not 1280x720) since the athlete is virtually always
    // filming themselves standing in front of a portrait-held phone --
    // requesting a landscape-shaped ideal here meant the recorded
    // formCheckVideoUrl clip's own intrinsic dimensions didn't match how it
    // was actually framed, which is what caused a saved clip to render
    // squished/sideways in some playback contexts downstream (see
    // form-video-recorder-dialog.tsx's own comment on this same fix).
    const videoOnlyConstraints = {
      video: {
        facingMode: { ideal: "environment" as const },
        width: { ideal: 720 },
        height: { ideal: 1280 },
        frameRate: { ideal: 60, min: 30 },
      },
    };
    const acquireCamera = () => {
      ensureCameraPermission().then((granted) => {
        if (stopped) return;
        if (!granted) {
          setCameraError("Camera access denied -- enable it for Forge in Settings.");
          return;
        }
        navigator.mediaDevices
          .getUserMedia(videoOnlyConstraints)
          .then((stream) => {
            setCameraError(null);
            attachStream(stream);
          })
          .catch(() => setCameraError("Camera access denied or unavailable."));
      });
    };
    acquireCamera();

    // Mobile browsers -- iOS Safari and installed PWAs especially -- suspend
    // or fully end the camera's tracks once the app is backgrounded, and
    // never resume them on their own. Without this, coming back from the
    // home screen leaves the athlete staring at a dead, frozen/black
    // <video> with no way back into tracking short of force-quitting the
    // app. Stop whatever's left of the old stream and grab a fresh one the
    // moment the app is foregrounded again -- previewTick/tick poll until
    // the video has real dimensions, so a freshly attached stream is
    // enough on its own once the loop itself is running again (see the
    // explicit restart below; reacquiring the stream alone doesn't do
    // that). onAppForeground uses the native appStateChange signal inside
    // Capacitor (more reliable than visibilitychange there) and
    // visibilitychange itself on web/PWA.
    const unsubscribeForeground = onAppForeground(() => {
      const stillLive = streamRef.current?.getVideoTracks().some((t) => t.readyState === "live");
      if (!stillLive) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        acquireCamera();
      }
      // onAppBackground below always cancels the rAF loop outright,
      // independent of whether iOS actually tore down the stream above --
      // reacquiring the camera alone doesn't restart previewTick/tick, so
      // without this the athlete would come back to a live-looking preview
      // that never tracks another rep again until they close and reopen
      // the dialog. Whichever loop was driving the current step is the one
      // to resume -- previewTick during setup/calibration, tick once a set
      // is actually being tracked.
      if (!rafRef.current) {
        if (stepRef.current === "tracking") rafRef.current = requestAnimationFrame(tick);
        else if (stepRef.current === "setup") rafRef.current = requestAnimationFrame(previewTick);
      }
    });

    // The reactive foreground reacquisition above works whenever iOS gets
    // around to suspending the old stream, but proactively releasing the
    // camera the moment the app backgrounds -- rather than waiting on the
    // OS's own timing -- turns off the recording indicator immediately and
    // stops a mid-set MediaRecorder from writing frames nobody will see
    // instead of finalizing cleanly. rAF itself already stops firing once
    // backgrounded without any help; this is only about the camera hardware
    // and the recorder. Deliberately doesn't touch tracking/rep state or
    // call stopTracking() -- backgrounding mid-set should pause, not end it.
    const unsubscribeBackground = onAppBackground(() => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    });

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta != null) setTilt(Math.round(e.beta) - 90);
    };
    window.addEventListener("deviceorientation", handleOrientation);

    return () => {
      stopped = true;
      window.removeEventListener("deviceorientation", handleOrientation);
      unsubscribeForeground();
      unsubscribeBackground();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // Closing mid-countdown shouldn't leave a startTracking() call queued
      // up to fire against a dialog nobody's looking at anymore.
      autoStartTimersRef.current.forEach((id) => window.clearTimeout(id));
      autoStartTimersRef.current = [];
    };
  }, [open]);

  // Runs from the moment the model's ready through "setup" (stopped by
  // startTracking(), which cancels it before starting the tracking-phase
  // tick loop instead). Draws the live skeleton overlay -- the athlete's
  // real-time confirmation that tracking is working -- and keeps
  // verticalSignRef refined against the athlete's own posture, so it's
  // already correct by the time "Start Set" is tapped. There's no
  // calibration step anymore: worldLandmarks are already real-world meters,
  // so nothing needs a pixels-per-meter scale factor derived first.
  function previewTick() {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const landmarker = poseLandmarkerRef.current;
    if (!video || !overlay || !landmarker || video.videoWidth === 0 || video.clientWidth === 0) {
      rafRef.current = requestAnimationFrame(previewTick);
      return;
    }
    if (video.currentTime === lastVideoTimeRef.current) {
      rafRef.current = requestAnimationFrame(previewTick);
      return;
    }
    lastVideoTimeRef.current = video.currentTime;

    // Sized to the video's actual on-screen box (clientWidth/Height), not
    // its encoded videoWidth/videoHeight -- on iOS Safari a portrait
    // rear-camera stream can report landscape sensor dimensions there while
    // rendering (and feeding MediaPipe) already-rotated portrait frames, so
    // scaling normalized landmarks by the raw encoded size draws the
    // skeleton at the wrong scale and position relative to what's actually
    // on screen. clientWidth/Height always matches what the athlete sees.
    overlay.width = video.clientWidth;
    overlay.height = video.clientHeight;
    const ctx = overlay.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      const now = performance.now();
      const detection = landmarker.detectForVideo(video, now);
      // subjectGateRef rejects both a low-confidence "person" MediaPipe
      // occasionally reports on a strongly rectangular, loosely humanoid
      // object in frame (a plyo box's stacked edges, a rack's hanging
      // straps) and a detection that jumped implausibly far to plausibly
      // still be the same athlete (a spotter, a background lifter) -- see
      // SubjectContinuityGate's own comment. Without this, either false
      // detection gets drawn as a skeleton right here in the setup preview,
      // before tracking has even started.
      const rawLandmarks = detection.landmarks[0] ?? null;
      const landmarks = subjectGateRef.current.admit(rawLandmarks);
      const worldLandmarks = landmarks ? (detection.worldLandmarks[0] ?? null) : null;
      if (landmarks) {
        // Smoothed purely for the on-screen preview -- see one-euro-filter.ts.
        drawSkeleton(ctx, displaySmootherRef.current.smooth(landmarks, now), overlay.width, overlay.height);
        const sign = worldLandmarks ? worldVerticalSign(worldLandmarks) : null;
        if (sign != null) verticalSignRef.current = sign;
      }
      evaluateAutoStartReadiness(landmarks, worldLandmarks, now);
    }
    rafRef.current = requestAnimationFrame(previewTick);
  }

  const READY_HOLD_MS = 900;

  // The automatic half of what used to be a manual "does this look right?"
  // check -- previously a second person had to look at the screen and
  // confirm the athlete was framed correctly before tapping Start Set,
  // which never worked for someone tracking themselves alone. Once the
  // whole body is in frame AND the camera isn't rotated off-square or
  // impossible to read (see assessCameraAlignment) continuously for
  // READY_HOLD_MS, tracking starts on its own with an audible countdown --
  // nobody has to watch the screen or touch the phone. Still runs (not
  // gated on having already triggered) once counting down, so stepping out
  // of frame mid-countdown cancels it rather than starting on an empty
  // rack.
  function evaluateAutoStartReadiness(
    landmarks: NormalizedLandmark[] | null,
    worldLandmarks: Landmark[] | null,
    now: number,
  ) {
    if (stepRef.current !== "setup") return;

    const bodyIn = !!landmarks && isFullBodyInFrame(landmarks);
    // Sampled only while the athlete is confirmed standing fully visible --
    // see computeHeightScaleCorrection's own comment. Collected continuously
    // through the whole readiness hold rather than just once, so
    // startTracking()'s median isn't riding on a single frame.
    if (bodyIn && worldLandmarks) {
      const candidate = computeHeightScaleCorrection(worldLandmarks, verticalSignRef.current, heightIn);
      if (candidate != null) heightCorrectionSamplesRef.current.push(candidate);
    }
    const alignment = worldLandmarks ? assessCameraAlignment(worldLandmarks) : null;
    // Kept for computeRepTrustScores at Stop -- see lastAlignmentReasonRef's
    // own comment. Only written here (setup step), never during tracking,
    // so it captures whatever the camera's real framing was right before
    // the set started.
    if (alignment) lastAlignmentReasonRef.current = alignment.reason;
    // Only "unknown" (shoulders not readable at all, so framing genuinely
    // can't be assessed) still holds the countdown back. "angled" used to
    // block here too, but a rotated camera doesn't cost enough accuracy to
    // be worth stalling the athlete over -- computeRepTrustScores still
    // notes it after the fact (see its own alignmentReason handling), just
    // without stopping the set from starting.
    const blocksStart = alignment != null && alignment.reason === "unknown";
    const ready = bodyIn && !blocksStart;

    if (!autoStartTriggeredRef.current) {
      setAlignmentHint(
        alignment?.reason === "axial"
          ? "Front-on framing -- good for bar tilt and shoulder symmetry; forward/back drift readings will be less reliable from this angle"
          : null,
      );
    }

    if (ready) {
      if (readyStartTimeRef.current == null) readyStartTimeRef.current = now;
      if (!autoStartTriggeredRef.current && now - readyStartTimeRef.current >= READY_HOLD_MS) {
        beginAutoStart();
      }
      return;
    }

    readyStartTimeRef.current = null;
    if (autoStartTriggeredRef.current) cancelAutoStart();
  }

  function beginAutoStart() {
    autoStartTriggeredRef.current = true;
    setAlignmentHint(null);
    let n = 3;
    setCountdown(n);
    const scheduleNext = () => {
      const id = window.setTimeout(() => {
        n -= 1;
        if (n > 0) {
          setCountdown(n);
          scheduleNext();
        } else {
          setCountdown(null);
          startTracking();
        }
      }, 800);
      autoStartTimersRef.current.push(id);
    };
    scheduleNext();
  }

  function cancelAutoStart() {
    autoStartTimersRef.current.forEach((id) => window.clearTimeout(id));
    autoStartTimersRef.current = [];
    autoStartTriggeredRef.current = false;
    setCountdown(null);
  }

  function startTracking() {
    // Stops previewTick's self-perpetuating loop -- otherwise it and the
    // tracking-phase tick() below would both keep rescheduling themselves
    // and stomp on the same rafRef/canvas.
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    // In case this was reached by tapping Start Set manually while an auto
    // countdown was already running -- don't leave a stray timeout that'd
    // call startTracking() a second time mid-set.
    autoStartTimersRef.current.forEach((id) => window.clearTimeout(id));
    autoStartTimersRef.current = [];
    setCountdown(null);
    lastDisplayYRef.current = null;
    changeStep("tracking");
    traceRef.current = [];
    leftTraceRef.current = [];
    rightTraceRef.current = [];
    framesRef.current = [];
    startTimeRef.current = performance.now();
    lastRepDirRef.current = 0;
    lastVideoTimeRef.current = -1;
    repCountRef.current = 0;
    setRepCount(0);
    mismatchTickCounterRef.current = 0;
    setLiveMismatchHint(null);
    setLiveTiltDeg(null);
    liveTiltHistoryRef.current = [];
    tiltReadingsRef.current = [];
    gripWidthReadingsRef.current = [];
    // Locked in from whatever readiness-check samples accumulated during
    // setup -- see heightCorrectionSamplesRef's own comment. Needs at least
    // a handful of samples (not just one or two) before it's trusted enough
    // to correct a whole set's worth of numbers. Only OVERWRITES the
    // existing correction when fresh samples cleared that bar -- retry()
    // jumps straight from "review" back to "tracking" without ever
    // revisiting "setup" (the only step evaluateAutoStartReadiness/
    // previewTick run in, so the only place this buffer gets refilled), so
    // without this guard every retried set would silently fall back to
    // scaleCorrectionRef.current = null on a technicality of the UI flow,
    // not because the correction actually stopped being valid -- the
    // athlete hasn't moved between Stop and Retry, so the previous set's
    // correction is still the best estimate available.
    if (heightCorrectionSamplesRef.current.length >= 5) {
      scaleCorrectionRef.current = medianOf(heightCorrectionSamplesRef.current);
    }
    heightCorrectionSamplesRef.current = [];
    prevFusedLeftRef.current = null;
    prevFusedRightRef.current = null;
    sideVelocitySamplesRef.current = [];
    leftVelocitySamplesRef.current = [];
    rightVelocitySamplesRef.current = [];
    rejectionEventsRef.current = [];
    confirmedColorSamplesRef.current = [];
    // Looked up once here (not read fresh every frame) since it can't
    // change mid-set -- see rememberedAppearanceRef's own comment.
    rememberedAppearanceRef.current = getRememberedAppearance(exerciseName);
    setImplementDetected(false);
    implementTrackerRef.current.reset();
    leftImplementTrackerRef.current.reset();
    rightImplementTrackerRef.current.reset();

    if (recordVideo && streamRef.current) {
      videoChunksRef.current = [];
      recordedBlobRef.current = null;
      const mimeType = MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : undefined;
      const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) videoChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        recordedBlobRef.current = new Blob(videoChunksRef.current, {
          type: recordedVideoType(recorder, mimeType),
        });
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
    }

    tick();
  }

  function tick() {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const landmarker = poseLandmarkerRef.current;
    if (!video || !overlay || !landmarker || video.videoWidth === 0 || video.clientWidth === 0) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    if (video.currentTime === lastVideoTimeRef.current) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    lastVideoTimeRef.current = video.currentTime;

    // See previewTick's comment -- sized to the video's actual on-screen
    // box, not its encoded videoWidth/videoHeight, so the overlay always
    // lines up with what's visually on screen regardless of any rotation
    // metadata mismatch on the encoded stream.
    overlay.width = video.clientWidth;
    overlay.height = video.clientHeight;
    const ctx = overlay.getContext("2d");
    if (!ctx) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const now = performance.now();
    const detection = landmarker.detectForVideo(video, now);
    // See subjectGateRef's own comment (and its use in the setup preview
    // tick above) -- the same false-positive-on-an-object and wrong-subject
    // risks apply for every frame of an already-running set, not just once
    // at auto-start, so this frame's detection is discarded (reads as "body
    // not visible" below) rather than trusted just because it's non-null.
    const rawLandmarks = detection.landmarks[0] ?? null;
    const landmarks = subjectGateRef.current.admit(rawLandmarks);
    // Scaled once here, right off detectForVideo, so every downstream
    // consumer within this tick (bar-point derivation, tilt, grip width,
    // joint angles, jump ankle point -- all still just read `worldLandmarks`
    // by name below) automatically inherits the correction with nothing
    // else in this function needing to change. No-op (identical values)
    // when scaleCorrectionRef.current is null -- see its own comment for
    // when that happens.
    const rawWorldLandmarks = landmarks ? (detection.worldLandmarks[0] ?? null) : null;
    const worldLandmarks =
      rawWorldLandmarks && scaleCorrectionRef.current != null
        ? scaleWorldLandmarks(rawWorldLandmarks, scaleCorrectionRef.current)
        : rawWorldLandmarks;
    setPoseVisible(!!landmarks);

    // Smoothed copies purely for what's drawn or read out live (skeleton,
    // bar trail, live speed/tilt) -- framesRef and the trace below keep
    // reading the raw detection every frame, so the numbers a coach later
    // sees are exactly as accurate as before any of this smoothing existed.
    const displayLandmarks = landmarks ? displaySmootherRef.current.smooth(landmarks, now) : null;
    const displayWorldLandmarks = worldLandmarks
      ? worldSmootherRef.current.smooth(worldLandmarks, now)
      : null;

    // Bar tilt itself is computed further down, once the left/right
    // implement trackers have run (see leftImplementTrackerRef's own
    // comment) -- it needs two independently-fused grip points, not just
    // the raw wrist landmarks this early in the tick has available.
    if (!landmarks || !worldLandmarks) setImplementDetected(false);

    if (landmarks && worldLandmarks && displayLandmarks && displayWorldLandmarks) {
      drawSkeleton(ctx, displayLandmarks, overlay.width, overlay.height);

      const sign = worldVerticalSign(worldLandmarks);
      if (sign != null) verticalSignRef.current = sign;

      // Pixel-space point purely for the trail overlay -- see pixelPoint()'s
      // own comment for why this is separate from the world-space point
      // below. Drawn from the smoothed landmarks so the trail doesn't
      // visibly jitter even though the recorded trace (below) doesn't use
      // them.
      const trailPoint = pixelPoint(
        displayLandmarks,
        mode === "jump" ? ANKLE_INDICES : WRIST_INDICES,
        overlay.width,
        overlay.height,
      );
      if (trailPoint) {
        pixelTraceRef.current.push({ x: trailPoint.x, y: trailPoint.y });
      }

      // Live speed reads the smoothed point so the on-screen number holds
      // steady instead of flickering frame to frame -- the recorded trace
      // below (and the final saved peak/mean velocity) stays on the raw
      // point, untouched.
      const displayWorldPoint =
        mode === "jump"
          ? deriveJumpPoint(displayWorldLandmarks)
          : deriveBarPoint(displayWorldLandmarks, usesSharedBar);
      if (displayWorldPoint) {
        const displayY = verticalSignRef.current * displayWorldPoint.y;
        if (lastDisplayYRef.current != null) {
          const dt = (now - lastDisplayTRef.current) / 1000;
          if (dt > 0) setLiveSpeed(Math.abs(displayY - lastDisplayYRef.current) / dt);
        }
        lastDisplayYRef.current = displayY;
        lastDisplayTRef.current = now;
      }

      const worldPoint =
        mode === "jump" ? deriveJumpPoint(worldLandmarks) : deriveBarPoint(worldLandmarks, usesSharedBar);

      if (worldPoint) {
        const t = now - startTimeRef.current;
        const trace = traceRef.current;
        const prev = trace[trace.length - 1];
        // Wrist position stands in for the implement by default, but the
        // wrist joint and whatever's actually in the athlete's hand aren't
        // at the same point -- grip thickness, wrist flexion, and (for a
        // kettlebell or med ball) just not being rigidly attached to the
        // hand all shift the two apart. Jump mode has nothing held, so all
        // of this (and the implement tracker below) is skipped there --
        // worldPoint (the ankle midpoint) is used as-is.
        let normalizedWrist = mode === "jump" ? null : deriveNormalizedWristPoint(landmarks, usesSharedBar);
        // When Hand Landmarker is loaded and confidently finds a hand near
        // Pose's coarser wrist point, use its much higher-resolution palm
        // read as the search center instead -- see hand-tracking.ts's own
        // comment for why this is a seed-point refinement, not a
        // replacement for anything downstream of it. Whether it found a
        // match is also kept as its own signal below: Hand Landmarker is a
        // completely separate, hand-specialized model, so a real hand
        // turning up right where Pose says the wrist is amounts to a
        // second, independent vote that Pose's landmark is a genuine
        // detection and not a misread -- exactly the failure mode ("ghost"
        // skeletons, phantom landmarks) that's otherwise hardest to catch.
        let gripConfirmed = false;
        // Hoisted (rather than called again below) so the left/right grip
        // tracking further down can reuse this same detection -- MediaPipe's
        // VIDEO-mode detectForVideo expects a strictly increasing timestamp
        // per call, so this can only run once per tick, not once per point.
        const handsResult =
          normalizedWrist && handLandmarkerRef.current
            ? handLandmarkerRef.current.detectForVideo(video, now)
            : null;
        if (handsResult && normalizedWrist) {
          const refined = refineGripPoint(handsResult.landmarks, normalizedWrist.x, normalizedWrist.y);
          if (refined) {
            normalizedWrist = refined;
            gripConfirmed = true;
          }
        }
        let barTrack =
          normalizedWrist &&
          implementTrackerRef.current.track(
            video,
            normalizedWrist.x,
            normalizedWrist.y,
            landmarks,
            worldLandmarks,
            worldPoint.x,
            worldPoint.y,
          );
        // Two independent measurements agreeing is reassuring; two
        // independent measurements disagreeing is INFORMATION, not
        // something to average away. No real implement sits this far from
        // the hand holding it -- if the tracker's own reported position
        // is further than that from the wrist, it's latched onto the
        // wrong thing (a rack post, another lifter, a shadow), and a
        // confidence-weighted blend between "right" and "wildly wrong"
        // isn't a meaningfully better answer than either extreme. Reject
        // it outright: force the tracker to reacquire fresh next frame
        // (rather than keep dead-reckoning forward from a position that's
        // just been judged implausible) and fall back to the wrist alone
        // for this one frame, the same as if no implement had been found
        // at all.
        const MAX_PLAUSIBLE_IMPLEMENT_OFFSET_M = 0.5;
        if (
          barTrack &&
          Math.hypot(barTrack.worldX - worldPoint.x, barTrack.worldY - worldPoint.y) >
            MAX_PLAUSIBLE_IMPLEMENT_OFFSET_M
        ) {
          implementTrackerRef.current.rejectLock();
          rejectionEventsRef.current.push(t);
          barTrack = null;
        }
        setImplementDetected(!!barTrack);
        // Confirmed-good implement color, sampled only from a fully-ramped
        // lock (LOCK_RAMP_FRAMES worth of continuous, unbroken,
        // plausibility-checked tracking) -- see confirmedColorSamplesRef's
        // own comment for why these accumulate here and get averaged into
        // one update at Stop rather than recording every single frame.
        if (barTrack && barTrack.confidence >= 1 && barTrack.color) {
          confirmedColorSamplesRef.current.push(barTrack.color);
        }
        // Fuse the wrist-derived position with the implement tracker's own
        // independently-held lock (see implement-tracking.ts's header
        // comment), weighted by how much to trust each one THIS frame --
        // not an either/or switch, so a marginal lock still nudges the
        // result a little rather than being all-or-nothing, and a
        // barely-visible wrist still keeps some floor of influence even
        // once the implement tracker is fully confident. Depth (z) has no
        // 2D-motion equivalent for the tracker to contribute, so it's
        // wrist-only regardless.
        //
        // Hand Landmarker's corroboration (gripConfirmed, above) nudges
        // the wrist side of this up a little further -- capped well short
        // of a full-confidence override, since it's still only a 2D
        // location check, not a validation of Pose's world-space Y/depth
        // estimate specifically.
        const rawWristConfidence = normalizedWrist ? barPointConfidence(worldLandmarks, usesSharedBar) : 0;
        const wristConfidence = gripConfirmed ? Math.min(1, rawWristConfidence * 1.25) : rawWristConfidence;
        // A remembered appearance for this exercise (see
        // implement-appearance-memory.ts, looked up once in startTracking)
        // nudges this frame's bar confidence up or down a little based on
        // how closely this frame's sampled color matches it -- a small
        // multiplicative adjustment, same spirit as gripConfirmed's nudge to
        // wristConfidence above. Deliberately modest (+-15% at most): color
        // alone is weak corroboration on its own, so a mismatch should never
        // undo most of the tracker's own motion-based confidence, and a
        // match should never manufacture confidence the motion search
        // didn't actually earn.
        const appearanceMatch =
          barTrack?.color && rememberedAppearanceRef.current
            ? appearanceSimilarity(barTrack.color, rememberedAppearanceRef.current)
            : null;
        const barConfidence = barTrack
          ? appearanceMatch != null
            ? barTrack.confidence * (0.85 + 0.15 * appearanceMatch)
            : barTrack.confidence
          : 0;
        const totalConfidence = wristConfidence + barConfidence;
        const x =
          totalConfidence > 0
            ? (wristConfidence * worldPoint.x + barConfidence * (barTrack ? barTrack.worldX : 0)) /
              totalConfidence
            : worldPoint.x;
        const rawY =
          totalConfidence > 0
            ? (wristConfidence * worldPoint.y + barConfidence * (barTrack ? barTrack.worldY : 0)) /
              totalConfidence
            : worldPoint.y;
        const y = verticalSignRef.current * rawY;
        // wristConfidence can reach 1.25 (the Hand Landmarker corroboration
        // bump above) and barConfidence up to 1, so this normalizes back to
        // the same 0-1 scale every other confidence value in this file uses
        // -- lets summarizeTrackedSet's own smoothing (see TrackedPoint's
        // confidence field) and computeRepTrustScores (derived from this
        // trace at Stop) both weight by how much this specific frame was
        // actually trusted, instead of treating every frame equally.
        const point = { t, x, y, z: worldPoint.z, confidence: Math.min(1, totalConfidence / 2) };
        // A brief camera dropout right before this point (an arm crossing
        // the bar, a chalk cloud) shouldn't read as one giant instantaneous
        // jump once it resolves -- see interpolateOcclusionGap's own
        // comment for why only a short gap gets bridged this way. A fast,
        // explosive movement (a rotational med-ball throw, a jump landing)
        // blurs past the pose model harder and longer than the slower,
        // controlled lifts this tolerance was originally tuned around, and
        // an unbridged gap there doesn't just misdraw one point -- it can
        // make segmentPhases lose or merge whole reps around the gap. Jump
        // mode gets the most headroom (a landing can lose ankle tracking
        // for longer than any lift's bar/wrist ever does).
        // See MAX_PLAUSIBLE_VELOCITY_MPS's own comment -- a frame whose
        // implied speed from the last accepted point is physically
        // impossible gets skipped outright (not even gap-bridged toward)
        // rather than standing as this frame's reading. `prev` on the next
        // tick naturally falls back to the same last-good point since
        // nothing was pushed this frame, no separate bookkeeping needed.
        if (mode === "jump" || isPlausibleVelocity(prev, point)) {
          if (prev)
            for (const gapPoint of interpolateOcclusionGap(prev, point, mode === "jump" ? 400 : 300))
              trace.push(gapPoint);
          trace.push(point);
        } else {
          rejectionEventsRef.current.push(t);
        }
        // Refines just the hip/knee/ankle landmarks (both the 2D and the
        // world-space arrays) in the SAVED frame history -- what
        // detectFormFaults/computeRepDepths/computeLegDriveAsymmetry read
        // back at Stop -- via a cropped second Pose pass -- see
        // roi-refine.ts's own comment. Throttled rather than run every
        // tick, and left off entirely whenever the optional second model
        // hasn't loaded; the live skeleton overlay keeps using the plain
        // full-frame landmarks regardless, so this never affects what's
        // drawn on screen, only what gets analyzed after Stop.
        roiTickCounterRef.current += 1;
        const ROI_REFINE_INTERVAL = 3;
        const { landmarks: savedLandmarks, worldLandmarks: savedWorldLandmarks } =
          roiLandmarkerRef.current && roiTickCounterRef.current % ROI_REFINE_INTERVAL === 0
            ? refineLowerBodyLandmarks(
                roiLandmarkerRef.current,
                video,
                landmarks,
                worldLandmarks,
                now,
                scaleCorrectionRef.current,
              )
            : { landmarks, worldLandmarks };
        framesRef.current.push({ t, landmarks: savedLandmarks, worldLandmarks: savedWorldLandmarks });

        const wrists = deriveWristPoints(worldLandmarks);
        if (wrists.left) {
          const leftPoint = {
            t,
            x: wrists.left.x,
            y: verticalSignRef.current * wrists.left.y,
            z: wrists.left.z,
          };
          const prevLeft = leftTraceRef.current[leftTraceRef.current.length - 1];
          if (mode === "jump" || isPlausibleVelocity(prevLeft ?? null, leftPoint)) {
            if (prevLeft)
              for (const g of interpolateOcclusionGap(prevLeft, leftPoint, mode === "jump" ? 400 : 300))
                leftTraceRef.current.push(g);
            leftTraceRef.current.push(leftPoint);
          }
        }
        if (wrists.right) {
          const rightPoint = {
            t,
            x: wrists.right.x,
            y: verticalSignRef.current * wrists.right.y,
            z: wrists.right.z,
          };
          const prevRight = rightTraceRef.current[rightTraceRef.current.length - 1];
          if (mode === "jump" || isPlausibleVelocity(prevRight ?? null, rightPoint)) {
            if (prevRight)
              for (const g of interpolateOcclusionGap(prevRight, rightPoint, mode === "jump" ? 400 : 300))
                rightTraceRef.current.push(g);
            rightTraceRef.current.push(rightPoint);
          }
        }

        // Left/right implement tracking, purely to make bar tilt a real
        // two-signal fusion instead of two raw wrist landmarks -- entirely
        // separate from the combined tracker and the raw wrist traces just
        // above (see leftImplementTrackerRef's own comment for why).
        // Skipped for jump mode (nothing held) and non-shared-bar equipment
        // (tilt isn't a real concept there either), same gate the saved
        // bar_tilt fault already uses.
        let fusedLeft: { x: number; y: number } | null = null;
        let fusedRight: { x: number; y: number } | null = null;
        // Normalized (0-1) confidence per side, for sideVelocitySamplesRef
        // below -- each of leftTotal/rightTotal below can reach as high as
        // 2 (wrist confidence and bar-track confidence are each already
        // 0-1 on their own), so this halves it back down to the same 0-1
        // scale VelocitySample promises everywhere else.
        let leftConfidence = 0;
        let rightConfidence = 0;
        if (mode !== "jump" && usesSharedBar) {
          const normalizedWrists = deriveNormalizedWristPoints(landmarks);
          // Same plausibility reasoning as MAX_PLAUSIBLE_IMPLEMENT_OFFSET_M
          // above, just tighter -- a single grip point has to sit right at
          // the hand holding it, not somewhere across a whole bar's width
          // the way the combined center can legitimately be.
          const MAX_PLAUSIBLE_GRIP_OFFSET_M = 0.35;

          if (normalizedWrists.left) {
            let seed = normalizedWrists.left;
            const refined = handsResult ? refineGripPoint(handsResult.landmarks, seed.x, seed.y) : null;
            if (refined) seed = refined;
            const leftWristWorld = worldLandmarks[POSE_LANDMARKS.LEFT_WRIST];
            let leftTrack = leftImplementTrackerRef.current.track(
              video,
              seed.x,
              seed.y,
              landmarks,
              worldLandmarks,
              leftWristWorld.x,
              leftWristWorld.y,
            );
            if (
              leftTrack &&
              Math.hypot(leftTrack.worldX - leftWristWorld.x, leftTrack.worldY - leftWristWorld.y) >
                MAX_PLAUSIBLE_GRIP_OFFSET_M
            ) {
              leftImplementTrackerRef.current.rejectLock();
              rejectionEventsRef.current.push(t);
              leftTrack = null;
            }
            const leftWristConf = singleWristConfidence(worldLandmarks, "left");
            const leftBarConf = leftTrack ? leftTrack.confidence : 0;
            const leftTotal = leftWristConf + leftBarConf;
            leftConfidence = leftTotal / 2;
            fusedLeft =
              leftTotal > 0
                ? {
                    x:
                      (leftWristConf * leftWristWorld.x + leftBarConf * (leftTrack ? leftTrack.worldX : 0)) /
                      leftTotal,
                    y:
                      (leftWristConf * leftWristWorld.y + leftBarConf * (leftTrack ? leftTrack.worldY : 0)) /
                      leftTotal,
                  }
                : null;
            // See MAX_PLAUSIBLE_VELOCITY_MPS's own comment -- this is the
            // actual data path bar tilt/grip-width read from, so an
            // implausible jump here is exactly what produced readings like
            // "grip shifted 65cm" or "tilted 50 degrees": a single bad
            // frame, uncaught because MAX_PLAUSIBLE_GRIP_OFFSET_M above only
            // checks tracker-vs-wrist agreement WITHIN this frame, not this
            // frame against the last one.
            if (fusedLeft && !isPlausibleVelocity(prevFusedLeftRef.current, { ...fusedLeft, t })) {
              rejectionEventsRef.current.push(t);
              fusedLeft = null;
            }
            if (fusedLeft) prevFusedLeftRef.current = { x: fusedLeft.x, y: fusedLeft.y, t };
          }

          if (normalizedWrists.right) {
            let seed = normalizedWrists.right;
            const refined = handsResult ? refineGripPoint(handsResult.landmarks, seed.x, seed.y) : null;
            if (refined) seed = refined;
            const rightWristWorld = worldLandmarks[POSE_LANDMARKS.RIGHT_WRIST];
            let rightTrack = rightImplementTrackerRef.current.track(
              video,
              seed.x,
              seed.y,
              landmarks,
              worldLandmarks,
              rightWristWorld.x,
              rightWristWorld.y,
            );
            if (
              rightTrack &&
              Math.hypot(rightTrack.worldX - rightWristWorld.x, rightTrack.worldY - rightWristWorld.y) >
                MAX_PLAUSIBLE_GRIP_OFFSET_M
            ) {
              rightImplementTrackerRef.current.rejectLock();
              rejectionEventsRef.current.push(t);
              rightTrack = null;
            }
            const rightWristConf = singleWristConfidence(worldLandmarks, "right");
            const rightBarConf = rightTrack ? rightTrack.confidence : 0;
            const rightTotal = rightWristConf + rightBarConf;
            rightConfidence = rightTotal / 2;
            fusedRight =
              rightTotal > 0
                ? {
                    x:
                      (rightWristConf * rightWristWorld.x + rightBarConf * (rightTrack ? rightTrack.worldX : 0)) /
                      rightTotal,
                    y:
                      (rightWristConf * rightWristWorld.y + rightBarConf * (rightTrack ? rightTrack.worldY : 0)) /
                      rightTotal,
                  }
                : null;
            // See fusedLeft's own comment just above -- same fix, mirrored.
            if (fusedRight && !isPlausibleVelocity(prevFusedRightRef.current, { ...fusedRight, t })) {
              rejectionEventsRef.current.push(t);
              fusedRight = null;
            }
            if (fusedRight) prevFusedRightRef.current = { x: fusedRight.x, y: fusedRight.y, t };
          }
        }

        // The live tilt reading itself: needs both sides fused this frame
        // to mean anything (same MIN_BAR_GRIP_SEPARATION_M-style reasoning
        // tiltDegreesFromPoints already applies). See LIVE_TILT_HISTORY_SIZE's
        // own comment for why this feeds a rolling median rather than
        // setting state straight from one frame.
        const rawTilt =
          fusedLeft && fusedRight ? tiltDegreesFromPoints(fusedLeft, fusedRight, verticalSignRef.current) : null;
        if (rawTilt != null) {
          liveTiltHistoryRef.current.push(rawTilt);
          if (liveTiltHistoryRef.current.length > LIVE_TILT_HISTORY_SIZE) liveTiltHistoryRef.current.shift();
          tiltReadingsRef.current.push(rawTilt);
        }
        setLiveTiltDeg(liveTiltHistoryRef.current.length > 0 ? medianOf(liveTiltHistoryRef.current) : null);
        // Same two fused points, a different measurement -- lateral
        // separation instead of angle, tracked for the whole set so a
        // mid-set regrip can be caught (see FormFault's "grip_shift" code).
        if (fusedLeft && fusedRight) {
          const gripWidthM = Math.abs(fusedRight.x - fusedLeft.x);
          if (gripWidthM >= PLAUSIBLE_GRIP_WIDTH_RANGE_M[0] && gripWidthM <= PLAUSIBLE_GRIP_WIDTH_RANGE_M[1]) {
            gripWidthReadingsRef.current.push(gripWidthM);
          }
          // A third measurement from the same two points -- this time their
          // own midpoint's vertical position, a second independent read on
          // the bar's own height alongside the primary trace's wrist+bar
          // fusion above. See sideVelocitySamplesRef's own comment.
          sideVelocitySamplesRef.current.push({
            t,
            y: verticalSignRef.current * ((fusedLeft.y + fusedRight.y) / 2),
            confidence: (leftConfidence + rightConfidence) / 2,
          });
          // And kept apart too -- see leftVelocitySamplesRef's own comment.
          leftVelocitySamplesRef.current.push({
            t,
            y: verticalSignRef.current * fusedLeft.y,
            confidence: leftConfidence,
          });
          rightVelocitySamplesRef.current.push({
            t,
            y: verticalSignRef.current * fusedRight.y,
            confidence: rightConfidence,
          });
        }

        // Cheap live rep counter: count direction reversals bigger than a
        // threshold, same idea as segmentPhases but incremental for the
        // live display -- the real, precise segmentation runs once on the
        // full trace at Stop. Display only -- this used to also auto-stop
        // tracking once it reached targetReps, but that cheap heuristic
        // can misfire (noise counted as a rep, or a mistimed/failed rep
        // never registering), silently ending the capture and the camera
        // recording well before the set was actually done. Recording now
        // only ever ends when the athlete taps Stop themselves.
        //
        // Jump mode gets its own, much larger threshold rather than
        // reusing the lift-mode one: an ordinary walking step lifts an
        // ankle only 3-6cm, comfortably clearing the 4cm lift-mode
        // reversal size, so counting every jump-mode step as a "jump"
        // while the athlete simply repositions between reps was the direct
        // cause of the live count overshooting the target (8/5, 9/5) while
        // no jump was happening. LIVE_JUMP_REVERSAL_CM sits a little under
        // summarizeJumpSet's own real per-jump floor (also height-scaled
        // the same way) rather than matching it exactly -- this counter
        // has none of the batch analysis's settle/apex checks, so it needs
        // a bit of headroom to still register a genuine jump promptly.
        const reversalThresholdM =
          mode === "jump" ? heightScaledAmplitudeCm(LIVE_JUMP_REVERSAL_CM, heightIn) / 100 : 0.04;
        if (trace.length > 4) {
          const window5 = trace.slice(-5).map((p) => p.y);
          const delta = window5[window5.length - 1] - window5[0];
          if (Math.abs(delta) > reversalThresholdM) {
            const dir = delta > 0 ? 1 : -1;
            if (lastRepDirRef.current !== dir) {
              if (dir === -1) {
                repCountRef.current += 1;
                setRepCount(repCountRef.current);
                hapticLight();
              }
              lastRepDirRef.current = dir;
            }
          }
        }

        // Live counterpart to the Stop-time patternMismatch check further
        // down -- same guessMovementPattern/expectedPatternFromName pair,
        // just re-run periodically WHILE tracking instead of once at the
        // end, so a wrong-exercise-selected or camera-picked-up-someone-
        // else's-set mistake can be caught and fixed mid-set. Gated on at
        // least one completed rep: guessMovementPattern accumulates min/max
        // range-of-motion across the WHOLE frame history it's given (see
        // its own frames.length < 6 guard), so calling it on a handful of
        // early frames before any real range of motion exists would just
        // produce noisy, misleading early guesses. Throttled to avoid
        // rescanning the whole frame history every single tick.
        if (mode !== "jump" && repCountRef.current >= 1) {
          mismatchTickCounterRef.current += 1;
          const MISMATCH_CHECK_INTERVAL = 45;
          if (mismatchTickCounterRef.current % MISMATCH_CHECK_INTERVAL === 0) {
            const liveGuess = guessMovementPattern(framesRef.current, movementType);
            const expected = expectedPatternFromName(exerciseName);
            const mismatch = liveGuess.pattern !== "unknown" && !!expected && liveGuess.pattern !== expected;
            setLiveMismatchHint(
              mismatch
                ? `Motion looks more like a ${liveGuess.label} — double check you're tracking ${exerciseName}.`
                : null,
            );
          }
        }
      }
      drawTrail(ctx, pixelTraceRef.current);
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopTracking() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();

    if (mode === "jump") {
      const jumpMetrics = summarizeJumpSet(traceRef.current, heightIn);
      if (!jumpMetrics) {
        toast.error("Couldn't get a clean read — make sure your feet leave the ground clearly in frame.");
        changeStep("setup");
        return;
      }
      // Landing mechanics (valgus, forward lean) still matter for a jump;
      // squat-depth judgment and bar-path drift don't -- see the "jump"
      // context branch in detectFormFaults.
      jumpMetrics.formFaults = detectFormFaults(
        framesRef.current,
        0,
        "jump",
        movementType,
        equipment,
        undefined,
        undefined,
        jumpMetrics.repBreakdown.map((r) => ({ startT: r.takeoffT, endT: r.landingT })),
      );
      setResult(jumpMetrics);
      changeStep("review");
      return;
    }

    let metrics = summarizeTrackedSet(
      traceRef.current,
      loadKg,
      heightIn,
      inferFirstPhaseHint(movementType, exerciseName),
      rejectionEventsRef.current,
    );
    if (!metrics) {
      toast.error("Couldn't get a clean read — try again with your whole body in frame.");
      changeStep("setup");
      return;
    }
    // See fuseSideVelocity's own comment -- confidence-weighted blend of
    // the primary trace's peak/mean velocity against the independent
    // left/right average, not a plain average of the two.
    metrics = fuseSideVelocity(metrics, sideVelocitySamplesRef.current, loadKg);
    metrics.formFaults = detectFormFaults(
      framesRef.current,
      metrics.barPathDeviationCm,
      "lift",
      movementType,
      equipment,
      // See tiltReadingsRef's own comment -- the saved bar_tilt fault now
      // reads from the same left/right-fused readings the live display
      // used, instead of recomputing tilt from these frames' raw,
      // single-source wrist landmarks.
      tiltReadingsRef.current,
      // See gripWidthReadingsRef's own comment -- new fault, no prior
      // behavior to preserve.
      gripWidthReadingsRef.current,
      // Scopes fault detection to the rep windows summarizeTrackedSet
      // already found -- see detectFormFaults' own comment on repWindows.
      // Without this, the rack walkout before the first rep and the
      // re-rack bend after the last one -- both included in framesRef.current
      // the same way rawPoints includes them for barPathDeviationCm -- could
      // trip forward_lean (or knee_valgus/pelvic_drop) on their own.
      metrics.repBreakdown.map((r) => ({ startT: r.startT, endT: r.endT })),
    );

    const depths = computeRepDepths(
      framesRef.current,
      metrics.repBreakdown.map((r) => ({ startT: r.startT, endT: r.endT })),
    );
    metrics.repBreakdown = metrics.repBreakdown.map((r, i) => ({ ...r, depthDeg: depths[i] }));

    // Only meaningful for a bilateral lower-body lift -- a Lunge or any
    // unilateral exercise loads one leg at a time across reps, so comparing
    // "left vs right within this rep" wouldn't measure anything real.
    if (movementType === "Squat" && laterality !== "unilateral") {
      const legDrive = computeLegDriveAsymmetry(
        framesRef.current,
        metrics.repBreakdown.map((r) => ({ startT: r.startT, endT: r.endT })),
      );
      const validEntries = legDrive
        .map((d, i) => (d ? { repNumber: metrics.repBreakdown[i].repNumber, ...d } : null))
        .filter((d): d is NonNullable<typeof d> => d !== null);
      metrics.legDriveAsymmetry = validEntries.length > 0 ? validEntries : null;
    } else {
      metrics.legDriveAsymmetry = null;
    }

    // Same idea, arms instead of legs -- only meaningful for a bilateral
    // press/pull on a shared bar (Push: bench/overhead press, Pull: rows).
    // Squat/Hinge/Lunge are excluded the same way they are from the leg
    // check above, just from the other direction: the bar there is driven
    // by the legs, not compared arm-to-arm.
    if (usesSharedBar && laterality !== "unilateral" && (movementType === "Push" || movementType === "Pull")) {
      const armDrive = computeArmDriveAsymmetry(
        leftVelocitySamplesRef.current,
        rightVelocitySamplesRef.current,
        metrics.repBreakdown.map((r) => ({ startT: r.startT, endT: r.endT })),
      );
      const validArmEntries = armDrive
        .map((d, i) => (d ? { repNumber: metrics.repBreakdown[i].repNumber, ...d } : null))
        .filter((d): d is NonNullable<typeof d> => d !== null);
      metrics.armDriveAsymmetry = validArmEntries.length > 0 ? validArmEntries : null;
    } else {
      metrics.armDriveAsymmetry = null;
    }

    const origin = { x: traceRef.current[0]?.x ?? 0, y: traceRef.current[0]?.y ?? 0 };
    metrics.armPathTrace =
      leftTraceRef.current.length > 1 && rightTraceRef.current.length > 1
        ? {
            left: buildPathTrace(leftTraceRef.current, origin),
            right: buildPathTrace(rightTraceRef.current, origin),
          }
        : null;

    // One update to the appearance memory per set, averaged across every
    // fully-confident frame instead of per-frame writes -- see
    // confirmedColorSamplesRef's own comment. Requires a real handful of
    // samples, not just one or two lucky frames, before trusting this set's
    // color enough to fold into what gets remembered for next time.
    if (confirmedColorSamplesRef.current.length >= 10) {
      const samples = confirmedColorSamplesRef.current;
      const avgColor = {
        r: samples.reduce((sum, c) => sum + c.r, 0) / samples.length,
        g: samples.reduce((sum, c) => sum + c.g, 0) / samples.length,
        b: samples.reduce((sum, c) => sum + c.b, 0) / samples.length,
      };
      recordConfirmedAppearance(exerciseName, avgColor);
    }

    const guess = guessMovementPattern(framesRef.current, movementType);
    setMovementGuess(guess);

    // Same mismatch logic the review screen's own patternMismatch (further
    // down, computed from state) uses -- done here with the local guess
    // instead of the not-yet-updated movementGuess state, since
    // computeRepTrustScores needs it this same tick.
    const guessExpectedPattern = expectedPatternFromName(exerciseName);
    const guessMismatch =
      guess.pattern !== "unknown" && !!guessExpectedPattern && guess.pattern !== guessExpectedPattern;
    metrics.trustScores = computeRepTrustScores(
      metrics.repBreakdown.map((r) => ({ repNumber: r.repNumber, startT: r.startT, endT: r.endT })),
      // Reads confidence straight off the primary trace's own points (see
      // TrackedPoint's confidence field) rather than a separately-tracked
      // ref -- it's the exact same per-frame value the position fusion and
      // now the trace's own smoothing (summarizeTrackedSet's ySmoothed)
      // already used, just filtered here to the reps that need it. An
      // interpolated occlusion-gap filler point (see interpolateOcclusionGap)
      // has no confidence of its own, so it reads as neutral rather than
      // untrustworthy, same fallback movingAverage/computeRepTrustScores use
      // elsewhere.
      traceRef.current.map((p) => ({ t: p.t, confidence: p.confidence ?? 0.6 })),
      rejectionEventsRef.current,
      guessMismatch,
      lastAlignmentReasonRef.current,
    );

    setResult(metrics);
    changeStep("review");
  }

  function retry() {
    traceRef.current = [];
    framesRef.current = [];
    setResult(null);
    changeStep("tracking");
    startTracking();
  }

  const expectedPattern = expectedPatternFromName(exerciseName);
  const patternMismatch =
    !!movementGuess &&
    movementGuess.pattern !== "unknown" &&
    !!expectedPattern &&
    movementGuess.pattern !== expectedPattern;
  const liftResult = result && !isJumpMetrics(result) ? result : null;
  const jumpResult = result && isJumpMetrics(result) ? result : null;
  const firstRepPeak = liftResult?.repBreakdown[0]?.peakVelocityMps ?? 0;
  const lastRepCurve = liftResult?.repBreakdown[liftResult.repBreakdown.length - 1]?.velocityCurve ?? [];
  const legDriveByRep = new Map((liftResult?.legDriveAsymmetry ?? []).map((d) => [d.repNumber, d]));
  const avgLegAsymmetry =
    liftResult?.legDriveAsymmetry && liftResult.legDriveAsymmetry.length > 0
      ? Math.round(
          liftResult.legDriveAsymmetry.reduce((sum, d) => sum + d.asymmetryPercent, 0) /
            liftResult.legDriveAsymmetry.length,
        )
      : null;
  const armDriveByRep = new Map((liftResult?.armDriveAsymmetry ?? []).map((d) => [d.repNumber, d]));
  const trustByRep = new Map((liftResult?.trustScores ?? []).map((d) => [d.repNumber, d]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            Track {exerciseName}
          </DialogTitle>
          <DialogDescription>
            {mode === "jump"
              ? "Jump height, distance, and ground contact time for this set."
              : mode === "full"
                ? "Bar speed, tempo, and bar path for this set."
                : "Bar path for this set — no speed emphasis."}
          </DialogDescription>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-md bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="w-full" />
          <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />

          {step === "tracking" && (
            <div className="absolute inset-x-0 top-0 flex flex-col gap-1.5 p-3">
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-bold",
                    poseVisible ? "bg-success/80 text-success-foreground" : "bg-destructive/80 text-white",
                  )}
                >
                  {poseVisible ? "Tracking" : "Body not visible"}
                </span>
                {mode === "full" && (
                  <span className="rounded-full bg-black/60 px-3 py-1 font-display text-lg font-bold text-white">
                    {liveSpeed.toFixed(2)} m/s
                  </span>
                )}
                <span className="rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white">
                  {repCount}
                  {targetReps ? `/${targetReps}` : ""} {mode === "jump" ? "jumps" : "reps"}
                </span>
              </div>
              {liveTiltDeg != null && (
                <div className="flex justify-center">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      Math.abs(liveTiltDeg) > 7
                        ? "bg-amber-500/80 text-black"
                        : "bg-black/60 text-white",
                    )}
                  >
                    {Math.abs(liveTiltDeg) > 7
                      ? `${Math.abs(liveTiltDeg).toFixed(0)}° toward the ${liveTiltDeg > 0 ? "right" : "left"} arm`
                      : "Bar level"}
                  </span>
                </div>
              )}
              {mode !== "jump" && (
                <div className="flex justify-center">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      implementDetected ? "bg-success/80 text-success-foreground" : "bg-black/40 text-white/70",
                    )}
                  >
                    {implementDetected ? "Object detected" : "Estimating from hand position"}
                  </span>
                </div>
              )}
              {liveMismatchHint && (
                <div className="flex justify-center">
                  <span className="rounded-full bg-amber-500/80 px-2.5 py-1 text-[11px] font-semibold text-black">
                    {liveMismatchHint}
                  </span>
                </div>
              )}
            </div>
          )}

          {step === "setup" && countdown != null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="font-display text-7xl font-extrabold text-white drop-shadow-lg">
                {countdown}
              </span>
            </div>
          )}

          {step === "setup" && countdown == null && alignmentHint && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-500/80 px-3 py-1 text-xs font-semibold text-black">
              {alignmentHint}
            </div>
          )}

          {tilt != null && step === "setup" && (
            <div
              className={cn(
                "absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold",
                Math.abs(tilt) <= 8 ? "bg-success/80 text-success-foreground" : "bg-amber-500/80 text-black",
              )}
            >
              {Math.abs(tilt) <= 8 ? "Phone level" : `Tilt ${tilt > 0 ? "down" : "up"} ${Math.abs(tilt)}°`}
            </div>
          )}
        </div>

        {cameraError && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {cameraError}
          </p>
        )}

        {step === "setup" && !cameraError && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {mode === "jump"
                ? "Step back far enough to fit your takeoff spot AND where you'll land in frame, and keep the phone level and perpendicular to your jump. No marker needed; this tracks your body directly."
                : "Step back until your whole body is visible, and try to keep the phone level and perpendicular to your movement — an angled camera skews the reading. No marker or tape needed; this tracks your body directly."}
              {" "}Prop the phone up and get in position — tracking starts on its own once you're set up, no need to touch it again.
            </p>
            {modelLoading && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />
                Loading the pose-tracking model…
              </p>
            )}
          </div>
        )}

        {step === "review" && jumpResult && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-3 text-center">
              <Stat label="Best Jump Height" value={`${jumpResult.bestJumpHeightCm} cm`} />
              <Stat
                label="Best Distance"
                value={
                  jumpResult.bestHorizontalDistanceCm != null
                    ? `${jumpResult.bestHorizontalDistanceCm} cm`
                    : "—"
                }
              />
              {jumpResult.avgGroundContactSeconds != null && (
                <Stat label="Avg. Ground Contact" value={`${jumpResult.avgGroundContactSeconds}s`} />
              )}
              {jumpResult.reactiveStrengthIndex != null && (
                <Stat label="Reactive Strength Index" value={`${jumpResult.reactiveStrengthIndex}`} />
              )}
            </div>
            <FormFaultBadges faults={jumpResult.formFaults} />
            {jumpResult.repBreakdown.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Jump by jump</p>
                <div className="space-y-1 rounded-md border border-border p-2">
                  {jumpResult.repBreakdown.map((r) => (
                    <div key={r.repNumber} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold">Jump {r.repNumber}</span>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span>{r.jumpHeightCm} cm</span>
                        {r.horizontalDistanceCm != null && <span>{r.horizontalDistanceCm} cm dist.</span>}
                        {r.groundContactSeconds != null && (
                          <span>{r.groundContactSeconds}s contact</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === "review" && liftResult && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-3 text-center">
              {mode === "full" && (
                <>
                  <Stat label="Peak Velocity" value={`${liftResult.peakVelocityMps} m/s`} />
                  <Stat label="Mean Velocity" value={`${liftResult.meanVelocityMps} m/s`} />
                  <Stat label="Concentric" value={`${liftResult.concentricSeconds}s`} />
                  <Stat
                    label="Eccentric"
                    value={`${liftResult.eccentricSeconds}s @ ${liftResult.eccentricMeanVelocityMps} m/s`}
                  />
                  {liftResult.peakPowerWatts != null && (
                    <Stat label="Peak Power" value={`${liftResult.peakPowerWatts} W`} />
                  )}
                  {liftResult.meanPowerWatts != null && (
                    <Stat label="Mean Power" value={`${liftResult.meanPowerWatts} W`} />
                  )}
                  {liftResult.velocityLossPercent != null && (
                    <Stat
                      // velocityLossPercent is signed (positive = later reps
                      // slower, negative = later reps faster -- see its own
                      // comment in bar-tracking.ts). A static "Velocity Loss"
                      // label with a flipped sign printed something like
                      // "+132% Velocity Loss" for a rep that got FASTER,
                      // which reads as an even bigger loss than 100% -- the
                      // label now swaps to match which direction it actually
                      // went, so the number and the word next to it always
                      // agree.
                      label={liftResult.velocityLossPercent >= 0 ? "Velocity Loss" : "Velocity Gain"}
                      value={`${Math.abs(liftResult.velocityLossPercent)}%`}
                    />
                  )}
                </>
              )}
              <Stat label="Avg. ROM" value={`${liftResult.romCm} cm`} />
              <Stat
                label={usesSharedBar ? "Bar Path Deviation" : "Hand Path Deviation"}
                value={`${liftResult.barPathDeviationCm} cm`}
                full={mode === "bar_path"}
              />
            </div>
            <FormFaultBadges faults={liftResult.formFaults} />

            {avgLegAsymmetry != null && (
              <p
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  avgLegAsymmetry >= 15 ? "font-semibold text-amber-500" : "text-muted-foreground",
                )}
              >
                {avgLegAsymmetry >= 15 ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Info className="h-3.5 w-3.5 shrink-0" />
                )}
                Leg drive: {avgLegAsymmetry}% avg. imbalance
              </p>
            )}

            {movementGuess && movementGuess.pattern !== "unknown" && (
              <p
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  patternMismatch ? "font-semibold text-amber-500" : "text-muted-foreground",
                )}
              >
                {patternMismatch ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Info className="h-3.5 w-3.5 shrink-0" />
                )}
                {patternMismatch
                  ? `Motion looks more like a ${movementGuess.label} — double check you're tracking ${exerciseName}.`
                  : `Motion pattern: ${movementGuess.label}`}
              </p>
            )}

            {liftResult.repBreakdown.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Rep by rep</p>
                <div className="space-y-1 rounded-md border border-border p-2">
                  {liftResult.repBreakdown.map((r) => {
                    const decayPct =
                      mode === "full" && firstRepPeak > 0
                        ? Math.round(((firstRepPeak - r.peakVelocityMps) / firstRepPeak) * 100)
                        : 0;
                    return (
                      <div key={r.repNumber} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5 font-semibold">
                          Rep {r.repNumber}
                          {trustByRep.has(r.repNumber) && (
                            <span
                              title={
                                trustByRep.get(r.repNumber)!.notes.length > 0
                                  ? `Tracking confidence: ${trustByRep.get(r.repNumber)!.score}%. ${trustByRep
                                      .get(r.repNumber)!
                                      .notes.join(". ")}`
                                  : `Tracking confidence: ${trustByRep.get(r.repNumber)!.score}%`
                              }
                              className={cn(
                                "inline-block h-1.5 w-1.5 rounded-full",
                                trustByRep.get(r.repNumber)!.label === "high"
                                  ? "bg-success"
                                  : trustByRep.get(r.repNumber)!.label === "medium"
                                    ? "bg-amber-500"
                                    : "bg-destructive",
                              )}
                            />
                          )}
                        </span>
                        <span className="flex items-center gap-2 text-muted-foreground">
                          {mode === "full" && (
                            <span className={decayPct > 15 ? "font-semibold text-amber-500" : undefined}>
                              {r.peakVelocityMps} m/s{decayPct > 15 ? ` (-${decayPct}%)` : ""}
                            </span>
                          )}
                          {r.depthDeg != null && <span>{r.depthDeg}° knee</span>}
                          {legDriveByRep.has(r.repNumber) && (
                            <span
                              className={
                                legDriveByRep.get(r.repNumber)!.asymmetryPercent >= 15
                                  ? "font-semibold text-amber-500"
                                  : undefined
                              }
                            >
                              {legDriveByRep.get(r.repNumber)!.dominantSide === "left" ? "R" : "L"} weaker{" "}
                              {legDriveByRep.get(r.repNumber)!.asymmetryPercent}%
                            </span>
                          )}
                          {armDriveByRep.has(r.repNumber) && (
                            <span
                              className={
                                armDriveByRep.get(r.repNumber)!.asymmetryPercent >= 15
                                  ? "font-semibold text-amber-500"
                                  : undefined
                              }
                            >
                              {armDriveByRep.get(r.repNumber)!.dominantSide === "left" ? "R" : "L"} arm weaker{" "}
                              {armDriveByRep.get(r.repNumber)!.asymmetryPercent}%
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {mode === "full" && lastRepCurve.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Sticking point (last rep)
                </p>
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lastRepCurve} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <XAxis
                        dataKey="positionCm"
                        type="number"
                        tick={{ fontSize: 9 }}
                        unit="cm"
                        tickFormatter={(v: number) => String(Math.round(v))}
                      />
                      <YAxis dataKey="velocityMps" tick={{ fontSize: 9 }} unit="m/s" width={40} />
                      <Line type="monotone" dataKey="velocityMps" stroke="#f97316" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "setup" && (
            <Button onClick={startTracking} disabled={!!cameraError || modelLoading}>
              <Video className="h-4 w-4" />
              Start Set
            </Button>
          )}
          {step === "tracking" && (
            <Button variant="secondary" onClick={stopTracking}>
              <Square className="h-4 w-4" />
              Stop &amp; Review
            </Button>
          )}
          {step === "review" && (
            <>
              <Button variant="outline" onClick={retry}>
                <RotateCcw className="h-4 w-4" />
                Retry
              </Button>
              <Button
                disabled={savePhase !== "idle"}
                onClick={async () => {
                  if (!result) return;
                  if (recordVideo && recordedBlobRef.current) {
                    let videoToUpload: Blob = recordedBlobRef.current;
                    // Burning the trail/rep badges in is cosmetic -- never
                    // worth blocking the actual save over. Any failure
                    // (unsupported browser API, a mid-encode error) just
                    // falls back to uploading the plain recorded clip, the
                    // same clip that would have been saved before this
                    // feature existed.
                    if (framesRef.current.length > 0) {
                      setSavePhase("overlay");
                      setOverlayProgress(0);
                      try {
                        const repMarkers: OverlayRepMarker[] = liftResult
                          ? liftResult.repBreakdown.map((r) => ({
                              startMs: r.startT,
                              label: `REP ${r.repNumber} · ${r.peakVelocityMps} m/s`,
                            }))
                          : jumpResult
                            ? jumpResult.repBreakdown.map((r) => ({
                                startMs: r.takeoffT,
                                label: `JUMP ${r.repNumber} · ${r.jumpHeightCm}cm`,
                              }))
                            : [];
                        videoToUpload = await burnTrackingOverlay(
                          recordedBlobRef.current,
                          framesRef.current,
                          mode === "jump" ? ANKLE_INDICES : WRIST_INDICES,
                          repMarkers,
                          setOverlayProgress,
                        );
                      } catch {
                        videoToUpload = recordedBlobRef.current;
                      }
                    }
                    setSavePhase("uploading");
                    try {
                      const formData = new FormData();
                      formData.append("video", videoToUpload, videoFilenameForBlob(videoToUpload, "form-check"));
                      const res = await apiRequest("POST", "/api/athlete/form-video", formData);
                      const { url } = await res.json();
                      onCapture(result, url);
                      onOpenChange(false);
                    } catch {
                      toast.error("Couldn't upload the video -- analytics are still saved below.");
                      onCapture(result);
                      onOpenChange(false);
                    } finally {
                      setSavePhase("idle");
                    }
                  } else {
                    onCapture(result);
                    onOpenChange(false);
                  }
                }}
              >
                <Check className="h-4 w-4" />
                {savePhase === "overlay"
                  ? `Adding overlay… ${Math.round(overlayProgress * 100)}%`
                  : savePhase === "uploading"
                    ? "Uploading…"
                    : "Use This Data"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormFaultBadges({ faults }: { faults: { code: string; label: string }[] }) {
  if (faults.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-amber-500">
        <AlertTriangle className="h-3.5 w-3.5" />
        Form notes
      </p>
      <div className="flex flex-wrap gap-1.5">
        {faults.map((f) => (
          <Badge key={f.code} variant="secondary" className="text-xs font-normal">
            {f.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : undefined}>
      <p className="font-display text-xl font-bold">{value}</p>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
    </div>
  );
}
