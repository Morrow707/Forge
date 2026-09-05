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
import { AvCameraChrome } from "@/components/av-camera-chrome";
import {
  visionJointsToWorldLandmarks,
  visionBody3DToWorldLandmarks,
  visionImplementToPoint,
  visionCoreMlBoxToPoint,
  visionRefineGripSeed,
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
  assessSubjectFacing,
  cameraViewMismatch,
  type SubjectFacing,
  guessMovementPattern,
  computeLegDriveAsymmetry,
  chainConsistencyPenalty,
  LOWER_BODY_MOVEMENT_TYPES,
  wristConfidence,
  calibrateFromFrames,
  calibrationMethodBreakdown,
  scaleWorldLandmarks,
  computeReferenceObjectScale,
  CALIBRATION_REFERENCES,
  MIN_CALIBRATION_SAMPLES,
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
  implausibleRangeOfMotion,
  toScaleFreeMetrics,
  normalizeTraceScale,
  type ScaleFreeMetrics,
  MIN_TRACKING_CONFIDENCE,
  type RepMetrics,
  type TrackedPoint,
  type VelocitySample,
} from "@/lib/bar-tracking";
import { expectedPatternFromName } from "@/components/bar-tracker-dialog";
import {
  postureForExercise,
  heightCalibrationUnreliable,
  filmGuidanceForExercise,
  barPathAssumptionInvalid,
  expectedCameraView,
  calibrationRefusalReason,
  firstMoveForExercise,
  romBucketForExercise,
} from "@/lib/exercise-camera-profile";
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
 * estimate. Without a successful calibration this mode reports no read at all -- "no number is
 * better than a wrong one" -- rather than a velocity/tilt/power number computed from
 * meaningless pixel units. Two independent calibration sources can feed the one scaleFactor
 * finishWithRecording actually uses: calibrateFromFrames' athlete-height read (needs both
 * ankles visible at some point -- see its own comment, including its shoulder-fallback, which
 * still needs ankles -- so frame the camera wide enough to keep feet in shot for a lying-flat
 * set like bench press), and plateScaleFromFrames' reference-object read off the CoreML "plate"
 * detector (needs a bumper plate visible instead). Either alone is enough; both together get
 * averaged -- though in practice only the height read fires today, since nothing currently sets
 * coreMlTrackingMode to "plate" (see its own comment on why an earlier attempt at forcing that
 * trade for bench press cost more in bar-path corroboration than it gained in calibration
 * coverage).
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

// Second calibration mechanism, alongside calibrateFromFrames' athlete-height one -- see this
// file's header comment and the coreMlTrackingMode assignment above for why bench press
// specifically needs this: a lying-flat set framed on the bar path routinely never shows the
// athlete's ankles, which calibrateFromFrames requires no matter what (even its own
// shoulder-to-ankle fallback still needs ankles -- see pose-tracking.ts's
// impliedStandingHeightPixels). Only ever has anything to find when coreMlTrackingMode was set
// to "plate" for this clip (see above), which is why this reads frame.coreMlImplement directly
// rather than taking a fusion result -- the box is a real, separate reference-object reading,
// not the corroboration nudge applyCoreMlCorroboration applies to the wrist/motion-diff trace.
//
// Assumes this gym's own bumper plate (bumper_plate_perform_better in pose-tracking.ts) --
// sourced from an actual tape measurement of the same plate this dataset's own "plate" class
// was trained on (see CALIBRATION_REFERENCES' own comment), not a guess. Takes the box's LARGER
// normalized-to-pixel axis as the measured diameter: a plate viewed at even a slight angle
// foreshortens one axis but not the other, so the larger axis stays closer to the true diameter
// than either the smaller axis or an average would.
//
// The trackingMode parameter is NOT decoration, and its absence was a real bug. The paragraph
// above asserts this "only ever has anything to find when coreMlTrackingMode was set to
// 'plate'" -- but that was an assumption about the caller, never a check, and the caller does
// not honour it. A barbell bench press runs with coreMlTrackingMode "barbell"
// (COREML_TRACKING_MODE_BY_EQUIPMENT), the native detector then populates coreMlImplement with
// a BARBELL box, and the payload carries no class label to tell them apart. So this function
// measured a barbell -- metres of it, across the frame -- and divided the 0.45m bumper-plate
// constant by it, then handed that to the caller to be AVERAGED into the real scale factor.
// It escaped notice only because the currently bundled model has a known barbell regression
// (confidences around 0.02, far under the 0.4 detection floor), so no box is produced in
// practice today. That is a model-quality accident, not a guard: the moment barbell detection
// improves, every barbell set's scale would be silently corrupted. Gated properly now.
function plateScaleFromFrames(
  frames: NativePoseFrame[],
  trackingMode: string | undefined,
): { scale: number; uncertaintyFraction: number } | null {
  if (trackingMode !== "plate") return null;
  const samples: number[] = [];
  for (const f of frames) {
    const box = f.coreMlImplement;
    if (!box || box.confidence < COREML_MIN_CONFIDENCE_TO_PENALIZE) continue;
    const pixelSize = Math.max(box.width * f.frameWidth, box.height * f.frameHeight);
    if (pixelSize > 0) samples.push(pixelSize);
  }
  if (samples.length < MIN_CALIBRATION_SAMPLES) return null;
  samples.sort((a, b) => a - b);
  const medianPixelSize = samples[Math.floor(samples.length / 2)];
  const reference = CALIBRATION_REFERENCES.find((r) => r.id === "bumper_plate_perform_better")!;
  return computeReferenceObjectScale(medianPixelSize, reference.nominalSizeM, reference.toleranceM);
}

const EMPTY_REP_METRICS: RepMetrics = {
  peakVelocityMps: 0,
  meanVelocityMps: 0,
  concentricSeconds: 0,
  eccentricSeconds: 0,
  barPathDeviationCm: 0,
  barPathTrace: [],
  repBreakdown: [],
  meanEai: 0,
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
  positionScaleCorrection,
  onUploadProgress,
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
  onCapture: (metrics: RepMetrics, videoUrl?: string, setNumber?: number, skeletonFrames?: PoseFrame[] | null) => void;
  videoContext?: VideoRecordContext;
  formFaultThresholds?: Partial<Record<keyof FormFaultThresholds, number | null>> | null;
  // From the active MovementProfile's own positionScaleCorrection (see
  // shared/schema.ts) -- passed separately from formFaultThresholds since
  // it isn't a form-fault threshold, it corrects the raw trace itself
  // before summarizeTrackedSet ever computes ROM/velocity/power from it.
  // Null/undefined means no correction (today's behavior).
  positionScaleCorrection?: number | null;
  // Fired on every upload progress tick, in addition to this dialog's own local uploadProgress
  // state -- the dialog closes as soon as onAnalysisStarted fires (see that prop's own
  // comment), so its own uploadProgress state becomes invisible to the athlete from that point
  // on. The caller uses this to keep showing real percentage on the inline "processing"
  // indicator that replaces this dialog once it's closed, instead of a bare "Processing..."
  // with no further detail for however long analysis+upload takes.
  onUploadProgress?: (setNumber: number, percent: number) => void;
}) {
  const filmGuidance = filmGuidanceForExercise(exerciseName);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Wraps setUploadProgress so every progress tick also reaches the parent, keyed to whichever
  // set this specific upload belongs to -- see onUploadProgress's own comment on why the
  // parent needs this once this dialog itself has closed.
  function reportUploadProgress(forSetNumber: number) {
    return (fraction: number) => {
      // uploadOrQueueVideo's own onProgress contract is a 0-1 fraction (see
      // video-offline-store.ts) -- this dialog's own render already knows that and does the
      // *100 conversion itself (Math.round(uploadProgress * 100)), so setUploadProgress keeps
      // getting the raw fraction unchanged. onUploadProgress is a DIFFERENT contract though --
      // its own name and every caller (workout.tsx's inline "Processing… N%" indicator) expect
      // an actual whole-number percent, not a fraction -- so it gets converted here, once, at
      // the source, rather than trusting every future caller to remember to do it themselves.
      setUploadProgress(fraction);
      onUploadProgress?.(forSetNumber, Math.round(fraction * 100));
    };
  }

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
  // Kill switch (2026-09-02, live incident) lifted: a Bench Press (Barbell) recording hung at
  // "0 frames processed" mid-workout the first time CoreML detection ran in this dialog. Root
  // cause was never pinned to CoreML specifically vs. the separate, pre-existing
  // AVAssetReader/Vision setup hang analyzeRecording's own watchdog comment documents -- but
  // that watchdog is no longer a single 120s timer either; it now fails fast (~15s of zero
  // progress) and reports to Sentry (see use-av-body-tracking.ts), so a repeat of that exact
  // hang no longer strands an athlete for two minutes and, for the first time, actually leaves a
  // trace of which case it was. That's what makes re-enabling this tonight a reasonable bet
  // instead of a repeat of the same blind spot.
  //
  // Every equipment/movement combination uses the same corroboration-only mapping below,
  // including bench press. An earlier version of this line special-cased "horizontal_press_or_row"
  // Barbell sets to "plate" instead, trading bar-path corroboration away for calibration --
  // reasonable in theory (calibrateFromFrames' ankle requirement can't resolve for a lying-flat
  // set with feet out of frame), but live field data the same night showed the real cost: with
  // "barbell" corroboration off, the fused bar-path signal got noisy enough to both invent
  // spurious extra reps (16 rep-velocity readings logged for a real 10-rep set) and get whole
  // real reps rejected by the trust filter (a separate set found only 4 of 10). Framing the
  // camera wide enough to keep the athlete's ankles in shot -- which this same athlete had
  // already done -- gets calibrateFromFrames working via height anyway, without that trade.
  // plateScaleFromFrames below still exists and still runs on whatever coreMlImplement data a
  // clip happens to have (harmless no-op when trackingMode was never "plate"), so nothing stops
  // it being wired back in through a real fix -- tracking both classes in one analysis pass,
  // which the native detector already gets both classes' detections for and just discards one of
  // -- once that's built and verified, rather than forcing the choice per movement pattern.
  const coreMlTrackingMode: string | undefined = equipment
    ? COREML_TRACKING_MODE_BY_EQUIPMENT[equipment]
    : undefined;

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

  // A capture that has real numbers, just not the ones that need a scale.
  //
  // The whole-set durations and the velocity-loss percentage go into their own real columns --
  // every one of those is a time or a ratio, so it means the same thing with or without
  // calibration. Everything that would need metres stays at the empty value it already had.
  // The per-rep detail rides in trackingDiagnostics rather than repBreakdown: that type's
  // velocity fields are non-null and read by every chart downstream, so widening them to carry
  // a null for this one case would push the question onto all of them.
  async function saveScaleFreeAndWarn(
    blob: Blob,
    scaleFree: ScaleFreeMetrics,
    message: string,
    captureDeviceInfo: CaptureDeviceInfo,
    trackingDiagnostics: TrackingDiagnostics,
    uploadPromise: Promise<{ status: "uploaded"; url: string } | { status: "queued" }> | null,
    forSetNumber: number,
  ) {
    const metrics: RepMetrics = {
      ...EMPTY_REP_METRICS,
      concentricSeconds: scaleFree.concentricSeconds,
      eccentricSeconds: scaleFree.eccentricSeconds ?? 0,
      velocityLossPercent: scaleFree.velocityLossPercent,
      captureDeviceInfo,
      trackingDiagnostics: { ...trackingDiagnostics, scaleFree },
    };
    const summary =
      `Got ${scaleFree.repCount} rep${scaleFree.repCount === 1 ? "" : "s"}, tempo` +
      (scaleFree.velocityLossPercent != null
        ? ` and ${Math.abs(Math.round(scaleFree.velocityLossPercent))}% velocity loss.`
        : ".");
    const full = `${message} ${summary}`;
    if (recordVideo && uploadPromise) {
      try {
        const result = await uploadPromise;
        toast.warning(
          result.status === "queued"
            ? `${full} (No Wi-Fi -- video saved on your device, will upload for your coach once connected.)`
            : `${full} (Video saved for your coach.)`,
        );
        if (result.status === "queued") {
          if (!hasWarnedAboutQueueing()) {
            markWarnedAboutQueueing();
            toast.info(
              "You can also upload a queued video manually anytime -- even over cellular -- from the Video Bank.",
              { duration: 10000 },
            );
          }
          onCapture(metrics, undefined, forSetNumber);
        } else {
          onCapture(metrics, result.url, forSetNumber);
        }
        onOpenChange(false);
      } catch (err) {
        const detail = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
        toast.error(`${full} And the video didn't save either: ${detail}`);
      } finally {
        setSaving(false);
      }
    } else {
      toast.warning(full);
      onCapture(metrics, undefined, forSetNumber);
      onOpenChange(false);
      setSaving(false);
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
            uploadPromise = uploadOrQueueVideo(
              blob,
              filename,
              videoContext ?? { label: exerciseName },
              reportUploadProgress(forSetNumber),
            );
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
        result.blob, result.rawFrames, result.skeletonFrames, result.captureDeviceInfo, result.recordingStats, uploadPromise, forSetNumber,
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
    skeletonFrames: PoseFrame[],
    captureDeviceInfo: CaptureDeviceInfo,
    recordingStats: {
      frameCount: number;
      trackedFrameCount: number;
      elapsedSeconds: number;
      readerStatus?: string;
      assetDurationSeconds?: number;
    },
    uploadPromise: Promise<{ status: "uploaded"; url: string } | { status: "queued" }> | null,
    forSetNumber: number,
  ) {
    const calibrationInput = rawFrames.map((f) => ({ worldLandmarks: visionJointsToWorldLandmarks(f) }));
    // Athlete-height calibration measures head-to-ankle and calls it standing height. That
    // identity requires an UPRIGHT body, so for a movement performed lying down it is invalid
    // at every camera angle -- there is no prop position that makes it correct.
    //
    // It has to be refused by NAME, not by inspecting the frames. Two shipped attempts to
    // detect the posture geometrically were defeated by real footage, and a simulation over 48
    // realistic prop positions (camera 0.4-2.0m behind the toes, 0.15-0.90m high, 0-20 degrees
    // of pitch) shows why the current state is worse than it looks: 25 of the 48 PUBLISHED a
    // height-derived range of motion, from 6.1cm to 75.4cm against a true 39.4cm, and
    // implausibleRangeOfMotion caught none of them. The athlete's reported 154 / 180.5 / 299cm
    // were the visible tail of a much larger silent band. The flip between refusing and
    // silently publishing sits at a camera height of ~0.47m -- the height of the bench itself,
    // so moving the phone from the floor to an adjacent bench turns a loud refusal into a
    // confident 72cm.
    //
    // Refusing costs a bench set its numbers until an in-plane reference is built (see
    // docs/camera-tracking-notes.md). Publishing a number that is wrong by anywhere from -85%
    // to +91%, with no indication, costs more.
    // Widened from "is this lift done lying down?" to "is the athlete standing at full length?"
    // -- see CameraPosture in exercise-camera-profile.ts. The case that was getting through was
    // seated: a seated athlete passes uprightEnough (which tests DIRECTION, not length) while
    // spanning only ~0.77 of their standing height, so the scale came out ~30% large on every
    // seated press, pulldown, row and leg machine, quietly enough to clear every other check.
    const posture = postureForExercise(exerciseName);
    // movementType is passed as well as the name: the name patterns are a list of spellings and
    // the library keeps growing, so the taxonomy backstops the floor and hold work whose name
    // gives nothing away (a plank, a bird dog, a stretch).
    const canUseHeight = !heightCalibrationUnreliable(exerciseName, movementType);
    const heightScaleFactor = canUseHeight ? calibrateFromFrames(calibrationInput, heightIn) : null;
    // Plate-based scale (see plateScaleFromFrames' own comment) only ever has something to find
    // when coreMlTrackingMode was "plate" for this clip -- everything else leaves this null and
    // heightScaleFactor decides alone, unchanged from before this existed. When BOTH resolve
    // (a bench-press set where the athlete's feet happened to still be in frame, say), average
    // them -- two independent reads agreeing is stronger evidence than either alone, the same
    // reasoning applyCoreMlCorroboration and medBallTrustScore already apply elsewhere in this
    // codebase to exactly this "two signals, not one" situation.
    const plateScale = plateScaleFromFrames(rawFrames, coreMlTrackingMode);
    const scaleFactor =
      heightScaleFactor != null && plateScale != null
        ? (heightScaleFactor + plateScale.scale) / 2
        : (plateScale?.scale ?? heightScaleFactor);
    const calibrationFrames = calibrationMethodBreakdown(calibrationInput);

    // No scale used to end the take here, with nothing saved but the video. It no longer does.
    //
    // Plenty of what a set is worth knowing never needed a real-world scale: how long each rep
    // took, how much the bar slowed across the set, how long it took to reach top speed, how far
    // it drifted as a share of its own travel. Those are times and ratios, and metres cancel out
    // of every one. Velocity loss in particular is the number a velocity-based-training athlete
    // trains against, it is a percentage, and it was being discarded along with the metres it
    // does not need.
    //
    // So the trace is still built (at a scale of 1, which is honest: the units are arbitrary),
    // and the scale-free half is computed and saved below. Only the metres, the metres per
    // second and the watts are withheld.
    //
    // No "(Video saved for your coach.)" in any of these -- saveEmptyAndWarn appends that
    // itself, and including it produced the message twice on a real device.
    const scaleRefusalMessage =
      scaleFactor != null
        ? null
        : (calibrationRefusalReason(posture) ??
          (!canUseHeight
            ? "This is a hold or a stretch rather than a lift with reps, so there's no range of motion to measure and your height can't be used to set scale. Numbers are withheld rather than guessed."
            : coreMlTrackingMode === "plate"
              ? "Couldn't calibrate real-world scale for this take -- make sure a bumper plate is clearly visible on the bar at some point in frame (or your height is set and you're visible standing)."
              : "Couldn't calibrate real-world scale for this take -- make sure your height is set in your profile and you're clearly visible standing at some point in frame."));
    // 1 rather than null so the trace-building loop below reads the same either way. Every
    // position it produces is then in arbitrary units, which is exactly what the scale-free path
    // expects and what nothing else is allowed to read.
    const effectiveScale = scaleFactor ?? 1;

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
    let subjectFacing: SubjectFacing | null = null;

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
      frame: NativePoseFrame,
    ): { fused: { x: number; y: number; confidence: number } | null; nextPrev: { x: number; y: number; t: number } | null } {
      const wristWorld = worldLm[side === "left" ? POSE_LANDMARKS.LEFT_WRIST : POSE_LANDMARKS.RIGHT_WRIST];
      const rawWristConf = wristConfidence(worldLm, side);
      // Corroboration nudge, not a seed replacement -- AvImplementTracker's own motion-diff
      // search already ran natively, seeded off the raw wrist joint, before this function ever
      // sees the frame, so (unlike bar-tracker-dialog.tsx's MediaPipe/Android equivalent) there's
      // no seed left to refine here. A real hand detected right where Pose predicted the wrist is
      // treated as an independent vote against a ghost-skeleton/phantom-landmark misread, the
      // same 1.25x-capped-at-1 nudge bar-tracker-dialog.tsx's own gripConfirmed applies. Matched
      // against the RAW (pre-pixel-scale) wrist joint -- visionRefineGripSeed operates in the
      // same normalized 0-1 space frame.handJoints' own x/y already are, not worldLm's
      // pixel-scaled space.
      const rawWristJoint = frame.joints.find((j) => j.name === (side === "left" ? "leftWrist" : "rightWrist"));
      const gripConfirmed = rawWristJoint ? visionRefineGripSeed(frame, rawWristJoint.x, rawWristJoint.y) != null : false;
      const wristConf = gripConfirmed ? Math.min(1, rawWristConf * 1.25) : rawWristConf;
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
      // Phase B: real depth when this frame actually has it (iOS 17+, a confident 3D pose) --
      // already real-world meters, so it bypasses the athlete-height effectiveScale entirely (see
      // visionBody3DToWorldLandmarks's own comment on why double-scaling would be wrong).
      // Falls back to the existing 2D-derived-plus-calibration path frame by frame, not once
      // for the whole clip, since body3D availability can vary frame to frame even on a
      // 17+ device (a low-confidence 3D read on one frame, a good one on the next).
      const body3DLm = visionBody3DToWorldLandmarks(f);
      const worldLm = body3DLm ?? scaleWorldLandmarks(visionJointsToWorldLandmarks(f), effectiveScale);
      frames.push({ t, landmarks: [], worldLandmarks: worldLm });

      const sign = worldVerticalSign(worldLm);
      if (sign != null) verticalSign = sign;
      if (alignmentReason == null) alignmentReason = assessCameraAlignment(worldLm).reason;
      if (subjectFacing == null || subjectFacing === "unknown") {
        subjectFacing = assessSubjectFacing(worldLm);
      }

      // Implement points come back in the exact same raw, unscaled Vision
      // convention as a joint (see AvImplementTracker's own comment) --
      // visionImplementToPoint applies the identical pixel-scale+Y-flip
      // transform worldLm above already went through, so scaling by the
      // same effectiveScale lands both in the same real-meters space.
      const leftImplementRaw = visionImplementToPoint(f.leftImplement, f);
      const rightImplementRaw = visionImplementToPoint(f.rightImplement, f);
      const leftImplement: ImplementPoint | null = leftImplementRaw
        ? { ...leftImplementRaw, x: leftImplementRaw.x * effectiveScale, y: leftImplementRaw.y * effectiveScale, z: 0 }
        : null;
      const rightImplement: ImplementPoint | null = rightImplementRaw
        ? { ...rightImplementRaw, x: rightImplementRaw.x * effectiveScale, y: rightImplementRaw.y * effectiveScale, z: 0 }
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
        ? { ...coreMlPointRaw, x: coreMlPointRaw.x * effectiveScale, y: coreMlPointRaw.y * effectiveScale, z: 0 }
        : null;

      const { fused: fusedLeft, nextPrev: nextPrevLeft } = fuseSide(worldLm, "left", leftImplement, prevFusedLeft, leftVelocitySamples, t, coreMlPoint, f);
      prevFusedLeft = nextPrevLeft;
      const { fused: fusedRight, nextPrev: nextPrevRight } = fuseSide(worldLm, "right", rightImplement, prevFusedRight, rightVelocitySamples, t, coreMlPoint, f);
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

    // The scale-free branch. Runs before anything that reads a real-world unit -- form-fault
    // detection, the range-of-motion plausibility check and the power maths all compare against
    // absolute centimetres and would be nonsense here.
    if (scaleRefusalMessage) {
      const unscaled = summarizeTrackedSet(
        normalizeTraceScale(trace),
        // No load: watts are mass times gravity times velocity, and the velocity is in arbitrary
        // units. A power number here would be wrong by whatever the scale turned out to be.
        undefined,
        undefined,
        firstMoveForExercise(exerciseName),
        rejectionEvents,
        1,
        // Rep boundaries relative to this take's own typical rep, since the absolute 20cm floor
        // means nothing without a scale.
        true,
      );
      const scaleFree = unscaled ? toScaleFreeMetrics(unscaled) : null;
      if (scaleFree) {
        await saveScaleFreeAndWarn(
          blob,
          scaleFree,
          scaleRefusalMessage,
          captureDeviceInfo,
          buildTrackingDiagnostics({
            outcome: "scale_free_only",
            message: scaleRefusalMessage,
            rawFrames,
            trackingMode: coreMlTrackingMode,
            recording: recordingStats,
            calibration: { scaleFactor: null, ...calibrationFrames },
          }),
          uploadPromise,
          forSetNumber,
        );
        return;
      }
      // Not even a rep boundary could be found, so there is genuinely nothing to report.
      await saveEmptyAndWarn(
        blob,
        scaleRefusalMessage,
        captureDeviceInfo,
        buildTrackingDiagnostics({
          outcome: "empty_calibration_failed",
          message: scaleRefusalMessage,
          rawFrames,
          trackingMode: coreMlTrackingMode,
          recording: recordingStats,
          calibration: { scaleFactor: null, ...calibrationFrames },
        }),
        uploadPromise,
        forSetNumber,
      );
      return;
    }

    const metrics = summarizeTrackedSet(
      trace,
      loadKg,
      heightIn,
      // Was undefined: this native path -- the one that actually runs on the phone -- passed no
      // starting direction at all, so every rep's concentric was decided by phase speed alone.
      // The manual has a definitive answer for all 91 bar-path lifts, including every bench and
      // overhead press, which the movementType taxonomy could never supply.
      firstMoveForExercise(exerciseName),
      rejectionEvents,
      positionScaleCorrection ?? 1,
    );
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
          trackingMode: coreMlTrackingMode,
          recording: recordingStats,
          calibration: { scaleFactor, ...calibrationFrames },
        }),
        uploadPromise,
        forSetNumber,
      );
      return;
    }

    // Last line of defence, and the only one no camera angle can defeat: every check before
    // this asks whether the geometry LOOKED trustworthy, and two versions of that got fooled by
    // a real bench set filmed from the foot of the bench. This asks whether the ANSWER is
    // possible for a human body. A calibration off by 4x cannot hide from it, whatever the
    // camera was doing. Routed through the same saveEmptyAndWarn path a failed calibration
    // already uses -- the clip is still saved for the coach, only the numbers are withheld.
    const romProblem = implausibleRangeOfMotion(
      metrics.romCm,
      heightIn,
      // Not expectedPatternFromName: that one's answers also drive the pattern-mismatch trust
      // penalty, which only means anything across the four patterns guessMovementPattern can
      // return. See romBucketForExercise's own comment.
      romBucketForExercise(exerciseName),
    );
    if (romProblem) {
      const message = `${romProblem} Film this lift square to the side, with the camera level with the bar, and make sure you're fully in frame.`;
      await saveEmptyAndWarn(
        blob,
        message,
        captureDeviceInfo,
        buildTrackingDiagnostics({
          outcome: "empty_implausible_scale",
          message,
          rawFrames,
          trackingMode: coreMlTrackingMode,
          recording: recordingStats,
          calibration: { scaleFactor, ...calibrationFrames },
        }),
        uploadPromise,
        forSetNumber,
      );
      return;
    }

    // Filmed from the wrong side. Not a degradation: the fault that matters most on a bar-path
    // lift is forward-and-back drift, and from the front that drift points straight at the lens
    // where a single camera cannot resolve it at all. Surfaced as a warning on the take rather
    // than a refusal, since everything vertical -- rep count, timing, range of motion -- is still
    // measured correctly from there.
    const viewProblem = cameraViewMismatch(
      subjectFacing ?? "unknown",
      expectedCameraView(exerciseName),
    );
    if (viewProblem) toast.warning(viewProblem, { duration: 8000 });

    // On an Olympic lift the bar deliberately does not travel a straight vertical line -- it
    // loops back around the knees and in under the athlete. Bar-path deviation measures distance
    // from a straight line and peak velocity is read off that same trace, so on these lifts a
    // technically correct rep scores WORSE than a bad one hauled up in a straight line. Those
    // two numbers are not imprecise here, they are inverted, so they are withheld rather than
    // shown with a caveat nobody reads. Range of motion, timing, velocity loss and rep count all
    // still mean what they usually mean and are kept.
    const olympicPath = barPathAssumptionInvalid(exerciseName);
    if (olympicPath) {
      metrics.barPathDeviationCm = null;
      metrics.peakVelocityMps = null;
      metrics.peakPowerWatts = null;
      // Per-rep values are left as computed and flagged instead of nulled: they feed internal
      // maths and several existing charts that type them as plain numbers, and threading a null
      // through all of that to express one lift family's caveat would push the question onto
      // every consumer. The flag is the signal not to chart them.
      metrics.barPathAssumptionInvalid = true;
    }

    metrics.formFaults = detectFormFaults(
      frames,
      // 0, not the withheld null: on an Olympic lift there is no meaningful drift to flag, and
      // 0 is how this parameter spells "nothing to report" to the fault detector.
      metrics.barPathDeviationCm ?? 0,
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
      // A correct side view used to arrive here as "unknown" and cost the take 10 trust points
      // with the note "Camera framing couldn't be confirmed". assessCameraAlignment asks whether
      // the athlete is squared up to the lens, which is false by definition when they are side-on
      // -- so the one camera position nearly every barbell lift requires scored worse than a
      // front view that cannot see bar drift at all. When the lift wants a side view and the
      // footage shows a side view, that is confirmed framing, not unconfirmed.
      expectedCameraView(exerciseName) === "side" && subjectFacing === "side_on"
        ? "ok"
        : alignmentReason,
      chainPenalties,
    );
    metrics.captureDeviceInfo = captureDeviceInfo;
    metrics.trackingDiagnostics = buildTrackingDiagnostics({
      outcome: "tracked",
      rawFrames,
      trackingMode: coreMlTrackingMode,
      recording: recordingStats,
      calibration: { scaleFactor, ...calibrationFrames },
    });

    // readerStatus exists specifically to tell "the athlete's take was genuinely short" apart
    // from "the native reader gave up partway through a longer recording" (see
    // AvAnalysisResult's own comment) -- until now that distinction only ever reached the
    // buried diagnostics report, so a truncated read (numbers computed from whatever fraction
    // of the set the reader got through before failing) looked identical to a clean, complete
    // one everywhere the athlete/coach could actually see. Only warns on a real partial-
    // progress failure (frameCount > 0) -- a reader that failed before processing anything
    // already surfaces as the "couldn't get a clean read" empty path above. Deliberately not
    // comparing elapsedSeconds (analysis wall-clock time) against assetDurationSeconds (the
    // clip's own length) to judge how much got covered -- analysis is normally FASTER than the
    // clip's real-time length (frame striding, no real-time playback constraint), so that
    // comparison would false-positive on plenty of ordinary, complete reads.
    if (recordingStats.readerStatus === "failed" && recordingStats.frameCount > 0) {
      toast.warning("Analysis was cut short partway through this set -- numbers below may not cover every rep.");
    }

    if (!recordVideo) {
      // No video saved this set -- skeleton replay has nothing to overlay, so there's nothing
      // worth attaching here (skeletonFrames without a video is orphaned data).
      onCapture(metrics, undefined, forSetNumber, null);
      onOpenChange(false);
      return;
    }

    // uploadPromise is always set here -- onBlobReady (stopTracking above) unconditionally
    // starts it whenever recordVideo is true, and the early return above already covers
    // !recordVideo. Falls back to a fresh upload rather than silently dropping the video if
    // that invariant is ever wrong.
    const inFlightUpload =
      uploadPromise ??
      uploadOrQueueVideo(
        blob,
        videoFilenameForBlob(blob, "form-check"),
        videoContext ?? { label: exerciseName },
        reportUploadProgress(forSetNumber),
      );
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
        onCapture(metrics, undefined, forSetNumber, skeletonFrames);
      } else {
        onCapture(metrics, result.url, forSetNumber, skeletonFrames);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Saved the set, but the clip failed to upload");
      onCapture(metrics, undefined, forSetNumber, skeletonFrames);
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
          <div ref={containerRef} className="absolute inset-0" style={{ background: "transparent" }}>
            <AvCameraChrome containerRef={containerRef} active={open} />
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

            {/* Shown before recording, not after. Camera angle decides which axis is even
                measurable (docs/camera-tracking-notes.md), so an athlete filming a squat from the
                front has not taken a slightly worse video -- they have taken one where bar drift,
                the fault that matters most on that lift, points straight at the lens and cannot
                be seen at all. Telling them afterwards costs them the set. */}
            {!recording && !analyzing && !saving && filmGuidance && (
              <div className="absolute inset-x-3 top-3 rounded-md bg-black/70 px-3 py-2 text-xs text-white">
                <p className="font-semibold uppercase tracking-wide text-white/60">Where to film from</p>
                <p className="mt-0.5">{filmGuidance.view}</p>
                <p className="mt-1.5 font-semibold uppercase tracking-wide text-white/60">Keep in frame</p>
                <p className="mt-0.5">{filmGuidance.inFrame}</p>
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

          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-center gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
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
