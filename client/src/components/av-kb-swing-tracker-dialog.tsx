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
import { Circle, Square, X, XCircle, AlertTriangle } from "lucide-react";
import { useAvBodyTracking } from "@/lib/use-av-body-tracking";
import { visionJointsToWorldLandmarks } from "@/lib/vision-body-landmarks";
import type { PoseFrame as NativePoseFrame } from "@/lib/native-av-preview";
import { calibrateFromFrames, scaleWorldLandmarks, POSE_LANDMARKS, visible } from "@/lib/pose-tracking";
import { summarizeKbSwingSet, type KbSwingSetMetrics } from "@/lib/kb-swing-tracking";
import type { TrackedPoint } from "@/lib/bar-tracking";
import { videoFilenameForBlob } from "@/lib/video-recording";

/** AVFoundation + Vision kettlebell swing tracking -- the "arc" trajectory pattern's first
 * built mode (see kb-swing-tracking.ts's own file comment for the full reasoning: a swing's
 * forward-back arc needs full-3D peak speed, not the vertical-only formula bar_path/full/jump
 * use). Genuinely new, no ARKit equivalent was ever built for this, same category as
 * av-medball-tracker-dialog.tsx.
 *
 * Tracks the wrist MIDPOINT directly rather than a separate implement -- a two-handed swing's
 * grip sits right on the bell, so the wrist position is already a faithful proxy for the bell's
 * own position (unlike a barbell held away from the body, which genuinely needs
 * AvImplementTracker). This keeps the dialog structurally identical to AvJumpTrackerDialog:
 * record, calibrate from the athlete's own height, build a trace from body joints alone, hand
 * it to kb-swing-tracking.ts's own summarizeKbSwingSet.
 *
 * Calibration is required, same reasoning as every other AV dialog needing real-world scale --
 * Vision's worldLandmarks-slot values are pixel-space until calibrateFromFrames scales them. */

const EMPTY_KB_SWING_METRICS: KbSwingSetMetrics = {
  peakSpeedMps: 0,
  meanSpeedMps: 0,
  peakHeightCm: 0,
  repBreakdown: [],
};

const SHOW_DIAGNOSTIC_OVERLAY = false;

export function AvKbSwingTrackerDialog({
  open,
  onOpenChange,
  heightIn,
  recordVideo,
  onCapture,
  videoContext,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heightIn?: number | null;
  recordVideo?: boolean;
  onCapture: (metrics: KbSwingSetMetrics, videoUrl?: string) => void;
  videoContext?: VideoRecordContext;
}) {
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const {
    containerRef,
    supported,
    supportError,
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

  async function saveEmptyAndWarn(blob: Blob, message: string) {
    if (recordVideo) {
      setSaving(true);
      setUploadProgress(0);
      try {
        const filename = videoFilenameForBlob(blob, "form-check");
        const result = await uploadOrQueueVideo(blob, filename, videoContext ?? { label: "Kettlebell Swing" }, setUploadProgress);
        toast.error(
          result.status === "queued"
            ? `${message} (No Wi-Fi -- video saved on your device, will upload for your coach once connected.)`
            : `${message} (Video saved for your coach.)`,
        );
        if (result.status === "queued") {
          if (!hasWarnedAboutQueueing()) {
            markWarnedAboutQueueing();
            toast.info(
              "You can also upload a queued video manually anytime -- even over cellular -- from the Video Bank.",
              { duration: 10000 },
            );
          }
          onCapture(EMPTY_KB_SWING_METRICS);
        } else {
          onCapture(EMPTY_KB_SWING_METRICS, result.url);
        }
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

  async function stopTracking() {
    const result = await stopRecordingAndAnalyze();
    if (!result) return; // error/cancellation already reported by the hook
    await finishWithRecording(result.blob, result.rawFrames);
  }

  async function finishWithRecording(blob: Blob, rawFrames: NativePoseFrame[]) {
    const calibrationInput = rawFrames.map((f) => ({ worldLandmarks: visionJointsToWorldLandmarks(f) }));
    const scaleFactor = calibrateFromFrames(calibrationInput, heightIn);
    if (scaleFactor == null) {
      await saveEmptyAndWarn(
        blob,
        "Couldn't calibrate real-world scale for this take -- make sure your height is set in your profile and you're clearly visible standing at some point in frame.",
      );
      return;
    }

    const trace: TrackedPoint[] = [];
    for (const f of rawFrames) {
      const worldLm = scaleWorldLandmarks(visionJointsToWorldLandmarks(f), scaleFactor);
      const leftWrist = worldLm[POSE_LANDMARKS.LEFT_WRIST];
      const rightWrist = worldLm[POSE_LANDMARKS.RIGHT_WRIST];
      // Midpoint when both hands are visible (a standard two-handed swing); falls back to
      // whichever single wrist is visible for a one-arm swing variant, same "degrade gracefully
      // to a single confident point" pattern bar-tracking.ts's own combined-point fallback uses.
      const leftOk = visible(leftWrist);
      const rightOk = visible(rightWrist);
      if (!leftOk && !rightOk) continue;
      const x = leftOk && rightOk ? (leftWrist.x + rightWrist.x) / 2 : leftOk ? leftWrist.x : rightWrist.x;
      const y = leftOk && rightOk ? (leftWrist.y + rightWrist.y) / 2 : leftOk ? leftWrist.y : rightWrist.y;
      const z = leftOk && rightOk ? (leftWrist.z + rightWrist.z) / 2 : leftOk ? leftWrist.z : rightWrist.z;
      const confidence = leftOk && rightOk ? Math.min(leftWrist.visibility, rightWrist.visibility) : leftOk ? leftWrist.visibility : rightWrist.visibility;
      trace.push({ t: f.timestamp * 1000, x, y, z, confidence });
    }

    const metrics = summarizeKbSwingSet(trace, heightIn);
    if (!metrics) {
      await saveEmptyAndWarn(blob, "Couldn't get a clean read -- make sure both hands and the kettlebell stay in frame throughout the set.");
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
      const result = await uploadOrQueueVideo(blob, filename, videoContext ?? { label: "Kettlebell Swing" }, setUploadProgress);
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

            {SHOW_DIAGNOSTIC_OVERLAY && (
              <div className="absolute left-3 right-16 top-[max(0.75rem,env(safe-area-inset-top))] z-10 select-text space-y-0.5 rounded-md bg-black/60 px-2 py-1.5 font-mono text-[9px] leading-tight text-white/80 backdrop-blur-sm">
                <div>supported={String(supported)} analyzedFrames={analyzedFrames}</div>
                {diagLog.map((line, i) => (
                  <div key={i} className="text-white/60">
                    {line}
                  </div>
                ))}
              </div>
            )}

            {recording && (
              <div className="absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-sm font-bold text-white backdrop-blur-sm">
                <Circle className="h-2.5 w-2.5 animate-pulse fill-destructive text-destructive" />
                Recording -- take your swings, then tap Stop
              </div>
            )}

            {analyzing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                <p className="text-sm text-white">Analyzing recording -- {analyzedFrames} frames processed…</p>
                <Button variant="outline" size="sm" onClick={cancelAnalysis}>
                  <XCircle className="h-4 w-4" />
                  Cancel
                </Button>
              </div>
            )}

            {!recording && !analyzing && !heightIn && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md bg-amber-500/80 px-3 py-2 text-center text-sm font-semibold text-black">
                Add your height in your profile to get calibrated numbers from this camera.
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
              <Button
                size="lg"
                onClick={() => {
                  setError(null);
                  startRecording();
                }}
                disabled={!supported || saving || !heightIn}
              >
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
