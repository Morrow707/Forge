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
  isAvBodyTrackingSupported,
  startAvPreview,
  stopAvPreview,
  updateAvPreviewRect,
  startAvRecording,
  stopAvRecording,
  deleteAvRecording,
  analyzeAvRecording,
  onAvPoseFrame,
  onAvSessionError,
  pollAvDiagnosticLog,
  setAvCameraActive,
} from "@/lib/native-av-preview";
import { visionJointsToWorldLandmarks } from "@/lib/vision-body-landmarks";
import { computePixelToMeterScale, scaleWorldLandmarks, worldVerticalSign, type PoseFrame } from "@/lib/pose-tracking";
import { summarizeRotation } from "@/lib/rotation-tracking";
import { summarizeSwing } from "@/lib/swing-tracking";
import type { Landmark } from "@mediapipe/tasks-vision";
import { videoFilenameForBlob } from "@/lib/video-recording";
import { type SwingSetMetrics } from "@/components/ar-swing-tracker-dialog";

const EMPTY_SWING_METRICS: SwingSetMetrics = {
  peakSeparationDeg: null,
  tempoRatio: null,
  backswingMs: null,
  downswingMs: null,
  headSwayCm: null,
  rotationTrace: [],
};

const MIN_CALIBRATION_SAMPLES = 5;

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** AVFoundation + Vision twin of ar-swing-tracker-dialog.tsx (which stays completely
 * untouched, per the plan's staged-rollout scope) -- the fourth real tracker on the new
 * pipeline. Same "no implement to follow" reasoning as Jump/Mechanics: rotation (shoulder/hip
 * separation), tempo, and head sway are all body-joint measurements, deliberately not
 * tracking the club/bat itself (see ar-swing-tracker-dialog.tsx's own comment on why that's
 * separate, harder, unvalidated work) -- so this needed no new native object-tracking risk.
 *
 * Only headSwayCm is genuinely scale-dependent (a real centimeter distance); peakSeparationDeg
 * is an angle and tempoRatio/backswingMs/downswingMs are timing -- all scale-invariant, same
 * split reasoning as av-mechanics-tracker-dialog.tsx. headSwayCm alone gets nulled out when
 * this take couldn't calibrate; everything else stays valid regardless.
 *
 * Also matches the ARKit original's own shape in one more way worth calling out: neither
 * dialog has a review step -- stopTracking computes metrics and calls onCapture directly,
 * closing the dialog immediately, same as here (SwingSetMetrics displays wherever the caller
 * puts it after the fact, not inside this dialog). */
export function AvSwingTrackerDialog({
  open,
  onOpenChange,
  sport,
  heightIn,
  recordVideo,
  onCapture,
  videoContext,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sport: "golf" | "baseball";
  heightIn?: number | null;
  recordVideo?: boolean;
  onCapture: (metrics: SwingSetMetrics, videoUrl?: string) => void;
  videoContext?: VideoRecordContext;
}) {
  const label = sport === "golf" ? "Golf Swing" : "Baseball Swing";
  const containerRef = useRef<HTMLDivElement>(null);
  const [recording, setRecording] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [supportError, setSupportError] = useState<string | undefined>(undefined);
  const [diagLog, setDiagLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [analyzedFrames, setAnalyzedFrames] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const rawFramesRef = useRef<{ t: number; worldLandmarks: Landmark[] }[]>([]);
  const recordingPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRecording(false);
    setAnalyzing(false);
    setError(null);
    setDiagLog([]);
    setAnalyzedFrames(0);
    rawFramesRef.current = [];
    isAvBodyTrackingSupported().then(({ supported: isSupported, error: supportErr }) => {
      setSupported(isSupported);
      setSupportError(supportErr);
    });
  }, [open]);

  useEffect(() => {
    if (!open || analyzing) {
      setAvCameraActive(false);
      void stopAvPreview();
      return;
    }
    let cancelled = false;
    let rafId: number | null = null;
    let started = false;
    let waitFrames = 0;
    const MAX_WAIT_FRAMES = 180;

    function onResize() {
      const r = containerRef.current?.getBoundingClientRect();
      if (r) void updateAvPreviewRect(r);
    }

    function tryStart() {
      if (cancelled) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        waitFrames++;
        if (waitFrames > MAX_WAIT_FRAMES) return;
        rafId = requestAnimationFrame(tryStart);
        return;
      }
      started = true;
      setAvCameraActive(true);
      startAvPreview(rect).catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not start camera");
      });
      window.addEventListener("resize", onResize);
    }

    tryStart();
    return () => {
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      if (started) {
        setAvCameraActive(false);
        void stopAvPreview();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, analyzing]);

  useEffect(() => {
    if (!open) return;
    return onAvSessionError(setError);
  }, [open]);

  useEffect(() => {
    if (!open || analyzing) return;
    return pollAvDiagnosticLog(setDiagLog);
  }, [open, analyzing]);

  useEffect(() => {
    return () => {
      if (recordingPathRef.current) void deleteAvRecording(recordingPathRef.current);
    };
  }, []);

  function startTracking() {
    rawFramesRef.current = [];
    setRecording(true);
    setError(null);
    startAvRecording().catch((err) => {
      setError(err instanceof Error ? err.message : "Recording failed to start");
      setRecording(false);
    });
  }

  async function stopTracking() {
    setRecording(false);
    setAnalyzing(true);
    setAnalyzedFrames(0);

    let blob: Blob;
    let path: string;
    try {
      ({ blob, path } = await stopAvRecording());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the recording");
      setAnalyzing(false);
      return;
    }
    recordingPathRef.current = path;

    const unsubscribe = onAvPoseFrame((frame) => {
      if (!frame.tracked) return;
      rawFramesRef.current.push({ t: frame.timestamp * 1000, worldLandmarks: visionJointsToWorldLandmarks(frame) });
      setAnalyzedFrames((n) => n + 1);
    });
    try {
      await analyzeAvRecording(path);
    } catch (err) {
      unsubscribe();
      setError(err instanceof Error ? err.message : "Analysis failed");
      setAnalyzing(false);
      void deleteAvRecording(path);
      recordingPathRef.current = null;
      return;
    }
    unsubscribe();
    void deleteAvRecording(path);
    recordingPathRef.current = null;
    setAnalyzing(false);

    await finishTracking(blob);
  }

  async function finishTracking(blob: Blob) {
    let lastSign: 1 | -1 = 1;
    const scaleSamples: number[] = [];
    for (const f of rawFramesRef.current) {
      const sign: 1 | -1 = worldVerticalSign(f.worldLandmarks) ?? lastSign;
      lastSign = sign;
      if (!heightIn) continue;
      const candidate = computePixelToMeterScale(f.worldLandmarks, sign, heightIn);
      if (candidate != null) scaleSamples.push(candidate);
    }
    const scaleFactor = scaleSamples.length >= MIN_CALIBRATION_SAMPLES ? medianOf(scaleSamples) : null;

    const frames: PoseFrame[] = rawFramesRef.current.map((f) => ({
      t: f.t,
      landmarks: [],
      worldLandmarks: scaleFactor != null ? scaleWorldLandmarks(f.worldLandmarks, scaleFactor) : f.worldLandmarks,
    }));

    const rotation = summarizeRotation(frames);
    const swing = summarizeSwing(frames);
    const metrics: SwingSetMetrics | null =
      rotation || swing.phases
        ? {
            peakSeparationDeg: rotation?.peakSeparationDeg ?? null,
            tempoRatio: swing.phases?.tempoRatio ?? null,
            backswingMs: swing.phases?.backswingMs ?? null,
            downswingMs: swing.phases?.downswingMs ?? null,
            // Only headSwayCm is scale-dependent -- see this file's own comment.
            headSwayCm: scaleFactor != null ? swing.headSwayCm : null,
            rotationTrace: rotation?.trace ?? [],
          }
        : null;

    if (!metrics) {
      if (recordVideo) {
        setSaving(true);
        setUploadProgress(0);
        try {
          const filename = videoFilenameForBlob(blob, "form-check");
          const result = await uploadOrQueueVideo(blob, filename, videoContext ?? { label }, setUploadProgress);
          toast.error(
            result.status === "queued"
              ? "Couldn't get a clean read -- make sure your whole swing stays in frame. (No Wi-Fi -- video saved on your device, will upload once connected.)"
              : "Couldn't get a clean read -- make sure your whole swing stays in frame. (Video saved for your coach.)",
          );
          if (result.status === "queued") {
            if (!hasWarnedAboutQueueing()) {
              markWarnedAboutQueueing();
              toast.info(
                "You can also upload a queued video manually anytime -- even over cellular -- from the Video Bank.",
                { duration: 10000 },
              );
            }
            onCapture(EMPTY_SWING_METRICS);
          } else {
            onCapture(EMPTY_SWING_METRICS, result.url);
          }
          onOpenChange(false);
        } catch (err) {
          const detail = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
          toast.error(`Couldn't get a clean read, and the video didn't save either: ${detail}`);
        } finally {
          setSaving(false);
        }
      } else {
        toast.error("Couldn't get a clean read -- make sure your whole swing stays in frame.");
      }
      return;
    }

    if (!recordVideo) {
      onCapture(metrics);
      onOpenChange(false);
      return;
    }

    setSaving(true);
    setUploadProgress(0);
    try {
      const filename = videoFilenameForBlob(blob, "form-check");
      const result = await uploadOrQueueVideo(blob, filename, videoContext ?? { label }, setUploadProgress);
      if (result.status === "queued") {
        if (!hasWarnedAboutQueueing()) {
          markWarnedAboutQueueing();
          toast.info(
            "No Wi-Fi -- this video is saved on your device and will upload automatically once you're connected. You can also upload it manually anytime from the Video Bank, even over cellular.",
            { duration: 10000 },
          );
        }
        onCapture(metrics);
      } else {
        onCapture(metrics, result.url);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Saved the set, but the clip failed to upload");
      onCapture(metrics);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-transparent backdrop-blur-none"
        className="inset-0 top-0 left-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-transparent p-0 overflow-hidden [&>button]:hidden"
      >
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

            {recording && (
              <div className="absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-sm font-bold text-white backdrop-blur-sm">
                <Circle className="h-2.5 w-2.5 animate-pulse fill-destructive text-destructive" />
                Recording -- take your swing, then tap Stop
              </div>
            )}

            {analyzing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                <p className="text-sm text-white">Analyzing swing -- {analyzedFrames} frames processed…</p>
              </div>
            )}

            {!recording && !analyzing && diagLog.length > 0 && (
              <div className="absolute left-2 top-2 z-10 select-text space-y-0.5 rounded-md bg-black/60 px-2 py-1 font-mono text-[9px] leading-tight text-white/80">
                {diagLog.slice(-3).map((line, i) => (
                  <div key={i} className="text-white/60">
                    {line}
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-sm text-white">
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

          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 bg-black/70 px-3 py-4 backdrop-blur-sm">
            {!recording && !analyzing && (
              <Button size="lg" onClick={startTracking} disabled={!supported || saving}>
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
            {analyzing && (
              <Button size="lg" variant="secondary" disabled>
                {saving ? `Saving… ${Math.round(uploadProgress * 100)}%` : "Analyzing…"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
