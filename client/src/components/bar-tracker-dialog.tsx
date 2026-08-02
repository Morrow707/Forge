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
import { cn } from "@/lib/utils";
import {
  findMarkerCentroid,
  summarizeTrackedSet,
  calibrationQuality,
  MARKER_COLOR_SWATCH,
  type MarkerColor,
  type TrackedPoint,
  type RepMetrics,
} from "@/lib/bar-tracking";
import { Camera, Video, Square, RotateCcw, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Step = "setup" | "calibrate" | "tracking" | "review";

export function BarTrackerDialog({
  open,
  onOpenChange,
  mode,
  exerciseName,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "bar_path" | "full";
  exerciseName: string;
  onCapture: (metrics: RepMetrics) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const traceRef = useRef<TrackedPoint[]>([]);
  const startTimeRef = useRef<number>(0);
  const lastRepDirRef = useRef<1 | -1 | 0>(0);

  const [step, setStep] = useState<Step>("setup");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [tilt, setTilt] = useState<number | null>(null);
  const [calibrationTaps, setCalibrationTaps] = useState<{ x: number; y: number }[]>([]);
  const [calibrationWarning, setCalibrationWarning] = useState<string | null>(null);
  const [referenceCm, setReferenceCm] = useState("220");
  const [markerColor, setMarkerColor] = useState<MarkerColor>("green");
  const [liveSpeed, setLiveSpeed] = useState(0);
  const [repCount, setRepCount] = useState(0);
  const [markerVisible, setMarkerVisible] = useState(true);
  const [result, setResult] = useState<RepMetrics | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("setup");
    setCameraError(null);
    setCalibrationTaps([]);
    setCalibrationWarning(null);
    setResult(null);
    setRepCount(0);
    traceRef.current = [];

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
    startTimeRef.current = performance.now();
    lastRepDirRef.current = 0;
    setRepCount(0);
    tick();
  }

  function tick() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const centroid = findMarkerCentroid(imageData, markerColor);
    setMarkerVisible(centroid !== null);

    if (centroid) {
      const t = performance.now() - startTimeRef.current;
      const trace = traceRef.current;
      const prev = trace[trace.length - 1];
      trace.push({ t, x: centroid.x, y: centroid.y });

      if (prev) {
        const dt = (t - prev.t) / 1000;
        const ppm = pixelsPerMeter();
        if (dt > 0 && ppm > 0) {
          const speed = Math.abs(centroid.y - prev.y) / ppm / dt;
          setLiveSpeed(speed);
        }
      }
      // Cheap live rep counter: count direction reversals bigger than ~4cm,
      // same idea as segmentPhases but incremental for the live display —
      // the real, precise segmentation runs once on the full trace at Stop.
      if (trace.length > 4) {
        const ppm = pixelsPerMeter();
        const window5 = trace.slice(-5).map((p) => p.y);
        const delta = window5[window5.length - 1] - window5[0];
        if (ppm > 0 && Math.abs(delta) / ppm > 0.04) {
          const dir = delta > 0 ? 1 : -1;
          if (lastRepDirRef.current !== dir) {
            if (dir === -1) setRepCount((c) => c + 1);
            lastRepDirRef.current = dir;
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopTracking() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const metrics = summarizeTrackedSet(traceRef.current, pixelsPerMeter());
    if (!metrics) {
      toast.error("Couldn't get a clean read on the marker — try again with better lighting.");
      setStep("calibrate");
      return;
    }
    setResult(metrics);
    setStep("review");
  }

  function retry() {
    traceRef.current = [];
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
          <canvas ref={canvasRef} className="hidden" />

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
                  markerVisible ? "bg-success/80 text-success-foreground" : "bg-destructive/80 text-white",
                )}
              >
                {markerVisible ? "Marker locked" : "Marker not visible"}
              </span>
              {mode === "full" && (
                <span className="rounded-full bg-black/60 px-3 py-1 font-display text-lg font-bold text-white">
                  {liveSpeed.toFixed(2)} m/s
                </span>
              )}
              <span className="rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white">
                {repCount} reps
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
              Step back until your full range of motion is visible, and try to keep the phone
              level and perpendicular to the bar path — an angled camera skews the reading.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Marker color</Label>
              <div className="flex gap-2">
                {(Object.keys(MARKER_COLOR_SWATCH) as MarkerColor[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={markerColor === c}
                    onClick={() => setMarkerColor(c)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border-2",
                      markerColor === c ? "border-foreground" : "border-transparent",
                    )}
                    style={{ backgroundColor: MARKER_COLOR_SWATCH[c] }}
                    title={c}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Put a piece of tape or a band in this color on the bar so it stands out from the
                background.
              </p>
            </div>
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
        )}

        <DialogFooter>
          {step === "setup" && (
            <Button onClick={() => setStep("calibrate")} disabled={!!cameraError}>
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
