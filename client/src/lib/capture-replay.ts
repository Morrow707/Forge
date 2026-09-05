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
import { implausibleRangeOfMotion } from "./bar-tracking";

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
  barPathTrace: PathTracePoint[];
};

export type ReplayResult = {
  setId?: number | string;
  exerciseName: string;
  /** Null when the trace was too short or held no detectable rep. */
  metrics: RepMetrics | null;
  repCount: number;
  loggedReps: number | null;
  /** Positive when the analysis found more reps than the athlete logged. */
  repCountError: number | null;
  romProblem: string | null;
};

/** A stored trace carries no confidence per point (it is the smoothed output, not the raw
 * reading), so replay assumes full confidence. That makes the replay slightly more permissive
 * than the live run, which is the safe direction: it will not invent a rejection the live
 * pipeline did not make. */
function toTrackedPoints(trace: PathTracePoint[]): TrackedPoint[] {
  return trace.map((p) => ({ t: p.t, x: p.x, y: p.y, z: 0, confidence: 1 }));
}

export function replayCapture(capture: StoredCapture): ReplayResult {
  const points = toTrackedPoints(capture.barPathTrace);
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
    repCount,
    loggedReps,
    repCountError: loggedReps != null ? repCount - loggedReps : null,
    romProblem: metrics
      ? implausibleRangeOfMotion(
          metrics.romCm,
          capture.heightIn,
          romBucketForExercise(capture.exerciseName),
        )
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
