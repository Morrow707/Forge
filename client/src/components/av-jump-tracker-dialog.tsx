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
import {
  deriveJumpPoint,
  detectFormFaults,
  computeLandingAsymmetry,
  computePixelToMeterScale,
  scaleWorldLandmarks,
  worldVerticalSign,
  type PoseFrame,
  type FormFaultThresholds,
} from "@/lib/pose-tracking";
import { summarizeJumpSet, type JumpSetMetrics } from "@/lib/jump-tracking";
import type { TrackedPoint } from "@/lib/bar-tracking";
import type { Landmark } from "@mediapipe/tasks-vision";
import { videoFilenameForBlob } from "@/lib/video-recording";

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
 * Record-first, analyze-later like Sprint: the whole set gets recorded, then Vision runs
 * against the finished clip once Stop is tapped, and BOTH the trace AND the height-calibration
 * samples are built from that same complete set of frames in one pass afterward -- unlike the
 * ARKit version's continuous live sampling, calibration here can only happen post-hoc since
 * there's no live per-frame stream to sample from during capture. */

const SHOW_DIAGNOSTIC_OVERLAY = false;

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const EMPTY_JUMP_METRICS: JumpSetMetrics = {
  bestJumpHeightCm: 0,
  bestHorizontalDistanceCm: null,
  avgGroundContactSeconds: null,
  reactiveStrengthIndex: null,
  repBreakdown: [],
  pathTrace: [],
  formFaults: [],
};

const MIN_CALIBRATION_SAMPLES = 5;

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

  // Raw, uncalibrated worldLandmarks straight off the bridge -- calibration
  // needs the complete set before it can compute a scale factor, so these
  // are only turned into a final trace/framesRef.current after
  // analyzeAvRecording resolves, not as each poseFrame streams in.
  const rawFramesRef = useRef<{ t: number; worldLandmarks: Landmark[] }[]>([]);
  const traceRef = useRef<TrackedPoint[]>([]);
  const framesRef = useRef<PoseFrame[]>([]);
  const recordingPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRecording(false);
    setAnalyzing(false);
    setError(null);
    setDiagLog([]);
    setAnalyzedFrames(0);
    rawFramesRef.current = [];
    traceRef.current = [];
    framesRef.current = [];
    isAvBodyTrackingSupported().then(({ supported: isSupported, error: supportErr }) => {
      setSupported(isSupported);
      setSupportError(supportErr);
    });
  }, [open]);

  // Camera only needs to be live while framing/recording -- released the
  // instant analysis starts, same reasoning as av-sprint-tracker-dialog.tsx.
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
    setError(null);
    rawFramesRef.current = [];
    traceRef.current = [];
    framesRef.current = [];
    setRecording(true);
    startAvRecording().catch((err) => {
      setError(err instanceof Error ? err.message : "Could not start recording");
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
      setError(err instanceof Error ? err.message : "Recording failed");
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

    await finishWithRecording(blob);
  }

  async function finishWithRecording(blob: Blob) {
    // Calibration pass: one scale factor for the whole take, computed from
    // every frame the athlete was roughly upright in (mid-jump/mid-squat
    // frames naturally fail computePixelToMeterScale's own standing-span
    // gate and don't contribute) -- see this file's own comment on why
    // this can't happen live the way ARKit's continuous sampling does.
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

    if (scaleFactor == null) {
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
            onCapture(EMPTY_JUMP_METRICS);
          } else {
            onCapture(EMPTY_JUMP_METRICS, result.url);
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

    framesRef.current = rawFramesRef.current.map((f) => ({
      t: f.t,
      landmarks: [],
      worldLandmarks: scaleWorldLandmarks(f.worldLandmarks, scaleFactor),
    }));
    traceRef.current = framesRef.current
      .map((f) => {
        const point = deriveJumpPoint(f.worldLandmarks);
        return point ? { t: f.t, x: point.x, y: point.y, z: point.z } : null;
      })
      .filter((p): p is TrackedPoint => p != null);

    const metrics = summarizeJumpSet(traceRef.current, heightIn, jumpHeightOutlierPercent ?? undefined);
    if (!metrics) {
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
            onCapture(EMPTY_JUMP_METRICS);
          } else {
            onCapture(EMPTY_JUMP_METRICS, result.url);
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
      framesRef.current,
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
      framesRef.current,
      metrics.repBreakdown.map((rep) => ({ landingT: rep.landingT })),
    );

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
                Recording -- take your reps, then tap Stop
              </div>
            )}

            {analyzing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                <p className="text-sm text-white">Analyzing recording -- {analyzedFrames} frames processed…</p>
              </div>
            )}

            {!recording && !analyzing && !heightIn && (
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
            {!recording && !analyzing && (
              <Button size="lg" onClick={startTracking} disabled={!supported || saving || !heightIn}>
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
