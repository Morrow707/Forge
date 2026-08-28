import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/queryClient";
import {
  uploadOrQueueVideo,
  hasWarnedAboutQueueing,
  markWarnedAboutQueueing,
  type VideoRecordContext,
} from "@/lib/video-offline-store";
import { POSE_LANDMARKS } from "@/lib/pose-tracking";
import { type PoseFrame as NativePoseFrame } from "@/lib/native-av-preview";
import { useAvBodyTracking } from "@/lib/use-av-body-tracking";
import {
  detectSprintCrossings,
  deriveSprintReferencePoint,
  MAX_PLAUSIBLE_SPRINT_SPEED_YARDS_PER_SEC,
  type SprintPoint,
  type SprintResult,
  type SprintCheckpoint,
} from "@/lib/sprint-tracking";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { toast } from "sonner";
import { AlertTriangle, Play, Square, RotateCcw, Check, X, Flag, XCircle } from "lucide-react";
import { videoFilenameForBlob } from "@/lib/video-recording";

/** AVFoundation + Vision horizontal-load tracking (sled push/pull, loaded carry) -- the
 * "horizontal-linear" trajectory pattern's first built mode. Genuinely new; no ARKit
 * equivalent was ever built. See trackingLevelEnum's own comment in shared/schema.ts for why
 * this needs different math from bar_path/full's continuous vertical-position model: a sled
 * push or loaded carry is "cover a known distance," the exact problem sprint-tracking.ts
 * already solves for Skills, not an up-down rep to segment.
 *
 * Reuses sprint-tracking.ts's own checkpoint-crossing model completely unmodified --
 * deriveSprintReferencePoint (hip midpoint, screen-space) and detectSprintCrossings -- just
 * simplified to the single "two checkpoints, coach enters the real distance" mode (no
 * shuttle/3-cone presets, no camera-angle fault detection, since a straight-line loaded
 * traverse doesn't need either), and saved to workoutSetEntries's own horizontalLoad* fields
 * instead of skillSessionLogs. Record-first, analyze-later, same as every other AV dialog. */

type Step = "calibrate" | "capture" | "analyzing" | "manual" | "review";

export type HorizontalLoadSetMetrics = {
  elapsedSeconds: number;
  distanceYards: number;
  avgSpeedYardsPerSec: number;
  likelyGlitch: boolean;
};

const CHECKPOINT_COLOR = "#facc15";
const MAX_RECORDING_MS = 30000;

function drawCheckpoints(ctx: CanvasRenderingContext2D, checkpointXs: number[], width: number, height: number) {
  ctx.strokeStyle = CHECKPOINT_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  for (const x of checkpointXs) {
    ctx.beginPath();
    ctx.moveTo(x * width, 0);
    ctx.lineTo(x * width, height);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// Same normalized-screen-space hip landmarks adapter every AV dialog needing
// deriveSprintReferencePoint builds locally (see av-sprint-tracker-dialog.tsx's own
// sparseHipLandmarksFromVisionFrame) -- Vision's raw joint x/y are already normalized
// screen-space, just needing the bottom-left-to-top-left Y-flip this app's `landmarks` slot
// assumes.
function sparseHipLandmarksFromVisionFrame(frame: NativePoseFrame): NormalizedLandmark[] {
  const landmarks: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  const leftHip = frame.joints.find((j) => j.name === "leftHip");
  const rightHip = frame.joints.find((j) => j.name === "rightHip");
  if (leftHip) {
    landmarks[POSE_LANDMARKS.LEFT_HIP] = { x: leftHip.x, y: 1 - leftHip.y, z: 0, visibility: leftHip.confidence };
  }
  if (rightHip) {
    landmarks[POSE_LANDMARKS.RIGHT_HIP] = { x: rightHip.x, y: 1 - rightHip.y, z: 0, visibility: rightHip.confidence };
  }
  return landmarks;
}

function buildManualResult(startTime: number, finishTime: number, distanceYards: number): HorizontalLoadSetMetrics | null {
  const elapsedSeconds = Math.round((finishTime - startTime) * 1000) / 1000;
  if (elapsedSeconds <= 0 || distanceYards <= 0) return null;
  const avgSpeedYardsPerSec = Math.round((distanceYards / elapsedSeconds) * 100) / 100;
  return {
    elapsedSeconds,
    distanceYards,
    avgSpeedYardsPerSec,
    likelyGlitch: avgSpeedYardsPerSec > MAX_PLAUSIBLE_SPRINT_SPEED_YARDS_PER_SEC,
  };
}

function fromSprintResult(result: SprintResult): HorizontalLoadSetMetrics {
  return {
    elapsedSeconds: result.totalElapsedSeconds,
    distanceYards: result.totalDistanceYards,
    avgSpeedYardsPerSec: result.avgSpeedYardsPerSec,
    likelyGlitch: result.likelyGlitch,
  };
}

export function AvHorizontalLoadTrackerDialog({
  open,
  onOpenChange,
  recordVideo,
  onCapture,
  videoContext,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordVideo?: boolean;
  onCapture: (metrics: HorizontalLoadSetMetrics, videoUrl?: string) => void;
  videoContext?: VideoRecordContext;
}) {
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const manualVideoRef = useRef<HTMLVideoElement>(null);
  const checkpointsRef = useRef<number[]>([]);
  const pointsRef = useRef<SprintPoint[]>([]);
  const stepRef = useRef<Step>("calibrate");
  const recordedBlobRef = useRef<Blob | null>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualStartRef = useRef<number | null>(null);

  const [step, setStepState] = useState<Step>("calibrate");
  function changeStep(next: Step) {
    stepRef.current = next;
    setStepState(next);
  }
  const [checkpointCount, setCheckpointCount] = useState(0);
  const [distanceYards, setDistanceYards] = useState("20");
  const [result, setResult] = useState<HorizontalLoadSetMetrics | null>(null);
  const [saving, setSaving] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [manualStartTime, setManualStartTime] = useState<number | null>(null);

  const {
    containerRef,
    supported,
    supportError,
    error,
    setError,
    diagLog,
    recording,
    startRecording,
    cancelRecording,
    stopRecordingAndAnalyze,
    cancelAnalysis,
  } = useAvBodyTracking(open && (step === "calibrate" || step === "capture"));

  useEffect(() => {
    if (!open) return;
    changeStep("calibrate");
    setError(null);
    setResult(null);
    checkpointsRef.current = [];
    setCheckpointCount(0);
    setDistanceYards("20");
    pointsRef.current = [];
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    recordedBlobRef.current = null;
    manualStartRef.current = null;
    setManualStartTime(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    redrawCheckpointOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, checkpointCount]);

  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    };
  }, []);

  function redrawCheckpointOverlay() {
    const canvas = overlayCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (step === "calibrate" || step === "capture") {
      drawCheckpoints(ctx, checkpointsRef.current, canvas.width, canvas.height);
    }
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (step !== "calibrate" || checkpointsRef.current.length >= 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const normalizedX = (e.clientX - rect.left) / rect.width;
    checkpointsRef.current = [...checkpointsRef.current, normalizedX];
    setCheckpointCount(checkpointsRef.current.length);
  }

  function resetCheckpoints() {
    checkpointsRef.current = [];
    setCheckpointCount(0);
  }

  function buildCheckpoints(): SprintCheckpoint[] | null {
    const taps = checkpointsRef.current;
    if (taps.length < 2) return null;
    const distanceNum = Number(distanceYards) || 0;
    if (distanceNum <= 0) return null;
    return [{ x: taps[0] }, { x: taps[1], segmentDistanceYards: distanceNum }];
  }

  function startCapture() {
    changeStep("capture");
    startRecording();
    recordingTimeoutRef.current = setTimeout(() => {
      if (stepRef.current === "capture") void stopCaptureAndAnalyze();
    }, MAX_RECORDING_MS);
  }

  function cancelCapture() {
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    void cancelRecording();
    changeStep("calibrate");
  }

  async function stopCaptureAndAnalyze() {
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    changeStep("analyzing");
    const captured = await stopRecordingAndAnalyze();
    if (!captured) {
      changeStep("calibrate");
      return;
    }
    finishCapture(captured.blob, captured.rawFrames);
  }

  function finishCapture(blob: Blob, rawFrames: NativePoseFrame[]) {
    recordedBlobRef.current = blob;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(blob));

    pointsRef.current = [];
    for (const frame of rawFrames) {
      const elapsedMs = frame.timestamp * 1000;
      const hipLandmarks = sparseHipLandmarksFromVisionFrame(frame);
      const ref = deriveSprintReferencePoint(hipLandmarks);
      if (ref) pointsRef.current.push({ t: elapsedMs, x: ref.x });
    }

    const checkpoints = buildCheckpoints();
    const crossing = checkpoints ? detectSprintCrossings(pointsRef.current, { checkpoints }) : null;
    if (crossing) {
      finishWithResult(fromSprintResult(crossing));
    } else {
      manualStartRef.current = null;
      setManualStartTime(null);
      changeStep("manual");
    }
  }

  function finishWithResult(metrics: HorizontalLoadSetMetrics) {
    changeStep("review");
    setResult(metrics);
  }

  function markManualStart() {
    const t = manualVideoRef.current?.currentTime;
    if (t == null) return;
    manualStartRef.current = t;
    setManualStartTime(t);
  }

  function markManualFinish() {
    const finishTime = manualVideoRef.current?.currentTime;
    const startTime = manualStartRef.current;
    if (finishTime == null || startTime == null) return;
    const distanceNum = Number(distanceYards) || 0;
    const manualResult = buildManualResult(startTime, finishTime, distanceNum);
    if (!manualResult) {
      toast.error("Finish must be after start (and distance must be set) -- scrub back and try again");
      return;
    }
    finishWithResult(manualResult);
  }

  function retry() {
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    recordedBlobRef.current = null;
    resetCheckpoints();
    setResult(null);
    setError(null);
    manualStartRef.current = null;
    setManualStartTime(null);
    changeStep("calibrate");
  }

  const [uploadProgress, setUploadProgress] = useState(0);

  async function saveMutation() {
    if (!result) return;
    setSaving(true);
    setUploadProgress(0);
    try {
      let uploadedVideoUrl: string | undefined;
      if (recordVideo && recordedBlobRef.current) {
        const filename = videoFilenameForBlob(recordedBlobRef.current, "form-check");
        const uploadResult = await uploadOrQueueVideo(
          recordedBlobRef.current,
          filename,
          videoContext ?? { label: "Sled/Carry" },
          setUploadProgress,
        );
        if (uploadResult.status === "queued") {
          if (!hasWarnedAboutQueueing()) {
            markWarnedAboutQueueing();
            toast.info(
              "No Wi-Fi -- this video is saved on your device and will upload automatically once you're connected. You can also upload it manually anytime from the Video Bank, even over cellular.",
              { duration: 10000 },
            );
          }
        } else {
          uploadedVideoUrl = uploadResult.url;
        }
      }
      onCapture(result, uploadedVideoUrl);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Saved the set, but the clip failed to upload");
      onCapture(result);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const showsCamera = step === "calibrate" || step === "capture";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName={showsCamera ? "bg-transparent backdrop-blur-none" : undefined}
        className={
          showsCamera
            ? "inset-0 top-0 left-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-transparent p-0 overflow-hidden [&>button]:hidden"
            : "max-w-lg"
        }
      >
        {showsCamera && (
          <div className="relative flex h-full w-full flex-col">
            <div ref={containerRef} className="relative flex-1" style={{ background: "transparent" }}>
              <button
                type="button"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
                className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
              >
                <X className="h-5 w-5" />
              </button>

              <canvas
                ref={overlayCanvasRef}
                onClick={handleOverlayClick}
                className={`absolute inset-0 h-full w-full ${step === "calibrate" ? "cursor-crosshair" : ""}`}
              />

              {recording && (
                <div className="absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-sm font-bold text-teal-400 backdrop-blur-sm">
                  Recording -- push/carry now, then tap Stop
                </div>
              )}

              {step === "calibrate" && (
                <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md bg-black/60 px-3 py-2 text-center text-sm text-white backdrop-blur-sm">
                  Make sure the whole distance being covered will be in frame.
                </div>
              )}

              {error && (
                <div className="absolute inset-x-4 bottom-24 flex items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-sm text-white">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              {supported === false && (
                <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-sm text-white">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Camera tracking isn't supported on this device.
                  </div>
                  {supportError && (
                    <p className="select-text break-all text-center text-xs opacity-90">{supportError}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-2 bg-black/70 px-3 py-4 backdrop-blur-sm">
              {step === "calibrate" && (
                <>
                  <p className="text-center text-sm text-white">
                    Tap the screen where the <strong>start line</strong> is, then where the{" "}
                    <strong>finish line</strong> is ({checkpointCount}/2 marked).
                  </p>
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-white">Distance (yards)</Label>
                      <Input type="number" value={distanceYards} onChange={(e) => setDistanceYards(e.target.value)} />
                    </div>
                    <Button variant="outline" onClick={resetCheckpoints} disabled={checkpointCount === 0}>
                      <RotateCcw className="h-4 w-4" />
                      Reset
                    </Button>
                  </div>
                  <Button
                    size="lg"
                    disabled={checkpointCount < 2 || (Number(distanceYards) || 0) <= 0 || !supported}
                    onClick={startCapture}
                  >
                    <Play className="h-4 w-4" />
                    Start Recording
                  </Button>
                </>
              )}
              {step === "capture" && (
                <div className="flex gap-3">
                  <Button size="lg" variant="secondary" className="flex-1" onClick={cancelCapture}>
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                  <Button size="lg" className="flex-1" onClick={stopCaptureAndAnalyze} disabled={!recording}>
                    <Square className="h-4 w-4" />
                    Stop Recording
                  </Button>
                </div>
              )}
              {(step === "calibrate" || step === "capture") && diagLog.length > 0 && (
                <p className="truncate text-center text-[10px] text-white/40">{diagLog[diagLog.length - 1]}</p>
              )}
            </div>
          </div>
        )}

        {step === "analyzing" && (
          <div className="space-y-4 py-6 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
            <p className="text-sm text-muted-foreground">Analyzing recording…</p>
            <Button variant="outline" size="sm" onClick={cancelAnalysis}>
              <XCircle className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        )}

        {step === "manual" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Couldn't auto-detect a clean checkpoint crossing from this take. Scrub the clip below and mark Start
                and Finish by hand -- the time will still count.
              </p>
            </div>
            {videoUrl && (
              <div className="overflow-hidden rounded-md bg-black">
                <video ref={manualVideoRef} src={videoUrl} playsInline controls className="w-full" />
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={markManualStart}>
                <Flag className="h-4 w-4" />
                Mark Start
              </Button>
              <Button className="flex-1" onClick={markManualFinish} disabled={manualStartTime == null}>
                <Flag className="h-4 w-4" />
                Mark Finish
              </Button>
            </div>
            {manualStartTime != null && (
              <p className="text-center text-xs text-muted-foreground">
                Start marked at {manualStartTime.toFixed(2)}s -- scrub to the finish and tap Mark Finish.
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={retry}>
                <RotateCcw className="h-4 w-4" />
                Retry Take
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "review" && result && (
          <div className="space-y-4">
            {videoUrl && (
              <div className="relative overflow-hidden rounded-md bg-black">
                <video src={videoUrl} playsInline controls className="w-full" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-4 text-center">
              <div>
                <p className="text-2xl font-bold text-teal-400">{result.elapsedSeconds.toFixed(2)}s</p>
                <p className="text-xs text-muted-foreground">Elapsed time</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{result.avgSpeedYardsPerSec.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Yards / sec</p>
              </div>
            </div>

            {result.likelyGlitch && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                This time looks faster than realistically possible -- almost certainly a tracking glitch, not a
                real split. Recommend retaking before saving.
              </div>
            )}
            {!result.likelyGlitch && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-teal-400" />
                Clean read.
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={retry}>
                <RotateCcw className="h-4 w-4" />
                Retry
              </Button>
              <Button onClick={saveMutation} disabled={saving}>
                {saving ? `Saving… ${Math.round(uploadProgress * 100)}%` : "Save Set"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
