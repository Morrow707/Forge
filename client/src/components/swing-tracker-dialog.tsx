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
import { getPoseLandmarker, SubjectContinuityGate, type PoseFrame } from "@/lib/pose-tracking";
import { lockCameraExposure } from "@/lib/camera-exposure";
import { WebCameraChrome } from "@/components/web-camera-chrome";
import { ensureCameraPermission, onAppForeground, onAppBackground } from "@/lib/native-camera";
import { summarizeRotation, summarizeSwing } from "@/lib/android-swing-tracking";
import { recordedVideoType, videoFilenameForBlob } from "@/lib/video-recording";
import type { AvSwingSetMetrics } from "@/components/av-swing-tracker-dialog";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";

const EMPTY_SWING_METRICS: AvSwingSetMetrics = {
  peakSeparationDeg: null,
  tempoRatio: null,
  backswingMs: null,
  downswingMs: null,
  headSwayCm: null,
  rotationTrace: [],
  trust: null,
  captureDeviceInfo: null,
  trackingDiagnostics: null,
};

/** Android/MediaPipe twin of av-swing-tracker-dialog.tsx -- same rotation (shoulder/hip
 * separation), tempo, and head-sway measurements, same "no implement to follow, body joints
 * only" scope, same no-review-step flow (stopTracking computes metrics and calls onCapture
 * directly, closing the dialog immediately). What's genuinely different from the iOS twin:
 *
 * - The scoring math (android-swing-tracking.ts) is a deliberate, separate fork of
 *   rotation-tracking.ts/swing-tracking.ts, not a shared import -- see that file's own header
 *   comment for why.
 * - No athlete-height calibration step: MediaPipe's PoseLandmarker already reports
 *   worldLandmarks in real-world meters directly, unlike Vision's raw 2D-derived output, which
 *   is why av-swing-tracker-dialog.tsx calibrates before computing headSwayCm and this dialog
 *   doesn't need to.
 * - Frames are already fully collected by the moment recording stops (this dialog runs its own
 *   live detectForVideo loop the whole time, the same as every other MediaPipe tracker dialog),
 *   so there's no separate post-recording "analyzing" pass or its own concurrent-upload
 *   optimization to reason about -- upload just starts once the recorder's own blob exists,
 *   after metrics are already computed.
 * - captureDeviceInfo/trackingDiagnostics stay null -- both are native-AV-only diagnostics with
 *   no MediaPipe equivalent, same convention every other Android tracker dialog already follows
 *   (bar-tracker-dialog.tsx never sets either either). */
export function SwingTrackerDialog({
  open,
  onOpenChange,
  sport,
  recordVideo,
  onCapture,
  videoContext,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sport: "golf" | "baseball";
  recordVideo?: boolean;
  onCapture: (metrics: AvSwingSetMetrics, videoUrl?: string) => void;
  videoContext?: VideoRecordContext;
}) {
  const label = sport === "golf" ? "Golf Swing" : "Baseball Swing";

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // See bar-tracker-dialog.tsx's own videoTrackRef comment -- kept in sync with streamRef's
  // video track so WebCameraChrome always reads the live track, even across an app-foreground
  // reacquisition.
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraChromeContainerRef = useRef<HTMLDivElement>(null);
  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    videoTrackRef.current = null;
  }
  const rafRef = useRef<number | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  // See mechanics-tracker-dialog.tsx's own subjectGateRef comment -- rejects a detection that
  // jumped implausibly far to plausibly still be the athlete being filmed.
  const subjectGateRef = useRef(new SubjectContinuityGate());
  const lastVideoTimeRef = useRef(-1);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const framesRef = useRef<PoseFrame[]>([]);
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
    chunksRef.current = [];
    lastVideoTimeRef.current = -1;
    subjectGateRef.current.reset();

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
        // ideal, not exact, and portrait (720x1280) -- see bar-tracker-dialog.tsx's own comment
        // on both. A swing is one of the fastest motions this app tracks, so tempoRatio's own
        // takeaway/top/impact timing benefits from 60fps more than almost anywhere else.
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
            // Best-effort, Chrome/Android-only -- see lockCameraExposure's own comment. A swing
            // is exactly the fast-motion case a longer auto-exposure shutter blurs hardest.
            if (videoTrack) void lockCameraExposure(videoTrack);
          })
          .catch(() => setCameraError("Camera access denied or unavailable."));
      });
    };
    acquireCamera();
    rafRef.current = requestAnimationFrame(tick);

    // See bar-tracker-dialog.tsx's own comment on onAppForeground/onAppBackground.
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
      framesRef.current.push({ t: now - captureStartRef.current, landmarks, worldLandmarks });
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  function startTracking() {
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
      // finishTracking runs from the recorder's own onstop above once the blob actually exists.
      recorderRef.current.stop();
      recorderRef.current = null;
    } else {
      // recordVideo was false -- nothing to wait on, every frame is already in framesRef.
      void finishTracking(null);
    }
  }

  async function finishTracking(blob: Blob | null) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    stopCamera();

    const rotation = summarizeRotation(framesRef.current);
    const swing = summarizeSwing(framesRef.current);
    const metrics: AvSwingSetMetrics | null =
      rotation || swing.phases
        ? {
            peakSeparationDeg: rotation?.peakSeparationDeg ?? null,
            tempoRatio: swing.phases?.tempoRatio ?? null,
            backswingMs: swing.phases?.backswingMs ?? null,
            downswingMs: swing.phases?.downswingMs ?? null,
            headSwayCm: swing.headSwayCm,
            rotationTrace: rotation?.trace ?? [],
            trust: rotation?.trust ?? null,
            captureDeviceInfo: null,
            trackingDiagnostics: null,
          }
        : null;

    if (!metrics) {
      const message = "Couldn't get a clean read -- make sure your whole swing stays in frame.";
      if (blob) {
        setSaving(true);
        try {
          const result = await uploadOrQueueVideo(
            blob,
            videoFilenameForBlob(blob, "form-check"),
            videoContext ?? { label },
            setUploadProgress,
          );
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
          onCapture(EMPTY_SWING_METRICS, result.status === "uploaded" ? result.url : undefined);
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
      return;
    }

    if (!blob) {
      onCapture(metrics, undefined);
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      const result = await uploadOrQueueVideo(blob, videoFilenameForBlob(blob, "form-check"), videoContext ?? { label }, setUploadProgress);
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
                Start {label}
              </Button>
            )}
            {recording && (
              <Button size="lg" variant="secondary" onClick={stopTracking}>
                <Square className="h-4 w-4" />
                Stop
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
