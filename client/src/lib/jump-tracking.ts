// Jump-flight analysis for the camera tracker's "jump" mode, applied to
// ankle-midpoint vertical position instead of wrist/bar position. This uses
// its own takeoff/landing state machine rather than bar-tracking.ts's zigzag
// phase segmenter: the segmenter closes a phase only when position retraces
// from its running extreme, which works for a lift bar that's always
// oscillating but breaks for a jump's flat "standing still" period after
// landing (nothing retraces during it, so the phase boundary drifts forward
// through the whole stand and corrupts both flight time and the next rep's
// ground-contact time). A level-crossing state machine fires exactly once at
// the true landing moment regardless of how long the athlete stands still
// afterward.
import { movingAverage, buildPathTrace, type TrackedPoint, type PathTracePoint } from "./bar-tracking";
import type { FormFault } from "./pose-tracking";

const GRAVITY_MPS2 = 9.81;
const SMOOTHING_WINDOW = 5;

export type JumpRep = {
  repNumber: number;
  flightSeconds: number;
  // Two independent estimates of the same thing, kept separate rather than
  // averaged: flight-time-derived height is the standard video-based jump
  // testing method (what apps like My Jump validate against force plates),
  // while peak displacement is a simpler cross-check straight off the
  // world-space ankle trace.
  jumpHeightCm: number;
  peakHeightCm: number;
  // Null when the camera axis shows negligible horizontal travel (a
  // vertical-only jump) -- not every jump is a broad jump.
  horizontalDistanceCm: number | null;
  // Time on the ground before this jump's takeoff, from the previous jump's
  // landing -- null for the first jump (nothing to measure from).
  groundContactSeconds: number | null;
  // True when this rep's jumpHeightCm is a statistical outlier against the
  // rest of the set (see the outlier pass in summarizeJumpSet below) --
  // e.g. "24, 24, 6, 24" is a tracking glitch on rep 3, not a real jump a
  // third the height of the others. Never adjusts or drops the number
  // itself, only flags it -- same principle as video-retention's eviction
  // logic: a number this module can't verify against ground truth doesn't
  // get silently "corrected," it gets surfaced so a human can look at it.
  likelyTrackingGlitch: boolean;
};

export type JumpSetMetrics = {
  bestJumpHeightCm: number;
  bestHorizontalDistanceCm: number | null;
  avgGroundContactSeconds: number | null;
  // Reactive Strength Index (jump height in meters / ground contact time in
  // seconds) -- the standard power-and-reactivity metric for repeated
  // jumps/depth jumps. Null when there's only one jump in the set (no
  // contact time to measure between reps).
  reactiveStrengthIndex: number | null;
  repBreakdown: JumpRep[];
  pathTrace: PathTracePoint[];
  // Filled in by the caller from pose-tracking.ts's detectFormFaults (with
  // context "jump"), same pattern as bar-tracking.ts's RepMetrics --
  // this module only has the ankle trace, not the full landmark history
  // fault detection needs.
  formFaults: FormFault[];
};

// loadKg has no equivalent here (jumps have no external load to base power
// on the way summarizeTrackedSet's does) -- this is display of body-flight
// kinematics, not force or power.
export function summarizeJumpSet(
  rawPoints: TrackedPoint[],
  minFlightAmplitudeCm = 8,
  // How far a rep's jumpHeightCm can deviate from the set's median before
  // it's flagged as a likely tracking glitch -- from the active
  // MovementProfile's jumpHeightOutlierPercent when one exists (see
  // shared/schema.ts), this default otherwise. 35% is generous enough that
  // real fatigue across a set of jumps (typically well under 20% rep to
  // rep) doesn't trip it, while still catching a glitch like a 6cm read
  // sitting next to three 24cm reps (a ~75% deviation).
  outlierPercent = 35,
): JumpSetMetrics | null {
  if (rawPoints.length < 6) return null;

  const ySmoothed = movingAverage(rawPoints.map((p) => p.y), SMOOTHING_WINDOW);
  const minAmplitudeM = minFlightAmplitudeCm / 100;
  // A fraction of the minimum flight amplitude, used both as the
  // takeoff/landing trigger threshold and as the jitter tolerance the
  // baseline is allowed to drift by while grounded -- small enough to catch
  // a real push-off promptly, large enough to ignore pose-noise sway.
  const triggerM = minAmplitudeM * 0.3;

  const reps: JumpRep[] = [];
  let previousLandingT: number | null = null;

  let state: "grounded" | "airborne" = "grounded";
  // The athlete's standing ankle height while grounded -- image y decreases
  // upward, so "airborne" means ySmoothed drops meaningfully below this.
  let baseline = ySmoothed[0];
  let baselineIdx = 0;
  let takeoffIdx = -1;
  let peakIdx = -1;

  for (let i = 1; i < ySmoothed.length; i++) {
    if (state === "grounded") {
      if (Math.abs(ySmoothed[i] - baseline) < triggerM) {
        // Still standing -- let the baseline track slow drift/jitter so a
        // long stand between jumps doesn't accumulate a false takeoff.
        baseline = ySmoothed[i];
        baselineIdx = i;
        continue;
      }
      if (baseline - ySmoothed[i] >= triggerM) {
        state = "airborne";
        takeoffIdx = baselineIdx; // last confirmed-grounded frame, not this one
        peakIdx = i;
      }
      // A rise below the trigger, or a downward move, isn't a takeoff --
      // keep waiting rather than resetting the baseline off a noisy frame.
    } else {
      if (ySmoothed[i] < ySmoothed[peakIdx]) peakIdx = i;
      if (ySmoothed[i] >= baseline) {
        // Level-crossing back to (or past) the pre-jump baseline: this
        // fires exactly once, at the true landing frame, no matter how long
        // the athlete then stands still -- unlike a retrace-from-extreme
        // check, a flat post-landing period can't drag this boundary.
        const landingIdx = i;
        const takeoffT = rawPoints[takeoffIdx].t;
        const landingT = rawPoints[landingIdx].t;
        const flightSeconds = (landingT - takeoffT) / 1000;

        if (flightSeconds > 0) {
          const jumpHeightCm = (GRAVITY_MPS2 * flightSeconds * flightSeconds * 100) / 8;

          const peakHeightCm = Math.max(0, (baseline - ySmoothed[peakIdx]) * 100);

          // Below ~5cm is just normal in-place sway, not an intentional
          // broad jump -- reporting a noisy "distance" on a vertical-only
          // jump would be misleading, so this stays null rather than a
          // small stray number.
          const horizontalM = Math.abs(rawPoints[landingIdx].x - rawPoints[takeoffIdx].x);
          const horizontalDistanceCmRaw = horizontalM * 100;
          const horizontalDistanceCm =
            horizontalDistanceCmRaw >= 5 ? Math.round(horizontalDistanceCmRaw * 10) / 10 : null;

          const groundContactSeconds =
            previousLandingT != null
              ? Math.round(((takeoffT - previousLandingT) / 1000) * 1000) / 1000
              : null;

          reps.push({
            repNumber: reps.length + 1,
            flightSeconds: Math.round(flightSeconds * 1000) / 1000,
            jumpHeightCm: Math.round(jumpHeightCm * 10) / 10,
            peakHeightCm: Math.round(peakHeightCm * 10) / 10,
            horizontalDistanceCm,
            groundContactSeconds,
            likelyTrackingGlitch: false,
          });

          previousLandingT = landingT;
        }

        state = "grounded";
        baseline = ySmoothed[i];
        baselineIdx = i;
      }
    }
  }

  if (reps.length === 0) return null;

  // Flagging needs at least 3 reps -- with only 2, there's no way to tell
  // which one (if either) is the odd one out, so a big gap between them
  // could just as easily be real fatigue as a tracking glitch. Median
  // (not mean) so a single wild rep can't drag the baseline it's being
  // compared against toward itself.
  if (reps.length >= 3) {
    const heights = reps.map((r) => r.jumpHeightCm).sort((a, b) => a - b);
    const mid = Math.floor(heights.length / 2);
    const medianHeightCm =
      heights.length % 2 !== 0 ? heights[mid] : (heights[mid - 1] + heights[mid]) / 2;
    if (medianHeightCm > 0) {
      for (const rep of reps) {
        const deviationPercent = (Math.abs(rep.jumpHeightCm - medianHeightCm) / medianHeightCm) * 100;
        rep.likelyTrackingGlitch = deviationPercent > outlierPercent;
      }
    }
  }

  const bestJumpHeightCm = Math.max(...reps.map((r) => r.jumpHeightCm));
  const distances = reps.map((r) => r.horizontalDistanceCm).filter((d): d is number => d != null);
  const bestHorizontalDistanceCm = distances.length ? Math.max(...distances) : null;
  const contactTimes = reps
    .map((r) => r.groundContactSeconds)
    .filter((c): c is number => c != null);
  const avgGroundContactSeconds = contactTimes.length
    ? Math.round((contactTimes.reduce((a, c) => a + c, 0) / contactTimes.length) * 1000) / 1000
    : null;
  const reactiveStrengthIndex =
    avgGroundContactSeconds && avgGroundContactSeconds > 0
      ? Math.round((bestJumpHeightCm / 100 / avgGroundContactSeconds) * 100) / 100
      : null;

  return {
    bestJumpHeightCm,
    bestHorizontalDistanceCm,
    avgGroundContactSeconds,
    reactiveStrengthIndex,
    repBreakdown: reps,
    pathTrace: buildPathTrace(rawPoints, { x: rawPoints[0].x, y: rawPoints[0].y }),
    formFaults: [],
  };
}
