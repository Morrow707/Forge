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
  POSE_LANDMARKS,
  detectFormFaults,
  worldVerticalSign,
  tiltDegreesFromPoints,
  usesSharedBarEquipment,
  assessCameraAlignment,
  guessMovementPattern,
  computeLegDriveAsymmetry,
  wristConfidence,
  calibrateFromFrames,
  scaleWorldLandmarks,
  type PoseFrame,
  type CameraAlignment,
  type FormFaultThresholds,
} from "@/lib/pose-tracking";
import {
  summarizeTrackedSet,
  interpolateOcclusionGap,
  computeArmDriveAsymmetry,
  computeRepTrustScores,
  MIN_TRACKING_CONFIDENCE,
  type RepMetrics,
  type TrackedPoint,
  type VelocitySample,
} from "@/lib/bar-tracking";
import { expectedPatternFromName } from "@/components/bar-tracker-dialog";
import { videoFilenameForBlob } from "@/lib/video-recording";
import type { Landmark } from "@mediapipe/tasks-vision";

/** AVFoundation + Vision bar-path/full mode tracking -- the last tracker mode converted off
 * ARKit (see ArBarTrackerDialog for the fallback this replaces, kept completely untouched per
 * the plan's own Context section). Same "needs a held implement, not just a body joint" problem
 * ArBarTrackerDialog solved for ARKit, now solved for this pipeline by AvImplementTracker.swift
 * -- see that class's own file comment for the algorithm (motion-diff, ported from
 * implement-tracking.ts) and for why it reports a raw Vision-convention point rather than a
 * meters/world position the way both trackers it's descended from do.
 *
 * Left/right fusion mirrors bar-tracker-dialog.tsx's own ORIGINAL MediaPipe formula (a real
 * confidence-weighted average of wrist vs. implement), not ArBarTrackerDialog's simplified
 * workaround (wrist confidence hardcoded to 1). That workaround existed only because ARKit's
 * body skeleton has no continuous per-joint confidence -- Vision's VNRecognizedPoint.confidence
 * is a real, graduated 0-1 score (already threaded through as worldLandmarks[...].visibility by
 * vision-body-landmarks.ts), so this pipeline is actually closer to the MediaPipe case than the
 * ARKit one here, and reusing pose-tracking.ts's own wristConfidence() unmodified is more
 * correct than reproducing ArBarTrackerDialog's constant-1 gap-filler.
 *
 * The real structural difference from ArBarTrackerDialog, same as every other AV dialog: this
 * pipeline is record-first, analyze-later (see AvBodyTrackingPlugin.swift's own comment on why).
 * There's no live per-frame fusion DURING capture -- the whole set gets recorded first, then
 * every frame Vision + AvImplementTracker already produced gets replayed ONCE, in order, through
 * the exact same fusion/tilt/trace-building math ArBarTrackerDialog runs live. That replay needs
 * no refs (unlike the live version) -- it's one synchronous pass inside finishWithRecording, so
 * plain closed-over locals do the same job refs did there.
 *
 * Calibration is NOT optional here, same reasoning as AvJumpTrackerDialog: Vision's
 * worldLandmarks-slot values are pixel-space with no real-world meaning until calibrated (see
 * calibrateFromFrames's own comment), unlike ARKit/MediaPipe's already-approximately-real-meters
 * estimate. Without a successful height-based calibration this mode reports no read at all --
 * "no number is better than a wrong one" -- rather than a velocity/tilt/power number computed
 * from meaningless pixel units. The tolerance-aware reference-object calibration scaffolding in
 * pose-tracking.ts (computeReferenceObjectScale) is a future refinement for when real
 * plate/ball reference photos exist, not wired in here yet.
 *
 * Ported: occlusion-gap interpolation, left/right leg- and arm-drive asymmetry, per-rep trust
 * scores -- all bar-tracking.ts/pose-tracking.ts functions reused unmodified, same gating rules
 * as both dialogs this is descended from (bilateral Squat only for leg drive, bilateral
 * Push/Pull on a shared bar for arm drive).
 *
 * Deliberately NOT ported, matching ArBarTrackerDialog's own accepted scope rather than
 * bar-tracker-dialog.tsx's fuller original: Hands-model grip-point refinement (no MediaPipe
 * Hands here either), and the single-frame implement-vs-wrist grip-offset plausibility check
 * (MAX_PLAUSIBLE_GRIP_OFFSET_M) -- present as an unused constant in ArBarTrackerDialog too. The
 * frame-to-frame isPlausibleVelocity check below, which IS ported, already catches a fused point
 * that jumped somewhere implausible between frames. */

const EMPTY_REP_METRICS: RepMetrics = {
  peakVelocityMps: 0,
  meanVelocityMps: 0,
  concentricSeconds: 0,
  eccentricSeconds: 0,
  barPathDeviationCm: 0,
  barPathTrace: [],
  repBreakdown: [],
  formFaults: [],
  peakPowerWatts: null,
  meanPowerWatts: null,
  eccentricMeanVelocityMps: 0,
  romCm: 0,
  velocityLossPercent: null,
};

const SHOW_DIAGNOSTIC_OVERLAY = false;

function isPlausibleVelocity(
  prev: { x: number; y: number; t: number } | null,
  next: { x: number; y: number; t: number },
): boolean {
  if (!prev) return true;
  const dt = (next.t - prev.t) / 1000;
  if (dt <= 0) return false;
  const MAX_PLAUSIBLE_VELOCITY_MPS = 3;
  const dist = Math.hypot(next.x - prev.x, next.y - prev.y);
  return dist / dt <= MAX_PLAUSIBLE_VELOCITY_MPS;
}

export function AvBarTrackerDialog({
  open,
  onOpenChange,
  mode,
  exerciseName,
  movementType,
  equipment,
  laterality,
  heightIn,
  targetReps,
  loadKg,
  recordVideo,
  onCapture,
  videoContext,
  formFaultThresholds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "bar_path" | "full";
  exerciseName: string;
  movementType?: string | null;
  equipment?: string | null;
  laterality?: string | null;
  heightIn?: number | null;
  targetReps?: number;
  loadKg?: number;
  recordVideo?: boolean;
  onCapture: (metrics: RepMetrics, videoUrl?: string) => void;
  videoContext?: VideoRecordContext;
  formFaultThresholds?: Partial<Record<keyof FormFaultThresholds, number | null>> | null;
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

  const usesSharedBar = usesSharedBarEquipment(equipment);

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setUploadProgress(0);
  }, [open]);

  // Shared by both failure branches below (calibration failed, or
  // summarizeTrackedSet couldn't produce a trustworthy read) -- the coach
  // still wants a video of every set even with no trustworthy numbers to go
  // with it, same reasoning as ArBarTrackerDialog/AvJumpTrackerDialog's own
  // near-identical branches.
  async function saveEmptyAndWarn(blob: Blob, message: string) {
    if (recordVideo) {
      setSaving(true);
      setUploadProgress(0);
      try {
        const filename = videoFilenameForBlob(blob, "form-check");
        const result = await uploadOrQueueVideo(blob, filename, videoContext ?? { label: exerciseName }, setUploadProgress);
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
          onCapture(EMPTY_REP_METRICS);
        } else {
          onCapture(EMPTY_REP_METRICS, result.url);
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
    const frames: PoseFrame[] = [];
    const tiltReadings: number[] = [];
    const leftVelocitySamples: VelocitySample[] = [];
    const rightVelocitySamples: VelocitySample[] = [];
    const rejectionEvents: number[] = [];
    let verticalSign: 1 | -1 = 1;
    let prevFusedLeft: { x: number; y: number; t: number } | null = null;
    let prevFusedRight: { x: number; y: number; t: number } | null = null;
    // Substitutes for ArBarTrackerDialog's "assessed right when Start Set is
    // tapped" moment -- there's no live frame to snapshot in a record-first
    // pipeline, so this locks in from the first frame the replay itself has
    // available, the closest available proxy to "framing right when the set
    // started."
    let alignmentReason: CameraAlignment["reason"] | null = null;

    // Weighted fusion of each side's implement reading against that side's
    // real (graduated) wrist confidence -- see this file's header comment
    // for why this reuses the MediaPipe-original formula, not
    // ArBarTrackerDialog's ARKit workaround.
    function fuseSide(
      worldLm: Landmark[],
      side: "left" | "right",
      implement: ImplementPoint | null,
      prevFused: { x: number; y: number; t: number } | null,
      velocitySamples: VelocitySample[],
      t: number,
    ): { fused: { x: number; y: number; confidence: number } | null; nextPrev: { x: number; y: number; t: number } | null } {
      const wristWorld = worldLm[side === "left" ? POSE_LANDMARKS.LEFT_WRIST : POSE_LANDMARKS.RIGHT_WRIST];
      const wristConf = wristConfidence(worldLm, side);
      const barConf = implement ? implement.confidence : 0;
      const total = wristConf + barConf;
      let fused: { x: number; y: number; confidence: number } | null =
        total > 0
          ? {
              x: (wristConf * wristWorld.x + barConf * (implement ? implement.x : 0)) / total,
              y: (wristConf * wristWorld.y + barConf * (implement ? implement.y : 0)) / total,
              confidence: total / 2,
            }
          : null;
      if (fused && !isPlausibleVelocity(prevFused, { ...fused, t })) {
        rejectionEvents.push(t);
        fused = null;
      }
      let nextPrev = prevFused;
      if (fused) {
        nextPrev = { x: fused.x, y: fused.y, t };
        velocitySamples.push({ t, y: verticalSign * fused.y, confidence: fused.confidence });
      }
      return { fused, nextPrev };
    }

    for (const f of rawFrames) {
      const t = f.timestamp * 1000;
      const worldLm = scaleWorldLandmarks(visionJointsToWorldLandmarks(f), scaleFactor);
      frames.push({ t, landmarks: [], worldLandmarks: worldLm });

      const sign = worldVerticalSign(worldLm);
      if (sign != null) verticalSign = sign;
      if (alignmentReason == null) alignmentReason = assessCameraAlignment(worldLm).reason;

      // Implement points come back in the exact same raw, unscaled Vision
      // convention as a joint (see AvImplementTracker's own comment) --
      // visionImplementToPoint applies the identical pixel-scale+Y-flip
      // transform worldLm above already went through, so scaling by the
      // same scaleFactor lands both in the same real-meters space.
      const leftImplementRaw = visionImplementToPoint(f.leftImplement, f);
      const rightImplementRaw = visionImplementToPoint(f.rightImplement, f);
      const leftImplement: ImplementPoint | null = leftImplementRaw
        ? { ...leftImplementRaw, x: leftImplementRaw.x * scaleFactor, y: leftImplementRaw.y * scaleFactor, z: 0 }
        : null;
      const rightImplement: ImplementPoint | null = rightImplementRaw
        ? { ...rightImplementRaw, x: rightImplementRaw.x * scaleFactor, y: rightImplementRaw.y * scaleFactor, z: 0 }
        : null;

      const { fused: fusedLeft, nextPrev: nextPrevLeft } = fuseSide(worldLm, "left", leftImplement, prevFusedLeft, leftVelocitySamples, t);
      prevFusedLeft = nextPrevLeft;
      const { fused: fusedRight, nextPrev: nextPrevRight } = fuseSide(worldLm, "right", rightImplement, prevFusedRight, rightVelocitySamples, t);
      prevFusedRight = nextPrevRight;

      if (
        usesSharedBar &&
        fusedLeft &&
        fusedRight &&
        fusedLeft.confidence >= MIN_TRACKING_CONFIDENCE &&
        fusedRight.confidence >= MIN_TRACKING_CONFIDENCE
      ) {
        const rawTilt = tiltDegreesFromPoints(fusedLeft, fusedRight, verticalSign);
        if (rawTilt != null) tiltReadings.push(rawTilt);
      }

      const combined =
        fusedLeft && fusedRight
          ? {
              x: (fusedLeft.x + fusedRight.x) / 2,
              y: (fusedLeft.y + fusedRight.y) / 2,
              confidence: (fusedLeft.confidence + fusedRight.confidence) / 2,
            }
          : (fusedLeft ?? fusedRight);
      if (combined) {
        const point: TrackedPoint = { t, x: combined.x, y: verticalSign * combined.y, z: 0, confidence: combined.confidence };
        const prevPoint = trace[trace.length - 1];
        if (prevPoint) {
          for (const gapPoint of interpolateOcclusionGap(prevPoint, point, 300)) trace.push(gapPoint);
        }
        trace.push(point);
      }
    }

    const metrics = summarizeTrackedSet(trace, loadKg, heightIn, undefined, rejectionEvents);
    if (!metrics) {
      await saveEmptyAndWarn(blob, "Couldn't get a clean read -- make sure the bar stays in frame throughout the set.");
      return;
    }

    metrics.formFaults = detectFormFaults(
      frames,
      metrics.barPathDeviationCm,
      "lift",
      movementType,
      equipment,
      tiltReadings,
      undefined,
      metrics.repBreakdown.map((r) => ({ startT: r.startT, endT: r.endT })),
      formFaultThresholds,
    );

    if (movementType === "Squat" && laterality !== "unilateral") {
      const legDrive = computeLegDriveAsymmetry(
        frames,
        metrics.repBreakdown.map((r) => ({ startT: r.startT, endT: r.endT })),
      );
      const validEntries = legDrive
        .map((d, i) => (d ? { repNumber: metrics.repBreakdown[i].repNumber, ...d } : null))
        .filter((d): d is NonNullable<typeof d> => d !== null);
      metrics.legDriveAsymmetry = validEntries.length > 0 ? validEntries : null;
    } else {
      metrics.legDriveAsymmetry = null;
    }

    if (usesSharedBar && laterality !== "unilateral" && (movementType === "Push" || movementType === "Pull")) {
      const armDrive = computeArmDriveAsymmetry(
        leftVelocitySamples,
        rightVelocitySamples,
        metrics.repBreakdown.map((r) => ({ startT: r.startT, endT: r.endT })),
      );
      const validArmEntries = armDrive
        .map((d, i) => (d ? { repNumber: metrics.repBreakdown[i].repNumber, ...d } : null))
        .filter((d): d is NonNullable<typeof d> => d !== null);
      metrics.armDriveAsymmetry = validArmEntries.length > 0 ? validArmEntries : null;
    } else {
      metrics.armDriveAsymmetry = null;
    }

    const guess = guessMovementPattern(frames, movementType);
    const expectedPattern = expectedPatternFromName(exerciseName);
    const patternMismatch = guess.pattern !== "unknown" && !!expectedPattern && guess.pattern !== expectedPattern;
    metrics.trustScores = computeRepTrustScores(
      metrics.repBreakdown.map((r) => ({ repNumber: r.repNumber, startT: r.startT, endT: r.endT })),
      trace.map((p) => ({ t: p.t, confidence: p.confidence ?? 0.6 })),
      rejectionEvents,
      patternMismatch,
      alignmentReason,
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
      const result = await uploadOrQueueVideo(blob, filename, videoContext ?? { label: exerciseName }, setUploadProgress);
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
                <div>
                  supported={String(supported)} mode={mode} analyzedFrames={analyzedFrames}
                </div>
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
                {targetReps ? ` (${targetReps} reps)` : ""}
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
