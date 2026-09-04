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
  wristConfidence,
  blendSpeedEstimates,
  detectThrowReps,
  type SetTrustScore,
  type BlendedSpeedResult,
  type PoseFrame,
} from "@/lib/pose-tracking";
import { analyzeMechanics, type MechanicsFrame } from "@/lib/mechanics-tracking";
import { MIN_TRACKING_CONFIDENCE } from "@/lib/bar-tracking";
import { ImplementTracker } from "@/lib/implement-tracking";
import { lockCameraExposure } from "@/lib/camera-exposure";
import { WebCameraChrome } from "@/components/web-camera-chrome";
import { ensureCameraPermission, onAppForeground, onAppBackground } from "@/lib/native-camera";
import { recordedVideoType, videoFilenameForBlob } from "@/lib/video-recording";
import type { MedballSetMetrics } from "@/components/av-medball-tracker-dialog";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";

const EMPTY_MEDBALL_METRICS: MedballSetMetrics = {
  peakSpeedMps: null,
  releaseHeightCm: null,
  trust: null,
  repBreakdown: [],
  captureDeviceInfo: null,
};

// Same reasoning as av-medball-tracker-dialog.tsx's identical constants -- generously above even
// a hard rotational throw or overhead slam (untuned against real footage, same caveat every
// heuristic constant in this codebase carries) and below this many confident samples there isn't
// enough of a tracked trace to trust a frame-to-frame speed reading from it at all.
const MAX_PLAUSIBLE_BALL_SPEED_MPS = 25;
const MIN_BALL_SPEED_SAMPLES = 4;

type BallPoint = { t: number; x: number; y: number; confidence: number };

/** Android/MediaPipe twin of av-medball-tracker-dialog.tsx -- same two-independent-signal
 * design (see that file's own header comment): the ball's own tracked speed, cross-checked
 * against mechanics-tracking.ts's "throw" analysis (peak wrist speed as a release-velocity
 * proxy), confidence-weighted blended via blendSpeedEstimates rather than a plain either/or
 * fallback. mechanics-tracking.ts, pose-tracking.ts, and bar-tracking.ts are all reused
 * completely unmodified -- already platform-agnostic, the same "shared summarization, separate
 * live-tracking layer" split every other Android port in this pass follows.
 *
 * The ball-tracking signal itself comes from THIS platform's own ImplementTracker
 * (implement-tracking.ts, motion-diff), run as two fully independent instances -- one seeded on
 * each wrist -- exactly the same leftImplementTrackerRef/rightImplementTrackerRef pattern
 * bar-tracker-dialog.tsx already established for its own left/right grip tracking, reused here
 * instead of AvImplementTracker. Deliberately does NOT wire in WebImplementDetector (the
 * med_ball classifier) the way bar-tracker-dialog.tsx wires it in for barbell/dumbbell/
 * kettlebell -- av-medball-tracker-dialog.tsx doesn't consume AvCoreMlImplementDetector's output
 * either; its own med_ball detection stays purely internal to that native class (see
 * implement-detection.ts's own trajectory-check comment), matching the iOS twin's actual scope
 * rather than adding a signal iOS's own dialog never uses.
 *
 * What's genuinely different from the iOS twin:
 * - No athlete-height calibration: MediaPipe's worldLandmarks already report real-world meters
 *   directly, same reasoning every other Android AV-style port this session gives.
 * - Frames are already fully collected by the moment recording stops, so there's no separate
 *   post-recording "analyzing" pass.
 * - captureDeviceInfo/trackingDiagnostics stay null/undefined -- both are native-AV-only
 *   diagnostics with no MediaPipe equivalent. */
export function MedballTrackerDialog({
  open,
  onOpenChange,
  recordVideo,
  onCapture,
  videoContext,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordVideo?: boolean;
  onCapture: (metrics: MedballSetMetrics, videoUrl?: string, skeletonFrames?: PoseFrame[] | null) => void;
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
  const leftImplementTrackerRef = useRef(new ImplementTracker());
  const rightImplementTrackerRef = useRef(new ImplementTracker());
  const lastVideoTimeRef = useRef(-1);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const framesRef = useRef<MechanicsFrame[]>([]);
  const leftBallPointsRef = useRef<BallPoint[]>([]);
  const rightBallPointsRef = useRef<BallPoint[]>([]);
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
    framesRef.current = [];
    leftBallPointsRef.current = [];
    rightBallPointsRef.current = [];
    chunksRef.current = [];
    lastVideoTimeRef.current = -1;
    subjectGateRef.current.reset();
    leftImplementTrackerRef.current.reset();
    rightImplementTrackerRef.current.reset();

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
      framesRef.current.push({ t, worldLandmarks });

      const leftWristN = landmarks[POSE_LANDMARKS.LEFT_WRIST];
      const rightWristN = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
      const leftWristW = worldLandmarks[POSE_LANDMARKS.LEFT_WRIST];
      const rightWristW = worldLandmarks[POSE_LANDMARKS.RIGHT_WRIST];

      if (visible(leftWristN) && visible(leftWristW)) {
        const track = leftImplementTrackerRef.current.track(
          video, leftWristN.x, leftWristN.y, landmarks, worldLandmarks, leftWristW.x, leftWristW.y,
        );
        if (track) leftBallPointsRef.current.push({ t, x: track.worldX, y: track.worldY, confidence: track.confidence });
      }
      if (visible(rightWristN) && visible(rightWristW)) {
        const track = rightImplementTrackerRef.current.track(
          video, rightWristN.x, rightWristN.y, landmarks, worldLandmarks, rightWristW.x, rightWristW.y,
        );
        if (track) rightBallPointsRef.current.push({ t, x: track.worldX, y: track.worldY, confidence: track.confidence });
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  function startTracking() {
    framesRef.current = [];
    leftBallPointsRef.current = [];
    rightBallPointsRef.current = [];
    chunksRef.current = [];
    leftImplementTrackerRef.current.reset();
    rightImplementTrackerRef.current.reset();
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

  // Frame-to-frame speed across an implement's own confident trace -- same robust-percentile
  // shape as av-medball-tracker-dialog.tsx's identical helper, against ImplementTracker's own
  // world-space output instead of AvImplementTracker's.
  function peakImplementSpeed(points: BallPoint[]): { speedMps: number; confidence: number } | null {
    const confident = points.filter((p) => p.confidence >= MIN_TRACKING_CONFIDENCE);
    if (confident.length < MIN_BALL_SPEED_SAMPLES) return null;
    const speeds: number[] = [];
    for (let i = 1; i < confident.length; i++) {
      const a = confident[i - 1];
      const b = confident[i];
      const dtSeconds = (b.t - a.t) / 1000;
      if (dtSeconds <= 0) continue;
      speeds.push(Math.hypot(b.x - a.x, b.y - a.y) / dtSeconds);
    }
    if (speeds.length < MIN_BALL_SPEED_SAMPLES) return null;
    const plausible = speeds.filter((v) => v <= MAX_PLAUSIBLE_BALL_SPEED_MPS);
    const pool = plausible.length > 0 ? plausible : speeds;
    const speedMps = Math.round(percentile(pool, 0.95) * 100) / 100;
    const confidence = confident.reduce((a, p) => a + p.confidence, 0) / confident.length;
    return { speedMps, confidence };
  }

  // Frame-to-frame ball speed across the WHOLE clip, unaggregated -- feeds detectThrowReps, same
  // shape as av-medball-tracker-dialog.tsx's identical helper.
  function implementSpeedTrace(points: BallPoint[]): { t: number; speed: number }[] {
    const confident = points.filter((p) => p.confidence >= MIN_TRACKING_CONFIDENCE);
    const samples: { t: number; speed: number }[] = [];
    for (let i = 1; i < confident.length; i++) {
      const a = confident[i - 1];
      const b = confident[i];
      const dtSeconds = (b.t - a.t) / 1000;
      if (dtSeconds <= 0) continue;
      samples.push({ t: b.t, speed: Math.hypot(b.x - a.x, b.y - a.y) / dtSeconds });
    }
    return samples;
  }

  async function finishTracking(blob: Blob | null) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    stopCamera();

    async function saveEmptyAndWarn(message: string) {
      if (blob) {
        setSaving(true);
        try {
          const result = await uploadOrQueueVideo(blob, videoFilenameForBlob(blob, "form-check"), videoContext ?? { label: "Med Ball" }, setUploadProgress);
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
          onCapture(EMPTY_MEDBALL_METRICS, result.status === "uploaded" ? result.url : undefined);
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

    // Whichever hand the tracker actually followed the ball with -- same "pick whichever side
    // had more confident samples" reasoning av-medball-tracker-dialog.tsx's own throwingSide
    // detection uses, applied to ImplementTracker's own two independent instances instead of
    // AvImplementTracker's leftImplement/rightImplement.
    const leftConfidentCount = leftBallPointsRef.current.filter((p) => p.confidence >= MIN_TRACKING_CONFIDENCE).length;
    const rightConfidentCount = rightBallPointsRef.current.filter((p) => p.confidence >= MIN_TRACKING_CONFIDENCE).length;
    const throwingSide: "left" | "right" = rightConfidentCount > leftConfidentCount ? "right" : "left";
    const ballPoints = throwingSide === "right" ? rightBallPointsRef.current : leftBallPointsRef.current;

    const mechanicsResult = analyzeMechanics(framesRef.current, "throw");
    const releaseHeightCm = mechanicsResult.releaseHeightM != null ? Math.round(mechanicsResult.releaseHeightM * 100) : null;

    function blendedSpeedForWindow(startT: number, endT: number): BlendedSpeedResult | null {
      const windowBallPoints = ballPoints.filter((p) => p.t >= startT && p.t <= endT);
      const windowFrames = framesRef.current.filter((f) => f.t >= startT && f.t <= endT);
      const windowMechanics = startT === -Infinity && endT === Infinity ? mechanicsResult : analyzeMechanics(windowFrames, "throw");
      const ballSignal = peakImplementSpeed(windowBallPoints);
      const wristConfidenceSamples = windowFrames
        .map((f) => wristConfidence(f.worldLandmarks, throwingSide))
        .filter((c) => c > 0);
      const avgWristConfidence =
        wristConfidenceSamples.length > 0
          ? wristConfidenceSamples.reduce((a, c) => a + c, 0) / wristConfidenceSamples.length
          : 0;
      const wristSignal =
        windowMechanics.peakWristSpeedMps != null
          ? { speedMps: windowMechanics.peakWristSpeedMps, confidence: avgWristConfidence }
          : null;
      return blendSpeedEstimates(
        ballSignal,
        wristSignal,
        "Ball wasn't confidently tracked for enough of this throw -- speed estimated from wrist motion alone",
        "No wrist motion signal to cross-check against -- speed from ball tracking alone",
      );
    }

    const repWindows = detectThrowReps(implementSpeedTrace(ballPoints));
    const windowsToProcess: { repNumber: number; startT: number; endT: number }[] =
      repWindows.length > 0 ? repWindows : [{ repNumber: 1, startT: -Infinity, endT: Infinity }];
    const repBreakdown: { repNumber: number; peakSpeedMps: number; trust: SetTrustScore }[] = [];
    for (const w of windowsToProcess) {
      const blended = blendedSpeedForWindow(w.startT, w.endT);
      if (blended) {
        repBreakdown.push({ repNumber: w.repNumber, peakSpeedMps: blended.speedMps, trust: blended.trust });
      }
    }
    const bestRep = repBreakdown.reduce<(typeof repBreakdown)[number] | null>(
      (best, r) => (best == null || r.peakSpeedMps > best.peakSpeedMps ? r : best),
      null,
    );
    const peakSpeedMps = bestRep?.peakSpeedMps ?? null;
    const trust = bestRep?.trust ?? null;

    if (peakSpeedMps == null) {
      await saveEmptyAndWarn("Couldn't get a clean read -- make sure your whole throwing motion, ball included, stays in frame.");
      return;
    }

    const metrics: MedballSetMetrics = {
      peakSpeedMps,
      releaseHeightCm,
      trust,
      repBreakdown,
      captureDeviceInfo: null,
    };

    toast.success(
      repBreakdown.length === 1
        ? `Throw: ${repBreakdown[0].peakSpeedMps} m/s`
        : `${repBreakdown.length} throws detected: ${repBreakdown.map((r) => r.peakSpeedMps).join(", ")} m/s`,
    );

    if (!blob) {
      onCapture(metrics, undefined, null);
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      const result = await uploadOrQueueVideo(blob, videoFilenameForBlob(blob, "form-check"), videoContext ?? { label: "Med Ball" }, setUploadProgress);
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
