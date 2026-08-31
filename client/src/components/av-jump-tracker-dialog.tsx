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
import {
  deriveJumpPoint,
  detectFormFaults,
  computeLandingAsymmetry,
  calibrateFromFrames,
  calibrationMethodBreakdown,
  scaleWorldLandmarks,
  type PoseFrame,
  type FormFaultThresholds,
} from "@/lib/pose-tracking";
import { summarizeJumpSet, type JumpSetMetrics } from "@/lib/jump-tracking";
import type { CaptureDeviceInfo, PoseFrame as NativePoseFrame } from "@/lib/native-av-preview";
import type { TrackedPoint } from "@/lib/bar-tracking";
import { videoFilenameForBlob } from "@/lib/video-recording";
import { buildTrackingDiagnostics } from "@/lib/tracking-diagnostics";

/** AVFoundation + Vision jump tracking (vertical/broad/box) -- the second real tracker built
 * on the new pipeline, directly parallel to ar-jump-tracker-dialog.tsx (which stays completely
 * untouched as a fallback). Jump was next for the same reason it went first off MediaPipe
 * originally: no implement to follow, just body joints -- summarizeJumpSet and
 * deriveJumpPoint run completely unmodified here too, same as the ARKit version, now fed by
 * vision-body-landmarks.ts instead of ar-body-landmarks.ts.
 *
 * The one thing this mode can't inherit from Sprint's Phase 4 conversion: calibration isn't
 * optional here the way it effectively was for ARKit. ARKit/MediaPipe's worldLandmarks are
 * already an approximately-real-meters estimate even with zero correction applied (see
 * computeHeightScaleCorrection's own comment) -- height calibration there is a NUDGE. Vision's
 * worldLandmarks-slot values (see vision-body-landmarks.ts) are pixel-space, with no
 * real-world meaning at all until scaled -- see computePixelToMeterScale's own comment on why
 * that's a genuinely different calibration problem. Without a successful calibration this
 * mode reports no jump height at all (same "couldn't get a clean read" path ArJumpTrackerDialog
 * already has for its own different failure reason), rather than a number computed from
 * meaningless pixel units.
 *
 * Camera/recording/analysis plumbing comes from useAvBodyTracking (shared with every other AV
 * tracker dialog) -- what's left here is purely jump-specific: the calibration application,
 * summarizeJumpSet, and the save/upload flow. */

const EMPTY_JUMP_METRICS: JumpSetMetrics = {
  bestJumpHeightCm: 0,
  bestHorizontalDistanceCm: null,
  avgGroundContactSeconds: null,
  reactiveStrengthIndex: null,
  repBreakdown: [],
  pathTrace: [],
  formFaults: [],
};

export function AvJumpTrackerDialog({
  open,
  onOpenChange,
  heightIn,
  movementType,
  equipment,
  recordVideo,
  onCapture,
  videoContext,
  formFaultThresholds,
  jumpHeightOutlierPercent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heightIn?: number | null;
  movementType?: string | null;
  equipment?: string | null;
  recordVideo?: boolean;
  onCapture: (metrics: JumpSetMetrics, videoUrl?: string) => void;
  videoContext?: VideoRecordContext;
  formFaultThresholds?: Partial<Record<keyof FormFaultThresholds, number | null>> | null;
  jumpHeightOutlierPercent?: number | null;
}) {
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
    await finishWithRecording(
      result.blob,
      result.rawFrames.map((f) => ({ t: f.timestamp * 1000, worldLandmarks: visionJointsToWorldLandmarks(f) })),
      result.captureDeviceInfo,
      result.rawFrames,
      result.recordingStats,
    );
  }

  async function finishWithRecording(
    blob: Blob,
    rawFrames: { t: number; worldLandmarks: PoseFrame["worldLandmarks"] }[],
    captureDeviceInfo: CaptureDeviceInfo,
    nativeRawFrames: NativePoseFrame[],
    recordingStats: { frameCount: number; trackedFrameCount: number; elapsedSeconds: number },
  ) {
    const scaleFactor = calibrateFromFrames(rawFrames, heightIn);
    const calibrationFrames = calibrationMethodBreakdown(rawFrames);

    if (scaleFactor == null) {
      const diagnostics = buildTrackingDiagnostics({
        outcome: "empty_calibration_failed",
        message:
          "Couldn't calibrate real-world scale for this take -- make sure your height is set in your profile and you're clearly visible standing at some point in frame.",
        rawFrames: nativeRawFrames,
        recording: recordingStats,
        calibration: { scaleFactor: null, ...calibrationFrames },
      });
      const emptyMetrics: JumpSetMetrics = { ...EMPTY_JUMP_METRICS, captureDeviceInfo, trackingDiagnostics: diagnostics };
      // No number is better than a wrong one -- see this file's own comment
      // on why an uncalibrated Vision reading can't degrade gracefully the
      // way ARKit's can. Same "couldn't get a clean read, but the clip
      // still saves" UX ArJumpTrackerDialog already has for its own
      // different failure reason (summarizeJumpSet returning null).
      if (recordVideo) {
        setSaving(true);
        setUploadProgress(0);
        try {
          const filename = videoFilenameForBlob(blob, "form-check");
          const result = await uploadOrQueueVideo(blob, filename, videoContext ?? { label: "Jump" }, setUploadProgress);
          toast.error(
            result.status === "queued"
              ? "Couldn't calibrate real-world scale for this take -- make sure your height is set in your profile and you're clearly visible standing at some point in frame. (No Wi-Fi -- video saved on your device, will upload for your coach once connected.)"
              : "Couldn't calibrate real-world scale for this take -- make sure your height is set in your profile and you're clearly visible standing at some point in frame. (Video saved for your coach.)",
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
          toast.error(`Couldn't calibrate, and the video didn't save either: ${detail}`);
        } finally {
          setSaving(false);
        }
      } else {
        toast.error(
          "Couldn't calibrate real-world scale for this take -- make sure your height is set in your profile and you're clearly visible standing at some point in frame.",
        );
      }
      return;
    }

    const frames: PoseFrame[] = rawFrames.map((f) => ({
      t: f.t,
      landmarks: [],
      worldLandmarks: scaleWorldLandmarks(f.worldLandmarks, scaleFactor),
    }));
    const trace: TrackedPoint[] = frames
      .map((f) => {
        const point = deriveJumpPoint(f.worldLandmarks);
        return point ? { t: f.t, x: point.x, y: point.y, z: point.z } : null;
      })
      .filter((p): p is TrackedPoint => p != null);

    const metrics = summarizeJumpSet(trace, heightIn, jumpHeightOutlierPercent ?? undefined);
    if (!metrics) {
      const diagnostics = buildTrackingDiagnostics({
        outcome: "empty_no_clean_read",
        message: "Couldn't get a clean read -- make sure your feet leave the ground clearly in frame.",
        rawFrames: nativeRawFrames,
        recording: recordingStats,
        calibration: { scaleFactor, ...calibrationFrames },
      });
      const emptyMetrics: JumpSetMetrics = { ...EMPTY_JUMP_METRICS, captureDeviceInfo, trackingDiagnostics: diagnostics };
      if (recordVideo) {
        setSaving(true);
        setUploadProgress(0);
        try {
          const filename = videoFilenameForBlob(blob, "form-check");
          const result = await uploadOrQueueVideo(blob, filename, videoContext ?? { label: "Jump" }, setUploadProgress);
          toast.error(
            result.status === "queued"
              ? "Couldn't get a clean read -- make sure your feet leave the ground clearly in frame. (No Wi-Fi -- video saved on your device, will upload for your coach once connected.)"
              : "Couldn't get a clean read -- make sure your feet leave the ground clearly in frame. (Video saved for your coach.)",
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
        toast.error("Couldn't get a clean read -- make sure your feet leave the ground clearly in frame.");
      }
      return;
    }

    metrics.formFaults = detectFormFaults(
      frames,
      0,
      "jump",
      movementType,
      equipment,
      undefined,
      undefined,
      metrics.repBreakdown.map((r) => ({ startT: r.takeoffT, endT: r.landingT })),
      formFaultThresholds,
    );
    metrics.landingAsymmetry = computeLandingAsymmetry(
      frames,
      metrics.repBreakdown.map((rep) => ({ landingT: rep.landingT })),
    );
    metrics.captureDeviceInfo = captureDeviceInfo;
    metrics.trackingDiagnostics = buildTrackingDiagnostics({
      outcome: "tracked",
      rawFrames: nativeRawFrames,
      recording: recordingStats,
      calibration: { scaleFactor, ...calibrationFrames },
    });

    if (!recordVideo) {
      onCapture(metrics);
      onOpenChange(false);
      return;
    }

    setSaving(true);
    setUploadProgress(0);
    try {
      const filename = videoFilenameForBlob(blob, "form-check");
      const result = await uploadOrQueueVideo(blob, filename, videoContext ?? { label: "Jump" }, setUploadProgress);
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
                    : `Analyzing recording -- ${analyzedFrames} frames processed…`}
                </p>
                {!saving && (
                  <Button variant="outline" size="sm" onClick={cancelAnalysis}>
                    <XCircle className="h-4 w-4" />
                    Cancel
                  </Button>
                )}
              </div>
            )}

            {!recording && !analyzing && !saving && !heightIn && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md bg-amber-500/80 px-3 py-2 text-center text-sm font-semibold text-black">
                Add your height in your profile to get calibrated jump numbers from this camera.
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
                disabled={!supported || !heightIn}
              >
                <Circle className="h-4 w-4 fill-current" />
                Start Jump Set
              </Button>
            )}
            {recording && (
              <Button size="lg" variant="secondary" onClick={stopTracking}>
                <Square className="h-4 w-4" />
                Stop Set
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
