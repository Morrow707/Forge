// Re-running the metrics stage over a capture that already happened.
//
// Every threshold in this pipeline is a number somebody picked. The rep-amplitude floor, the
// phantom-phase ratio, the trust deductions, the range-of-motion bounds -- all of them were
// reasoned about and none of them were measured, because measuring one means re-running the
// analysis over real captures and seeing what changes. There was no way to do that: analysis
// only ever ran once, live, on a phone, against footage that was then discarded.
//
// Sets already store their own bar-path trace. That trace is the input to everything downstream
// of tracking -- segmentation, rep counting, velocity, range of motion, trust -- so replaying it
// exercises the half of the pipeline where the thresholds actually live, with no device, no
// camera and no video.
//
// Deliberately NOT a replay of the tracking stage. Turning frames into a trace involves the
// implement trackers, the CoreML detector and Vision itself, none of which run outside the app,
// and pretending otherwise would produce a harness that tests a reimplementation rather than the
// thing that shipped.
import {
  summarizeTrackedSet,
  toScaleFreeMetrics,
  normalizeTraceScale,
  type FirstPhaseHint,
  type PathTracePoint,
  type RepMetrics,
  type TrackedPoint,
} from "./bar-tracking";
import { firstMoveForExercise, romBucketForExercise } from "./exercise-camera-profile";
import { summarizeJumpSet, type JumpSetMetrics } from "./jump-tracking";
import {
  implausibleRangeOfMotion,
  implausibleBarPathDeviation,
  traceSpanAlongLift,
} from "./bar-tracking";

/** One stored set, as much of it as a replay needs. Shaped to match what the set row already
 * holds so an export needs no transformation. */
export type StoredCapture = {
  /** For the report only, so a surprising row can be found again. */
  setId?: number | string;
  exerciseName: string;
  heightIn?: number | null;
  loadKg?: number | null;
  /** What the athlete said they did, for comparison against what the analysis found. */
  loggedReps?: number | null;
  /** Which pipeline produced this trace, and the reason a replay cannot guess.
   *
   * Jump mode stores its ankle-height trace in `barPathTrace` rather than adding a second trace
   * column, so a jump capture and a barbell capture are the same shape and nothing in the points
   * themselves distinguishes them. Without this the barbell model runs over both, and a box jump
   * comes back reporting a peak BAR velocity for a movement with no bar, a range of motion that
   * is really an ankle excursion, and a velocity loss computed across jumps.
   *
   * Optional, because exports written before it existed do not carry it. Absent means "assume
   * barbell", which is what the harness did for its whole life -- wrong for jumps, and no more
   * wrong than it already was. */
  trackingLevel?: string | null;
  barPathTrace: PathTracePoint[];
};

/** Jump mode is its own pipeline end to end -- see jump-tracking.ts. Nothing it produces is
 * comparable to a barbell metric, so the two are never mixed in one result. */
export function isJumpCapture(capture: StoredCapture): boolean {
  return capture.trackingLevel === "jump";
}

export type ReplayResult = {
  setId?: number | string;
  exerciseName: string;
  /** Null when the trace was too short or held no detectable rep -- and ALSO null for a jump
   * capture, which has no barbell metrics to report. Read `jumpMetrics` for those. */
  metrics: RepMetrics | null;
  /** Set only for a jump capture, from the same summarizeJumpSet the app itself runs. */
  jumpMetrics: JumpSetMetrics | null;
  repCount: number;
  loggedReps: number | null;
  /** Positive when the analysis found more reps than the athlete logged. */
  repCountError: number | null;
  romProblem: string | null;
};

/** A stored trace carries no confidence per point (it is the smoothed output, not the raw
 * reading), so replay assumes full confidence. That makes the replay slightly more permissive
 * than the live run, which is the safe direction: it will not invent a rejection the live
 * pipeline did not make.
 *
 * The units matter and are easy to get wrong. `buildPathTrace` stores the trace in CENTIMETRES
 * relative to the first point, because that is what the on-screen path drawing wants.
 * Everything downstream of tracking -- `summarizeTrackedSet` and every threshold it reads --
 * works in METRES, because that is what Vision hands over. Feeding the stored numbers back in
 * unconverted multiplies every distance by 100, which clears the rep-amplitude floor on noise
 * and reports a squat with several metres of range of motion. Divide on the way back in. */
const TRACE_CM_PER_METRE = 100;

function toTrackedPoints(trace: PathTracePoint[]): TrackedPoint[] {
  return trace.map((p) => ({
    t: p.t,
    x: p.x / TRACE_CM_PER_METRE,
    y: p.y / TRACE_CM_PER_METRE,
    z: 0,
    confidence: 1,
  }));
}

export function replayCapture(capture: StoredCapture): ReplayResult {
  const points = toTrackedPoints(capture.barPathTrace);

  // A jump goes through its own pipeline, and running the barbell one over it does not produce a
  // worse number -- it produces a number of a different KIND, presented in the same fields. Peak
  // "bar" velocity on a movement with no bar, a range of motion that is really an ankle
  // excursion, a velocity loss computed across jumps. Every one of those reads as a normal
  // metric and none of them is one.
  // AND A JUMP REPLAY IS MUCH WEAKER THAN A BARBELL ONE, which is worth knowing before anyone
  // calibrates a jump threshold against this harness the way the barbell thresholds now are.
  //
  // buildPathTrace decimates to about 200 points, so a stored trace samples at 10-15Hz where the
  // live run saw 60. Most barbell metrics survive that: range of motion is a position difference
  // and mean velocity is an average, and neither cares much about the samples in between. Jump
  // height does not survive it. It is v^2/(2g) off the takeoff velocity -- one instantaneous
  // reading, during a takeoff lasting about 0.15s, SQUARED. At 15Hz a takeoff is two or three
  // samples, and whatever error that leaves is doubled by the square.
  //
  // Replaying the corpus shows it: five box jumps by one athlete come back at 63, 64, 77, 87 and
  // 178cm. The last is a seventy-inch vertical. Treat a replayed jump height as evidence the
  // pipeline RAN, not as a measurement.
  if (isJumpCapture(capture)) {
    const jumpMetrics = summarizeJumpSet(points, capture.heightIn);
    const jumpReps = jumpMetrics?.repBreakdown.length ?? 0;
    const jumpLogged = capture.loggedReps ?? null;
    return {
      setId: capture.setId,
      exerciseName: capture.exerciseName,
      metrics: null,
      jumpMetrics,
      repCount: jumpReps,
      loggedReps: jumpLogged,
      repCountError: jumpLogged != null ? jumpReps - jumpLogged : null,
      // Both plausibility gates are anthropometric limits on a BAR's travel. A jump has its own
      // outlier check inside summarizeJumpSet, so there is nothing honest to say here.
      romProblem: null,
    };
  }

  const hint: FirstPhaseHint = firstMoveForExercise(capture.exerciseName);
  const metrics = summarizeTrackedSet(
    points,
    capture.loadKg ?? undefined,
    capture.heightIn ?? undefined,
    hint,
  );
  const repCount = metrics?.repBreakdown.length ?? 0;
  const loggedReps = capture.loggedReps ?? null;
  return {
    setId: capture.setId,
    exerciseName: capture.exerciseName,
    metrics,
    jumpMetrics: null,
    repCount,
    loggedReps,
    repCountError: loggedReps != null ? repCount - loggedReps : null,
    // Either way of showing the same wrong scale. Reported under one field because the caller's
    // question is "can this take's numbers be trusted", not "which check objected".
    romProblem: metrics
      ? (implausibleRangeOfMotion(
          metrics.romCm,
          capture.heightIn,
          romBucketForExercise(capture.exerciseName),
          // Already centimetres -- a stored trace is written in them.
          traceSpanAlongLift(capture.barPathTrace),
        ) ??
        implausibleBarPathDeviation(
          metrics.barPathDeviationCm,
          capture.heightIn,
          romBucketForExercise(capture.exerciseName),
        ))
      : null,
  };
}

/** The same capture analysed as if no real-world scale had been established.
 *
 * Useful on its own: it answers "what would this set have reported under the scale-free path"
 * for a set that DID calibrate, which is the only way to check that path against a take whose
 * true numbers are known. */
export function replayCaptureScaleFree(capture: StoredCapture) {
  const points = normalizeTraceScale(toTrackedPoints(capture.barPathTrace));
  const metrics = summarizeTrackedSet(
    points,
    undefined,
    undefined,
    firstMoveForExercise(capture.exerciseName),
    [],
    1,
    true,
  );
  return metrics ? toScaleFreeMetrics(metrics) : null;
}

export type ReplaySummary = {
  captureCount: number;
  analysed: number;
  /** Captures where the analysis found a different number of reps than the athlete logged. */
  repCountMismatches: number;
  /** Captures whose range of motion is physically impossible for the athlete's height. */
  implausibleScale: number;
  /** Mean absolute rep-count error, over the captures that logged a rep count. */
  meanAbsRepError: number | null;
  results: ReplayResult[];
};

/** Replay a batch and summarise it.
 *
 * The counts are the point. A threshold change that fixes one set and breaks four is invisible
 * one set at a time, and obvious here. */
export function replayAll(captures: StoredCapture[]): ReplaySummary {
  const results = captures.map(replayCapture);
  const withLogged = results.filter((r) => r.repCountError != null);
  const meanAbsRepError =
    withLogged.length > 0
      ? Math.round(
          (withLogged.reduce((a, r) => a + Math.abs(r.repCountError!), 0) / withLogged.length) * 100,
        ) / 100
      : null;
  return {
    captureCount: captures.length,
    analysed: results.filter((r) => r.metrics != null).length,
    repCountMismatches: withLogged.filter((r) => r.repCountError !== 0).length,
    implausibleScale: results.filter((r) => r.romProblem != null).length,
    meanAbsRepError,
    results,
  };
}
