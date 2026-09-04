// The four capture modes that never scored their own confidence: jump,
// horizontal_load, sprint and mechanics (ARC-1).
//
// Every other tracked mode already folds its accuracy signals into one
// number the athlete and their coach can read -- bar_path/full through
// bar-tracking.ts's computeRepTrustScores, swing/med_ball/kb_swing through
// pose-tracking.ts's blendSpeedEstimates. These four shipped without one,
// which is why workoutSetEntries.trustScorePct is null for a jump or a sled
// push and skillSessionLogs.trustScorePct is null for every row that
// exists. This module is the missing half.
//
// Nothing here is a new MEASUREMENT. Every input is a signal the tracker
// already computed and then discarded: an ankle trace's own per-frame
// confidence, a sprint's own likelyGlitch flag, how much of a mechanics
// capture actually had the joints it was measuring. The one genuinely new
// idea is CORROBORATION, which is what these modes were missing and the
// scored modes already had: jump carries two independent height estimates
// (flight time vs. peak displacement) that were deliberately "kept separate
// rather than averaged" and then never compared to each other, and a
// sprint's crossing times carry a real, computable precision bound from how
// far apart the two frames straddling each checkpoint actually were.
// Comparing those is the same cross-check blendSpeedEstimates makes between
// an object tracker and a body-joint proxy, just on the signals these modes
// happen to have.
//
// Deliberately dependency-free (types only) so it stays unit-testable in a
// Node environment -- see capture-trust.test.ts. Every threshold below is an
// untuned starting value, the same "no real footage in this sandbox to
// calibrate against" caveat every other heuristic constant in this pipeline
// carries.

import type { RepTrustScore } from "./bar-tracking";
import type { SetTrustScore } from "./pose-tracking";

/** Shared banding, so a "medium" means the same thing in every mode --
 * identical cutoffs to computeRepTrustScores' own, deliberately, since the
 * server normalizes all of them into one trust_score_pct column and a
 * coach comparing a jump against a lift should be reading one scale. */
export function labelForScore(score: number): "high" | "medium" | "low" {
  return score >= 80 ? "high" : score >= 55 ? "medium" : "low";
}

/** Same clamp computeRepTrustScores applies -- a score never reads as 0
 * ("no confidence at all" is a claim this can't support either), and never
 * above 100. */
export function clampScore(score: number): number {
  return Math.max(5, Math.min(100, Math.round(score)));
}

function build(base: number, deductions: { penalty: number; note: string }[]): SetTrustScore {
  let score = base;
  const notes: string[] = [];
  for (const d of deductions) {
    if (d.penalty <= 0) continue;
    score -= d.penalty;
    notes.push(d.note);
  }
  const clamped = clampScore(score);
  return { score: clamped, label: labelForScore(clamped), notes };
}

// ---------------------------------------------------------------------------
// jump
// ---------------------------------------------------------------------------

/** One rep's already-computed signals, as summarizeJumpSet has them at the
 * moment it pushes the rep. Passed in rather than recomputed so this module
 * needs nothing from the trace itself. */
export type JumpRepTrustInput = {
  repNumber: number;
  /** Mean TrackedPoint.confidence across the rep's own takeoff-to-landing
   * window. Occlusion-gap filler points carry a discounted confidence of
   * their own (see interpolateOcclusionGap), so a heavily bridged rep
   * already reads low here without needing a separate coverage signal. */
  avgConfidence: number;
  /** Flight-time-derived height -- the standard video jump-testing method. */
  jumpHeightCm: number;
  /** Peak ankle displacement above the pre-jump baseline -- an independent
   * read of the same jump off the same trace, never compared against the
   * flight-time number until now. */
  peakHeightCm: number;
  /** Set as an outlier against the set's own median (see summarizeJumpSet's
   * outlier pass). Only meaningful on a set of 3+ jumps. */
  outlierAgainstSet: boolean;
};

// How closely the two independent height estimates have to agree before
// this stops docking the rep. They measure genuinely different things (a
// flight-time height assumes a symmetric ground-to-ground arc; peak
// displacement is a direct trace read that a bent-knee takeoff inflates),
// so exact agreement is not expected even on a perfect capture -- these are
// set loose enough that a clean rep clears them, and only a rep where the
// two readings tell substantially different stories gets flagged.
const JUMP_HEIGHT_AGREEMENT_GOOD = 0.6;
const JUMP_HEIGHT_AGREEMENT_WEAK = 0.35;

/** Per-rep trust for jump mode -- RepTrustScore[], not a set-level score,
 * because workoutSetEntries.trustScores is already that shape and
 * resolveTrustScorePct already reduces it (lowest rep wins) into
 * trust_score_pct. A jump set needs no new column. */
export function jumpTrustScores(reps: JumpRepTrustInput[]): RepTrustScore[] {
  return reps.map((rep) => {
    const bigger = Math.max(rep.jumpHeightCm, rep.peakHeightCm);
    const smaller = Math.min(rep.jumpHeightCm, rep.peakHeightCm);
    // Both estimates at (or below) zero means there is nothing to compare,
    // not that they agree perfectly -- treated as no corroboration rather
    // than as a clean cross-check.
    const agreement = bigger > 0 ? smaller / bigger : 0;

    const set = build(rep.avgConfidence * 100, [
      {
        // A sharp disagreement is the strongest single tell this mode has:
        // two independent reads of the same jump, off the same trace, that
        // cannot both be right. It has to be able to pull an otherwise
        // fully-confident rep down to "low" on its own, or the corroboration
        // ARC-1 added would never actually change what the athlete is told.
        penalty: agreement >= JUMP_HEIGHT_AGREEMENT_GOOD ? 0 : agreement >= JUMP_HEIGHT_AGREEMENT_WEAK ? 20 : 45,
        note:
          agreement >= JUMP_HEIGHT_AGREEMENT_WEAK
            ? "Flight time and ankle travel disagree somewhat on this jump's height"
            : "Flight time and ankle travel disagree sharply on this jump's height",
      },
      {
        penalty: rep.outlierAgainstSet ? 25 : 0,
        note: "This jump is well out of line with the rest of the set",
      },
    ]);
    return { repNumber: rep.repNumber, score: set.score, label: set.label, notes: set.notes };
  });
}

// ---------------------------------------------------------------------------
// sprint / horizontal_load (both checkpoint-crossing timing)
// ---------------------------------------------------------------------------

export type CrossingTrustInput = {
  /** detectSprintCrossings' own plausibility flag -- a result implying a
   * speed no human has run. */
  likelyGlitch: boolean;
  /** Total frames the recording produced, and how many of those actually
   * yielded a reference point (both hips visible). A run tracked in a third
   * of its frames can still cross every checkpoint, just far less precisely.  */
  totalFrames: number;
  framesWithReferencePoint: number;
  /** For each crossing, the wall-clock gap between the two frames the
   * crossing was interpolated between -- see detectSprintCrossings'
   * crossingFrameGapsMs. The crossing time is only ever known to within
   * this, so the ratio of the worst gap to the measured elapsed time is a
   * real precision bound on the result, not a heuristic. */
  crossingFrameGapsMs: number[];
  totalElapsedSeconds: number;
  /** True when the athlete scrubbed the start/finish by hand instead of the
   * camera finding them (sprint's manual fallback). Not untrustworthy --
   * a human eye on a video is a real measurement -- but it is not a
   * camera cross-check either, and the score should not claim it is. */
  manuallyTimed?: boolean;
};

// Fraction of the run's own elapsed time that the worst crossing's frame
// gap is allowed to represent before it starts costing the score.
const CROSSING_PRECISION_GOOD = 0.02;
const CROSSING_PRECISION_WEAK = 0.06;
// Below this share of frames carrying a usable reference point, the run was
// tracked too sparsely to call the timing well-corroborated.
const REFERENCE_COVERAGE_GOOD = 0.7;
const REFERENCE_COVERAGE_WEAK = 0.4;

/** Set-level trust for a checkpoint-timed capture -- sprint mode on the
 * skills side, and horizontal_load on the strength side, which reuses the
 * exact same crossing model (see the horizontal_load columns' own schema
 * comment) and so gets the identical scoring rather than a parallel one. */
export function crossingTrustScore(input: CrossingTrustInput): SetTrustScore {
  const coverage =
    input.totalFrames > 0 ? input.framesWithReferencePoint / input.totalFrames : 0;
  const worstGapMs = input.crossingFrameGapsMs.length > 0 ? Math.max(...input.crossingFrameGapsMs) : 0;
  const elapsedMs = input.totalElapsedSeconds * 1000;
  const precision = elapsedMs > 0 ? worstGapMs / elapsedMs : 1;

  return build(100, [
    {
      penalty: input.likelyGlitch ? 55 : 0,
      note: "This time implies a speed no human has run -- almost certainly a checkpoint-detection glitch",
    },
    {
      penalty: precision <= CROSSING_PRECISION_GOOD ? 0 : precision <= CROSSING_PRECISION_WEAK ? 15 : 30,
      note:
        precision <= CROSSING_PRECISION_WEAK
          ? "Frames were sparse enough around a checkpoint to blur the split slightly"
          : "Frames were too sparse around a checkpoint to time the crossing precisely",
    },
    {
      penalty: coverage >= REFERENCE_COVERAGE_GOOD ? 0 : coverage >= REFERENCE_COVERAGE_WEAK ? 12 : 25,
      note:
        coverage >= REFERENCE_COVERAGE_WEAK
          ? "The athlete's hips were out of frame for part of the run"
          : "The athlete's hips were out of frame for most of the run",
    },
    {
      penalty: input.manuallyTimed ? 10 : 0,
      note: "Start and finish were marked by hand on the video, not detected by the camera",
    },
  ]);
}

/** horizontal_load reports one carry, not a set of reps, but
 * workoutSetEntries.trustScores is the only confidence column the strength
 * side has that resolveTrustScorePct already reads. A single-entry array
 * keyed to rep 1 lands the number in trust_score_pct with no new column and
 * no server change -- the same normalization the schema comment asks for. */
export function asSingleRepTrust(trust: SetTrustScore): RepTrustScore[] {
  return [{ repNumber: 1, score: trust.score, label: trust.label, notes: trust.notes }];
}

// ---------------------------------------------------------------------------
// mechanics
// ---------------------------------------------------------------------------

export type MechanicsTrustInput = {
  /** Frames the capture produced in total. */
  totalFrames: number;
  /** Frames where both shoulders AND both hips were visible -- the joints
   * every headline mechanics number (separation, rotation, sequencing) is
   * derived from. analyzeMechanics already drops the rest; this is how many
   * it kept. */
  framesWithTorso: number;
  /** analyzeMechanics' own sequencing read. A capture where the hip and
   * shoulder rotation peaks couldn't both be located didn't see enough of
   * the motion to describe it. */
  hipPeakFound: boolean;
  shoulderPeakFound: boolean;
  /** "throw" mode only -- the throwing-arm peak, and whether the wrist
   * speed it came from exceeded MAX_PLAUSIBLE_WRIST_SPEED_MPS (a landmark
   * jumping across the frame, not a real throw). Both undefined in "swing"
   * mode, which has no arm peak to find. */
  armPeakFound?: boolean;
  implausibleWristSpeed?: boolean;
};

const MECHANICS_TORSO_COVERAGE_GOOD = 0.75;
const MECHANICS_TORSO_COVERAGE_WEAK = 0.45;
// A capture this short can't hold a swing or a throw, let alone locate its
// rotation peaks -- whatever it measured came off a handful of frames.
const MECHANICS_MIN_FRAMES = 15;

export function mechanicsTrustScore(input: MechanicsTrustInput): SetTrustScore {
  const coverage = input.totalFrames > 0 ? input.framesWithTorso / input.totalFrames : 0;
  const missingPeaks =
    (input.hipPeakFound ? 0 : 1) +
    (input.shoulderPeakFound ? 0 : 1) +
    (input.armPeakFound === false ? 1 : 0);

  return build(100, [
    {
      // Enough on its own to drop a clean capture to "low" -- a landmark
      // that jumped across the frame is not a nuance to average away.
      penalty: input.implausibleWristSpeed ? 50 : 0,
      note: "Peak wrist speed came back physically impossible -- a misdetected landmark, not a real throw",
    },
    {
      penalty: coverage >= MECHANICS_TORSO_COVERAGE_GOOD ? 0 : coverage >= MECHANICS_TORSO_COVERAGE_WEAK ? 15 : 30,
      note:
        coverage >= MECHANICS_TORSO_COVERAGE_WEAK
          ? "Shoulders and hips were out of frame for part of this capture"
          : "Shoulders and hips were out of frame for most of this capture",
    },
    {
      penalty: missingPeaks * 15,
      note:
        missingPeaks > 1
          ? "Couldn't locate several of the rotation peaks the sequencing read depends on"
          : "Couldn't locate one of the rotation peaks the sequencing read depends on",
    },
    {
      penalty: input.totalFrames < MECHANICS_MIN_FRAMES ? 25 : 0,
      note: "The capture was too short to see the whole motion",
    },
  ]);
}
