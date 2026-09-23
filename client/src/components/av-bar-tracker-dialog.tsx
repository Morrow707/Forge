import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/queryClient";
import {
  uploadOrQueueVideo,
  attachUploadedVideoInBackground,
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
  visionImplementToPoint,
  visionCoreMlBoxToPoint,
  visionRefineGripSeed,
  type ImplementPoint,
} from "@/lib/vision-body-landmarks";
import type {
  PoseFrame as NativePoseFrame,
  CaptureDeviceInfo,
  AvObjectLockTelemetry,
} from "@/lib/native-av-preview";
import { referenceObjectVerdict, MIN_YARDSTICK_PX } from "@shared/tracker-arbiter";
import {
  POSE_LANDMARKS,
  detectFormFaults,
  worldVerticalSign,
  shoulderWidthScaleFromFrames,
  reconcileScaleEstimates,
  rejectImplausibleScales,
  plateReadIsPlausibleAgainstGrip,
  impliedBodyLengthUnits,
  tiltDegreesFromPoints,
  usesSharedBarEquipment,
  alignmentReasonWithoutDepth,
  trustAlignmentReason,
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
  type FormFaultThresholds,
} from "@/lib/pose-tracking";
import {
  buildTrackingDiagnostics,
  type TrackingDiagnostics,
  type ReferenceObjectRead,
} from "@/lib/tracking-diagnostics";
import {
  summarizeTrackedSet,
  interpolateOcclusionGap,
  barPointFromSides,
  medianHalfSpan,
  torsoAnchorFrom,
  torsoAnchorIsStable,
  torsoWasAtRest,
  torsoRestSpreadGrips,
  TORSO_ANCHOR_HISTORY,
  computeArmDriveAsymmetry,
  computeRepTrustScores,
  implausibleRangeOfMotion,
  implausibleBarPathDeviation,
  traceSpanAlongLift,
  movementAxisFromGrip,
  dropAcrossAxisOutliers,
  toScaleFreeMetrics,
  normalizeTraceScale,
  type ScaleFreeMetrics,
  MIN_TRACKING_CONFIDENCE,
  type RepMetrics,
  type TrackedPoint,
  type VelocitySample,
  VELOCITY_SMOOTHING_MS,
} from "@/lib/bar-tracking";
import { expectedPatternFromName } from "@/components/bar-tracker-dialog";
import {
  postureForExercise,
  heightCalibrationUnreliable,
  filmGuidanceForExercise,
  barPathAssumptionInvalid,
  expectedCameraView,
  calibrationRefusalReasonForScale,
  firstMoveForExercise,
  romBucketForExercise,
} from "@/lib/exercise-camera-profile";
import { videoFilenameForBlob } from "@/lib/video-recording";
import type { Landmark } from "@mediapipe/tasks-vision";

/** AVFoundation + Vision bar-path/full mode tracking -- the last tracker mode converted off
 * ARKit (see ArBarTrackerDialog for the fallback this replaces, kept completely untouched per
 * the plan's own Context section). Same "needs a held implement, not just a body joint" problem
 * ArBarTrackerDialog solved for ARKit, now solved for this pipeline by AvBodyTrackingPlugin.swift's implement tracker
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
// A LOADED BARBELL IS TRACKED BY ITS PLATES.
//
// This asked the detector for the "barbell" class, which had two consequences and both were bad.
// The bar is a thin dark line against a gym full of thin dark lines, so it is the hardest thing
// in the frame to find; and plateScaleFromFrames, the one calibration in this app that measures
// an object of KNOWN SIZE rather than the athlete, only runs when the detector was asked for
// plates. So every barbell lift was tracked off the least visible object present and then had to
// derive real-world scale from the lifter's body -- which is what forced the whole posture
// question, refused a bench press outright for being done lying down, and left an athlete
// filming from a normal angle with no numbers.
//
// The plate is the obvious reference and it was there the whole time: a 45cm disc, the largest
// high-contrast object on the bar, and unlike a body it does not foreshorten in a way that
// matters. A circle viewed from any angle is an ellipse whose LONG axis is still its true
// diameter, which is exactly why it works from the side, the front, the foot of a bench or 45
// degrees off it. Scale from the equipment does not care where the camera is standing. Scale
// from a body does, and that is the entire source of the angle problem.
const COREML_TRACKING_MODE_BY_EQUIPMENT: Record<string, string> = {
  Barbell: "plate",
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
// HOW WIDE THE HANDS WERE, IN RAW FRAME PIXELS, WITH NO CALIBRATION INVOLVED.
//
// Measured straight off the wrist joints, in the same raw pixel units the CoreML box is measured
// in, so the two can be divided. Deliberately independent of every scale: this exists to CHECK a
// scale, so it cannot depend on one.
//
// Median over the take, and only frames where both wrists were seen. A bench press holds a fixed
// grip for the whole set, so the median is a solid read even when individual frames are noisy.
function gripWidthPxFromFrames(frames: NativePoseFrame[]): number | null {
  const widths: number[] = [];
  for (const f of frames) {
    const left = f.joints.find((j) => j.name === "leftWrist");
    const right = f.joints.find((j) => j.name === "rightWrist");
    if (!left || !right) continue;
    if (left.confidence < MIN_JOINT_CONFIDENCE_FOR_GRIP || right.confidence < MIN_JOINT_CONFIDENCE_FOR_GRIP) continue;
    const width = Math.hypot((right.x - left.x) * f.frameWidth, (right.y - left.y) * f.frameHeight);
    if (width > 0) widths.push(width);
  }
  if (widths.length < MIN_CALIBRATION_SAMPLES) return null;
  widths.sort((a, b) => a - b);
  return widths[Math.floor(widths.length / 2)];
}

const MIN_JOINT_CONFIDENCE_FOR_GRIP = 0.3;

/**
 * WHERE THE ATHLETE WAS, FOR THE TAKE, SO A REFERENCE OBJECT CAN BE HELD AGAINST IT.
 *
 * The per-frame version of this lives in Swift, where it gates the lock in real time (see
 * AvTrackerArbiter). This is its once-per-take twin: medians over the whole clip, because a
 * reference-object scale is itself a median over the whole clip and the two have to be measured
 * the same way to be compared. A handful of frames where the athlete was occluded should no more
 * veto the scale than they should move it.
 *
 * Uses only the frames where BOTH wrists cleared the confidence floor, matching
 * gripWidthPxFromFrames exactly -- so the anchor and the yardstick describe the same set of
 * frames, rather than an anchor drawn from moments the yardstick knows nothing about.
 */
function takeBodyReference(frames: NativePoseFrame[]): {
  anchor: { x: number; y: number } | null;
  yardstick: { px: number; source: "grip" } | null;
  frameWidth: number;
  frameHeight: number;
} {
  const xs: number[] = [];
  const ys: number[] = [];
  let frameWidth = 0;
  let frameHeight = 0;
  for (const f of frames) {
    if (f.frameWidth > 0 && f.frameHeight > 0) {
      frameWidth = f.frameWidth;
      frameHeight = f.frameHeight;
    }
    const left = f.joints.find((j) => j.name === "leftWrist");
    const right = f.joints.find((j) => j.name === "rightWrist");
    if (!left || !right) continue;
    if (left.confidence < MIN_JOINT_CONFIDENCE_FOR_GRIP || right.confidence < MIN_JOINT_CONFIDENCE_FOR_GRIP) continue;
    xs.push((left.x + right.x) / 2);
    ys.push((left.y + right.y) / 2);
  }
  const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const gripPx = gripWidthPxFromFrames(frames);
  return {
    anchor: xs.length > 0 ? { x: med(xs), y: med(ys) } : null,
    yardstick: gripPx != null && gripPx >= MIN_YARDSTICK_PX ? { px: gripPx, source: "grip" } : null,
    frameWidth,
    frameHeight,
  };
}


// How square a box has to be before it can only be a disc seen face-on. A 450mm plate viewed
// square is 1.0; the tolerance covers the detector's own box slop and a few degrees of tilt.
// Wider than this and the ellipse is telling you the camera is off-axis, so the long edge is no
// longer a diameter and the grip cross-check earns its place again.
const PLATE_DISC_ASPECT_LOW = 0.8;
const PLATE_DISC_ASPECT_HIGH = 1.25;

// AND A DISC STILL HAS TO BE PLATE-SIZED. This is the bound the shape check had no business
// going without.
//
// From Scott's bench, 2026-09-22, set 2: the detector boxed something 582.8 x 567.4px -- aspect
// 1.03, as square as a read gets, 42 samples at 0.7-1.0 confidence, sitting dead centre in the
// frame. Shape alone says disc, so the shape bypass would have handed its long edge over as a
// 450mm diameter. His grip in that same take measured 129.5px. A 450mm plate 4.51x the width of
// a man's bench grip is a plate two metres across; the object is a rack upright, a bench pad or
// a mirror, and the scale it implies is out by about five.
//
// The bypass exists because an off-square GRIP cannot referee a plate (that is the foreshortened
// ruler this whole angle problem is about). It does not follow that NOTHING can. A ratio this
// gross is not a question about camera angle -- no angle makes a plate five times a grip -- so
// the grip keeps its veto at the extremes and loses it only in the band where foreshortening is
// a plausible explanation for the disagreement.
//
// This is not the camera rejecting a take. Nothing is withheld either way: it decides WHICH of
// two rulers the take is measured with, and the other one (shoulder breadth) is still there. See
// RULE #1 at the top of CLAUDE.md -- that rule is about never refusing to write a number, not
// about accepting a ruler the geometry has already ruled out.
const PLATE_DISC_MAX_GRIP_RATIO = 2.6;

function plateScaleFromFrames(
  frames: NativePoseFrame[],
  trackingMode: string | undefined,
): {
  scale: number;
  uncertaintyFraction: number;
  measured: number;
  samples: number;
  // What the detector actually boxed, not just how wide it came out. See the referenceObject
  // field in tracking-diagnostics.ts: a plate is a disc and should box near square, on the bar,
  // near the hands. Shape and position are what separate a real plate read from a rack upright.
  shape: ReferenceObjectRead;
} | null {
  // WHICHEVER DETECTOR SAW THE PLATE, NOT WHICHEVER ONE WAS ASKED FIRST.
  //
  // The clip now carries two classes (see AvCoreMlImplementDetector.secondaryLabel): the class
  // the caller asked for, tracked every frame, and the other half of a loaded barbell, sampled.
  // Which of the two is the plate depends on the tracking mode, and a plate is a plate whichever
  // slot it arrived in -- so this reads the one that IS one rather than the one that happens to
  // be primary. Before, asking for the bar meant no plate was measured all take even though the
  // detector was perfectly capable of finding one, which is the entire reason scale kept falling
  // back onto the athlete's body and dragging camera angle in with it.
  const plateIsPrimary = trackingMode === "plate";
  const plateIsSecondary = trackingMode === "barbell";
  if (!plateIsPrimary && !plateIsSecondary) return null;
  const samples: number[] = [];
  const widths: number[] = [];
  const heights: number[] = [];
  const centersX: number[] = [];
  const centersY: number[] = [];
  const confidences: number[] = [];
  for (const f of frames) {
    const box = plateIsPrimary
      ? f.coreMlImplement
      : f.coreMlSecondary?.label === "plate"
        ? f.coreMlSecondary
        : undefined;
    if (!box || box.confidence < COREML_MIN_CONFIDENCE_TO_PENALIZE) continue;
    const widthPx = box.width * f.frameWidth;
    const heightPx = box.height * f.frameHeight;
    const pixelSize = Math.max(widthPx, heightPx);
    if (pixelSize > 0) {
      samples.push(pixelSize);
      widths.push(widthPx);
      heights.push(heightPx);
      centersX.push(box.x);
      centersY.push(box.y);
      confidences.push(box.confidence);
    }
  }
  if (samples.length < MIN_CALIBRATION_SAMPLES) return null;
  samples.sort((a, b) => a - b);
  const medianPixelSize = samples[Math.floor(samples.length / 2)];
  const reference = CALIBRATION_REFERENCES.find((r) => r.id === "bumper_plate_perform_better")!;
  const computed = computeReferenceObjectScale(
    medianPixelSize,
    reference.nominalSizeM,
    reference.toleranceM,
  );
  // The measured diameter travels with the scale. When a plate read goes wrong it is because the
  // detector measured the wrong thing -- a plate on the rack behind the lifter, a bench end, a
  // dark patch -- and that shows up as a pixel size nothing like a plate at that distance. It was
  // invisible before, so a bad read could only be inferred backwards from a wrong range of
  // motion, which is guessing.
  // Median throughout -- a detector that jumped to the wrong object on a handful of frames is
  // exactly what these exist to expose, and a mean would follow it there.
  const med = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const medianWidthPx = med(widths);
  const medianHeightPx = med(heights);
  const shape = {
    label: plateIsPrimary ? "plate (primary)" : "plate (secondary)",
    medianWidthPx: round2(medianWidthPx),
    medianHeightPx: round2(medianHeightPx),
    aspectRatio: medianHeightPx > 0 ? round2(medianWidthPx / medianHeightPx) : 0,
    medianCenterXNorm: round2(med(centersX)),
    medianCenterYNorm: round2(med(centersY)),
    minConfidence: round2(Math.min(...confidences)),
    maxConfidence: round2(Math.max(...confidences)),
    samples: samples.length,
  };
  return computed ? { ...computed, measured: medianPixelSize, samples: samples.length, shape } : null;
}

// Every field the RepMetrics type marks `| null` stays null here, not 0 -- see romCm's and
// peakVelocityMps' own comments in bar-tracking.ts ("zero would be a different lie: charts
// plot it, coaches read it"). This constant is exactly the case those comments warn about: a
// refused take (failed calibration, implausible range of motion, no clean read) with nothing
// to report. The fields the type keeps non-nullable (concentricSeconds/eccentricSeconds/
// eccentricMeanVelocityMps) stay 0, since scale-free timing values are legitimately zero for a
// take with no reps, and the type does not offer null for them. meanEai USED to sit in that
// list for exactly that reason; it is nullable now (a set whose trace was too coarse has no
// EAI to average), so it follows the rule above rather than the exception.
const EMPTY_REP_METRICS: RepMetrics = {
  peakVelocityMps: null,
  meanVelocityMps: null,
  concentricSeconds: 0,
  eccentricSeconds: 0,
  barPathDeviationCm: null,
  barPathTrace: [],
  repBreakdown: [],
  meanEai: null,
  formFaults: [],
  peakPowerWatts: null,
  meanPowerWatts: null,
  eccentricMeanVelocityMps: 0,
  romCm: null,
  velocityLossPercent: null,
};


// THE BASELINE THIS IS MEASURED OVER HAS TO BE A REAL INTERVAL, NOT ONE FRAME.
//
// Same 120fps arithmetic that MIN_VELOCITY_BASELINE_MS fixed in bar-tracking.ts, in the gate
// that runs BEFORE any of that: this compared each point to the one immediately before it, which
// at 120fps is 8.3ms apart. Divide any landmark jitter by 0.0083s and it reads as an enormous
// instantaneous velocity, so the filter threw out real bar points for the crime of being sampled
// quickly. On Scott's side-on bench, 2026-09-22, it dropped 284 of them -- and took a whole rep
// with them (9 found against 10 on the bar sensor, largest trace gap 1.735s).
//
// The threshold itself was never wrong; the denominator was. Comparing against the most recent
// accepted point at least MIN_PLAUSIBILITY_BASELINE_MS old measures how fast the bar is actually
// travelling instead of how noisy one frame was. A take that really does contain an impossible
// jump still fails it, because a jump does not undo itself over 33ms.
//
// This is not the camera rejecting a take (RULE #1): it drops a SAMPLE, which is exactly the
// filtering that rule explicitly preserves. The point is that it was dropping GOOD samples.
const MIN_PLAUSIBILITY_BASELINE_MS = 33;

function isPlausibleVelocity(
  recent: { x: number; y: number; t: number }[],
  next: { x: number; y: number; t: number },
): boolean {
  if (recent.length === 0) return true;
  // The oldest accepted point still inside the window, falling back to the newest when the
  // window has not filled yet (the first frames of a take, or a 30fps device where one frame
  // already spans the baseline).
  let baseline = recent[recent.length - 1];
  for (const p of recent) {
    if (next.t - p.t >= MIN_PLAUSIBILITY_BASELINE_MS) {
      baseline = p;
      break;
    }
  }
  const dt = (next.t - baseline.t) / 1000;
  if (dt <= 0) return false;
  const MAX_PLAUSIBLE_VELOCITY_MPS = 3;
  const dist = Math.hypot(next.x - baseline.x, next.y - baseline.y);
  return dist / dt <= MAX_PLAUSIBLE_VELOCITY_MPS;
}

// Enough accepted points to span the baseline at 120fps with room to spare.
const PLAUSIBILITY_HISTORY = 8;

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
  onAnalysisProgress,
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
  // THE OTHER HALF OF THE WAIT, REPORTED SEPARATELY. onUploadProgress is the save; this is the
  // analysis, which is the slower of the two and until now showed no number at all. Two
  // callbacks rather than one shared percentage, because the athlete is asking which half they
  // are waiting on, and one bar cannot answer that.
  onAnalysisProgress?: (setNumber: number, percent: number) => void;
}) {
  const filmGuidance = filmGuidanceForExercise(exerciseName);
  // Where to film from is the one instruction that decides whether the take is measurable at
  // all, so it opens as a card in the middle of the screen that has to be dismissed, not a
  // strip pinned to the top. Pinned to the top it landed under the status bar and behind the
  // zoom control, which is how a bench press got filmed from the foot of the bench -- the view
  // the text itself rules out, on the take where the tracker then found two reps out of ten.
  // Dismissal is per-open rather than remembered: the right camera position is a different
  // sentence for every lift, and the cost of reading it again is a tap.
  const [guidanceDismissed, setGuidanceDismissed] = useState(false);
  useEffect(() => {
    if (open) setGuidanceDismissed(false);
  }, [open]);
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
  // Ask for the PLATE class on any lift whose posture rules out height calibration.
  //
  // plateScaleFromFrames has been fully built this whole time and has never once run, because
  // nothing ever set this to "plate". Everything else is in place: the reference plate's real
  // measured diameter, the larger-axis rule for a foreshortened plate, the averaging against a
  // height-derived scale when both resolve.
  //
  // Three reasons this is the right class to ask for on these lifts specifically. They are the
  // lifts with no scale at all, so a reference object is the only route to real centimetres and
  // watts. A barbell lift performed lying down has loaded plates square in frame. And the
  // equipment classes cost nothing to give up here: the shipped model regressed barbell to about
  // 0.02 and dumbbell to about 0.14 confidence, both far under the gate, while the plate class
  // came through that same retrain intact.
  //
  // Held loosely on purpose. The plate class's supporting data is eleven instances from three
  // photos and the training script rebuilds from scratch each time, so this is worth measuring
  // through the replay harness before anyone treats a plate-derived scale as settled.
  const coreMlTrackingMode: string | undefined = heightCalibrationUnreliable(exerciseName, movementType)
    ? "plate"
    : equipment
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
  // THE SET COMES BACK NOW. THE VIDEO CATCHES UP ON ITS OWN.
  //
  // Every path below used to AWAIT the upload before handing the metrics up and closing, so the
  // athlete stood watching a bar for a file that has nothing to do with their numbers -- counted
  // at about 22 seconds on a 1080p/120fps take, 2026-09-22: "22 seconds is far too long."
  //
  // The analysis is finished by the time any of this runs. So the set is handed up and the
  // dialog closes immediately, and the upload continues in the background: when it lands,
  // attachUploadedVideoInBackground links it to the set by row id (tuple fallback) and announces
  // it, which is the same path a Wi-Fi-queued clip already takes. An open workout page patches
  // its own copy from that event -- without it the next autosave would overwrite the day and
  // take the fresh attachment with it.
  //
  // `videoContext.reattach` is what makes the link possible. Without it the clip lands in the
  // Video Bank's unattached list rather than on the set, which is the existing behaviour for a
  // clip whose target is unknown -- worse than attaching, far better than making somebody wait.
  function uploadInBackground(
    uploadPromise: Promise<{ status: "uploaded"; url: string } | { status: "queued" }>,
    context: VideoRecordContext,
  ) {
    void uploadPromise
      .then(async (result) => {
        if (result.status === "queued") {
          if (!hasWarnedAboutQueueing()) {
            markWarnedAboutQueueing();
            toast.info(
              "No Wi-Fi -- the video is saved on your device and will upload for your coach once connected. "
                + "You can also send it manually from the Video Bank.",
              { duration: 10000 },
            );
          }
          return;
        }
        await attachUploadedVideoInBackground(context, result.url);
      })
      .catch((err) => {
        const detail = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
        // The SET is already saved by this point, which is the whole intent -- this toast is
        // about the clip alone, and says so rather than reading as a lost set.
        toast.error(`Your set saved, but the video didn't: ${detail}`);
      });
  }

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
        toast.error(`${message} (Video uploading for your coach.)`);
        onCapture(emptyMetrics, undefined, forSetNumber);
        onOpenChange(false);
        uploadInBackground(uploadPromise, videoContext ?? { label: exerciseName });
      } catch (err) {
        const detail = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
        toast.error(`${message} And the video didn't save either: ${detail}`);
        // THE TAKE STILL HAPPENED, EVEN IF ITS CLIP DID NOT ARRIVE.
        //
        // This used to toast and stop: no onCapture, no close. The metrics AND the
        // trackingDiagnostics blob -- the only record of WHY this capture was refused -- were
        // dropped on the floor because a separate thing, the video upload, failed. The set
        // kept its typed reps and weight and nothing anywhere said a camera had ever been
        // pointed at it, so the take vanished from the tracking report too.
        //
        // The asymmetry is the tell: finishWithRecording's own catch (the SUCCESS path) has
        // always called onCapture here and closed. So a good capture survived a failed upload
        // and a refused one did not -- exactly backwards, since the refused take is the one
        // whose diagnostics somebody needs to read.
        onCapture(emptyMetrics, undefined, forSetNumber);
        onOpenChange(false);
      } finally {
        setSaving(false);
      }
    } else {
      toast.error(message);
      // Same reasoning as the catch above, for the no-video case: a refused take with no clip
      // to upload still produced a diagnostics record, and dropping it here left the set looking
      // as though the camera had never run. This branch only ever toasted.
      onCapture(emptyMetrics, undefined, forSetNumber);
      onOpenChange(false);
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
  /// A TAKE WHOSE SCALE IS SUSPECT STILL SAVES ITS NUMBERS.
  ///
  /// Same shape as saveScaleFreeAndWarn, and the opposite decision: that one withholds the
  /// metres because there is no ruler at all, this one keeps them because there IS a ruler and
  /// the only thing known about it is that it is probably off by a factor. Under
  /// "THE CAMERA NEVER REJECTS A TAKE" that factor is the most useful thing in the capture --
  /// it is the number a bar sensor can be held against. The accuracy caveat already sits on
  /// every surface that displays one of these, so the reader is warned; withholding tells them
  /// nothing and leaves nobody able to find the fault.
  async function saveTrackedAndWarn(
    blob: Blob,
    metrics: RepMetrics,
    captureDeviceInfo: CaptureDeviceInfo,
    trackingDiagnostics: TrackingDiagnostics,
    uploadPromise: Promise<{ status: "uploaded"; url: string } | { status: "queued" }> | null,
    forSetNumber: number,
  ) {
    const withDiagnostics: RepMetrics = { ...metrics, captureDeviceInfo, trackingDiagnostics };
    if (recordVideo && uploadPromise) {
      onCapture(withDiagnostics, undefined, forSetNumber);
      onOpenChange(false);
      uploadInBackground(uploadPromise, videoContext ?? { label: exerciseName });
      return;
    }
    onCapture(withDiagnostics, undefined, forSetNumber);
    onOpenChange(false);
  }

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
      // Explicitly null, not the zeros EMPTY_REP_METRICS carries. A zero is a different lie from
      // a blank: a coach reading a bench set would see 0 m/s and 0cm of range rather than an
      // empty cell, and a chart plots it. These are the fields that genuinely could not be
      // measured without a scale, so they say so.
      peakVelocityMps: null,
      meanVelocityMps: null,
      barPathDeviationCm: null,
      romCm: null,
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
        // Same as the refusal path above: the set is handed up and the dialog closes now, and
        // the clip attaches itself when it lands. See uploadInBackground.
        toast.warning(`${full} (Video uploading for your coach.)`);
        onCapture(metrics, undefined, forSetNumber);
        onOpenChange(false);
        uploadInBackground(uploadPromise, videoContext ?? { label: exerciseName });
      } catch (err) {
        const detail = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
        toast.error(`${full} And the video didn't save either: ${detail}`);
        onCapture(metrics, undefined, forSetNumber);
        onOpenChange(false);
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
        onAnalysisProgress: (percent) => onAnalysisProgress?.(forSetNumber, percent),
        trackingMode: coreMlTrackingMode,
        // Always provided now (not just when recordVideo) -- recording has stopped and the slow
        // on-device analysis pass is about to start regardless of whether a video gets uploaded,
        // and closing the dialog here (rather than leaving the athlete staring at "Analyzing
        // recording...") is the whole point of this redesign, not something to skip when there's
        // no video.
        // BACK OUT OF THE CAMERA HERE, THE INSTANT THE RECORDER STOPS.
        //
        // This used to hang off onBlobReady, which sounded early and was not: turning the
        // recording into an uploadable Blob means a 720p re-encode of a 28-second 120fps movie
        // plus reading its bytes across the bridge, and every second of that ran with the camera
        // still on screen under "Analyzing recording -- 0 frames processed...". Scott, 2026-09-22:
        // "Why am I still getting that weird screen after I hit stop, we got rid of that weeks
        // ago, the camera should instantly close and go back to the workout screen."
        //
        // Closing is safe and always was: tracker dialogs are mounted through lazyDialog and STAY
        // mounted after close (see CLAUDE.md), precisely so a save path can finish after this
        // call. The set card takes over from here -- onAnalysisStarted has already put this set
        // into the processing list, and the analysis and upload report onto that card.
        onRecordingStopped: () => {
          onAnalysisStarted(forSetNumber);
          onOpenChange(false);
        },
        // Fires later, when the re-encoded copy is in hand. By now the camera is long gone and
        // the analysis is already running; this only starts the upload alongside it.
        onBlobReady: (blob) => {
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
            // "Nothing left to salvage" was wrong: THE FAILURE IS THE THING TO SALVAGE.
            //
            // This caught an upload failure on top of an analysis failure and did nothing at all, so a
            // set where the camera ran, the analysis fell over AND the clip did not make it came out
            // identical to a set nobody ever pointed a camera at. That is the exact case the tracking
            // report exists for, and it was the one case guaranteed never to reach it.
            //
            // Handing up the empty metrics with no video URL records that a capture was attempted and
            // came back with nothing. The report flags it as a set whose diagnostics are missing, which
            // is a fact somebody can act on, rather than an absence nobody can see.
            onCapture(EMPTY_REP_METRICS, undefined, forSetNumber);
            onOpenChange(false);
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
      // See AvObjectLockTelemetry. The caller already passes the whole AvAnalysisResult here;
      // this type only ever narrowed it, and these two were being dropped on the floor at the
      // narrowing rather than anywhere interesting.
      objectLock?: AvObjectLockTelemetry;
      objectLockSecondary?: AvObjectLockTelemetry;
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
    const plateScaleRaw = plateScaleFromFrames(rawFrames, coreMlTrackingMode);
    // See plateReadIsPlausibleAgainstGrip. Dropped here rather than left for
    // rejectImplausibleScales, which needs a measured body and therefore cannot help on the one
    // take shape where the plate is the only source.
    const gripWidthPx = gripWidthPxFromFrames(rawFrames);
    // A DISC THAT READS AS A DISC NEEDS NO SECOND OPINION FROM THE HANDS.
    //
    // The grip check divides the plate's pixel size by the span between the wrists. That span is
    // only a ruler when the grip line is broadside; the moment the camera moves off square to the
    // bar it foreshortens, the denominator collapses, the ratio shoots up, and a perfectly good
    // plate is thrown out for being "the wrong size next to that grip". Measured on Scott's
    // bench sets, 2026-09-22: ratios of 2.22x and 4.51x against a window of 0.45-2.0, with hands
    // reading 152px apart where a real bench grip is 55-60cm.
    //
    // But the object tracker already reports something the camera angle cannot fake. A plate is
    // a circle, and a circle photographed from any direction projects to an ellipse -- so a box
    // that comes back NEARLY SQUARE can only be a disc seen close to face-on, and a disc seen
    // face-on is a 450mm ruler measured on its true diameter. Nothing about the athlete is
    // needed to know that, which is the point: the two trackers are equal, and the object one
    // does not have to ask the body's permission to be believed when its own evidence is this
    // direct.
    //
    // So the grip check still runs -- it is the thing that catches a rack plate at twice the
    // athlete's distance -- but only on a box whose shape leaves the size in doubt. Scott,
    // shown a photo of his own setup with one plate reading as a clean circle: "I will be
    // benching from this angle, make it work."
    const plateAspect = plateScaleRaw?.shape.aspectRatio ?? 0;
    const plateToGripRatio =
      plateScaleRaw != null && gripWidthPx != null && gripWidthPx > 0
        ? plateScaleRaw.measured / gripWidthPx
        : null;
    const plateReadsAsADisc =
      plateAspect >= PLATE_DISC_ASPECT_LOW
      && plateAspect <= PLATE_DISC_ASPECT_HIGH
      // See PLATE_DISC_MAX_GRIP_RATIO. Unmeasurable grip means nothing to bound against, and the
      // shape is then the only evidence there is, so the bypass stands.
      && (plateToGripRatio == null || plateToGripRatio <= PLATE_DISC_MAX_GRIP_RATIO);
    const plateFailedGripCheck =
      plateScaleRaw != null
      && !plateReadsAsADisc
      && !plateReadIsPlausibleAgainstGrip(plateScaleRaw.measured, gripWidthPx);

    // IS IT THE RIGHT SHAPE, AND IS IT ANYWHERE NEAR THE ATHLETE.
    //
    // The size ratio above is a real cross-check and it catches the gross case -- the 497px read
    // that took a whole bench set's numbers with it. What it cannot catch is the common one. Its
    // window spans 0.45 to 2.0 (PLATE_TO_GRIP_RATIO_LOW/HIGH), more than a factor of four,
    // because a plate genuinely can appear at very different sizes; a plate on the rack at twice the athlete's distance reads at about half
    // the pixels and sails straight through.
    //
    // Shape and position are what separate those two, and both were ALREADY BEING MEASURED. The
    // aspect ratio and the median box centre have been written into the diagnostics blob since
    // the reference-object work landed, precisely so a human could work out after the fact why a
    // take's numbers had come out wrong. Nothing ever read them back. The measurement was never
    // the missing piece.
    //
    // Same rule as the native per-frame gate, same file, same threshold -- see
    // referenceObjectVerdict and shared/tracker-arbiter.ts. That is what makes this a
    // unification rather than a second opinion: the object tracker is being held to one standard
    // in both places, and the standard is the body.
    const bodyRef = takeBodyReference(rawFrames);
    const plateShapeVerdict = plateScaleRaw
      ? referenceObjectVerdict({
          shape: plateScaleRaw.shape,
          anchor: bodyRef.anchor,
          yardstick: bodyRef.yardstick,
          frameWidth: bodyRef.frameWidth,
          frameHeight: bodyRef.frameHeight,
        })
      : null;
    // Every reason, not the first one. A read that is both the wrong shape AND in the wrong place
    // is a different diagnosis from one that is merely oblique, and the report shows both.
    const plateRejectedReasons: string[] = [
      ...(plateFailedGripCheck ? ["size_vs_grip"] : []),
      ...(plateShapeVerdict?.reasons ?? []),
    ];
    const plateScale = plateRejectedReasons.length > 0 ? null : plateScaleRaw;

    // SHOULDER BREADTH, WHERE THE BODY'S LENGTH IS UNAVAILABLE.
    //
    // A bench press was refused outright, on the exercise's NAME: lying down means height cannot
    // give scale, so no scale, so no numbers, on every bench anyone will ever film. That is a
    // policy rather than a measurement, and no camera angle could satisfy it -- which is exactly
    // what made it indefensible. "This lift is done lying down" is not a fault an athlete can
    // fix, and a bench press is not an exotic case to opt out of.
    //
    // The refusal was right about one thing and wrong about what followed from it. A lying
    // athlete's LENGTH genuinely is unmeasurable from the end of a bench -- it points at the lens.
    // Their shoulder breadth is not: it sits perpendicular to that axis, so it is broadside in
    // precisely the framing that ruins the length, and the tracker holds both shoulders through
    // the whole set. The measurement was there the entire time and the code declined to look at
    // it. See shoulderWidthScaleFromFrames.
    //
    // Only as a fallback, and never averaged with a length read: it is a looser estimate
    // (biacromial-to-height varies by build, so a broad lifter and a narrow one of the same
    // height differ by around a tenth), and blending it with a good read would spread its
    // uncertainty into a number that did not have any.
    // EVERY SOURCE IS COMPUTED, THEN THEY ARE COMPARED.
    //
    // Scale used to be a waterfall: the plate, else the athlete's height, else their shoulders,
    // with the later ones not even evaluated once an earlier one answered. So the pipeline held
    // at most one opinion about how big a pixel is, and no way to tell a good reading from a bad
    // one. That is exactly how a shoulder-derived scale six times too small reached a screen --
    // there was no second opinion to check it against, and the two detectors that could have
    // provided one were never asked.
    //
    // All three run now and reconcileScaleEstimates compares them: agreement between independent
    // sources is the strongest evidence available here, and disagreement is the signal that
    // something is wrong, which is worth far more than a single confident-looking number.
    const shoulderScale = shoulderWidthScaleFromFrames(calibrationInput, heightIn, posture);
    const shoulderScaleValue = shoulderScale.scale;

    // Every candidate is checked against the athlete's own height before any of them is ranked --
    // see rejectImplausibleScales. A scale that puts a 5'10" lifter at sixteen inches tall is
    // measuring something other than what it thinks it is, and that is knowable from the footage
    // rather than from which source it came out of.
    const bodySpanUnits = impliedBodyLengthUnits(calibrationInput);
    const scaleCandidatesRaw = [
      ...(plateScale != null
        ? [
            {
              source: "plate" as const,
              scale: plateScale.scale,
              uncertaintyFraction: plateScale.uncertaintyFraction,
            },
          ]
        : []),
      ...(heightScaleFactor != null
        ? [{ source: "height" as const, scale: heightScaleFactor, uncertaintyFraction: 0.05 }]
        : []),
      ...(shoulderScaleValue != null
        ? [
            {
              source: "shoulder_width" as const,
              scale: shoulderScaleValue,
              uncertaintyFraction: shoulderScale.uncertaintyFraction,
            },
          ]
        : []),
    ];
    const { kept: plausibleScales, rejected: implausibleScales } = rejectImplausibleScales(
      scaleCandidatesRaw,
      bodySpanUnits,
      heightIn,
    );
    const scaleVerdict = reconcileScaleEstimates(plausibleScales);

    const scaleFactor = scaleVerdict.scale;

    const calibrationFrames = calibrationMethodBreakdown(calibrationInput);
    // Which mechanism actually produced the scale, recorded alongside it. Plate-derived scale is
    // new and its training data is thin, so a number built on one has to be identifiable as such
    // rather than indistinguishable from a height-derived one.
    // Names what actually decided the number, including whether anything corroborated it.
    const scaleSource: "height" | "plate" | "box" | "both" | "shoulder_width" | null =
      scaleVerdict.agreedSources.length > 1
        ? "both"
        : (scaleVerdict.agreedSources[0] ?? null);

    const scaleCandidates = [
      ...(plateScale != null
        ? [
            {
              source: "plate",
              scale: plateScale.scale,
              measured: plateScale.measured,
              samples: plateScale.samples,
            },
          ]
        : []),
      ...(heightScaleFactor != null
        ? [{ source: "height", scale: heightScaleFactor, measured: null, samples: null }]
        : []),
      ...(shoulderScaleValue != null
        ? [
            {
              source: "shoulder_width",
              scale: shoulderScaleValue,
              measured: shoulderScale.medianSpanUnits,
              samples: shoulderScale.framesUsed,
            },
          ]
        : []),
    ];
    const calibrationDiagnostics: {
      scaleSource: typeof scaleSource;
      scaleCandidates: typeof scaleCandidates;
      scaleOutliers: { source: string; ratioToChosen: number }[];
      scaleCorroborated: boolean;
      scalesRejectedAsImplausible?: { source: string; impliedHeightIn: number }[];
      axisSource?: "grip" | "trace_covariance";
      gripPairsUsed?: number;
      traceTravelAlongPx?: number;
      traceTravelAcrossPx?: number;
      traceTravelAlongCm?: number;
      tracePathCm?: number;
      traceDisplacementCm?: number;
      velocitySmoothingMs?: number;
      traceTravelAcrossCm?: number;
      tracePointsDroppedOffAxis?: number;
      referenceObject?: ReferenceObjectRead | null;
      gripWidthPx?: number | null;
      plateRejectedAgainstGrip?: boolean;
      plateMeasuredPx?: number | null;
      plateToGripRatio?: number | null;
      plateRejectedReasons?: string[];
    } = {
      scaleSource,
      scaleCandidates,
      scaleOutliers: scaleVerdict.outliers.map((o) => ({
        source: o.source,
        ratioToChosen: o.ratioToChosen,
      })),
      scaleCorroborated: scaleVerdict.corroborated,
      scalesRejectedAsImplausible: implausibleScales,
      // The shape is recorded whether the read was used or thrown out -- a rejected read is the
      // one worth looking at.
      referenceObject: (plateScale ?? plateScaleRaw)?.shape ?? null,
      gripWidthPx: gripWidthPx == null ? null : Math.round(gripWidthPx * 10) / 10,
      plateRejectedAgainstGrip: plateFailedGripCheck,
      plateMeasuredPx: plateScaleRaw?.measured ?? null,
      plateToGripRatio: plateToGripRatio == null ? null : Math.round(plateToGripRatio * 1000) / 1000,
      plateRejectedReasons,
    };

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
        // THE POSTURE-SPECIFIC REFUSAL IS GONE, AND THIS IS THE SECOND PLACE IT LIVED.
        //
        // Restoring the shoulder ruler removed the refusal in pose-tracking.ts and NOT this one,
        // so a lying lift whose scale failed for any other reason still met "Distances and
        // speeds can't be measured on a lying lift yet ... Forge won't guess." Scott, on seeing
        // it again after the revert: "But again it rejected, you turned it off."
        //
        // It was wrong twice over. It told the athlete their exercise was the problem, when the
        // actual failure was a scale source that did not resolve -- and it named a limitation
        // that nothing they could do would fix, on a set where the reps, the durations and the
        // velocity loss were all still perfectly measurable and all still saved below. A lying
        // lift is not a different kind of take; it is a take whose scale failed, which is
        // already what the generic messages below say.
        : (calibrationRefusalReasonForScale(posture) ??
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
    // The gate on the combined bar point, kept apart from the per-side one above so the report
    // can say WHICH filter fired -- a side that read impossibly fast and a bar point that
    // teleported because the sides swapped are different faults with different fixes.
    const combinedRejectionEvents: number[] = [];
    const halfSpanHistory: { x: number; y: number }[] = [];
    // Per-frame torso anchors, and whether each sat where the torso had been sitting. Both are
    // collected unconditionally; torsoWasAtRest below decides whether this take is one where
    // they mean anything.
    const torsoAnchors: ({ x: number; y: number } | null)[] = [];
    const torsoAnchorStable: boolean[] = [];
    let torsoAnchorHistory: { x: number; y: number }[] = [];
    const torsoJumpFrameTimes = new Set<number>();
    let barPointSideFlipped = 0;
    let barPointFromBothHands = 0;
    let barPointFromLoneHandCarried = 0;
    let barPointFromBareLoneHand = 0;
    let prevCombined: { x: number; y: number; t: number }[] = [];
    let verticalSign: 1 | -1 = 1;
    // Half the measured distance from the left grip to the right, carried forward so a frame with
    // only one hand can still be placed at the middle of the bar -- see barPointFromSides.
    // WHY A FRAME PRODUCED NO POINT, COUNTED RATHER THAN INFERRED.
    //
    // A take came back with zero tracked points on a clip where the body was found on all 705
    // frames and both hands were tracked on most of them. Nothing recorded which of the three
    // ways a frame can produce nothing actually happened, so the only route to an answer was
    // reasoning backwards from an empty trace -- which is where the last two of these went wrong.
    let framesNoWristOrImplement = 0;
    let framesVelocityRejected = 0;
    let framesUsable = 0;
    let lastHalfSpan: { x: number; y: number } | null = null;
    let prevFusedLeft: { x: number; y: number; t: number }[] = [];
    let prevFusedRight: { x: number; y: number; t: number }[] = [];
    // Substitutes for ArBarTrackerDialog's "assessed right when Start Set is
    // tapped" moment -- there's no live frame to snapshot in a record-first
    // pipeline, so this locks in from the first frame the replay itself has
    // available, the closest available proxy to "framing right when the set
    // started."
    const gripPairs: { left: { x: number; y: number }; right: { x: number; y: number } }[] = [];
    // Kept asking until a frame answers -- see subjectFacing's own loop below. Frame 0 of a
    // replay is usually untracked, and the alignment verdict used to be pinned on it: "unknown"
    // set for good on the first frame, and every rep docked 10 trust points for framing that
    // could not be confirmed on a frame with nobody in it.
    let subjectFacing: SubjectFacing | null = null;

    // Weighted fusion of each side's implement reading against that side's
    // real (graduated) wrist confidence -- see this file's header comment
    // for why this reuses the MediaPipe-original formula, not
    // ArBarTrackerDialog's ARKit workaround.
    function fuseSide(
      worldLm: Landmark[],
      side: "left" | "right",
      implement: ImplementPoint | null,
      // A SHORT HISTORY, not just the last point -- see isPlausibleVelocity. Oldest first.
      prevFused: { x: number; y: number; t: number }[],
      velocitySamples: VelocitySample[],
      t: number,
      coreMlPoint: ImplementPoint | null,
      frame: NativePoseFrame,
    ): { fused: { x: number; y: number; confidence: number } | null; nextPrev: { x: number; y: number; t: number }[] } {
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
              // A plate box is a SCALE reference, not a second opinion on where the grip is.
              // Corroboration rewards a detection close to the fused point and penalises a
              // confident one further than half a metre away -- and on a bench press the inner
              // plate legitimately sits about that far from the hands, so feeding it in here
              // would dock confidence on every frame for the plate being exactly where a plate
              // belongs. plateScaleFromFrames reads the same boxes separately for scale.
              coreMlTrackingMode === "plate" ? null : coreMlPoint,
            )
          : null;

      if (fused && !isPlausibleVelocity(prevFused, { ...fused, t })) {
        rejectionEvents.push(t);
        fused = null;
      }
      let nextPrev = prevFused;
      if (fused) {
        nextPrev = [...prevFused, { x: fused.x, y: fused.y, t }].slice(-PLAUSIBILITY_HISTORY);
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
      // Deliberately NOT `body3DLm ?? ...` any more. The 3D bridge returns metres relative to the
      // hip, the 2D one returns absolute image space, and the native plugin only produces 3D on
      // every third frame -- so mixing them per frame put a sawtooth into the trace at a third of
      // the frame rate. See visionBody3DToWorldLandmarks' own comment for the full reasoning and
      // for what recovering the depth properly would take.
      const worldLm = scaleWorldLandmarks(visionJointsToWorldLandmarks(f), effectiveScale);
      frames.push({ t, landmarks: [], worldLandmarks: worldLm });

      const sign = worldVerticalSign(worldLm);
      if (sign != null) verticalSign = sign;

      // THE BODY AT REST, USED AS THE REFERENCE IT IS. See torsoWasAtRest in bar-tracking.ts.
      //
      // On a bench press -- and equally on a standing press, a curl, a shrug, a Pendlay row --
      // the torso does not travel. Every input this lift had came from the body tracker anyway
      // (the tracked point IS the wrist midpoint, scale is shoulder breadth, the object
      // detector's search region is aimed by the wrists, overwatch judges the object with grip
      // width), so nothing independent could catch a jumped wrist. A torso that has moved when
      // the torso does not move is that independent signal, and the wrists cannot influence it.
      //
      // Collected on EVERY take. Whether it is used is decided afterwards, by whether this
      // take's torso actually held still -- a squat's does not, and there rejecting torso
      // movement would reject the lift.
      const lm = (i: number) => {
        const p = worldLm[i];
        return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
      };
      const torsoAnchor = torsoAnchorFrom(
        lm(POSE_LANDMARKS.LEFT_SHOULDER),
        lm(POSE_LANDMARKS.RIGHT_SHOULDER),
        lm(POSE_LANDMARKS.LEFT_HIP),
        lm(POSE_LANDMARKS.RIGHT_HIP),
      );
      if (torsoAnchor) {
        torsoAnchors.push(torsoAnchor);
        const span = medianHalfSpan(halfSpanHistory);
        const gripWidthUnits = span ? Math.hypot(span.x, span.y) * 2 : null;
        torsoAnchorStable.push(torsoAnchorIsStable(torsoAnchor, torsoAnchorHistory, gripWidthUnits));
        if (!torsoAnchorStable[torsoAnchorStable.length - 1]) torsoJumpFrameTimes.add(t);
        torsoAnchorHistory = [...torsoAnchorHistory, torsoAnchor].slice(-TORSO_ANCHOR_HISTORY);
      } else {
        torsoAnchors.push(null);
        // No anchor is not evidence the body moved. A frame overwatch cannot judge PASSES.
        torsoAnchorStable.push(true);
      }
      // No assessCameraAlignment on this path: worldLm has z pinned to 0 (see
      // visionJointsToWorldLandmarks), so that reader could only ever answer "ok" or
      // "unknown", and it answered "unknown" for every correct side view. The alignment
      // reason is derived from the x/y facing read at Stop -- see alignmentReasonWithoutDepth.
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

      const rejectionsBefore = rejectionEvents.length;
      const { fused: fusedLeft, nextPrev: nextPrevLeft } = fuseSide(worldLm, "left", leftImplement, prevFusedLeft, leftVelocitySamples, t, coreMlPoint, f);
      prevFusedLeft = nextPrevLeft;
      const { fused: fusedRight, nextPrev: nextPrevRight } = fuseSide(worldLm, "right", rightImplement, prevFusedRight, rightVelocitySamples, t, coreMlPoint, f);
      prevFusedRight = nextPrevRight;
      // A side that existed and was thrown out for moving impossibly fast, as opposed to one that
      // was never seen at all -- the two look identical in an empty trace and mean opposite things.
      const rejectedThisFrame = rejectionEvents.length > rejectionsBefore;

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

      // Both hands, kept as a pair rather than only as the midpoint the trace uses. The line
      // between them is the bar, and the lift runs perpendicular to it -- see
      // movementAxisFromGrip for why that is a better statement of the movement direction than
      // anything recovered from the trace afterwards.
      if (fusedLeft && fusedRight) {
        gripPairs.push({
          left: { x: fusedLeft.x, y: verticalSign * fusedLeft.y },
          right: { x: fusedRight.x, y: verticalSign * fusedRight.y },
        });
      }

      // See barPointFromSides. A lone hand is carried back to the middle of the bar rather than
      // traced where it sits, so the point keeps meaning the same thing from frame to frame.
      // The MEDIAN of every span measured this set, and the last accepted point to settle which
      // side a lone hand is -- see medianHalfSpan and barPointFromSides.
      if (fusedLeft && fusedRight) {
        halfSpanHistory.push({ x: (fusedRight.x - fusedLeft.x) / 2, y: (fusedRight.y - fusedLeft.y) / 2 });
      }
      const carryBy = medianHalfSpan(halfSpanHistory) ?? lastHalfSpan;
      const lastTracePoint = trace.length > 0 ? trace[trace.length - 1] : null;
      let { point: combined, halfSpan, sideFlipped } = barPointFromSides(
        fusedLeft,
        fusedRight,
        carryBy,
        lastTracePoint ? { x: lastTracePoint.x, y: verticalSign * lastTracePoint.y } : null,
      );
      // WHICH BRANCH BUILT THIS POINT, COUNTED.
      //
      // The three branches mean three different things and the trace cannot be read without
      // knowing which one ran. Both hands is the middle of the bar, measured. One hand carried
      // back by the last half-span is the middle of the bar, inferred -- right if the half-span
      // is current, off by up to half a grip if it is stale. One hand with no half-span yet is
      // the END of the bar, and the point has silently changed what it means.
      //
      // The 2026-09-23 bench take is why: the trace sits at one x for a stretch, then ~50cm away
      // for another stretch, then back -- sustained excursions, not single-frame spikes, so no
      // speed gate or median filter reaches them. That shape is the point changing meaning, and
      // there was no counter anywhere that could say so.
      if (sideFlipped) barPointSideFlipped++;
      if (fusedLeft && fusedRight) barPointFromBothHands++;
      else if (combined && carryBy) barPointFromLoneHandCarried++;
      else if (combined) barPointFromBareLoneHand++;
      lastHalfSpan = halfSpan;

      // THE COMBINED POINT NEEDS ITS OWN PLAUSIBILITY GATE, NOT JUST THE TWO SIDES.
      //
      // isPlausibleVelocity ran per SIDE, inside fuseSide, and each side on its own is smooth:
      // the left hand moves like a left hand, the right hand moves like a right hand. What
      // teleports is the point BUILT from them, because which sides exist changes frame to
      // frame -- a left-only frame followed by a right-only one moves the bar point by up to a
      // whole grip width even though neither hand went anywhere. barPointFromSides carries a
      // lone hand back to the middle using the last measured half-span, which fixes the common
      // case, but a stale or mismeasured half-span puts the reconstructed point half a grip or
      // a whole grip off, and nothing downstream was checking.
      //
      // Measured on the 2026-09-23 bench take (10 reps logged, 3 found): 27 of 570 steps in the
      // trace moved more than 25cm, most of them at 8-17 m/s on a 33ms frame, and the take
      // reported "0 thrown out by the speed filter" -- because the filter had never seen this
      // series. Those jumps are what the segmenter read as reps: rep 1's curve steps from
      // -3.4cm to -79.6cm in a single sample. Range of motion came back 77.9cm on a bench
      // press whose bar travels about 36.
      //
      // This drops a SAMPLE, never a take (RULE #1) -- the same filtering the rule explicitly
      // preserves, and the counter below is what makes it visible rather than silent.
      if (combined && !isPlausibleVelocity(prevCombined, { x: combined.x, y: combined.y, t })) {
        combinedRejectionEvents.push(t);
        combined = null;
      }
      if (combined) {
        prevCombined = [...prevCombined, { x: combined.x, y: combined.y, t }].slice(-PLAUSIBILITY_HISTORY);
      }

      if (combined) framesUsable++;
      else if (rejectedThisFrame) framesVelocityRejected++;
      else framesNoWristOrImplement++;
      if (combined) {
        const point: TrackedPoint = { t, x: combined.x, y: verticalSign * combined.y, z: 0, confidence: combined.confidence };
        const prevPoint = trace[trace.length - 1];
        if (prevPoint) {
          for (const gapPoint of interpolateOcclusionGap(prevPoint, point, 300)) trace.push(gapPoint);
        }
        trace.push(point);
      }
    }

    // NOW DECIDE WHETHER THIS TAKE'S TORSO STILLNESS MEANS ANYTHING, AND ACT ON IT.
    //
    // Deliberately a second pass. Whether the athlete's torso travelled is a fact about the
    // whole SET, not about a frame -- a squat's first thirty frames look as still as a bench's,
    // and gating inside the loop would have to decide on evidence it does not have yet.
    //
    // A jumped torso means a jumped pose read, and the wrists on that frame jumped with it. So
    // the bar points from those frames are dropped -- a SAMPLE, never the take (RULE #1), and
    // the count is reported so the rejection can be seen rather than inferred.
    const torsoAnchorsSeen = torsoAnchors.filter((a): a is { x: number; y: number } => a != null);
    const torsoGripWidthUnits = (() => {
      const span = medianHalfSpan(halfSpanHistory);
      return span ? Math.hypot(span.x, span.y) * 2 : null;
    })();
    const torsoStillThisTake = torsoWasAtRest(torsoAnchorsSeen, torsoGripWidthUnits);
    const torsoSpreadRaw = torsoRestSpreadGrips(torsoAnchorsSeen, torsoGripWidthUnits);
    const torsoSpreadGrips = torsoSpreadRaw == null ? null : Math.round(torsoSpreadRaw * 1000) / 1000;
    let torsoJumpRejections = 0;
    if (torsoStillThisTake && torsoJumpFrameTimes.size > 0) {
      const before = trace.length;
      const kept = trace.filter((p) => !torsoJumpFrameTimes.has(p.t));
      // NEVER LET THIS EMPTY A TAKE. If most of the set reads as a jumped torso then the
      // stillness premise is what is wrong, not the frames -- the same reasoning
      // dropAcrossAxisOutliers and rejectImplausibleScales both apply to their own guards.
      if (kept.length >= before / 2) {
        torsoJumpRejections = before - kept.length;
        trace.length = 0;
        trace.push(...kept);
      }
    }

    // See TrackingDiagnostics["trace"]. Reads the trace at call time rather than snapshotting it,
    // so a caller after dropAcrossAxisOutliers (which rewrites the array in place) gets the
    // trimmed count and a caller before it gets the raw one. Every save path below is handed one
    // of these -- the REFUSED paths need it more than the successful one does, and those were
    // the ones reporting nothing at all about why.
    const traceDiagnostics = (repsFound: number | null) => {
      let largestGapSeconds: number | null = null;
      for (let i = 1; i < trace.length; i++) {
        const gap = (trace[i].t - trace[i - 1].t) / 1000;
        if (largestGapSeconds == null || gap > largestGapSeconds) largestGapSeconds = gap;
      }
      return {
        points: trace.length,
        repsFound,
        framesUsable,
        framesNoWristOrImplement,
        framesVelocityRejected,
        velocityRejections: rejectionEvents.length,
        combinedVelocityRejections: combinedRejectionEvents.length,
        barPointFromBothHands,
        barPointSideFlipped,
        torsoStillThisTake,
        torsoJumpRejections,
        torsoSpreadGrips,
        barPointFromLoneHandCarried,
        barPointFromBareLoneHand,
        largestGapSeconds: largestGapSeconds == null ? null : Math.round(largestGapSeconds * 1000) / 1000,
      };
    };

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
          objectLock: recordingStats.objectLock ?? null,
          objectLockSecondary: recordingStats.objectLockSecondary ?? null,
            calibration: { scaleFactor: null, ...calibrationDiagnostics, ...calibrationFrames },
            trace: traceDiagnostics(scaleFree.repCount),
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
          objectLock: recordingStats.objectLock ?? null,
          objectLockSecondary: recordingStats.objectLockSecondary ?? null,
          calibration: { scaleFactor: null, ...calibrationDiagnostics, ...calibrationFrames },
          trace: traceDiagnostics(null),
        }),
        uploadPromise,
        forSetNumber,
      );
      return;
    }

    // Measured, then reported. The axis decides which direction counts as "up" for this lift,
    // and the travel is how far the tracked point actually went along it -- in raw pixels,
    // before scale. Together they are the other half of every range-of-motion number this
    // pipeline produces, and neither was visible until now.
    const movementAxis = movementAxisFromGrip(gripPairs);

    // Frames where the tracked point was not on the bar, thrown out before anything is measured
    // -- see dropAcrossAxisOutliers. The across-axis travel this take reported (150cm on a bar
    // that moves a few centimetres sideways) is what this is for, and the rep count is what it
    // was costing.
    const { kept: cleanedTrace, dropped: acrossOutliersDropped } = dropAcrossAxisOutliers(
      trace,
      movementAxis,
    );
    trace.length = 0;
    trace.push(...cleanedTrace);
    calibrationDiagnostics.tracePointsDroppedOffAxis = acrossOutliersDropped;

    if (trace.length > 0) {
      const ax = movementAxis ?? { x: 0, y: 1 };
      let minAlong = Infinity;
      let maxAlong = -Infinity;
      let minAcross = Infinity;
      let maxAcross = -Infinity;
      for (const p of trace) {
        const along = p.x * ax.x + p.y * ax.y;
        const across = -p.x * ax.y + p.y * ax.x;
        if (along < minAlong) minAlong = along;
        if (along > maxAlong) maxAlong = along;
        if (across < minAcross) minAcross = across;
        if (across > maxAcross) maxAcross = across;
      }
      // METRES, NOT PIXELS. The trace has already been multiplied by the scale by the time it
      // is pushed (see effectiveScale above), so the first version of this reported a real 0.18m
      // squat as "0px" -- rounded away, and reading as though the bar had never moved. Reported
      // in centimetres now, with the pixel equivalent alongside it so it can still be held up
      // against the plate diameter on the line above, which is the comparison that makes it
      // mean something.
      calibrationDiagnostics.axisSource = movementAxis ? "grip" : "trace_covariance";
      calibrationDiagnostics.gripPairsUsed = gripPairs.length;
      calibrationDiagnostics.traceTravelAlongCm = (maxAlong - minAlong) * 100;
      calibrationDiagnostics.traceTravelAcrossCm = (maxAcross - minAcross) * 100;
      // WALKED vs WENT. Path is summed step to step; displacement is the span above. Only a
      // wandering tracked point separates them, and that separation is what inflates velocity
      // while leaving range of motion alone -- see computeSpeeds in bar-tracking.ts. Recorded so
      // the ratio can be read straight off the report instead of derived from a raw trace.
      let walked = 0;
      for (let i = 1; i < trace.length; i++) {
        const a = trace[i - 1];
        const b = trace[i];
        walked += Math.abs((b.x - a.x) * ax.x + (b.y - a.y) * ax.y);
      }
      calibrationDiagnostics.tracePathCm = walked * 100;
      calibrationDiagnostics.traceDisplacementCm = (maxAlong - minAlong) * 100;
      calibrationDiagnostics.velocitySmoothingMs = VELOCITY_SMOOTHING_MS;
      if (scaleFactor && scaleFactor > 0) {
        calibrationDiagnostics.traceTravelAlongPx = (maxAlong - minAlong) / scaleFactor;
        calibrationDiagnostics.traceTravelAcrossPx = (maxAcross - minAcross) / scaleFactor;
      }
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
      false,
      // The rep gate now comes from this movement's own range of motion rather than one flat
      // 20cm for every lift -- see repAmplitudeGateCm. Same bucket implausibleRangeOfMotion is
      // given below, so the floor a rep has to clear and the floor below which a reading is
      // called impossible are stated once, in one table.
      romBucketForExercise(exerciseName),
      // And the direction of the lift comes from the bar, measured, rather than from the trace,
      // inferred. Null on a one-handed movement or a take where the pair never held, which puts
      // it back on the trace's own principal component.
      movementAxis,
    );
    if (!metrics) {
      // "MAKE SURE THE BAR STAYS IN FRAME" WAS A GUESS, AND ON A REAL TAKE IT WAS WRONG.
      //
      // This branch fired on a ten-rep bench press where the bar never left the shot: the
      // detector had it on 676 of 763 frames and the left hand on 691. The athlete was told to
      // keep the bar in frame, which he had, and the set was saved with nothing in it.
      //
      // Reaching here does not mean the bar was lost. summarizeTrackedSet returns null for two
      // reasons -- too few tracked points to work with, or points it could not split into reps --
      // and only the first is about framing. The evidence separating them is already sitting in
      // this function, so the message is chosen from it instead of assumed.
      const TOO_FEW_POINTS = 6;
      const message =
        trace.length < TOO_FEW_POINTS
          ? "Couldn't get a clean read -- make sure the bar stays in frame throughout the set."
          : "Couldn't tell the reps apart in this one. The bar was tracked, but its path didn't " +
            "break into separate reps -- filming square to the side, level with the bar, gives " +
            "the clearest read.";

      // And a take this well tracked should not come back empty. The scale-free summary one
      // branch up already recovers rep count, tempo and velocity loss from a trace with no usable
      // scale -- every one of those is a duration or a ratio, so none of them needs metres. It
      // was only ever reachable when calibration failed outright; a take that HAD a scale and
      // then failed to segment at it got nothing at all, which is strictly less than this same
      // trace would have produced with no calibration whatsoever.
      const unscaled = summarizeTrackedSet(
        normalizeTraceScale(trace),
        undefined,
        undefined,
        firstMoveForExercise(exerciseName),
        rejectionEvents,
        1,
        true,
      );
      const scaleFree = unscaled ? toScaleFreeMetrics(unscaled) : null;
      if (scaleFree) {
        await saveScaleFreeAndWarn(
          blob,
          scaleFree,
          message,
          captureDeviceInfo,
          buildTrackingDiagnostics({
            outcome: "scale_free_only",
            message,
            rawFrames,
            trackingMode: coreMlTrackingMode,
            recording: recordingStats,
          objectLock: recordingStats.objectLock ?? null,
          objectLockSecondary: recordingStats.objectLockSecondary ?? null,
            calibration: { scaleFactor, ...calibrationDiagnostics, ...calibrationFrames },
            trace: traceDiagnostics(scaleFree.repCount),
          }),
          uploadPromise,
          forSetNumber,
        );
        return;
      }

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
          objectLock: recordingStats.objectLock ?? null,
          objectLockSecondary: recordingStats.objectLockSecondary ?? null,
          calibration: { scaleFactor, ...calibrationDiagnostics, ...calibrationFrames },
          trace: traceDiagnostics(null),
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
    // Not expectedPatternFromName: that one's answers also drive the pattern-mismatch trust
    // penalty, which only means anything across the four patterns guessMovementPattern can
    // return. See romBucketForExercise's own comment.
    const romBucket = romBucketForExercise(exerciseName);
    // Two ways the same wrong scale shows itself, and a take only had to survive one of them.
    // A bar reported as drifting a metre off line is the scale talking, not the athlete.
    const romProblem =
      implausibleRangeOfMotion(
        metrics.romCm,
        heightIn,
        romBucket,
        // The live trace is in metres; every threshold this is compared against is in
        // centimetres, so convert on the way in.
        (traceSpanAlongLift(trace) ?? 0) * 100,
      ) ??
      implausibleBarPathDeviation(metrics.barPathDeviationCm, heightIn, romBucket);
    // A SUSPECT SCALE IS NOT A REASON TO WITHHOLD THE NUMBERS. IT IS A REASON TO SAY SO.
    //
    // This branch used to throw away every scaled metric when the bar-path check said the scale
    // was off by a known factor, and fall back to the scale-free set. The athlete pressed record,
    // did ten reps, and got a red banner. Scott, after it happened to a retake: "it automatically
    // recorded over, so I just tested with nothing to show for it" -- and then, flatly: "The
    // camera should never reject. Ever. If I get one more rejection I'm going to flip out."
    //
    // He is right and it is already written down (CLAUDE.md, "THE CAMERA NEVER REJECTS A TAKE"):
    // a number wrong by a known factor is EVIDENCE -- it can be held against a bar sensor,
    // replayed, and used to find the fault -- and a withheld number is nothing at all. The
    // accuracy caveat is already on every surface that shows one of these, which is how a reader
    // is told not to trust it. Silence is not.
    //
    // So the scaled metrics are kept and the warning is attached, rather than the other way
    // round. What was a refusal is now an annotation. The diagnostics still record the outcome
    // so the tracking report can find these takes.
    if (romProblem) {
      const message = `${romProblem} The numbers below are saved anyway, so they can be checked -- but treat them as suspect. Filming square to the side, camera level with the bar, gives the most reliable read.`;
      toast.warning(message, { duration: 12000 });
      await saveTrackedAndWarn(
        blob,
        metrics,
        captureDeviceInfo,
        buildTrackingDiagnostics({
          outcome: "scale_suspect",
          message,
          rawFrames,
          trackingMode: coreMlTrackingMode,
          recording: recordingStats,
          objectLock: recordingStats.objectLock ?? null,
          objectLockSecondary: recordingStats.objectLockSecondary ?? null,
          calibration: { scaleFactor, ...calibrationDiagnostics, ...calibrationFrames },
          trace: traceDiagnostics(metrics.repBreakdown.length),
        }),
        uploadPromise,
        forSetNumber,
      );
      return;
    }

    // What this framing costs, stated as a fact about one axis rather than as a verdict on the
    // take -- see cameraViewMismatch, which no longer claims a head-on or rear view cannot be
    // measured. Informational, not a warning: nothing here says the numbers shown are wrong.
    const viewProblem = cameraViewMismatch(
      subjectFacing ?? "unknown",
      expectedCameraView(exerciseName),
    );
    if (viewProblem) toast.info(viewProblem, { duration: 8000 });

    // On an Olympic lift the bar deliberately does not travel a straight vertical line -- it
    // loops back around the knees and in under the athlete. Bar-path deviation measures distance
    // from a straight line and peak velocity is read off that same trace, so on these lifts a
    // technically correct rep scores WORSE than a bad one hauled up in a straight line.
    //
    // THE NUMBERS ARE STILL SAVED. They used to be nulled here, and that was a refusal: a
    // clean filmed on a phone produced no bar path and no peak velocity at all, so there was
    // nothing to compare against a bar sensor and nothing to calibrate the Olympic path model
    // with. Rule #1 -- the camera never rejects a take. `barPathAssumptionInvalid` is the flag
    // that tells a renderer not to chart them and tells a reader not to trust them, which is
    // what "accept it wrong and say what it is" looks like. Range of motion, timing, velocity
    // loss and rep count are unaffected and mean what they usually mean.
    const olympicPath = barPathAssumptionInvalid(exerciseName);
    if (olympicPath) {
      metrics.barPathAssumptionInvalid = true;
    }

    metrics.formFaults = detectFormFaults(
      frames,
      // 0 on an Olympic lift: the deviation is saved above but it is measured against a
      // straight-line assumption this lift breaks on purpose, so feeding it to the fault
      // detector would flag correct technique as a fault. 0 is how this parameter spells
      // "nothing to report". The number itself is still on the row.
      olympicPath ? 0 : (metrics.barPathDeviationCm ?? 0),
      "lift",
      movementType,
      equipment,
      tiltReadings,
      undefined,
      metrics.repBreakdown.map((r) => ({ startT: r.startT, endT: r.endT })),
      formFaultThresholds,
      // The grip separation the tilt angle would be divided by. See MIN_TILT_GRIP_SPAN_PX.
      gripWidthPx ?? null,
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
      // A correct side view is not a framing fault -- see trustAlignmentReason, shared with the
      // web twin. The reason itself comes from the depthless reader (alignmentReasonWithoutDepth)
      // because this path has no z to give assessCameraAlignment.
      trustAlignmentReason(
        alignmentReasonWithoutDepth(subjectFacing ?? "unknown", expectedCameraView(exerciseName)),
        subjectFacing ?? "unknown",
        expectedCameraView(exerciseName),
      ),
      chainPenalties,
    );
    metrics.captureDeviceInfo = captureDeviceInfo;
    metrics.trackingDiagnostics = buildTrackingDiagnostics({
      outcome: "tracked",
      rawFrames,
      trackingMode: coreMlTrackingMode,
      recording: recordingStats,
          objectLock: recordingStats.objectLock ?? null,
          objectLockSecondary: recordingStats.objectLockSecondary ?? null,
      calibration: { scaleFactor, ...calibrationDiagnostics, ...calibrationFrames },
      trace: traceDiagnostics(metrics.repBreakdown.length),
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

    // SAY SO WHEN THE COUNT DOES NOT MATCH.
    //
    // targetReps has been a prop on this dialog the whole time and nothing ever read it. Scott
    // squatted five and the set came back with six, which then set the set's mean velocity, its
    // range of motion and its velocity loss -- and the only place that was visible was counting
    // the entries in the rep list yourself. The extra one has its own fix (see the rack-artifact
    // filter in bar-tracking.ts), but no filter catches every case, and the athlete is the only
    // one here who knows how many reps they actually did.
    //
    // Deliberately not an error and deliberately does not change a number. A set genuinely taken
    // to two past the prescription is a normal thing to do, so this says what was found and
    // leaves the judgement where it belongs.
    if (targetReps && targetReps > 0 && metrics.repBreakdown.length !== targetReps) {
      const found = metrics.repBreakdown.length;
      toast.info(
        `Tracked ${found} rep${found === 1 ? "" : "s"} on a set prescribed at ${targetReps}. ` +
          `Check the rep list below if that isn't what you did -- the set's averages are built from it.`,
        { duration: 10000 },
      );
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
            {!recording && !analyzing && !saving && !guidanceDismissed && filmGuidance && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
                <div className="relative w-full max-w-sm rounded-lg bg-neutral-900 p-5 text-sm text-white shadow-xl">
                  <button
                    type="button"
                    onClick={() => setGuidanceDismissed(true)}
                    aria-label="Close filming instructions"
                    className="absolute right-2 top-2 rounded-full p-2 text-white/70 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <p className="pr-8 font-semibold uppercase tracking-wide text-white/60">
                    Where to film from
                  </p>
                  <p className="mt-1 leading-snug">{filmGuidance.view}</p>
                  <p className="mt-4 font-semibold uppercase tracking-wide text-white/60">
                    Keep in frame
                  </p>
                  <p className="mt-1 leading-snug">{filmGuidance.inFrame}</p>
                  <Button className="mt-5 w-full" onClick={() => setGuidanceDismissed(true)}>
                    Got it
                  </Button>
                </div>
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
                  startRecording({ trackingMode: coreMlTrackingMode });
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
