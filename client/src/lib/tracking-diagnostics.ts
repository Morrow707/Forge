import type { PoseFrame as NativePoseFrame } from "@/lib/native-av-preview";
import { estimateImplementDiameterM, isPlausibleMedBallSize } from "@/lib/pose-tracking";

// Client-side mirror of trackingDiagnosticsSchema in shared/schema.ts -- kept in sync by hand,
// same pattern CaptureDeviceInfo (native-av-preview.ts) already uses rather than importing the
// zod schema's inferred type into every tracker dialog.
export type TrackingOutcome = "tracked" | "empty_calibration_failed" | "empty_no_clean_read";

export type TrackingDiagnostics = {
  outcome: TrackingOutcome;
  message: string | null;
  recording: {
    frameCount: number;
    trackedFrameCount: number;
    elapsedSeconds: number;
    // What the recorded asset's own metadata says its total length is, and what the native
    // AVAssetReader's read loop actually stopped on -- see AvBodyTrackingPlugin.swift's own
    // comment on this same pair. Optional (not every recordingStats a caller has lying around
    // predates this existing, e.g. anything computed before this field shipped) -- a report
    // rendering this just omits the comparison rather than showing "undefined."
    assetDurationSeconds?: number;
    readerStatus?: string;
    readerErrorMessage?: string;
    visionFailureCount?: number;
    thermalState?: string;
    lowPowerModeEnabled?: boolean;
    freeDiskSpaceBytes?: number;
    maxInterFrameGapSeconds?: number;
    // Box-jump-only -- see shared/schema.ts's trackingDiagnosticsSchema comment on this same
    // field for the full explanation of why it's separate from objectDetection below.
    boxTopNormalizedY?: number;
  } | null;
  bodyPose: { framesTotal: number; framesWithBody: number; avgWristConfidence: number | null };
  objectDetection: {
    framesWithLeftImplement: number;
    framesWithRightImplement: number;
    avgImplementConfidence: number | null;
    // Med-ball-only (see AvCoreMlImplementDetector.swift/PoseCoreMlImplement) -- the model's own
    // reported confidence, averaged across every sampled frame that had a detection at all.
    // Independent of scaleFactor (unlike coreMlSizeCheck below) -- this is the model's own
    // opinion, not a real-world cross-check, so it's available even when calibration failed.
    framesWithCoreMlImplement: number;
    avgCoreMlConfidence: number | null;
    // How many of those detections had an estimated real-world size implausible for an actual
    // medicine ball (see pose-tracking.ts's isPlausibleMedBallSize). Only ever populated when
    // trackingMode was "med_ball" -- MED_BALL_PLAUSIBLE_DIAMETER_RANGE_M is a med-ball-specific
    // bound, and running it against a barbell/plate/dumbbell/kettlebell detection would flag
    // essentially every reading as "implausible" (those are all bigger than a med ball), a false
    // alarm that looked like a real failure on a live Bench Press clip -- there's no equivalent
    // plausibility range for the other classes yet, so this stays null rather than reporting a
    // check that isn't actually measuring anything meaningful for them. Also null whenever
    // calibration failed for this clip (no scale factor to convert pixels to meters with), not
    // just when no CoreML model is bundled -- all three cases mean "nothing to report," but for
    // different reasons.
    coreMlSizeCheck: { framesChecked: number; implausibleCount: number } | null;
  };
  calibration: {
    scaleFactor: number | null;
    noseToAnkleFrames: number;
    shoulderToAnkleFrames: number;
    unresolvedFrames: number;
  } | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// "The AI" -- summarizes Vision's own per-frame body-pose output (already sitting in every AV
// tracker dialog's `rawFrames`, the same array each dialog already builds worldLandmarks from)
// into how much of the clip actually had a body in it, and how confident Vision was in the
// wrist specifically -- the one joint every fusion pipeline here actually leans on.
function summarizeBodyPose(rawFrames: NativePoseFrame[]): TrackingDiagnostics["bodyPose"] {
  let framesWithBody = 0;
  let wristConfSum = 0;
  let wristConfCount = 0;
  for (const f of rawFrames) {
    if (f.tracked) framesWithBody++;
    for (const j of f.joints) {
      if (j.name === "leftWrist" || j.name === "rightWrist") {
        wristConfSum += j.confidence;
        wristConfCount++;
      }
    }
  }
  return {
    framesTotal: rawFrames.length,
    framesWithBody,
    avgWristConfidence: wristConfCount > 0 ? round2(wristConfSum / wristConfCount) : null,
  };
}

// Object detection -- AvImplementTracker.swift's own per-frame lock, summarized the same way.
// All-zero on a bar/implement exercise is the single most useful "why did this fail" signal on
// its own: it means the implement tracker never locked onto anything for the whole clip,
// independent of how well the body itself tracked.
// scaleFactor is the same pixels-per-meter... meters-per-pixel scale calibrateFromFrames
// already computes for this clip -- null whenever calibration itself failed, in which case
// coreMlSizeCheck comes back null too (nothing to convert CoreML boxes' pixel sizes into real
// meters with).
function summarizeObjectDetection(
  rawFrames: NativePoseFrame[],
  scaleFactor: number | null,
  trackingMode: string | null,
): TrackingDiagnostics["objectDetection"] {
  let framesWithLeftImplement = 0;
  let framesWithRightImplement = 0;
  let implConfSum = 0;
  let implConfCount = 0;
  let framesWithCoreMlImplement = 0;
  let coreMlConfSum = 0;
  let coreMlFramesChecked = 0;
  let coreMlImplausibleCount = 0;
  const checkSize = trackingMode === "med_ball";
  for (const f of rawFrames) {
    if (f.leftImplement) {
      framesWithLeftImplement++;
      implConfSum += f.leftImplement.confidence;
      implConfCount++;
    }
    if (f.rightImplement) {
      framesWithRightImplement++;
      implConfSum += f.rightImplement.confidence;
      implConfCount++;
    }
    if (f.coreMlImplement) {
      framesWithCoreMlImplement++;
      coreMlConfSum += f.coreMlImplement.confidence;
      if (checkSize && scaleFactor != null) {
        coreMlFramesChecked++;
        const diameterM = estimateImplementDiameterM(
          f.coreMlImplement, f.frameWidth, f.frameHeight, scaleFactor,
        );
        if (!isPlausibleMedBallSize(diameterM)) coreMlImplausibleCount++;
      }
    }
  }
  return {
    framesWithLeftImplement,
    framesWithRightImplement,
    avgImplementConfidence: implConfCount > 0 ? round2(implConfSum / implConfCount) : null,
    framesWithCoreMlImplement,
    avgCoreMlConfidence: framesWithCoreMlImplement > 0 ? round2(coreMlConfSum / framesWithCoreMlImplement) : null,
    coreMlSizeCheck:
      checkSize && scaleFactor != null
        ? { framesChecked: coreMlFramesChecked, implausibleCount: coreMlImplausibleCount }
        : null,
  };
}

// Assembled once per finished recording (success or a saveEmptyAndWarn-style failure) by every
// AV tracker dialog, from data each one already has in hand -- nothing new captured natively,
// just packaged and persisted instead of thrown away the moment the dialog closes. See this
// file's own TrackingDiagnostics comment, and trackingDiagnosticsSchema in shared/schema.ts.
export function buildTrackingDiagnostics(args: {
  outcome: TrackingOutcome;
  message?: string | null;
  rawFrames: NativePoseFrame[];
  // Which CoreML class (if any) was actually requested for this clip -- see
  // summarizeObjectDetection's own checkSize for why coreMlSizeCheck only means something for
  // "med_ball". Omitted callers (any tracker dialog that hasn't been updated to pass this yet)
  // get the same safe "don't report a check that isn't real" behavior as an explicit null.
  trackingMode?: string | null;
  recording?: {
    frameCount: number;
    trackedFrameCount: number;
    elapsedSeconds: number;
    assetDurationSeconds?: number;
    readerStatus?: string;
    readerErrorMessage?: string;
    visionFailureCount?: number;
    thermalState?: string;
    lowPowerModeEnabled?: boolean;
    freeDiskSpaceBytes?: number;
    maxInterFrameGapSeconds?: number;
    boxTopNormalizedY?: number;
  } | null;
  calibration?: {
    scaleFactor: number | null;
    noseToAnkleFrames: number;
    shoulderToAnkleFrames: number;
    unresolvedFrames: number;
  } | null;
}): TrackingDiagnostics {
  return {
    outcome: args.outcome,
    message: args.message ?? null,
    recording: args.recording ?? null,
    bodyPose: summarizeBodyPose(args.rawFrames),
    objectDetection: summarizeObjectDetection(
      args.rawFrames, args.calibration?.scaleFactor ?? null, args.trackingMode ?? null,
    ),
    calibration: args.calibration ?? null,
  };
}
