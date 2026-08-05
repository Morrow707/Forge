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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  summarizeTrackedSet,
  calibrationQuality,
  buildPathTrace,
  type TrackedPoint,
  type RepMetrics,
} from "@/lib/bar-tracking";
import { summarizeJumpSet, type JumpSetMetrics } from "@/lib/jump-tracking";
import {
  getPoseLandmarker,
  deriveBarPoint,
  deriveJumpPoint,
  deriveWristPoints,
  detectFormFaults,
  computeBarTiltDegrees,
  computeRepDepths,
  guessMovementPattern,
  calibratePixelsPerMeterFromHeight,
  type PoseFrame,
  type MovementGuess,
  type MovementPattern,
} from "@/lib/pose-tracking";
import { PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
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

type Step = "setup" | "calibrate" | "tracking" | "review";

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

function drawTrail(ctx: CanvasRenderingContext2D, trace: TrackedPoint[]) {
  const points = trace.slice(-TRAIL_MAX_POINTS);
  if (points.length < 2) return;
  ctx.strokeStyle = TRAIL_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

function isJumpMetrics(r: RepMetrics | JumpSetMetrics): r is JumpSetMetrics {
  return "bestJumpHeightCm" in r;
}

export function BarTrackerDialog({
  open,
  onOpenChange,
  mode,
  exerciseName,
  movementType,
  athleteHeightCm,
  targetReps,
  loadKg,
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
  // The athlete's own height in cm, when on file -- lets calibration derive
  // pixelsPerMeter from the T-pose the pose check already requires instead
  // of a manual tap-two-points step. Null falls back to manual calibration.
  athleteHeightCm?: number | null;
  // Auto-stops tracking once this many reps are detected (parsed from the
  // prescribed rep scheme by the caller) -- manual "Stop & Review" always
  // still works too, and non-numeric rep schemes just never trigger this.
  targetReps?: number;
  // This set's entered weight, converted to kg by the caller -- lets
  // summarizeTrackedSet estimate power output (mass * g * velocity).
  // Undefined for bodyweight-only sets, which just don't get a power
  // number, same as any other tracking-off metric. Unused in jump mode.
  loadKg?: number;
  onCapture: (metrics: RepMetrics | JumpSetMetrics) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const traceRef = useRef<TrackedPoint[]>([]);
  const leftTraceRef = useRef<TrackedPoint[]>([]);
  const rightTraceRef = useRef<TrackedPoint[]>([]);
  const framesRef = useRef<PoseFrame[]>([]);
  const startTimeRef = useRef<number>(0);
  const lastRepDirRef = useRef<1 | -1 | 0>(0);
  const repCountRef = useRef(0);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const voiceEnabledRef = useRef(loadVoicePref());
  // Set continuously in the background from the moment the camera/model are
  // ready, from the athlete's own height -- a ref (not just state) so
  // pixelsPerMeter() can read it synchronously from inside the tracking rAF
  // loop without waiting on a re-render.
  const autoPixelsPerMeterRef = useRef<number | null>(null);

  const [step, setStep] = useState<Step>("setup");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [tilt, setTilt] = useState<number | null>(null);
  const [calibrationTaps, setCalibrationTaps] = useState<{ x: number; y: number }[]>([]);
  const [calibrationWarning, setCalibrationWarning] = useState<string | null>(null);
  const [referenceCm, setReferenceCm] = useState("220");
  // Mirrors autoPixelsPerMeterRef for rendering the calibrate step's UI --
  // true once the background detection loop has derived a calibration from
  // the athlete's height, letting them skip manual taps entirely.
  const [autoCalibratedFromHeight, setAutoCalibratedFromHeight] = useState(false);
  const [liveSpeed, setLiveSpeed] = useState(0);
  const [liveTiltDeg, setLiveTiltDeg] = useState<number | null>(null);
  const [repCount, setRepCount] = useState(0);
  const [poseVisible, setPoseVisible] = useState(true);
  const [result, setResult] = useState<RepMetrics | JumpSetMetrics | null>(null);
  const [movementGuess, setMovementGuess] = useState<MovementGuess | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(loadVoicePref);

  function toggleVoice(next: boolean) {
    setVoiceEnabled(next);
    voiceEnabledRef.current = next;
    window.localStorage.setItem(VOICE_PREF_KEY, next ? "1" : "0");
  }

  useEffect(() => {
    if (!open) return;
    setStep("setup");
    setCameraError(null);
    setCalibrationTaps([]);
    setCalibrationWarning(null);
    setResult(null);
    setMovementGuess(null);
    setRepCount(0);
    repCountRef.current = 0;
    traceRef.current = [];
    leftTraceRef.current = [];
    rightTraceRef.current = [];
    framesRef.current = [];
    lastVideoTimeRef.current = -1;
    setLiveTiltDeg(null);
    autoPixelsPerMeterRef.current = null;
    setAutoCalibratedFromHeight(false);

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
    };
  }, [open]);

  // Runs from the moment the model's ready through "setup" and "calibrate"
  // (stopped by startTracking(), which cancels it before starting the
  // tracking-phase tick loop instead). Draws the live skeleton overlay --
  // the athlete's real-time confirmation that tracking is working, with no
  // separate "hold this pose" step needed for it -- and opportunistically
  // derives pixels-per-meter from the athlete's height whenever the needed
  // landmarks are visible, continuously refining it (rather than freezing
  // on the first reading) so whatever position they're in right as they
  // tap "Start Set" is what gets used.
  function previewTick() {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const landmarker = poseLandmarkerRef.current;
    if (!video || !overlay || !landmarker || video.videoWidth === 0) {
      rafRef.current = requestAnimationFrame(previewTick);
      return;
    }
    if (video.currentTime === lastVideoTimeRef.current) {
      rafRef.current = requestAnimationFrame(previewTick);
      return;
    }
    lastVideoTimeRef.current = video.currentTime;

    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    const ctx = overlay.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      const detection = landmarker.detectForVideo(video, performance.now());
      const landmarks = detection.landmarks[0] ?? null;
      if (landmarks) {
        drawSkeleton(ctx, landmarks, overlay.width, overlay.height);
        const auto = calibratePixelsPerMeterFromHeight(landmarks, overlay.height, athleteHeightCm);
        if (auto != null) {
          autoPixelsPerMeterRef.current = auto;
          setAutoCalibratedFromHeight(true);
        }
      }
    }
    rafRef.current = requestAnimationFrame(previewTick);
  }

  function handleCalibrationTap(e: React.MouseEvent<HTMLDivElement>) {
    if (calibrationTaps.length >= 2 || !videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = videoRef.current.videoWidth / rect.width;
    const scaleY = videoRef.current.videoHeight / rect.height;
    const point = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    const next = [...calibrationTaps, point];
    setCalibrationTaps(next);
    if (next.length === 2 && videoRef.current) {
      const quality = calibrationQuality(next[0], next[1], videoRef.current.videoWidth);
      setCalibrationWarning(
        quality === "move_closer"
          ? "Those two points are close together on screen — move the camera closer for more accurate tracking."
          : quality === "move_back"
            ? "Those two points span nearly the whole frame — step back so your full range of motion stays in view."
            : null,
      );
    }
  }

  function pixelsPerMeter() {
    // Manual taps always win when present -- tapping two points is the
    // athlete deliberately overriding the automatic body-based calibration
    // (e.g. for extra precision against a barbell of known length).
    if (calibrationTaps.length >= 2) {
      const [p1, p2] = calibrationTaps;
      const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const meters = (Number(referenceCm) || 220) / 100;
      return pixelDist / meters;
    }
    return autoPixelsPerMeterRef.current ?? 0;
  }

  function startTracking() {
    // Stops previewTick's self-perpetuating loop -- otherwise it and the
    // tracking-phase tick() below would both keep rescheduling themselves
    // and stomp on the same rafRef/canvas.
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setStep("tracking");
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
    tick();
  }

  function tick() {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const landmarker = poseLandmarkerRef.current;
    if (!video || !overlay || !landmarker || video.videoWidth === 0) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    if (video.currentTime === lastVideoTimeRef.current) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    lastVideoTimeRef.current = video.currentTime;

    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    const ctx = overlay.getContext("2d");
    if (!ctx) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const now = performance.now();
    const detection = landmarker.detectForVideo(video, now);
    const landmarks = detection.landmarks[0] ?? null;
    setPoseVisible(!!landmarks);
    // Bar tilt is meaningless with no bar in hand -- skip it in jump mode
    // rather than showing a readout from whatever the arms happen to be
    // doing mid-jump.
    setLiveTiltDeg(landmarks && mode !== "jump" ? computeBarTiltDegrees(landmarks) : null);

    if (landmarks) {
      drawSkeleton(ctx, landmarks, overlay.width, overlay.height);
      const point =
        mode === "jump"
          ? deriveJumpPoint(landmarks, overlay.width, overlay.height)
          : deriveBarPoint(landmarks, overlay.width, overlay.height);

      if (point) {
        const t = now - startTimeRef.current;
        const trace = traceRef.current;
        const prev = trace[trace.length - 1];
        trace.push({ t, x: point.x, y: point.y });
        framesRef.current.push({ t, landmarks });

        const wrists = deriveWristPoints(landmarks, overlay.width, overlay.height);
        if (wrists.left) leftTraceRef.current.push({ t, x: wrists.left.x, y: wrists.left.y });
        if (wrists.right) rightTraceRef.current.push({ t, x: wrists.right.x, y: wrists.right.y });

        if (prev) {
          const dt = (t - prev.t) / 1000;
          const ppm = pixelsPerMeter();
          if (dt > 0 && ppm > 0) {
            const speed = Math.abs(point.y - prev.y) / ppm / dt;
            setLiveSpeed(speed);
          }
        }
        // Cheap live rep counter: count direction reversals bigger than
        // ~4cm, same idea as segmentPhases but incremental for the live
        // display -- the real, precise segmentation runs once on the full
        // trace at Stop.
        if (trace.length > 4) {
          const ppm = pixelsPerMeter();
          const window5 = trace.slice(-5).map((p) => p.y);
          const delta = window5[window5.length - 1] - window5[0];
          if (ppm > 0 && Math.abs(delta) / ppm > 0.04) {
            const dir = delta > 0 ? 1 : -1;
            if (lastRepDirRef.current !== dir) {
              if (dir === -1) {
                repCountRef.current += 1;
                setRepCount(repCountRef.current);
                if (voiceEnabledRef.current) speak(String(repCountRef.current));
                if (targetReps && repCountRef.current >= targetReps) {
                  toast.info(
                    `${targetReps} ${mode === "jump" ? "jumps" : "reps"} detected — reviewing your set`,
                  );
                  stopTracking();
                  return;
                }
              }
              lastRepDirRef.current = dir;
            }
          }
        }
      }
      drawTrail(ctx, traceRef.current);
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopTracking() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    if (mode === "jump") {
      const jumpMetrics = summarizeJumpSet(traceRef.current, pixelsPerMeter());
      if (!jumpMetrics) {
        toast.error("Couldn't get a clean read — make sure your feet leave the ground clearly in frame.");
        setStep("calibrate");
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
      setStep("review");
      return;
    }

    const metrics = summarizeTrackedSet(traceRef.current, pixelsPerMeter(), loadKg);
    if (!metrics) {
      toast.error("Couldn't get a clean read — try again with your whole body in frame.");
      setStep("calibrate");
      return;
    }
    metrics.formFaults = detectFormFaults(framesRef.current, metrics.barPathDeviationCm, "lift", movementType);

    const depths = computeRepDepths(
      framesRef.current,
      metrics.repBreakdown.map((r) => ({ startT: r.startT, endT: r.endT })),
    );
    metrics.repBreakdown = metrics.repBreakdown.map((r, i) => ({ ...r, depthDeg: depths[i] }));

    const ppm = pixelsPerMeter();
    const origin = { x: traceRef.current[0]?.x ?? 0, y: traceRef.current[0]?.y ?? 0 };
    metrics.armPathTrace =
      leftTraceRef.current.length > 1 && rightTraceRef.current.length > 1
        ? {
            left: buildPathTrace(leftTraceRef.current, ppm, origin),
            right: buildPathTrace(rightTraceRef.current, ppm, origin),
          }
        : null;

    const guess = guessMovementPattern(framesRef.current);
    setMovementGuess(guess);

    if (voiceEnabledRef.current) {
      const count = metrics.formFaults.length;
      speak(count > 0 ? `Set complete. ${count} form note${count > 1 ? "s" : ""}.` : "Set complete.");
    }

    setResult(metrics);
    setStep("review");
  }

  function retry() {
    traceRef.current = [];
    framesRef.current = [];
    setResult(null);
    setStep("tracking");
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

          {step === "calibrate" && (
            <div
              onClick={handleCalibrationTap}
              className="absolute inset-0 cursor-crosshair"
            >
              {calibrationTaps.map((p, i) => (
                <div
                  key={i}
                  className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/50"
                  style={{
                    left: `${(p.x / (videoRef.current?.videoWidth || 1)) * 100}%`,
                    top: `${(p.y / (videoRef.current?.videoHeight || 1)) * 100}%`,
                  }}
                />
              ))}
            </div>
          )}

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
            </div>
          )}

          {tilt != null && (step === "setup" || step === "calibrate") && (
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

        {step === "calibrate" && (
          <div className="space-y-3">
            {autoCalibratedFromHeight && calibrationTaps.length === 0 ? (
              <>
                <p className="flex items-center gap-2 text-sm font-semibold text-success">
                  <Check className="h-4 w-4 shrink-0" />
                  Calibrated automatically from your profile height — ready to go, no marker or
                  known-length object needed.
                </p>
                <p className="text-xs text-muted-foreground">
                  Want to calibrate against a known-length object instead (e.g. an exact barbell
                  length) for extra precision? Tap one end of it below.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {calibrationTaps.length === 0
                  ? mode === "jump"
                    ? "Tap one end of any fixed object of known length in frame (a mat, a yardstick, even your own height marked on a wall)."
                    : "Tap one end of the bar (or any fixed object of known length)."
                  : calibrationTaps.length === 1
                    ? "Now tap the other end."
                    : "Calibration set."}
              </p>
            )}
            {calibrationWarning && (
              <p className="flex items-center gap-2 text-sm text-amber-500">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {calibrationWarning}
              </p>
            )}
            {calibrationTaps.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground">
                  Real-world length between those two points (cm)
                </Label>
                <Input
                  type="number"
                  value={referenceCm}
                  onChange={(e) => setReferenceCm(e.target.value)}
                  className="max-w-[10rem]"
                />
                {autoCalibratedFromHeight && (
                  <button
                    type="button"
                    onClick={() => {
                      setCalibrationTaps([]);
                      setCalibrationWarning(null);
                    }}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Clear taps, use my height instead
                  </button>
                )}
              </div>
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
            <Button onClick={() => setStep("calibrate")} disabled={!!cameraError || modelLoading}>
              I'm Set Up
            </Button>
          )}
          {step === "calibrate" && (
            <Button
              onClick={startTracking}
              disabled={
                calibrationTaps.length === 1 ||
                (calibrationTaps.length === 0 && !autoCalibratedFromHeight)
              }
            >
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
                onClick={() => {
                  if (result) onCapture(result);
                  onOpenChange(false);
                }}
              >
                <Check className="h-4 w-4" />
                Use This Data
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
