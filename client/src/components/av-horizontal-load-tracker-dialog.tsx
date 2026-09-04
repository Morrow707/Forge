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
import { POSE_LANDMARKS, type PoseFrame } from "@/lib/pose-tracking";
import { type PoseFrame as NativePoseFrame, type CaptureDeviceInfo } from "@/lib/native-av-preview";
import { useAvBodyTracking } from "@/lib/use-av-body-tracking";
import { AvCameraChrome } from "@/components/av-camera-chrome";
import {
  detectSprintCrossings,
  deriveSprintReferencePoint,
  MAX_PLAUSIBLE_SPRINT_SPEED_YARDS_PER_SEC,
  type SprintPoint,
  type SprintResult,
  type SprintCheckpoint,
} from "@/lib/sprint-tracking";
import { crossingTrustScore, asSingleRepTrust } from "@/lib/capture-trust";
import type { RepTrustScore } from "@/lib/bar-tracking";
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
  // ARC-1: horizontal_load recorded nothing about its own confidence until
  // now. A single-entry RepTrustScore[] rather than a mode-specific column
  // -- a carry is one effort, and workoutSetEntries.trustScores is the
  // confidence field the server's resolveTrustScorePct already normalizes
  // into trust_score_pct. See capture-trust.ts's asSingleRepTrust.
  trustScores?: RepTrustScore[] | null;
  captureDeviceInfo?: CaptureDeviceInfo | null;
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

function buildManualResult(
  startTime: number,
  finishTime: number,
  distanceYards: number,
  coverage: { totalFrames: number; framesWithReferencePoint: number },
): HorizontalLoadSetMetrics | null {
  const elapsedSeconds = Math.round((finishTime - startTime) * 1000) / 1000;
  if (elapsedSeconds <= 0 || distanceYards <= 0) return null;
  const avgSpeedYardsPerSec = Math.round((distanceYards / elapsedSeconds) * 100) / 100;
  const likelyGlitch = avgSpeedYardsPerSec > MAX_PLAUSIBLE_SPRINT_SPEED_YARDS_PER_SEC;
  return {
    elapsedSeconds,
    distanceYards,
    avgSpeedYardsPerSec,
    likelyGlitch,
    trustScores: asSingleRepTrust(
      crossingTrustScore({
        likelyGlitch,
        totalFrames: coverage.totalFrames,
        framesWithReferencePoint: coverage.framesWithReferencePoint,
        // Marked by eye on the clip, not interpolated between two frames --
        // no frame-gap bound to report, see crossingTrustScore's own comment.
        crossingFrameGapsMs: [],
        totalElapsedSeconds: elapsedSeconds,
        manuallyTimed: true,
      }),
    ),
  };
}

function fromSprintResult(
  result: SprintResult,
  coverage: { totalFrames: number; framesWithReferencePoint: number },
): HorizontalLoadSetMetrics {
  return {
    elapsedSeconds: result.totalElapsedSeconds,
    distanceYards: result.totalDistanceYards,
    avgSpeedYardsPerSec: result.avgSpeedYardsPerSec,
    likelyGlitch: result.likelyGlitch,
    trustScores: asSingleRepTrust(
      crossingTrustScore({
        likelyGlitch: result.likelyGlitch,
        totalFrames: coverage.totalFrames,
        framesWithReferencePoint: coverage.framesWithReferencePoint,
        crossingFrameGapsMs: result.crossingFrameGapsMs,
        totalElapsedSeconds: result.totalElapsedSeconds,
      }),
    ),
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
  onCapture: (metrics: HorizontalLoadSetMetrics | null, videoUrl?: string, skeletonFrames?: PoseFrame[] | null) => void;
  videoContext?: VideoRecordContext;
}) {
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const manualVideoRef = useRef<HTMLVideoElement>(null);
  const checkpointsRef = useRef<number[]>([]);
  const pointsRef = useRef<SprintPoint[]>([]);
  // How many analyzed frames the recording produced in total, against how many of them
  // actually yielded a hip-midpoint reference point -- a run tracked in a third of its frames
  // still crosses every checkpoint, just far less precisely. Feeds crossingTrustScore (ARC-1).
  const frameCoverageRef = useRef({ totalFrames: 0, framesWithReferencePoint: 0 });
  const stepRef = useRef<Step>("calibrate");
  const recordedBlobRef = useRef<Blob | null>(null);
  // Set by stopCaptureAndAnalyze's onBlobReady the instant the recording exists, well before
  // Vision analysis (let alone the review step) finishes -- see use-av-body-tracking.ts's own
  // onBlobReady comment. saveMutation just awaits this same in-flight upload instead of
  // starting a fresh one once the coach taps Save, so the two run concurrently rather than the
  // upload only starting after analysis (and the whole review/manual-marking step) is done.
  const uploadPromiseRef = useRef<Promise<{ status: "uploaded"; url: string } | { status: "queued" }> | null>(null);
  // Set once per capture (stopCaptureAndAnalyze), read by finishWithResult -- the manual
  // start/finish fallback re-scrubs the SAME already-recorded clip rather than capturing again,
  // so it has no fresh captureDeviceInfo of its own to attach; both paths funnel through
  // finishWithResult, so stashing it here once covers both.
  const captureDeviceInfoRef = useRef<CaptureDeviceInfo | null>(null);
  // See workoutSetEntries.skeletonFrames' own comment in shared/schema.ts -- carried the same
  // way captureDeviceInfoRef is (set once analysis finishes, read back much later at saveMutation,
  // since this dialog's manual-scrub fallback means onCapture doesn't fire right after analysis
  // the way every other AV dialog's does).
  const skeletonFramesRef = useRef<PoseFrame[] | null>(null);
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
    cameraPermission,
    error,
    setError,
    diagLog,
    recording,
    analyzedFrames,
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
    uploadPromiseRef.current = null;
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
    uploadPromiseRef.current = null;
    const captured = await stopRecordingAndAnalyze({
      onBlobReady: recordVideo
        ? (blob) => {
            setSaving(true);
            setUploadProgress(0);
            const filename = videoFilenameForBlob(blob, "form-check");
            uploadPromiseRef.current = uploadOrQueueVideo(blob, filename, videoContext ?? { label: "Sled/Carry" }, setUploadProgress);
          }
        : undefined,
    });
    if (!captured) {
      // Analysis failed or was cancelled, but the upload above (if it started) doesn't know or
      // care -- it never depended on analysis succeeding. Left alone it would still finish in
      // the background with no set to attach it to, so wait for it and hand it over anyway --
      // same "the clip is worth keeping even without numbers" reasoning as every other
      // onBlobReady dialog's own failure branch.
      //
      // Cast (not just read directly) before narrowing -- uploadPromiseRef.current is only
      // ever reassigned inside the onBlobReady closure above, and TypeScript's control-flow
      // analysis doesn't trace into closures: outside one, it treats a closure-only-assigned
      // ref field as having stayed at its initializer (null) forever, no matter the declared
      // type, which narrows the truthy branch below to `never` without this cast overriding it
      // (see av-jump-tracker-dialog.tsx's own stopTracking for the same quirk on a plain `let`).
      const inFlightUpload = uploadPromiseRef.current as Promise<
        { status: "uploaded"; url: string } | { status: "queued" }
      > | null;
      if (inFlightUpload) {
        try {
          const uploadResult = await inFlightUpload;
          toast.error("Couldn't finish analyzing this take, but your video was saved for your coach.");
          onCapture(null, uploadResult.status === "uploaded" ? uploadResult.url : undefined, null);
          onOpenChange(false);
          return;
        } catch {
          // Genuinely nothing left to salvage -- fall through to send the coach back to
          // calibrate, same as the no-upload-in-flight case below.
        } finally {
          setSaving(false);
        }
      }
      changeStep("calibrate");
      return;
    }
    captureDeviceInfoRef.current = captured.captureDeviceInfo;
    skeletonFramesRef.current = captured.skeletonFrames;
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
    frameCoverageRef.current = {
      totalFrames: rawFrames.length,
      framesWithReferencePoint: pointsRef.current.length,
    };

    const checkpoints = buildCheckpoints();
    const crossing = checkpoints ? detectSprintCrossings(pointsRef.current, { checkpoints }) : null;
    if (crossing) {
      finishWithResult(fromSprintResult(crossing, frameCoverageRef.current));
    } else {
      manualStartRef.current = null;
      setManualStartTime(null);
      changeStep("manual");
    }
  }

  function finishWithResult(metrics: HorizontalLoadSetMetrics) {
    changeStep("review");
    setResult({ ...metrics, captureDeviceInfo: captureDeviceInfoRef.current });
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
    const manualResult = buildManualResult(startTime, finishTime, distanceNum, frameCoverageRef.current);
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
    // Deliberately not awaited/cancelled -- the take being discarded may already have an
    // upload in flight from onBlobReady. Letting it finish in the background and just
    // dropping the reference is the same tradeoff already accepted elsewhere in this pipeline
    // (see stopCaptureAndAnalyze's own failure-salvage branch for why that one instead awaits
    // and attaches it -- there's no "set" here to attach an orphaned retry-take's video to).
    uploadPromiseRef.current = null;
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
    try {
      let uploadedVideoUrl: string | undefined;
      if (recordVideo && recordedBlobRef.current) {
        // uploadPromiseRef.current is always set here -- onBlobReady (stopCaptureAndAnalyze
        // above) unconditionally starts it whenever recordVideo is true. Falls back to a fresh
        // upload rather than silently dropping the video if that invariant is ever wrong.
        const inFlightUpload =
          uploadPromiseRef.current ??
          uploadOrQueueVideo(
            recordedBlobRef.current,
            videoFilenameForBlob(recordedBlobRef.current, "form-check"),
            videoContext ?? { label: "Sled/Carry" },
            setUploadProgress,
          );
        const uploadResult = await inFlightUpload;
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
      onCapture(result, uploadedVideoUrl, skeletonFramesRef.current);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Saved the set, but the clip failed to upload");
      onCapture(result, undefined, skeletonFramesRef.current);
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
            ? "inset-0 top-0 left-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-transparent backdrop-blur-none p-0 overflow-hidden [&>button]:hidden"
            : "max-w-lg"
        }
      >
        {showsCamera && (
          <div className="relative h-full w-full">
            <div ref={containerRef} className="absolute inset-0" style={{ background: "transparent" }}>
              <AvCameraChrome containerRef={containerRef} active={showsCamera} />
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
                  Recording
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

            <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
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
