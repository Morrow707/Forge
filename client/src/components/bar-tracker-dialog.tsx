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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  summarizeTrackedSet,
  buildPathTrace,
  interpolateOcclusionGap,
  type TrackedPoint,
  type RepMetrics,
} from "@/lib/bar-tracking";
import { summarizeJumpSet, type JumpSetMetrics } from "@/lib/jump-tracking";
import { refineBarHeightFromEdges } from "@/lib/bar-edge-detection";
import { PoseSmoother } from "@/lib/one-euro-filter";
import { playSuccessChime } from "@/lib/audio-cues";
import {
  getPoseLandmarker,
  deriveBarPoint,
  deriveJumpPoint,
  deriveWristPoints,
  detectFormFaults,
  computeBarTiltDegrees,
  computeRepDepths,
  computeLegDriveAsymmetry,
  guessMovementPattern,
  worldVerticalSign,
  isFullBodyInFrame,
  assessCameraAlignment,
  POSE_LANDMARKS,
  type PoseFrame,
  type MovementGuess,
  type MovementPattern,
} from "@/lib/pose-tracking";
import { PoseLandmarker, type NormalizedLandmark, type Landmark } from "@mediapipe/tasks-vision";
import {
  Camera,
  Video,
  Square,
  RotateCcw,
  Check,
  AlertTriangle,
  Sparkles,
  Info,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis } from "recharts";
import { apiRequest } from "@/lib/queryClient";

type Step = "setup" | "tracking" | "review";

const MIN_VISIBILITY = 0.5;
const SKELETON_COLOR = "#4ade80";
const TRAIL_COLOR = "#f97316";
const TRAIL_MAX_POINTS = 90;

const VOICE_PREF_KEY = "forge:tracker-voice-cues";

function loadVoicePref(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(VOICE_PREF_KEY) === "1";
}

// Purely a personal convenience during a set (some athletes like a spoken
// rep count, others find it distracting), so this is a device-level
// preference, not something synced or shown to a coach.
function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.1;
  window.speechSynthesis.speak(utterance);
}

// Loose keyword match from the exercise name to the handful of patterns
// guessMovementPattern can distinguish -- used only to flag an obvious
// mismatch ("tracking Bench Press but this moved like a Squat"), not to
// validate anything precisely.
function expectedPatternFromName(name: string): MovementPattern | null {
  const n = name.toLowerCase();
  if (n.includes("deadlift")) return "deadlift";
  if (n.includes("squat")) return "squat";
  if (/overhead|shoulder press|push press|military press/.test(n)) return "overhead_press";
  if (n.includes("bench") || n.includes("row") || n.includes("press")) return "horizontal_press_or_row";
  return null;
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

export function BarTrackerDialog({
  open,
  onOpenChange,
  mode,
  exerciseName,
  movementType,
  laterality,
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
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const voiceEnabledRef = useRef(loadVoicePref());
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
  // Whether refineBarHeightFromEdges found a confident real bar edge on the
  // most recent frame -- purely informational, so the athlete can see
  // whether tracking is reading the actual bar or has fallen back to the
  // wrist-only estimate (e.g. a bare hand exercise, poor lighting, or the
  // bar out of the search window).
  const [barEdgeDetected, setBarEdgeDetected] = useState(false);
  const [result, setResult] = useState<RepMetrics | JumpSetMetrics | null>(null);
  const [movementGuess, setMovementGuess] = useState<MovementGuess | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(loadVoicePref);
  const [savingVideo, setSavingVideo] = useState(false);

  function toggleVoice(next: boolean) {
    setVoiceEnabled(next);
    voiceEnabledRef.current = next;
    window.localStorage.setItem(VOICE_PREF_KEY, next ? "1" : "0");
  }

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
    setBarEdgeDetected(false);
    verticalSignRef.current = 1;
    displaySmootherRef.current.reset();
    worldSmootherRef.current.reset();
    lastDisplayYRef.current = null;
    readyStartTimeRef.current = null;
    autoStartTriggeredRef.current = false;
    autoStartTimersRef.current.forEach((id) => window.clearTimeout(id));
    autoStartTimersRef.current = [];
    setCountdown(null);
    setAlignmentHint(null);
    videoChunksRef.current = [];
    recordedBlobRef.current = null;
    setSavingVideo(false);

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

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCameraError("Camera access denied or unavailable."));

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta != null) setTilt(Math.round(e.beta) - 90);
    };
    window.addEventListener("deviceorientation", handleOrientation);

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
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
      const landmarks = detection.landmarks[0] ?? null;
      const worldLandmarks = detection.worldLandmarks[0] ?? null;
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
  // whole body is in frame AND the camera looks roughly square to the
  // athlete (see assessCameraAlignment) continuously for READY_HOLD_MS,
  // tracking starts on its own with an audible countdown -- nobody has to
  // watch the screen or touch the phone. Still runs (not gated on having
  // already triggered) once counting down, so stepping out of frame mid-
  // countdown cancels it rather than starting on an empty rack.
  function evaluateAutoStartReadiness(
    landmarks: NormalizedLandmark[] | null,
    worldLandmarks: Landmark[] | null,
    now: number,
  ) {
    if (stepRef.current !== "setup") return;

    const bodyIn = !!landmarks && isFullBodyInFrame(landmarks);
    const alignment = worldLandmarks ? assessCameraAlignment(worldLandmarks) : null;
    const ready = bodyIn && (alignment?.aligned ?? false);

    if (!autoStartTriggeredRef.current) {
      setAlignmentHint(
        alignment && !alignment.aligned
          ? "Camera looks angled -- try to face it squarely for accurate readings"
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
    playSuccessChime();
    let n = 3;
    setCountdown(n);
    // Always spoken, unlike every other speak() call in this component --
    // the voice-cues preference below is for optional in-set flourishes
    // (rep counts, a "set complete" line); this countdown is the only
    // signal a solo athlete standing away from the phone gets that
    // tracking is about to start, so it isn't optional the same way.
    speak(String(n));
    const scheduleNext = () => {
      const id = window.setTimeout(() => {
        n -= 1;
        if (n > 0) {
          setCountdown(n);
          speak(String(n));
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
    setLiveTiltDeg(null);
    setBarEdgeDetected(false);

    if (recordVideo && streamRef.current) {
      videoChunksRef.current = [];
      recordedBlobRef.current = null;
      const mimeType = MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : undefined;
      const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) videoChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        recordedBlobRef.current = new Blob(videoChunksRef.current, { type: mimeType ?? "video/webm" });
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
    const landmarks = detection.landmarks[0] ?? null;
    const worldLandmarks = detection.worldLandmarks[0] ?? null;
    setPoseVisible(!!landmarks);

    // Smoothed copies purely for what's drawn or read out live (skeleton,
    // bar trail, live speed/tilt) -- framesRef and the trace below keep
    // reading the raw detection every frame, so the numbers a coach later
    // sees are exactly as accurate as before any of this smoothing existed.
    const displayLandmarks = landmarks ? displaySmootherRef.current.smooth(landmarks, now) : null;
    const displayWorldLandmarks = worldLandmarks
      ? worldSmootherRef.current.smooth(worldLandmarks, now)
      : null;

    // Bar tilt is meaningless with no bar in hand -- skip it in jump mode
    // rather than showing a readout from whatever the arms happen to be
    // doing mid-jump.
    setLiveTiltDeg(displayLandmarks && mode !== "jump" ? computeBarTiltDegrees(displayLandmarks) : null);
    if (!landmarks || !worldLandmarks) setBarEdgeDetected(false);

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
        mode === "jump" ? deriveJumpPoint(displayWorldLandmarks) : deriveBarPoint(displayWorldLandmarks);
      if (displayWorldPoint) {
        const displayY = verticalSignRef.current * displayWorldPoint.y;
        if (lastDisplayYRef.current != null) {
          const dt = (now - lastDisplayTRef.current) / 1000;
          if (dt > 0) setLiveSpeed(Math.abs(displayY - lastDisplayYRef.current) / dt);
        }
        lastDisplayYRef.current = displayY;
        lastDisplayTRef.current = now;
      }

      const worldPoint = mode === "jump" ? deriveJumpPoint(worldLandmarks) : deriveBarPoint(worldLandmarks);

      if (worldPoint) {
        const t = now - startTimeRef.current;
        const trace = traceRef.current;
        const prev = trace[trace.length - 1];
        // Wrist height stands in for bar height by default, but the wrist
        // joint and the bar itself aren't at the same point -- grip
        // thickness and wrist flexion shift them apart. When there's a
        // confident real pixel edge nearby (the bar's actual rim against
        // the background), use that instead; jump mode has no bar to find
        // an edge of, so it's skipped there.
        const edgeOffset =
          mode === "jump" ? null : refineBarHeightFromEdges(video, landmarks, worldLandmarks);
        setBarEdgeDetected(edgeOffset != null);
        const y = verticalSignRef.current * worldPoint.y + (edgeOffset ?? 0);
        const point = { t, x: worldPoint.x, y, z: worldPoint.z };
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
        if (prev)
          for (const gapPoint of interpolateOcclusionGap(prev, point, mode === "jump" ? 400 : 300))
            trace.push(gapPoint);
        trace.push(point);
        framesRef.current.push({ t, landmarks, worldLandmarks });

        const wrists = deriveWristPoints(worldLandmarks);
        if (wrists.left) {
          const leftPoint = {
            t,
            x: wrists.left.x,
            y: verticalSignRef.current * wrists.left.y,
            z: wrists.left.z,
          };
          const prevLeft = leftTraceRef.current[leftTraceRef.current.length - 1];
          if (prevLeft)
            for (const g of interpolateOcclusionGap(prevLeft, leftPoint, mode === "jump" ? 400 : 300))
              leftTraceRef.current.push(g);
          leftTraceRef.current.push(leftPoint);
        }
        if (wrists.right) {
          const rightPoint = {
            t,
            x: wrists.right.x,
            y: verticalSignRef.current * wrists.right.y,
            z: wrists.right.z,
          };
          const prevRight = rightTraceRef.current[rightTraceRef.current.length - 1];
          if (prevRight)
            for (const g of interpolateOcclusionGap(prevRight, rightPoint, mode === "jump" ? 400 : 300))
              rightTraceRef.current.push(g);
          rightTraceRef.current.push(rightPoint);
        }

        // Cheap live rep counter: count direction reversals bigger than
        // ~4cm, same idea as segmentPhases but incremental for the live
        // display -- the real, precise segmentation runs once on the full
        // trace at Stop. Display only -- this used to also auto-stop
        // tracking once it reached targetReps, but that cheap heuristic
        // can misfire (noise counted as a rep, or a mistimed/failed rep
        // never registering), silently ending the capture and the camera
        // recording well before the set was actually done. Recording now
        // only ever ends when the athlete taps Stop themselves.
        if (trace.length > 4) {
          const window5 = trace.slice(-5).map((p) => p.y);
          const delta = window5[window5.length - 1] - window5[0];
          if (Math.abs(delta) > 0.04) {
            const dir = delta > 0 ? 1 : -1;
            if (lastRepDirRef.current !== dir) {
              if (dir === -1) {
                repCountRef.current += 1;
                setRepCount(repCountRef.current);
                if (voiceEnabledRef.current) speak(String(repCountRef.current));
              }
              lastRepDirRef.current = dir;
            }
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
      const jumpMetrics = summarizeJumpSet(traceRef.current);
      if (!jumpMetrics) {
        toast.error("Couldn't get a clean read — make sure your feet leave the ground clearly in frame.");
        changeStep("setup");
        return;
      }
      // Landing mechanics (valgus, forward lean) still matter for a jump;
      // squat-depth judgment and bar-path drift don't -- see the "jump"
      // context branch in detectFormFaults.
      jumpMetrics.formFaults = detectFormFaults(framesRef.current, 0, "jump", movementType);
      if (voiceEnabledRef.current) {
        speak(`Set complete. Best jump ${jumpMetrics.bestJumpHeightCm} centimeters.`);
      }
      setResult(jumpMetrics);
      changeStep("review");
      return;
    }

    const metrics = summarizeTrackedSet(traceRef.current, loadKg);
    if (!metrics) {
      toast.error("Couldn't get a clean read — try again with your whole body in frame.");
      changeStep("setup");
      return;
    }
    metrics.formFaults = detectFormFaults(framesRef.current, metrics.barPathDeviationCm, "lift", movementType);

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

    const origin = { x: traceRef.current[0]?.x ?? 0, y: traceRef.current[0]?.y ?? 0 };
    metrics.armPathTrace =
      leftTraceRef.current.length > 1 && rightTraceRef.current.length > 1
        ? {
            left: buildPathTrace(leftTraceRef.current, origin),
            right: buildPathTrace(rightTraceRef.current, origin),
          }
        : null;

    const guess = guessMovementPattern(framesRef.current);
    setMovementGuess(guess);

    if (voiceEnabledRef.current) {
      const count = metrics.formFaults.length;
      speak(count > 0 ? `Set complete. ${count} form note${count > 1 ? "s" : ""}.` : "Set complete.");
    }

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
                      barEdgeDetected ? "bg-success/80 text-success-foreground" : "bg-black/40 text-white/70",
                    )}
                  >
                    {barEdgeDetected ? "Bar detected" : "Estimating from grip"}
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
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox checked={voiceEnabled} onCheckedChange={(c) => toggleVoice(c === true)} />
              <span className="flex items-center gap-1.5">
                {voiceEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                Voice rep counts &amp; end-of-set cues (off by default)
              </span>
            </label>
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
                      label="Velocity Loss"
                      value={`${liftResult.velocityLossPercent > 0 ? "-" : "+"}${Math.abs(liftResult.velocityLossPercent)}%`}
                    />
                  )}
                </>
              )}
              <Stat label="Avg. ROM" value={`${liftResult.romCm} cm`} />
              <Stat
                label="Bar Path Deviation"
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
                        <span className="font-semibold">Rep {r.repNumber}</span>
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
                disabled={savingVideo}
                onClick={async () => {
                  if (!result) return;
                  if (recordVideo && recordedBlobRef.current) {
                    setSavingVideo(true);
                    try {
                      const formData = new FormData();
                      formData.append("video", recordedBlobRef.current, "form-check.webm");
                      const res = await apiRequest("POST", "/api/athlete/form-video", formData);
                      const { url } = await res.json();
                      onCapture(result, url);
                      onOpenChange(false);
                    } catch {
                      toast.error("Couldn't upload the video -- analytics are still saved below.");
                      onCapture(result);
                      onOpenChange(false);
                    } finally {
                      setSavingVideo(false);
                    }
                  } else {
                    onCapture(result);
                    onOpenChange(false);
                  }
                }}
              >
                <Check className="h-4 w-4" />
                {savingVideo ? "Saving…" : "Use This Data"}
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
