import { useEffect, useState } from "react";
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
import { Circle, Square, AlertTriangle, X, XCircle } from "lucide-react";
import { useAvBodyTracking } from "@/lib/use-av-body-tracking";
import { visionJointsToWorldLandmarks } from "@/lib/vision-body-landmarks";
import {
  calibrateFromFrames,
  calibrationMethodBreakdown,
  scaleWorldLandmarks,
  type PoseFrame,
  type SetTrustScore,
} from "@/lib/pose-tracking";
import { summarizeRotation } from "@/lib/rotation-tracking";
import { summarizeSwing } from "@/lib/swing-tracking";
import type { Landmark } from "@mediapipe/tasks-vision";
import { videoFilenameForBlob } from "@/lib/video-recording";
import { type SwingSetMetrics } from "@/components/ar-swing-tracker-dialog";
import type { CaptureDeviceInfo, PoseFrame as NativePoseFrame } from "@/lib/native-av-preview";
import { buildTrackingDiagnostics, type TrackingDiagnostics } from "@/lib/tracking-diagnostics";

// SwingSetMetrics itself is defined in ar-swing-tracker-dialog.tsx (untouched, dead-code
// fallback only -- see this file's own header comment), so the trust score this dialog adds is
// carried as an extension here rather than a change to that shared type.
export type AvSwingSetMetrics = SwingSetMetrics & {
  trust: SetTrustScore | null;
  captureDeviceInfo: CaptureDeviceInfo | null;
  trackingDiagnostics?: TrackingDiagnostics | null;
};

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
 * puts it after the fact, not inside this dialog).
 *
 * Camera/recording/analysis plumbing comes from useAvBodyTracking (shared with every other AV
 * tracker dialog) -- what's left here is purely swing-specific: calibration application,
 * summarizeRotation/summarizeSwing, and the save/upload flow. */
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
  onCapture: (metrics: AvSwingSetMetrics, videoUrl?: string) => void;
  videoContext?: VideoRecordContext;
}) {
  const label = sport === "golf" ? "Golf Swing" : "Baseball Swing";
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const {
    containerRef,
    supported,
    supportError,
    cameraPermission,
    error,
    setError,
    diagLog,
    recording,
    analyzing,
    analyzedFrames,
    startRecording,
    stopRecordingAndAnalyze,
    cancelAnalysis,
  } = useAvBodyTracking(open);

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setUploadProgress(0);
  }, [open]);

  async function stopTracking() {
    const result = await stopRecordingAndAnalyze();
    if (!result) return; // error/cancellation already reported by the hook
    await finishTracking(
      result.blob,
      result.rawFrames.map((f) => ({ t: f.timestamp * 1000, worldLandmarks: visionJointsToWorldLandmarks(f) })),
      result.captureDeviceInfo,
      result.rawFrames,
      result.recordingStats,
    );
  }

  async function finishTracking(
    blob: Blob,
    rawFrames: { t: number; worldLandmarks: Landmark[] }[],
    captureDeviceInfo: CaptureDeviceInfo,
    nativeRawFrames: NativePoseFrame[],
    recordingStats: { frameCount: number; trackedFrameCount: number; elapsedSeconds: number },
  ) {
    const scaleFactor = calibrateFromFrames(rawFrames, heightIn);
    const calibrationFrames = calibrationMethodBreakdown(rawFrames);

    const frames: PoseFrame[] = rawFrames.map((f) => ({
      t: f.t,
      landmarks: [],
      worldLandmarks: scaleFactor != null ? scaleWorldLandmarks(f.worldLandmarks, scaleFactor) : f.worldLandmarks,
    }));

    const rotation = summarizeRotation(frames);
    const swing = summarizeSwing(frames);
    const metrics: AvSwingSetMetrics | null =
      rotation || swing.phases
        ? {
            peakSeparationDeg: rotation?.peakSeparationDeg ?? null,
            tempoRatio: swing.phases?.tempoRatio ?? null,
            backswingMs: swing.phases?.backswingMs ?? null,
            downswingMs: swing.phases?.downswingMs ?? null,
            // Only headSwayCm is scale-dependent -- see this file's own comment.
            headSwayCm: scaleFactor != null ? swing.headSwayCm : null,
            rotationTrace: rotation?.trace ?? [],
            trust: rotation?.trust ?? null,
            captureDeviceInfo,
            trackingDiagnostics: buildTrackingDiagnostics({
              outcome: "tracked",
              rawFrames: nativeRawFrames,
              recording: recordingStats,
              calibration: { scaleFactor, ...calibrationFrames },
            }),
          }
        : null;

    if (!metrics) {
      const diagnostics = buildTrackingDiagnostics({
        outcome: "empty_no_clean_read",
        message: "Couldn't get a clean read -- make sure your whole swing stays in frame.",
        rawFrames: nativeRawFrames,
        recording: recordingStats,
        calibration: { scaleFactor, ...calibrationFrames },
      });
      const emptyMetrics: AvSwingSetMetrics = { ...EMPTY_SWING_METRICS, captureDeviceInfo, trackingDiagnostics: diagnostics };
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
            onCapture(emptyMetrics);
          } else {
            onCapture(emptyMetrics, result.url);
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
        className="inset-0 top-0 left-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-transparent backdrop-blur-none p-0 overflow-hidden [&>button]:hidden"
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
                Recording
              </div>
            )}

            {(analyzing || saving) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                <p className="text-sm text-white">
                  {saving
                    ? `Saving your video… ${Math.round(uploadProgress * 100)}%`
                    : `Analyzing swing -- ${analyzedFrames} frames processed…`}
                </p>
                {!saving && (
                  <Button variant="outline" size="sm" onClick={cancelAnalysis}>
                    <XCircle className="h-4 w-4" />
                    Cancel
                  </Button>
                )}
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
            {!recording && !analyzing && !saving && (
              <Button
                size="lg"
                onClick={() => {
                  setError(null);
                  startRecording();
                }}
                disabled={!supported}
              >
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
            {(analyzing || saving) && (
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
