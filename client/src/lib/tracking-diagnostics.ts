import type { PoseFrame as NativePoseFrame } from "@/lib/native-av-preview";

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
  } | null;
  bodyPose: { framesTotal: number; framesWithBody: number; avgWristConfidence: number | null };
  objectDetection: {
    framesWithLeftImplement: number;
    framesWithRightImplement: number;
    avgImplementConfidence: number | null;
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
function summarizeObjectDetection(rawFrames: NativePoseFrame[]): TrackingDiagnostics["objectDetection"] {
  let framesWithLeftImplement = 0;
  let framesWithRightImplement = 0;
  let implConfSum = 0;
  let implConfCount = 0;
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
  }
  return {
    framesWithLeftImplement,
    framesWithRightImplement,
    avgImplementConfidence: implConfCount > 0 ? round2(implConfSum / implConfCount) : null,
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
    objectDetection: summarizeObjectDetection(args.rawFrames),
    calibration: args.calibration ?? null,
  };
}
