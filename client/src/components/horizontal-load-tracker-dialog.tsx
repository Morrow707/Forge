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
import { getPoseLandmarker, SubjectContinuityGate, type PoseFrame } from "@/lib/pose-tracking";
import { lockCameraExposure } from "@/lib/camera-exposure";
import { WebCameraChrome } from "@/components/web-camera-chrome";
import { ensureCameraPermission, onAppForeground, onAppBackground } from "@/lib/native-camera";
import {
  detectSprintCrossings,
  deriveSprintReferencePoint,
  MAX_PLAUSIBLE_SPRINT_SPEED_YARDS_PER_SEC,
  type SprintPoint,
  type SprintResult,
} from "@/lib/sprint-tracking";
import type { HorizontalLoadSetMetrics } from "@/components/av-horizontal-load-tracker-dialog";
import { toast } from "sonner";
import { AlertTriangle, Play, Square, RotateCcw, Check, X, Flag } from "lucide-react";
import { recordedVideoType, videoFilenameForBlob } from "@/lib/video-recording";
import { hapticLight } from "@/lib/haptics";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";

type Step = "calibrate" | "capture" | "manual" | "review";

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

/** Android/MediaPipe twin of av-horizontal-load-tracker-dialog.tsx -- same "horizontal-linear"
 * trajectory pattern (a sled push/pull or loaded carry is "cover a known distance," not an
 * up-down rep to segment -- see that file's own header comment), same two-checkpoint-tap +
 * manual-scrub-fallback model, reusing sprint-tracking.ts's deriveSprintReferencePoint/
 * detectSprintCrossings completely unmodified (already platform-agnostic, already shared with
 * sprint-tracker-dialog.tsx on this same platform).
 *
 * What's genuinely different from the iOS twin, and closer to THIS platform's own
 * sprint-tracker-dialog.tsx instead: crossing detection runs LIVE, in the same detectForVideo
 * tick loop that's already running during "capture" (auto-finishing the instant a clean crossing
 * is found), rather than iOS's necessarily record-then-analyze structure (Vision only ever
 * analyzes a finished file). A manual Stop before a crossing fires still falls to the same
 * scrub-and-mark "manual" step as the iOS twin, for the same real reason: occlusion, a bad
 * camera angle, or the athlete just starting before the countdown can all mean no clean crossing
 * ever gets found automatically. */
export function HorizontalLoadTrackerDialog({
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const manualVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraChromeContainerRef = useRef<HTMLDivElement>(null);
  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    videoTrackRef.current = null;
  }
  const rafRef = useRef<number | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const subjectGateRef = useRef(new SubjectContinuityGate());
  const lastVideoTimeRef = useRef(-1);
  const checkpointsRef = useRef<number[]>([]);
  const pointsRef = useRef<SprintPoint[]>([]);
  const framesRef = useRef<PoseFrame[]>([]);
  const captureStartRef = useRef(0);
  const stepRef = useRef<Step>("calibrate");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordedBlobRef = useRef<Blob | null>(null);
  const manualStartRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [step, setStepState] = useState<Step>("calibrate");
  function changeStep(next: Step) {
    stepRef.current = next;
    setStepState(next);
  }
  const [checkpointCount, setCheckpointCount] = useState(0);
  const [distanceYards, setDistanceYards] = useState("20");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<HorizontalLoadSetMetrics | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [manualStartTime, setManualStartTime] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    changeStep("calibrate");
    setCameraError(null);
    setResult(null);
    checkpointsRef.current = [];
    setCheckpointCount(0);
    setDistanceYards("20");
    pointsRef.current = [];
    framesRef.current = [];
    lastVideoTimeRef.current = -1;
    subjectGateRef.current.reset();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    chunksRef.current = [];
    recordedBlobRef.current = null;
    manualStartRef.current = null;
    setManualStartTime(null);

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

    let cancelled = false;
    const acquireCamera = () => {
      ensureCameraPermission().then((granted) => {
        if (cancelled) return;
        if (!granted) {
          setCameraError("Camera access denied -- enable it for Forge in Settings.");
          return;
        }
        navigator.mediaDevices
          .getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 720 },
              height: { ideal: 1280 },
              frameRate: { ideal: 60, min: 30 },
            },
          })
          .then((stream) => {
            if (cancelled) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            setCameraError(null);
            streamRef.current = stream;
            if (videoRef.current) videoRef.current.srcObject = stream;
            const videoTrack = stream.getVideoTracks()[0];
            videoTrackRef.current = videoTrack ?? null;
            if (videoTrack) void lockCameraExposure(videoTrack);
          })
          .catch(() => setCameraError("Camera access denied or unavailable."));
      });
    };
    acquireCamera();
    rafRef.current = requestAnimationFrame(tick);

    const unsubscribeForeground = onAppForeground(() => {
      const stillLive = streamRef.current?.getVideoTracks().some((t) => t.readyState === "live");
      if (!stillLive) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        videoTrackRef.current = null;
        acquireCamera();
      }
      if (!rafRef.current) rafRef.current = requestAnimationFrame(tick);
    });
    const unsubscribeBackground = onAppBackground(() => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      stopCamera();
    });

    return () => {
      cancelled = true;
      unsubscribeForeground();
      unsubscribeBackground();
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    redrawCheckpointOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, checkpointCount]);

  function redrawCheckpointOverlay() {
    const canvas = overlayCanvasRef.current;
    const container = cameraChromeContainerRef.current;
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

  function buildCheckpoints() {
    const taps = checkpointsRef.current;
    if (taps.length < 2) return null;
    const distanceNum = Number(distanceYards) || 0;
    if (distanceNum <= 0) return null;
    return [{ x: taps[0] }, { x: taps[1], segmentDistanceYards: distanceNum }];
  }

  function tick() {
    const video = videoRef.current;
    const landmarker = poseLandmarkerRef.current;
    if (!video || !landmarker || video.videoWidth === 0) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    if (video.currentTime === lastVideoTimeRef.current) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    lastVideoTimeRef.current = video.currentTime;

    const now = performance.now();
    const detection = landmarker.detectForVideo(video, now);
    const rawLandmarks = detection.landmarks[0] ?? null;
    const landmarks = subjectGateRef.current.admit(rawLandmarks);
    const worldLandmarks = landmarks ? (detection.worldLandmarks[0] ?? null) : null;

    if (stepRef.current === "capture" && landmarks && worldLandmarks) {
      const ref = deriveSprintReferencePoint(landmarks);
      if (ref) {
        const t = now - captureStartRef.current;
        pointsRef.current.push({ t, x: ref.x });
        framesRef.current.push({ t, landmarks, worldLandmarks });

        const checkpoints = buildCheckpoints();
        const crossing = checkpoints ? detectSprintCrossings(pointsRef.current, { checkpoints }) : null;
        if (crossing) {
          finishCapture(crossing);
          return;
        }
      }
    }

    rafRef.current = requestAnimationFrame(tick);
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

  function startCapture() {
    changeStep("capture");
    pointsRef.current = [];
    framesRef.current = [];
    chunksRef.current = [];
    captureStartRef.current = performance.now();
    if (recordVideo && streamRef.current) {
      const mimeType = MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : undefined;
      const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        recordedBlobRef.current = new Blob(chunksRef.current, { type: recordedVideoType(recorder, mimeType) });
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        setVideoUrl(URL.createObjectURL(recordedBlobRef.current));
      };
      recorderRef.current = recorder;
      recorder.start();
    }
    setRecording(true);
    recordingTimeoutRef.current = setTimeout(() => {
      if (stepRef.current === "capture") stopCaptureManually();
    }, MAX_RECORDING_MS);
  }

  function finishCapture(crossing: SprintResult) {
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setRecording(false);
    hapticLight();
    finishWithResult(fromSprintResult(crossing));
  }

  // The athlete tapped Stop before a clean crossing was ever auto-detected --
  // same real causes AvHorizontalLoadTrackerDialog's own manual fallback
  // exists for (occlusion, a bad angle, starting before the countdown).
  // Falls to the scrub-and-mark step instead of just failing outright.
  function stopCaptureManually() {
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    setRecording(false);
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    manualStartRef.current = null;
    setManualStartTime(null);
    changeStep("manual");
  }

  function cancelCapture() {
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    setRecording(false);
    if (recorderRef.current?.state === "recording") {
      chunksRef.current = [];
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    changeStep("calibrate");
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
    hapticLight();
    finishWithResult(manualResult);
  }

  function retry() {
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    recordedBlobRef.current = null;
    resetCheckpoints();
    setResult(null);
    setCameraError(null);
    manualStartRef.current = null;
    setManualStartTime(null);
    changeStep("calibrate");
    rafRef.current = requestAnimationFrame(tick);
  }

  async function saveMutation() {
    if (!result) return;
    setSaving(true);
    try {
      let uploadedVideoUrl: string | undefined;
      if (recordVideo && recordedBlobRef.current) {
        const uploadResult = await uploadOrQueueVideo(
          recordedBlobRef.current,
          videoFilenameForBlob(recordedBlobRef.current, "form-check"),
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
      onCapture(result, uploadedVideoUrl, framesRef.current);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Saved the set, but the clip failed to upload");
      onCapture(result, undefined, framesRef.current);
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
            <div ref={cameraChromeContainerRef} className="absolute inset-0" style={{ background: "transparent" }}>
              <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
              <WebCameraChrome containerRef={cameraChromeContainerRef} videoTrackRef={videoTrackRef} active={showsCamera && !modelLoading && !cameraError} />
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

              {cameraError && (
                <div className="absolute inset-x-4 bottom-24 flex items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-sm text-white">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {cameraError}
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
                    disabled={checkpointCount < 2 || (Number(distanceYards) || 0) <= 0 || !!cameraError || modelLoading}
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
                  <Button size="lg" className="flex-1" onClick={stopCaptureManually} disabled={!recording}>
                    <Square className="h-4 w-4" />
                    Stop Recording
                  </Button>
                </div>
              )}
            </div>
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
