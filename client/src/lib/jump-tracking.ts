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
): JumpSetMetrics | null {
  if (rawPoints.length < 6) return null;

  const ySmoothed = movingAverage(rawPoints.map((p) => p.y), SMOOTHING_WINDOW);
  const minAmplitudeM = minFlightAmplitudeCm / 100;
  // A fraction of the minimum flight amplitude, used both as the
  // takeoff/landing trigger threshold and as the jitter tolerance the
  // baseline is allowed to drift by while grounded -- small enough to catch
  // a real push-off promptly, large enough to ignore pose-noise sway.
  const triggerM = minAmplitudeM * 0.3;

  // How many consecutive near-still frames count as "landed" rather than a
  // single noisy sample -- long enough to reject jitter, short enough not
  // to eat into the next rep's ground-contact time.
  const SETTLE_FRAMES = 3;
  const settleToleranceM = triggerM;

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

      // Landing doesn't have to return to the pre-jump baseline -- a box
      // jump lands higher (on the box), a depth jump lands lower. So
      // instead of waiting for a specific return height, this watches for
      // the flight simply stopping: near-zero vertical movement sustained
      // for SETTLE_FRAMES, once we're clearly past the apex (not just
      // pausing at the top of the arc, which also has near-zero velocity
      // for an instant but keeps falling afterward).
      const amplitudeSoFar = baseline - ySmoothed[peakIdx];
      const pastApex = ySmoothed[i] - ySmoothed[peakIdx] >= triggerM;
      if (amplitudeSoFar >= minAmplitudeM && pastApex && i - (SETTLE_FRAMES - 1) > peakIdx) {
        const window = ySmoothed.slice(i - SETTLE_FRAMES + 1, i + 1);
        const settled = Math.max(...window) - Math.min(...window) < settleToleranceM;
        if (settled) {
          // First frame of the settled window -- the actual touchdown
          // moment, not the frame settling was confirmed on.
          const landingIdx = i - SETTLE_FRAMES + 1;
          const takeoffT = rawPoints[takeoffIdx].t;
          const landingT = rawPoints[landingIdx].t;
          const flightSeconds = (landingT - takeoffT) / 1000;

          if (flightSeconds > 0) {
            const jumpHeightCm = (GRAVITY_MPS2 * flightSeconds * flightSeconds * 100) / 8;

            const peakHeightCm = Math.max(0, amplitudeSoFar * 100);

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
            });

            previousLandingT = landingT;
          }

          // The new stand height -- wherever that turned out to be (back on
          // the ground, up on a box, down off one) -- becomes the baseline
          // the next rep's takeoff is measured from.
          state = "grounded";
          baseline = window.reduce((a, b) => a + b, 0) / window.length;
          baselineIdx = i;
        }
      }
    }
  }

  if (reps.length === 0) return null;

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
