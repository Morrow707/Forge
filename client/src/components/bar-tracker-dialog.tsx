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
import { cn } from "@/lib/utils";
import {
  summarizeTrackedSet,
  calibrationQuality,
  type TrackedPoint,
  type RepMetrics,
} from "@/lib/bar-tracking";
import {
  getPoseLandmarker,
  deriveBarPoint,
  detectFormFaults,
  type PoseFrame,
} from "@/lib/pose-tracking";
import { PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { Camera, Video, Square, RotateCcw, Check, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Step = "setup" | "calibrate" | "tracking" | "review";

const MIN_VISIBILITY = 0.5;
const SKELETON_COLOR = "#4ade80";
const TRAIL_COLOR = "#f97316";
const TRAIL_MAX_POINTS = 90;

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

export function BarTrackerDialog({
  open,
  onOpenChange,
  mode,
  exerciseName,
  targetReps,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "bar_path" | "full";
  exerciseName: string;
  // Auto-stops tracking once this many reps are detected (parsed from the
  // prescribed rep scheme by the caller) -- manual "Stop & Review" always
  // still works too, and non-numeric rep schemes just never trigger this.
  targetReps?: number;
  onCapture: (metrics: RepMetrics) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const traceRef = useRef<TrackedPoint[]>([]);
  const framesRef = useRef<PoseFrame[]>([]);
  const startTimeRef = useRef<number>(0);
  const lastRepDirRef = useRef<1 | -1 | 0>(0);
  const repCountRef = useRef(0);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const lastVideoTimeRef = useRef(-1);

  const [step, setStep] = useState<Step>("setup");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [tilt, setTilt] = useState<number | null>(null);
  const [calibrationTaps, setCalibrationTaps] = useState<{ x: number; y: number }[]>([]);
  const [calibrationWarning, setCalibrationWarning] = useState<string | null>(null);
  const [referenceCm, setReferenceCm] = useState("220");
  const [liveSpeed, setLiveSpeed] = useState(0);
  const [repCount, setRepCount] = useState(0);
  const [poseVisible, setPoseVisible] = useState(true);
  const [result, setResult] = useState<RepMetrics | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("setup");
    setCameraError(null);
    setCalibrationTaps([]);
    setCalibrationWarning(null);
    setResult(null);
    setRepCount(0);
    repCountRef.current = 0;
    traceRef.current = [];
    framesRef.current = [];
    lastVideoTimeRef.current = -1;

    setModelLoading(true);
    getPoseLandmarker()
      .then((landmarker) => {
        poseLandmarkerRef.current = landmarker;
        setModelLoading(false);
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
    if (calibrationTaps.length < 2) return 0;
    const [p1, p2] = calibrationTaps;
    const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const meters = (Number(referenceCm) || 220) / 100;
    return pixelDist / meters;
  }

  function startTracking() {
    setStep("tracking");
    traceRef.current = [];
    framesRef.current = [];
    startTimeRef.current = performance.now();
    lastRepDirRef.current = 0;
    lastVideoTimeRef.current = -1;
    repCountRef.current = 0;
    setRepCount(0);
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
    const result = landmarker.detectForVideo(video, now);
    const landmarks = result.landmarks[0] ?? null;
    setPoseVisible(!!landmarks);

    if (landmarks) {
      drawSkeleton(ctx, landmarks, overlay.width, overlay.height);
      const point = deriveBarPoint(landmarks, overlay.width, overlay.height);

      if (point) {
        const t = now - startTimeRef.current;
        const trace = traceRef.current;
        const prev = trace[trace.length - 1];
        trace.push({ t, x: point.x, y: point.y });
        framesRef.current.push({ t, landmarks });

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
                if (targetReps && repCountRef.current >= targetReps) {
                  toast.info(`${targetReps} reps detected — reviewing your set`);
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
    const metrics = summarizeTrackedSet(traceRef.current, pixelsPerMeter());
    if (!metrics) {
      toast.error("Couldn't get a clean read — try again with your whole body in frame.");
      setStep("calibrate");
      return;
    }
    metrics.formFaults = detectFormFaults(framesRef.current, metrics.barPathDeviationCm);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            Track {exerciseName}
          </DialogTitle>
          <DialogDescription>
            {mode === "full"
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
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
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
                {targetReps ? `/${targetReps}` : ""} reps
              </span>
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
              Step back until your whole body is visible, and try to keep the phone level and
              perpendicular to your movement — an angled camera skews the reading. No marker or
              tape needed; this tracks your body directly.
            </p>
            {modelLoading && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />
                Loading the pose-tracking model…
              </p>
            )}
          </div>
        )}

        {step === "calibrate" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {calibrationTaps.length === 0
                ? "Tap one end of the bar (or any fixed object of known length)."
                : calibrationTaps.length === 1
                  ? "Now tap the other end."
                  : "Calibration set."}
            </p>
            {calibrationWarning && (
              <p className="flex items-center gap-2 text-sm text-amber-500">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {calibrationWarning}
              </p>
            )}
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
            </div>
          </div>
        )}

        {step === "review" && result && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-3 text-center">
              {mode === "full" && (
                <>
                  <Stat label="Peak Velocity" value={`${result.peakVelocityMps} m/s`} />
                  <Stat label="Mean Velocity" value={`${result.meanVelocityMps} m/s`} />
                  <Stat label="Concentric" value={`${result.concentricSeconds}s`} />
                  <Stat label="Eccentric" value={`${result.eccentricSeconds}s`} />
                </>
              )}
              <Stat
                label="Bar Path Deviation"
                value={`${result.barPathDeviationCm} cm`}
                full={mode === "bar_path"}
              />
            </div>
            {result.formFaults.length > 0 && (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-amber-500">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Form notes
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.formFaults.map((f) => (
                    <Badge key={f.code} variant="secondary" className="text-xs font-normal">
                      {f.label}
                    </Badge>
                  ))}
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
            <Button onClick={startTracking} disabled={calibrationTaps.length < 2}>
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

function Stat({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : undefined}>
      <p className="font-display text-xl font-bold">{value}</p>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
    </div>
  );
}
