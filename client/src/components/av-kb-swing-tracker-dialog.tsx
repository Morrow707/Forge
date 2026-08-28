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
import { visionJointsToWorldLandmarks, visionImplementToPoint, type ImplementPoint } from "@/lib/vision-body-landmarks";
import type { PoseFrame as NativePoseFrame } from "@/lib/native-av-preview";
import {
  calibrateFromFrames,
  scaleWorldLandmarks,
  POSE_LANDMARKS,
  visible,
  percentile,
  blendSpeedEstimates,
} from "@/lib/pose-tracking";
import { summarizeKbSwingSet, MAX_PLAUSIBLE_KB_SWING_SPEED_MPS, type KbSwingSetMetrics } from "@/lib/kb-swing-tracking";
import { MIN_TRACKING_CONFIDENCE, type TrackedPoint } from "@/lib/bar-tracking";
import { videoFilenameForBlob } from "@/lib/video-recording";
import { AvDiagnosticOverlay } from "@/components/av-diagnostic-overlay";

/** AVFoundation + Vision kettlebell swing tracking -- the "arc" trajectory pattern's first
 * built mode (see kb-swing-tracking.ts's own file comment for the full reasoning: a swing's
 * forward-back arc needs full-3D peak speed, not the vertical-only formula bar_path/full/jump
 * use). Genuinely new, no ARKit equivalent was ever built for this, same category as
 * av-medball-tracker-dialog.tsx.
 *
 * Tracks the wrist MIDPOINT as the PRIMARY signal rather than a separate implement -- a
 * two-handed swing's grip sits right on the bell, so the wrist position is already a faithful
 * proxy for the bell's own position (unlike a barbell held away from the body, which genuinely
 * needs AvImplementTracker for its primary trace). This keeps the dialog structurally close to
 * AvJumpTrackerDialog: record, calibrate from the athlete's own height, build a trace from body
 * joints, hand it to kb-swing-tracking.ts's own summarizeKbSwingSet.
 *
 * AvImplementTracker's own bell-tracked speed (f.leftImplement/rightImplement -- already
 * computed every frame for any AV recording, the same data av-medball-tracker-dialog.tsx reads)
 * is used as a SECOND, independent cross-check on the headline peak speed, via
 * pose-tracking.ts's blendSpeedEstimates -- the bell never leaves the hand mid-swing (unlike a
 * thrown med-ball), so this is exactly the "wrist and implement should agree" reasoning this
 * session settled on, generalized from bar_path/full to a mode that doesn't otherwise use the
 * implement tracker at all.
 *
 * Calibration is required, same reasoning as every other AV dialog needing real-world scale --
 * Vision's worldLandmarks-slot values are pixel-space until calibrateFromFrames scales them. */

const EMPTY_KB_SWING_METRICS: KbSwingSetMetrics = {
  peakSpeedMps: 0,
  meanSpeedMps: 0,
  peakHeightCm: 0,
  repBreakdown: [],
  trust: null,
};

// Minimum confident bell-tracked samples before trusting a frame-to-frame speed off
// AvImplementTracker's own trace -- same reasoning as av-medball-tracker-dialog.tsx's identical
// constant: a couple of lucky frames isn't a real trace.
const MIN_BELL_SPEED_SAMPLES = 4;

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
    // AvImplementTracker's own bell-tracked point (pixel-space, scaled the same way as the
    // implement in av-medball-tracker-dialog.tsx) -- kept as a fully separate signal from the
    // wrist-midpoint trace above, not blended frame-by-frame, so a bad bell-tracking frame can
    // never corrupt the primary wrist trace the way it would if the two were averaged together
    // up front.
    const bellPoints: { t: number; x: number; y: number; confidence: number }[] = [];
    for (const f of rawFrames) {
      const worldLm = scaleWorldLandmarks(visionJointsToWorldLandmarks(f), scaleFactor);
      const leftWrist = worldLm[POSE_LANDMARKS.LEFT_WRIST];
      const rightWrist = worldLm[POSE_LANDMARKS.RIGHT_WRIST];
      // Midpoint when both hands are visible (a standard two-handed swing); falls back to
      // whichever single wrist is visible for a one-arm swing variant, same "degrade gracefully
      // to a single confident point" pattern bar-tracking.ts's own combined-point fallback uses.
      const leftOk = visible(leftWrist);
      const rightOk = visible(rightWrist);
      if (leftOk || rightOk) {
        const x = leftOk && rightOk ? (leftWrist.x + rightWrist.x) / 2 : leftOk ? leftWrist.x : rightWrist.x;
        const y = leftOk && rightOk ? (leftWrist.y + rightWrist.y) / 2 : leftOk ? leftWrist.y : rightWrist.y;
        const z = leftOk && rightOk ? (leftWrist.z + rightWrist.z) / 2 : leftOk ? leftWrist.z : rightWrist.z;
        const confidence = leftOk && rightOk ? Math.min(leftWrist.visibility, rightWrist.visibility) : leftOk ? leftWrist.visibility : rightWrist.visibility;
        trace.push({ t: f.timestamp * 1000, x, y, z, confidence });
      }

      const t = f.timestamp * 1000;
      const scalePoint = (raw: ImplementPoint | null) =>
        raw ? { t, x: raw.x * scaleFactor, y: raw.y * scaleFactor, confidence: raw.confidence } : null;
      const leftBell = scalePoint(visionImplementToPoint(f.leftImplement, f));
      const rightBell = scalePoint(visionImplementToPoint(f.rightImplement, f));
      // Both hands grip the SAME bell (unlike a barbell's independent left/right ends), so
      // whichever side tracked more confidently this frame is the better read of the one bell,
      // not something to average together.
      if (leftBell && rightBell) bellPoints.push(leftBell.confidence >= rightBell.confidence ? leftBell : rightBell);
      else if (leftBell) bellPoints.push(leftBell);
      else if (rightBell) bellPoints.push(rightBell);
    }

    const wristMetrics = summarizeKbSwingSet(trace, heightIn);
    if (!wristMetrics) {
      await saveEmptyAndWarn(blob, "Couldn't get a clean read -- make sure both hands and the kettlebell stay in frame throughout the set.");
      return;
    }

    // Cross-check the wrist-derived peak speed against the bell's own tracked speed -- see this
    // file's header comment. Same robust-percentile-over-a-physical-ceiling shape as
    // av-medball-tracker-dialog.tsx's peakImplementSpeed.
    const confidentBellPoints = bellPoints.filter((p) => p.confidence >= MIN_TRACKING_CONFIDENCE);
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
    const wristConfidentSamples = trace.filter((p) => (p.confidence ?? 0) >= MIN_TRACKING_CONFIDENCE);
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
    };

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

            <AvDiagnosticOverlay
              supported={supported}
              supportError={supportError}
              cameraPermission={cameraPermission}
              analyzedFrames={analyzedFrames}
              diagLog={diagLog}
              heightIn={heightIn}
            />

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
