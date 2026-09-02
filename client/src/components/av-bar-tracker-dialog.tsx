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
import {
  visionJointsToWorldLandmarks,
  visionImplementToPoint,
  visionCoreMlBoxToPoint,
  type ImplementPoint,
} from "@/lib/vision-body-landmarks";
import type { PoseFrame as NativePoseFrame, CaptureDeviceInfo } from "@/lib/native-av-preview";
import {
  POSE_LANDMARKS,
  detectFormFaults,
  worldVerticalSign,
  tiltDegreesFromPoints,
  usesSharedBarEquipment,
  assessCameraAlignment,
  guessMovementPattern,
  computeLegDriveAsymmetry,
  chainConsistencyPenalty,
  LOWER_BODY_MOVEMENT_TYPES,
  wristConfidence,
  calibrateFromFrames,
  calibrationMethodBreakdown,
  scaleWorldLandmarks,
  type PoseFrame,
  type CameraAlignment,
  type FormFaultThresholds,
} from "@/lib/pose-tracking";
import { buildTrackingDiagnostics, type TrackingDiagnostics } from "@/lib/tracking-diagnostics";
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
 * that jumped somewhere implausible between frames.
 *
 * A third signal, additive to the wrist+motion-diff fusion above rather than a replacement for
 * it (same "additive, never a replacement" stance AvCoreMlImplementDetector's own Swift comment
 * states): when `equipment` names a class the bundled object detector actually knows (see
 * COREML_TRACKING_MODE_BY_EQUIPMENT below -- currently barbell/dumbbell/kettlebell), this dialog
 * asks AvBodyTrackingPlugin to also run that detector during analysis, the same mechanism
 * AvMedBallTrackerDialog already uses for "med_ball". Its per-frame box (native-av-preview.ts's
 * PoseCoreMlImplement) gets checked against THIS frame's own wrist+motion-diff fused point in
 * applyCoreMlCorroboration below: close agreement nudges that frame's confidence up a little,
 * a confident-but-far-apart reading nudges it down a little -- the same modest, capped,
 * never-overriding-position idiom this file's own appearanceMatch/gripConfirmed nudges already
 * use, and the same "two independent reads agreeing is stronger evidence" reasoning
 * av-medball-tracker-dialog.tsx's medBallTrustScore documents for its own two signals. For any
 * other equipment (Bodyweight, Machine, Trap Bar, anything not in the map), trackingMode is
 * omitted and analysis behaves exactly as it did before this existed -- no object detector, no
 * cross-check, unchanged confidence math. */

// Equipment this dialog can ask the bundled object detector to also look for, mapped to that
// detector's own class name (scripts/med-ball-detector/prepare_dataset.py's CLASS_NAMES is the
// source of truth). Only equipment with a real trained class is listed -- "Trap Bar"/"EZ-Bar"
// share usesSharedBarEquipment's bar-tilt treatment but look visually different enough from a
// straight barbell that mapping them to "barbell" would just seed the detector against the
// wrong shape, so they (and everything else) fall through to undefined, same as today.
const COREML_TRACKING_MODE_BY_EQUIPMENT: Record<string, string> = {
  Barbell: "barbell",
  Dumbbell: "dumbbell",
  Kettlebell: "kettlebell",
};

// How far apart (meters) the CoreML box's center and this frame's own wrist+motion-diff fused
// point can be before they count as "looking at the same object" -- same distance
// bar-tracker-dialog.tsx's own MAX_PLAUSIBLE_IMPLEMENT_OFFSET_M already uses for the identical
// judgment call between the wrist and the motion-diff implement tracker, reused here rather than
// picking a new number, since it's the same question (two independent reads of where the
// equipment is) asked of a third source instead of a second one.
const COREML_AGREEMENT_MAX_OFFSET_M = 0.5;

// Below this, a CoreML detection is too marginal to treat a large disagreement with the fused
// point as meaningful -- same MIN_TRACKING_CONFIDENCE bar-tracking.ts already uses everywhere
// else for "trust this frame's position at all." A weak detection simply gets no say either way
// (neither boosts nor penalizes), rather than a barely-there reading dragging down an otherwise
// solid wrist+motion-diff fix.
const COREML_MIN_CONFIDENCE_TO_PENALIZE = 0.5;

// Modest, capped nudge -- same +-15% magnitude as this file's own appearanceMatch adjustment,
// deliberately small so a third corroborating (or conflicting) signal shifts confidence without
// ever being able to single-handedly promote a bad fix to "trusted" or demote a good one to
// "reject."
function applyCoreMlCorroboration(
  fused: { x: number; y: number; confidence: number },
  coreMlPoint: ImplementPoint | null,
): { x: number; y: number; confidence: number } {
  if (!coreMlPoint) return fused;
  const offsetM = Math.hypot(coreMlPoint.x - fused.x, coreMlPoint.y - fused.y);
  if (offsetM <= COREML_AGREEMENT_MAX_OFFSET_M) {
    return { ...fused, confidence: Math.min(1, fused.confidence * (1 + 0.15 * coreMlPoint.confidence)) };
  }
  if (coreMlPoint.confidence >= COREML_MIN_CONFIDENCE_TO_PENALIZE) {
    return { ...fused, confidence: fused.confidence * 0.85 };
  }
  return fused;
}

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
  setNumber,
  onAnalysisStarted,
  onProcessingSettled,
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
  // Which set this dialog instance is currently tracking -- read directly from this prop at the
  // moment Stop Set is tapped (not from any state the PARENT might change later) and threaded
  // through every callback below, so a background analysis that's still running when the
  // athlete starts tracking a DIFFERENT set always reports back to the set it actually belongs
  // to. See this file's own comment on onAnalysisStarted for why that race is real now that this
  // dialog closes before analysis finishes.
  setNumber: number;
  // Fires once, right when recording stops and the slow on-device analysis is about to begin
  // (native has the file, live camera preview is no longer needed) -- the caller uses this to
  // close the dialog immediately and show an inline "processing" indicator on this set's own row
  // instead, rather than blocking the whole screen on a spinner for however long analysis takes.
  // Safe to close this dialog here: `open` only tears down the camera PREVIEW (see
  // useAvBodyTracking's own effect), never the in-flight recording/analysis/upload this
  // component's own async functions keep running regardless of `open`.
  onAnalysisStarted: (setNumber: number) => void;
  // Fires exactly once when this Stop Set's whole background flow is done, on every exit path
  // (real metrics, empty/failed metrics, or a cancellation) -- the caller uses this to clear the
  // inline "processing" indicator onAnalysisStarted turned on, regardless of how things turned
  // out. Deliberately separate from onCapture, which only fires on paths that actually produce
  // metrics to save.
  onProcessingSettled: (setNumber: number) => void;
  onCapture: (metrics: RepMetrics, videoUrl?: string, setNumber?: number) => void;
  videoContext?: VideoRecordContext;
  formFaultThresholds?: Partial<Record<keyof FormFaultThresholds, number | null>> | null;
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
    cancelRecording,
    stopRecordingAndAnalyze,
    cancelAnalysis,
  } = useAvBodyTracking(open);

  const usesSharedBar = usesSharedBarEquipment(equipment);
  // KILL SWITCH -- 2026-09-02, mid-live-workout: a Bench Press (Barbell) recording hung at
  // "0 frames processed" and never recovered. This was the very first real-device analysis pass
  // ever to run with the CoreML detector enabled for a bar-tracker dialog (added earlier this
  // same session), so it's the prime suspect even though root cause isn't confirmed yet -- a
  // pre-existing, separately-documented AVAssetReader/Vision setup hang (see analyzeRecording's
  // own watchdog comment) is also a real possibility and wasn't touched tonight. Forcing
  // trackingMode undefined here (TS-only, no native change, no verify_build wait) restores
  // exactly the pre-this-session behavior -- the plain wrist+motion-diff tracker, unaffected --
  // while the actual cause gets investigated without risking the rest of a live training day.
  // Re-enable (delete this override) once that's understood; see SESSION_NOTES_2026-09-02.md.
  const coreMlTrackingMode: string | undefined = undefined;

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
  async function saveEmptyAndWarn(
    blob: Blob,
    message: string,
    captureDeviceInfo: CaptureDeviceInfo,
    trackingDiagnostics: TrackingDiagnostics,
    uploadPromise: Promise<{ status: "uploaded"; url: string } | { status: "queued" }> | null,
    forSetNumber: number,
  ) {
    const emptyMetrics: RepMetrics = { ...EMPTY_REP_METRICS, captureDeviceInfo, trackingDiagnostics };
    if (recordVideo && uploadPromise) {
      try {
        const result = await uploadPromise;
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
          onCapture(emptyMetrics, undefined, forSetNumber);
        } else {
          onCapture(emptyMetrics, result.url, forSetNumber);
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
    // Captured once, up front -- every callback below (onAnalysisStarted, onCapture,
    // onProcessingSettled) uses this same value for the whole lifetime of this one Stop Set,
    // never the `setNumber` prop's possibly-since-changed live value. See this dialog's own prop
    // comment on why: this dialog now closes and returns control to the athlete before analysis
    // finishes, so they can legitimately be tracking a different set by the time any of this
    // settles.
    const forSetNumber = setNumber;
    try {
      // Starts the upload the instant the recording exists rather than after analysis also
      // finishes, so the two run concurrently -- see use-av-body-tracking.ts's own onBlobReady
      // comment. saveEmptyAndWarn and finishWithRecording's own success path both just await
      // this same in-flight upload instead of starting a fresh one once they're ready for it.
      let uploadPromise: Promise<{ status: "uploaded"; url: string } | { status: "queued" }> | null = null;
      const result = await stopRecordingAndAnalyze({
        trackingMode: coreMlTrackingMode,
        // Always provided now (not just when recordVideo) -- recording has stopped and the slow
        // on-device analysis pass is about to start regardless of whether a video gets uploaded,
        // and closing the dialog here (rather than leaving the athlete staring at "Analyzing
        // recording...") is the whole point of this redesign, not something to skip when there's
        // no video.
        onBlobReady: (blob) => {
          onAnalysisStarted(forSetNumber);
          if (recordVideo) {
            setSaving(true);
            setUploadProgress(0);
            const filename = videoFilenameForBlob(blob, "form-check");
            uploadPromise = uploadOrQueueVideo(blob, filename, videoContext ?? { label: exerciseName }, setUploadProgress);
          }
        },
      });
      if (!result) {
        // Analysis failed or was cancelled, but the upload above doesn't know or care -- it never
        // depended on analysis succeeding. Left alone it would still finish in the background with
        // no set to attach it to, so wait for it and hand it over anyway, same "the clip is worth
        // keeping even without numbers" reasoning as saveEmptyAndWarn below.
        const inFlightUpload = uploadPromise as Promise<
          { status: "uploaded"; url: string } | { status: "queued" }
        > | null;
        if (inFlightUpload) {
          try {
            const uploadResult = await inFlightUpload;
            toast.error("Couldn't finish analyzing this take, but your video was saved for your coach.");
            onCapture(EMPTY_REP_METRICS, uploadResult.status === "uploaded" ? uploadResult.url : undefined, forSetNumber);
            onOpenChange(false);
          } catch {
            // Genuinely nothing left to salvage.
          } finally {
            setSaving(false);
          }
        }
        return;
      }
      await finishWithRecording(
        result.blob, result.rawFrames, result.captureDeviceInfo, result.recordingStats, uploadPromise, forSetNumber,
      );
    } finally {
      // Fires no matter which of the paths above was taken -- see this dialog's own prop
      // comment on onProcessingSettled for why this is deliberately separate from onCapture.
      onProcessingSettled(forSetNumber);
    }
  }

  async function finishWithRecording(
    blob: Blob,
    rawFrames: NativePoseFrame[],
    captureDeviceInfo: CaptureDeviceInfo,
    recordingStats: { frameCount: number; trackedFrameCount: number; elapsedSeconds: number },
    uploadPromise: Promise<{ status: "uploaded"; url: string } | { status: "queued" }> | null,
    forSetNumber: number,
  ) {
    const calibrationInput = rawFrames.map((f) => ({ worldLandmarks: visionJointsToWorldLandmarks(f) }));
    const scaleFactor = calibrateFromFrames(calibrationInput, heightIn);
    const calibrationFrames = calibrationMethodBreakdown(calibrationInput);
    if (scaleFactor == null) {
      const message =
        "Couldn't calibrate real-world scale for this take -- make sure your height is set in your profile and you're clearly visible standing at some point in frame.";
      await saveEmptyAndWarn(
        blob,
        message,
        captureDeviceInfo,
        buildTrackingDiagnostics({
          outcome: "empty_calibration_failed",
          message,
          rawFrames,
          recording: recordingStats,
          calibration: { scaleFactor: null, ...calibrationFrames },
        }),
        uploadPromise,
        forSetNumber,
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
      coreMlPoint: ImplementPoint | null,
    ): { fused: { x: number; y: number; confidence: number } | null; nextPrev: { x: number; y: number; t: number } | null } {
      const wristWorld = worldLm[side === "left" ? POSE_LANDMARKS.LEFT_WRIST : POSE_LANDMARKS.RIGHT_WRIST];
      const wristConf = wristConfidence(worldLm, side);
      const barConf = implement ? implement.confidence : 0;
      const total = wristConf + barConf;
      let fused: { x: number; y: number; confidence: number } | null =
        total > 0
          ? applyCoreMlCorroboration(
              {
                x: (wristConf * wristWorld.x + barConf * (implement ? implement.x : 0)) / total,
                y: (wristConf * wristWorld.y + barConf * (implement ? implement.y : 0)) / total,
                confidence: total / 2,
              },
              coreMlPoint,
            )
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

      // Same raw-Vision-convention-then-scale treatment as leftImplement/rightImplement above,
      // applied to AvCoreMlImplementDetector's box instead of AvImplementTracker's point (see
      // visionCoreMlBoxToPoint's own comment). Only ever populated when coreMlTrackingMode
      // enabled it (see this file's header comment) -- undefined equipment means f.coreMlImplement
      // is never present on any frame, so this is null every time for anyone not covered by
      // COREML_TRACKING_MODE_BY_EQUIPMENT, same as if this whole feature didn't exist. One point,
      // not per-side -- the detector finds the equipment, not a hand, so both sides check it
      // against the same reading.
      const coreMlPointRaw = visionCoreMlBoxToPoint(f.coreMlImplement, f);
      const coreMlPoint: ImplementPoint | null = coreMlPointRaw
        ? { ...coreMlPointRaw, x: coreMlPointRaw.x * scaleFactor, y: coreMlPointRaw.y * scaleFactor, z: 0 }
        : null;

      const { fused: fusedLeft, nextPrev: nextPrevLeft } = fuseSide(worldLm, "left", leftImplement, prevFusedLeft, leftVelocitySamples, t, coreMlPoint);
      prevFusedLeft = nextPrevLeft;
      const { fused: fusedRight, nextPrev: nextPrevRight } = fuseSide(worldLm, "right", rightImplement, prevFusedRight, rightVelocitySamples, t, coreMlPoint);
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
      const message = "Couldn't get a clean read -- make sure the bar stays in frame throughout the set.";
      await saveEmptyAndWarn(
        blob,
        message,
        captureDeviceInfo,
        buildTrackingDiagnostics({
          outcome: "empty_no_clean_read",
          message,
          rawFrames,
          recording: recordingStats,
          calibration: { scaleFactor, ...calibrationFrames },
        }),
        uploadPromise,
        forSetNumber,
      );
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

    // Kinetic-chain consistency, folded in as one more trust-score signal (see
    // chainConsistencyPenalty's own comment) -- only for the movement types that actually have a
    // relevant chain: leg (hip-knee-ankle) for a lower-body lift, arm (shoulder-elbow-wrist) for
    // a press/pull. Neither applies to a Hinge/Carry/etc. arm-wise or a Push/Pull leg-wise, so
    // this stays a Map rather than a flat penalty -- reps outside the relevant movement type
    // simply get no entry, and computeRepTrustScores treats a missing entry as no penalty.
    const chainType: "leg" | "arm" | null =
      movementType != null && LOWER_BODY_MOVEMENT_TYPES.has(movementType)
        ? "leg"
        : movementType === "Push" || movementType === "Pull"
          ? "arm"
          : null;
    const chainPenalties = chainType
      ? new Map(
          metrics.repBreakdown.map((r) => [
            r.repNumber,
            chainConsistencyPenalty(frames, r.startT, r.endT, chainType),
          ]),
        )
      : undefined;

    metrics.trustScores = computeRepTrustScores(
      metrics.repBreakdown.map((r) => ({ repNumber: r.repNumber, startT: r.startT, endT: r.endT })),
      trace.map((p) => ({ t: p.t, confidence: p.confidence ?? 0.6 })),
      rejectionEvents,
      patternMismatch,
      alignmentReason,
      chainPenalties,
    );
    metrics.captureDeviceInfo = captureDeviceInfo;
    metrics.trackingDiagnostics = buildTrackingDiagnostics({
      outcome: "tracked",
      rawFrames,
      recording: recordingStats,
      calibration: { scaleFactor, ...calibrationFrames },
    });

    if (!recordVideo) {
      onCapture(metrics, undefined, forSetNumber);
      onOpenChange(false);
      return;
    }

    // uploadPromise is always set here -- onBlobReady (stopTracking above) unconditionally
    // starts it whenever recordVideo is true, and the early return above already covers
    // !recordVideo. Falls back to a fresh upload rather than silently dropping the video if
    // that invariant is ever wrong.
    const inFlightUpload =
      uploadPromise ??
      uploadOrQueueVideo(blob, videoFilenameForBlob(blob, "form-check"), videoContext ?? { label: exerciseName }, setUploadProgress);
    try {
      const result = await inFlightUpload;
      if (result.status === "queued") {
        if (!hasWarnedAboutQueueing()) {
          markWarnedAboutQueueing();
          toast.info(
            "No Wi-Fi -- this video is saved on your device and will upload automatically once you're connected. You can also upload it manually anytime from the Video Bank, even over cellular.",
            { duration: 10000 },
          );
        }
        onCapture(metrics, undefined, forSetNumber);
      } else {
        onCapture(metrics, result.url, forSetNumber);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Saved the set, but the clip failed to upload");
      onCapture(metrics, undefined, forSetNumber);
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
              onClick={() => {
                // Live incident, 2026-09-02: tapping this while `analyzing` was true left a
                // stuck overlay behind -- this button called onOpenChange(false) unconditionally
                // and nothing else, so the native analysis (and its recording/upload state) kept
                // running orphaned behind a dialog that was already gone, instead of actually
                // being torn down. Attempting the real cancel first (same interrupt path the
                // in-progress "Cancel" button already uses) at least gives the native side a
                // chance to unwind cleanly. onOpenChange(false) still always fires immediately
                // right after, not gated on that cancel completing -- this button's whole job is
                // being a guaranteed way out even if analysis/recording itself is hung, the same
                // problem that made waiting on it unacceptable in the first place.
                if (analyzing) cancelAnalysis();
                else if (recording) void cancelRecording();
                onOpenChange(false);
              }}
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
                  {/* The upload now starts the instant the recording exists, running
                      concurrently with analysis instead of waiting for it -- so both are
                      routinely true at once. Analyzing's own progress stays the headline
                      number while it's still running (saving is happening quietly behind it),
                      and only takes over once analysis is done but the upload still has a tail
                      left. */}
                  {analyzing
                    ? `Analyzing recording -- ${analyzedFrames} frames processed…`
                    : `Saving your video… ${Math.round(uploadProgress * 100)}%`}
                </p>
                {/* Cancel only applies to the on-device analysis pass (cancelAnalysis calls
                    the native cancelAvAnalysis) -- shown exactly while analysis is still
                    running, independent of whether the (now-concurrent) upload has finished. */}
                {analyzing && (
                  <Button variant="outline" size="sm" onClick={cancelAnalysis}>
                    <XCircle className="h-4 w-4" />
                    Cancel
                  </Button>
                )}
              </div>
            )}

            {!recording && !analyzing && !saving && !heightIn && (
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
                Start Set
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
                {analyzing ? "Analyzing…" : `Saving… ${Math.round(uploadProgress * 100)}%`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
