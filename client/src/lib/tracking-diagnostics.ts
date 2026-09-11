import type { PoseFrame as NativePoseFrame } from "@/lib/native-av-preview";
import { estimateImplementDiameterM, isPlausibleMedBallSize } from "@/lib/pose-tracking";

// Client-side mirror of trackingDiagnosticsSchema in shared/schema.ts -- kept in sync by hand,
// same pattern CaptureDeviceInfo (native-av-preview.ts) already uses rather than importing the
// zod schema's inferred type into every tracker dialog.
export type TrackingOutcome =
  | "tracked"
  | "empty_calibration_failed"
  | "empty_no_clean_read"
  // Calibration reported success but produced a physically impossible result -- see
  // implausibleRangeOfMotion in bar-tracking.ts. Distinct from empty_calibration_failed:
  // there, nothing calibrated; here, something did and was wrong, which is the more
  // dangerous case because it is the one that used to publish confident nonsense.
  | "empty_implausible_scale"
  // Not empty at all: no real-world scale could be established, so the metres, the metres per
  // second and the watts are withheld, but the times and ratios that never needed a scale are
  // saved. Distinct from empty_calibration_failed, which is the same cause with nothing kept.
  | "scale_free_only";

export type ScaleFreeSummary = {
  repCount: number;
  concentricSeconds: number;
  eccentricSeconds: number | null;
  velocityLossPercent: number | null;
  barPathDriftPercentOfRom: number | null;
  reps: {
    repNumber: number;
    concentricSeconds: number;
    eccentricSeconds: number | null;
    timeToPeakVelocitySeconds: number;
    relativePeakVelocity: number;
    depthDeg?: number | null;
  }[];
};

export type ReferenceObjectRead = {
  label: string;
  medianWidthPx: number;
  medianHeightPx: number;
  /** Wider over taller. A bumper plate should sit near 1; a long thin box is a bar or a rail. */
  aspectRatio: number;
  medianCenterXNorm: number;
  medianCenterYNorm: number;
  minConfidence: number;
  maxConfidence: number;
  samples: number;
};

export type TraceDiagnostics = {
  points: number;
  repsFound: number | null;
  /** Frames that produced a usable bar point, and the two ways a frame produces none: neither
   *  hand was seen at all, or a hand WAS seen and was thrown out for moving impossibly fast.
   *  Those two look identical in an empty trace and mean opposite things -- one is framing, the
   *  other is the filter. */
  framesUsable?: number;
  framesNoWristOrImplement?: number;
  framesVelocityRejected?: number;
  velocityRejections: number;
  largestGapSeconds: number | null;
};

export type TrackingDiagnostics = {
  outcome: TrackingOutcome;
  // Present only on a "scale_free_only" capture. Lives here rather than in repBreakdown because
  // that type's velocity fields are non-null and read by every chart downstream; widening them
  // to carry a null for this one case would push the question onto all of them.
  scaleFree?: ScaleFreeSummary | null;
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
    // DO THE TWO SYSTEMS ACTUALLY AGREE, FRAME BY FRAME.
    //
    // Body pose and the implement tracker both run on every frame and their readings are fused
    // per side, weighted by each one's confidence. Nothing recorded whether they were agreeing
    // while they did it. "763/763 frames had a body" and "left hand 691/763" sit next to each
    // other on the report and say nothing about whether those two were pointing at the same
    // place -- so a take where the tracker had quietly wandered onto the rack behind the lifter
    // reads identically to one where both were locked on the same hand all set.
    //
    // The gap is measured in the same pixel-space units the fusion itself works in, so it can be
    // held against a shoulder span from the scale candidates on the line above. A gap a
    // reasonable fraction of shoulder width is two systems watching one hand; a gap several times
    // that is two systems watching different objects and averaging them.
    sourceAgreement: {
      framesWithBoth: number;
      framesPoseOnly: number;
      framesImplementOnly: number;
      medianGapPx: number | null;
      maxGapPx: number | null;
    } | null;
  };

  calibration: {
    scaleFactor: number | null;
    // Where the real-world scale actually came from. "height" is the athlete's own stature, the
    // long-standing path; "plate" is a reference object measured in frame; "both" means the two
    // resolved independently and were averaged.
    //
    // Recorded because plate-derived scale is new and unvalidated. Its supporting training data
    // is a handful of instances from three photos, so the first numbers it produces need to be
    // attributable to it rather than blended anonymously into everything else -- that is exactly
    // what the replay harness needs to tell a good plate read from a bad one.
    scaleSource?: "height" | "plate" | "both" | "shoulder_width" | null;
    // WHAT EACH SOURCE ACTUALLY MEASURED, REPORTED WHETHER IT WON OR NOT.
    //
    // Three takes in a row came back with a range of motion several times too short, and every
    // round of diagnosis worked backwards from that one number to guess which source had gone
    // wrong and how. That is inference, not measurement, and it was wrong more often than it was
    // right. Recorded here instead: the size the plate was measured at and how many frames
    // agreed, the span the shoulders were measured at, the scale each source derived, and what
    // the reconciliation made of the set. A take that comes out wrong now says WHY in its own
    // report rather than leaving it to be reconstructed.
    scaleCandidates?: {
      source: string;
      scale: number;
      // The raw measurement behind it, in whatever unit that source works in -- a plate's
      // diameter in pixels, a shoulder span in pixel-space units. This is the number that goes
      // wrong when a detector locks onto the wrong object, and it was never visible.
      measured?: number | null;
      samples?: number | null;
    }[];
    // Named outliers from the reconciliation, with how far each sat from the chosen scale.
    scaleOutliers?: { source: string; ratioToChosen: number }[];
    // True only when two independent sources agreed. A lone source can be right, but nothing
    // corroborated it, and the difference matters when a number looks wrong later.
    scaleCorroborated?: boolean;
    // WHICH DIRECTION THE LIFT WAS MEASURED ALONG, AND HOW FAR THE TRACE ACTUALLY MOVED.
    //
    // A scale can be perfect and the take still come back with a range of motion several times
    // too short, because range of motion is the scale MULTIPLIED BY the distance the tracked
    // point travelled along the movement axis. Only the scale half was ever reported, so a
    // short reading could not be told apart from a scale error -- and every round of diagnosis
    // so far has assumed the scale.
    //
    // These are the other half, in raw pixels before any scale touches them. A trace that
    // travelled 80px when the plate beside it measures 510px did not move the length of a bench
    // press, whatever the scale says; a trace that travelled 420px did, and the scale is the
    // problem. One number separates the two, and it was never on the page.
    axisSource?: "grip" | "trace_covariance";
    gripPairsUsed?: number;
    traceTravelAlongPx?: number;
    traceTravelAcrossPx?: number;
    traceTravelAlongCm?: number;
    traceTravelAcrossCm?: number;
    // Frames thrown out for sitting too far off the bar's own line -- see dropAcrossAxisOutliers.
    tracePointsDroppedOffAxis?: number;
    // Candidates thrown out for implying an impossible athlete, with the height each implied.
    scalesRejectedAsImplausible?: { source: string; impliedHeightIn: number }[];
    noseToAnkleFrames: number;
    shoulderToAnkleFrames: number;
    supineFullLengthFrames?: number;
    unresolvedFrames: number;
    // WHAT THE REFERENCE-OBJECT DETECTOR ACTUALLY BOXED.
    //
    // The plate read is reported as one number -- the diameter it measured -- and that number
    // has been wrong on every take so far: 594px for something that should read about 94 on a
    // bench press, off by a similar factor on a squat. Rejected correctly each time, and each
    // time the only way to ask WHY was to reason backwards from the implied athlete height.
    //
    // A plate is a disc. Boxed properly it comes out close to square, sitting on the bar near
    // the hands. Its shape and where it sat are what say whether the detector found a plate at
    // all or something else entirely -- a rack upright, a bench end, the whole loaded bar -- and
    // neither was recorded. The confidence spread is here for the same reason: an average hides
    // a detector that was certain on four frames and guessing on fifty.
    referenceObject?: ReferenceObjectRead | null;
    /** Hand span in raw frame pixels, measured off the wrists with no calibration involved --
     *  the yardstick the plate read is checked against. See plateReadIsPlausibleAgainstGrip. */
    gripWidthPx?: number | null;
    /** True when a plate read was thrown out for being an impossible size next to that hand
     *  span. Recorded because the read still appears under referenceObject above, and a number
     *  shown without saying it was discarded is how a bad scale looked like a good one. */
    plateRejectedAgainstGrip?: boolean;
  } | null;
  // WHAT THE TRACE ITSELF CAME OUT AS, AND WHAT THE SEGMENTER MADE OF IT.
  //
  // A refused take said "couldn't get a clean read" and nothing else. Whether that meant six
  // tracked points or seven hundred, and whether the reps failed to separate or were never
  // there, had to be inferred backwards from the rest of the page -- which is guessing, and on a
  // real bench press it guessed wrong and told the athlete to keep the bar in frame when the bar
  // had never left it.
  //
  // These are the two numbers that separate those cases outright, plus what got thrown away on
  // the way: frames rejected for moving impossibly fast between samples, and the longest stretch
  // with no usable reading at all.
  trace?: TraceDiagnostics | null;
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
  // See sourceAgreement's own comment. Pose and implement readings are compared in the raw
  // normalized space both arrive in, then expressed in that frame's own pixels -- the units the
  // fusion and every scale candidate already work in.
  let framesWithBoth = 0;
  let framesPoseOnly = 0;
  let framesImplementOnly = 0;
  const gapsPx: number[] = [];
  const checkSize = trackingMode === "med_ball";
  for (const f of rawFrames) {
    for (const side of ["left", "right"] as const) {
      const implement = side === "left" ? f.leftImplement : f.rightImplement;
      const wrist = f.joints.find((j) => j.name === (side === "left" ? "leftWrist" : "rightWrist"));
      if (implement && wrist) {
        framesWithBoth++;
        gapsPx.push(
          Math.hypot(
            (implement.x - wrist.x) * f.frameWidth,
            (implement.y - wrist.y) * f.frameHeight,
          ),
        );
      } else if (wrist) {
        framesPoseOnly++;
      } else if (implement) {
        framesImplementOnly++;
      }
    }
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
    sourceAgreement:
      framesWithBoth + framesPoseOnly + framesImplementOnly > 0
        ? {
            framesWithBoth,
            framesPoseOnly,
            framesImplementOnly,
            medianGapPx: gapsPx.length > 0 ? round2(median(gapsPx)) : null,
            maxGapPx: gapsPx.length > 0 ? round2(Math.max(...gapsPx)) : null,
          }
        : null,
  };
}

// Median, not mean: the whole point of these is to survive a handful of frames where a tracker
// jumped somewhere it had no business being, which is exactly what a mean would follow.
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Assembled once per finished recording (success or a saveEmptyAndWarn-style failure) by every
// AV tracker dialog, from data each one already has in hand -- nothing new captured natively,
// just packaged and persisted instead of thrown away the moment the dialog closes. See this
// file's own TrackingDiagnostics comment, and trackingDiagnosticsSchema in shared/schema.ts.
export function buildTrackingDiagnostics(args: {
  outcome: TrackingOutcome;
  message?: string | null;
  /** Only ever set alongside outcome "scale_free_only". */
  scaleFree?: ScaleFreeSummary | null;
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
  calibration?: TrackingDiagnostics["calibration"];
  // See TrackingDiagnostics["trace"]. Passed in rather than derived here because only the caller
  // has the finished trace and whatever the segmenter made of it.
  trace?: TrackingDiagnostics["trace"];
}): TrackingDiagnostics {
  return {
    outcome: args.outcome,
    trace: args.trace ?? null,
    scaleFree: args.scaleFree ?? null,
    message: args.message ?? null,
    recording: args.recording ?? null,
    bodyPose: summarizeBodyPose(args.rawFrames),
    objectDetection: summarizeObjectDetection(
      args.rawFrames, args.calibration?.scaleFactor ?? null, args.trackingMode ?? null,
    ),
    calibration: args.calibration ?? null,
  };
}
