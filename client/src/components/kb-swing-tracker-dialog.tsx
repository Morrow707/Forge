import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/queryClient";
import {
  uploadOrQueueVideo,
  hasWarnedAboutQueueing,
  markWarnedAboutQueueing,
  type VideoRecordContext,
} from "@/lib/video-offline-store";
import { toast } from "sonner";
import { Circle, Square, AlertTriangle, X } from "lucide-react";
import {
  getPoseLandmarker,
  SubjectContinuityGate,
  POSE_LANDMARKS,
  visible,
  percentile,
  blendSpeedEstimates,
  type PoseFrame,
} from "@/lib/pose-tracking";
import { summarizeKbSwingSet, MAX_PLAUSIBLE_KB_SWING_SPEED_MPS, type KbSwingSetMetrics } from "@/lib/kb-swing-tracking";
import { MIN_TRACKING_CONFIDENCE, type TrackedPoint } from "@/lib/bar-tracking";
import { ImplementTracker } from "@/lib/implement-tracking";
import { lockCameraExposure } from "@/lib/camera-exposure";
import { WebCameraChrome } from "@/components/web-camera-chrome";
import { ensureCameraPermission, onAppForeground, onAppBackground } from "@/lib/native-camera";
import { recordedVideoType, videoFilenameForBlob } from "@/lib/video-recording";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";

const EMPTY_KB_SWING_METRICS: KbSwingSetMetrics = {
  peakSpeedMps: 0,
  meanSpeedMps: 0,
  peakHeightCm: 0,
  repBreakdown: [],
  trust: null,
  captureDeviceInfo: null,
};

// Same reasoning as av-kb-swing-tracker-dialog.tsx's identical constant --
// a couple of lucky frames isn't a real bell-tracked trace.
const MIN_BELL_SPEED_SAMPLES = 4;

/** Android/MediaPipe twin of av-kb-swing-tracker-dialog.tsx -- same "arc" trajectory pattern
 * (see kb-swing-tracking.ts's own file comment: peak speed happens near the BOTTOM of the arc,
 * mostly horizontal motion, so bar-tracking.ts's vertical-only formulas would badly undercount
 * it). Reuses kb-swing-tracking.ts's summarizeKbSwingSet completely unmodified -- it's already
 * platform-agnostic math over a plain TrackedPoint[] trace, the same "shared summarization,
 * separate live-tracking layer" split this session's other Android ports (swing, object
 * detection) already established.
 *
 * What's genuinely different from the iOS twin:
 * - No athlete-height calibration: MediaPipe's worldLandmarks already report real-world meters
 *   directly, unlike Vision's raw 2D-derived output -- same reasoning swing-tracker-dialog.tsx's
 *   own header comment gives for skipping calibrateFromFrames.
 * - The bell cross-check signal comes from THIS platform's own ImplementTracker
 *   (implement-tracking.ts, motion-diff, already built and already used by bar-tracker-dialog.tsx)
 *   instead of AvImplementTracker -- same role (a second, independent read on the bell's own
 *   tracked position, blended against the wrist-midpoint trace via blendSpeedEstimates),
 *   deliberately separate implementation.
 * - Frames are already fully collected by the moment recording stops (a live detectForVideo loop
 *   the whole time), so there's no separate post-recording "analyzing" pass to reason about.
 * - captureDeviceInfo/trackingDiagnostics stay null/undefined -- both are native-AV-only
 *   diagnostics with no MediaPipe equivalent, same convention every other Android tracker dialog
 *   already follows. */
export function KbSwingTrackerDialog({
  open,
  onOpenChange,
  recordVideo,
  onCapture,
  videoContext,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordVideo?: boolean;
  onCapture: (metrics: KbSwingSetMetrics, videoUrl?: string, skeletonFrames?: PoseFrame[] | null) => void;
  videoContext?: VideoRecordContext;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
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
  const implementTrackerRef = useRef(new ImplementTracker());
  const lastVideoTimeRef = useRef(-1);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Wrist-midpoint trace -- the PRIMARY signal, same as av-kb-swing-tracker-dialog.tsx's own
  // (a two-handed swing's grip sits right on the bell, so the wrist midpoint is already a
  // faithful proxy -- see kb-swing-tracking.ts's own header comment).
  const traceRef = useRef<TrackedPoint[]>([]);
  // ImplementTracker's own bell-tracked point, kept fully separate from traceRef above -- same
  // "never blended frame-by-frame, only cross-checked once at Stop" reasoning
  // av-kb-swing-tracker-dialog.tsx's own bellPoints uses.
  const bellPointsRef = useRef<{ t: number; x: number; y: number; confidence: number }[]>([]);
  const captureStartRef = useRef(0);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    if (!open) return;
    setCameraError(null);
    setRecording(false);
    setSaving(false);
    setUploadProgress(0);
    traceRef.current = [];
    bellPointsRef.current = [];
    chunksRef.current = [];
    lastVideoTimeRef.current = -1;
    subjectGateRef.current.reset();
    implementTrackerRef.current.reset();

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
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

    if (recorderRef.current?.state === "recording" && landmarks && worldLandmarks) {
      const t = now - captureStartRef.current;
      const leftWristN = landmarks[POSE_LANDMARKS.LEFT_WRIST];
      const rightWristN = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
      const leftWristW = worldLandmarks[POSE_LANDMARKS.LEFT_WRIST];
      const rightWristW = worldLandmarks[POSE_LANDMARKS.RIGHT_WRIST];
      const leftOk = visible(leftWristN) && visible(leftWristW);
      const rightOk = visible(rightWristN) && visible(rightWristW);

      if (leftOk || rightOk) {
        const wx = leftOk && rightOk ? (leftWristW.x + rightWristW.x) / 2 : leftOk ? leftWristW.x : rightWristW.x;
        const wy = leftOk && rightOk ? (leftWristW.y + rightWristW.y) / 2 : leftOk ? leftWristW.y : rightWristW.y;
        const wz = leftOk && rightOk ? (leftWristW.z + rightWristW.z) / 2 : leftOk ? leftWristW.z : rightWristW.z;
        const confidence =
          leftOk && rightOk ? Math.min(leftWristW.visibility, rightWristW.visibility) : leftOk ? leftWristW.visibility : rightWristW.visibility;
        traceRef.current.push({ t, x: wx, y: wy, z: wz, confidence });

        // ImplementTracker's own search is seeded off ONE normalized point -- the same
        // wrist-midpoint (normalized pixel-space this time, not world) the trace above uses in
        // world-space, so both signals are anchored on the same physical point every frame.
        const nx = leftOk && rightOk ? (leftWristN.x + rightWristN.x) / 2 : leftOk ? leftWristN.x : rightWristN.x;
        const ny = leftOk && rightOk ? (leftWristN.y + rightWristN.y) / 2 : leftOk ? leftWristN.y : rightWristN.y;
        const bellTrack = implementTrackerRef.current.track(video, nx, ny, landmarks, worldLandmarks, wx, wy);
        if (bellTrack) {
          bellPointsRef.current.push({ t, x: bellTrack.worldX, y: bellTrack.worldY, confidence: bellTrack.confidence });
        }
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  function startTracking() {
    traceRef.current = [];
    bellPointsRef.current = [];
    chunksRef.current = [];
    implementTrackerRef.current.reset();
    captureStartRef.current = performance.now();
    if (recordVideo && streamRef.current) {
      const mimeType = MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : undefined;
      const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recordedVideoType(recorder, mimeType) });
        void finishTracking(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
    }
    setRecording(true);
  }

  function stopTracking() {
    setRecording(false);
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
    } else {
      void finishTracking(null);
    }
  }

  async function finishTracking(blob: Blob | null) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    stopCamera();

    const wristMetrics = summarizeKbSwingSet(traceRef.current);

    async function saveEmptyAndWarn(message: string) {
      if (blob) {
        setSaving(true);
        try {
          const result = await uploadOrQueueVideo(blob, videoFilenameForBlob(blob, "form-check"), videoContext ?? { label: "Kettlebell Swing" }, setUploadProgress);
          toast.error(
            result.status === "queued"
              ? `${message} (No Wi-Fi -- video saved on your device, will upload once connected.)`
              : `${message} (Video saved for your coach.)`,
          );
          if (result.status === "queued" && !hasWarnedAboutQueueing()) {
            markWarnedAboutQueueing();
            toast.info(
              "You can also upload a queued video manually anytime -- even over cellular -- from the Video Bank.",
              { duration: 10000 },
            );
          }
          onCapture(EMPTY_KB_SWING_METRICS, result.status === "uploaded" ? result.url : undefined);
          onOpenChange(false);
        } catch (err) {
          const detail = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
          toast.error(`${message} And the video didn't save either: ${detail}`);
        } finally {
          setSaving(false);
        }
      } else {
        toast.error(message);
      }
    }

    if (!wristMetrics) {
      await saveEmptyAndWarn("Couldn't get a clean read -- make sure both hands and the kettlebell stay in frame throughout the set.");
      return;
    }

    // Cross-check the wrist-derived peak speed against the bell's own ImplementTracker-tracked
    // speed -- same robust-percentile-over-a-physical-ceiling shape as
    // av-kb-swing-tracker-dialog.tsx's identical cross-check.
    const confidentBellPoints = bellPointsRef.current.filter((p) => p.confidence >= MIN_TRACKING_CONFIDENCE);
    let bellSignal: { speedMps: number; confidence: number } | null = null;
    if (confidentBellPoints.length >= MIN_BELL_SPEED_SAMPLES) {
      const speeds: number[] = [];
      for (let i = 1; i < confidentBellPoints.length; i++) {
        const a = confidentBellPoints[i - 1];
        const b = confidentBellPoints[i];
        const dtSeconds = (b.t - a.t) / 1000;
        if (dtSeconds <= 0) continue;
        speeds.push(Math.hypot(b.x - a.x, b.y - a.y) / dtSeconds);
      }
      if (speeds.length >= MIN_BELL_SPEED_SAMPLES) {
        const plausible = speeds.filter((v) => v <= MAX_PLAUSIBLE_KB_SWING_SPEED_MPS);
        const pool = plausible.length > 0 ? plausible : speeds;
        const confidence = confidentBellPoints.reduce((a, p) => a + p.confidence, 0) / confidentBellPoints.length;
        bellSignal = { speedMps: Math.round(percentile(pool, 0.95) * 100) / 100, confidence };
      }
    }
    const wristConfidentSamples = traceRef.current.filter((p) => (p.confidence ?? 0) >= MIN_TRACKING_CONFIDENCE);
    const wristSignal =
      wristConfidentSamples.length > 0
        ? {
            speedMps: wristMetrics.peakSpeedMps,
            confidence: wristConfidentSamples.reduce((a, p) => a + (p.confidence ?? 0), 0) / wristConfidentSamples.length,
          }
        : null;

    const blended = blendSpeedEstimates(
      bellSignal,
      wristSignal,
      "Bell wasn't confidently tracked for enough of this set -- speed from wrist motion alone",
      "No wrist motion signal to cross-check against -- speed from bell tracking alone",
    );
    const metrics: KbSwingSetMetrics = {
      ...wristMetrics,
      peakSpeedMps: blended?.speedMps ?? wristMetrics.peakSpeedMps,
      trust: blended?.trust ?? null,
      captureDeviceInfo: null,
    };

    if (!blob) {
      onCapture(metrics, undefined, null);
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      const result = await uploadOrQueueVideo(blob, videoFilenameForBlob(blob, "form-check"), videoContext ?? { label: "Kettlebell Swing" }, setUploadProgress);
      if (result.status === "queued" && !hasWarnedAboutQueueing()) {
        markWarnedAboutQueueing();
        toast.info(
          "No Wi-Fi -- this video is saved on your device and will upload automatically once you're connected. You can also upload it manually anytime from the Video Bank, even over cellular.",
          { duration: 10000 },
        );
      }
      onCapture(metrics, result.status === "uploaded" ? result.url : undefined);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Saved the set, but the clip failed to upload");
      onCapture(metrics, undefined);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-transparent backdrop-blur-none"
        className="inset-0 top-0 left-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-transparent backdrop-blur-none p-0 overflow-hidden [&>button]:hidden"
      >
        <div className="relative h-full w-full">
          <div ref={cameraChromeContainerRef} className="absolute inset-0" style={{ background: "transparent" }}>
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
            <WebCameraChrome containerRef={cameraChromeContainerRef} videoTrackRef={videoTrackRef} active={open && !modelLoading && !cameraError} />
            <button
              type="button"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>

            {recording && (
              <div className="absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-sm font-bold text-white backdrop-blur-sm">
                <Circle className="h-2.5 w-2.5 animate-pulse fill-destructive text-destructive" />
                Recording
              </div>
            )}

            {saving && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                <p className="text-sm text-white">Saving your video… {Math.round(uploadProgress * 100)}%</p>
              </div>
            )}

            {cameraError && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-sm text-white">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {cameraError}
              </div>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-center gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
            {!recording && !saving && (
              <Button size="lg" onClick={startTracking} disabled={!!cameraError || modelLoading}>
                <Circle className="h-4 w-4 fill-current" />
                Start Set
              </Button>
            )}
            {recording && (
              <Button size="lg" variant="secondary" onClick={stopTracking}>
                <Square className="h-4 w-4" />
                Stop Set
              </Button>
            )}
            {saving && (
              <Button size="lg" variant="secondary" disabled>
                Saving… {Math.round(uploadProgress * 100)}%
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
