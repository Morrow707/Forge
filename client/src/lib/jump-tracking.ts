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
import {
  movingAverage,
  buildPathTrace,
  heightScaledAmplitudeCm,
  framesForDuration,
  MIN_TRACKING_CONFIDENCE,
  type TrackedPoint,
  type PathTracePoint,
} from "./bar-tracking";
import type { FormFault, LandingAsymmetryEntry } from "./pose-tracking";

const GRAVITY_MPS2 = 9.81;
// A flat frame count here would describe half as much real-world smoothing
// once a device grants the 60fps bar-tracker-dialog.tsx now requests
// instead of the ~30fps this was tuned around -- see bar-tracking.ts's own
// comment on TARGET_SMOOTHING_MS/framesForDuration, which this reuses so a
// jump's ankle trace gets the same fps-independent smoothing strength a
// lift's bar-path trace does.
const TARGET_SMOOTHING_MS = 165;
// Same reasoning, for how many consecutive near-still SAMPLES count as
// "landed" -- see its own comment further down where it's turned into an
// actual frame count via framesForDuration.
const TARGET_SETTLE_MS = 100;

// No standing vertical jump, broad jump, or box jump for any real athlete
// has flight time anywhere near this, even at an elite level (well under a
// second for all three) -- this is purely a sanity ceiling against the
// state machine mistaking a tracking dropout for a very long "flight."
// A broad jump in particular can send the ankle point out of a tightly
// framed shot for a moment; if pose tracking loses (and later reacquires)
// the athlete mid-air, nothing in the trace between those two points flags
// the gap, so the state machine's next "settled" frame gets read as a
// real landing arbitrarily far downstream in time. Since jumpHeightCm
// grows with the SQUARE of flightSeconds, that turns a several-second
// tracking gap into a physically impossible triple-digit "jump height"
// instead of a merely-wrong one -- worth rejecting outright rather than
// reporting.
const MAX_FLIGHT_SECONDS = 1.2;

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
  // Same clock as TrackedPoint.t (ms since tracking started) -- lift mode's
  // RepBreakdown has always carried startT/endT for exactly this reason
  // (video-overlay.ts locating which rep a given video timestamp falls
  // in); this is the jump-mode equivalent so that code doesn't need two
  // different lookup strategies per mode.
  takeoffT: number;
  landingT: number;
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
  // Filled in by the caller from pose-tracking.ts's computeLandingAsymmetry
  // -- same "this module only has the ankle trace" reasoning as formFaults
  // above. One entry per rep in repBreakdown (null for a rep without
  // enough clean per-foot data), undefined when the caller never populates
  // it at all (a MediaPipe caller with only 2D landmarks and no real depth
  // to trust the timing signal from).
  landingAsymmetry?: (LandingAsymmetryEntry | null)[];
};

const BASE_MIN_FLIGHT_AMPLITUDE_CM = 15;

// loadKg has no equivalent here (jumps have no external load to base power
// on the way summarizeTrackedSet's does) -- this is display of body-flight
// kinematics, not force or power.
//
// heightIn (the athlete's stored height, when on file) scales
// BASE_MIN_FLIGHT_AMPLITUDE_CM via bar-tracking.ts's heightScaledAmplitudeCm
// -- the smallest ankle-height rise the state machine above will trust as
// a real takeoff rather than standing sway or a weight-shift between
// reps. 8cm (the original flat floor before this existed) is barely above
// ordinary in-place wobble, so a moment of resettling footing on top of a
// box (or even just breathing/postural sway) could cross it and register
// as its own jump on top of the real one. A genuine vertical or broad
// jump -- box jump included -- clears well over 15cm of ankle travel for
// an average-height athlete, so that floor costs nothing on real reps
// while cutting out the sway-driven ones; the height scaling shifts it
// proportionally for anyone far from average.
export function summarizeJumpSet(
  rawPoints: TrackedPoint[],
  heightIn?: number | null,
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
  const minFlightAmplitudeCm = heightScaledAmplitudeCm(BASE_MIN_FLIGHT_AMPLITUDE_CM, heightIn);

  // Confidence-weighted the same way bar-tracking.ts's own sideSmoothed is
  // (see fuseSideVelocity) -- movingAverage already accepts this, this call
  // just never passed it, so a stretch of low-lock frames (the implement/
  // ankle tracker briefly losing the athlete mid-air, e.g. a broad jump
  // sending an ankle out of frame for an instant) got the same weight as a
  // fully-trusted frame going into the takeoff/landing state machine below.
  const ySmoothed = movingAverage(
    rawPoints.map((p) => p.y),
    framesForDuration(rawPoints, TARGET_SMOOTHING_MS),
    rawPoints.map((p) => p.confidence ?? 1),
  );
  const minAmplitudeM = minFlightAmplitudeCm / 100;
  // A fraction of the minimum flight amplitude, used both as the
  // takeoff/landing trigger threshold and as the jitter tolerance the
  // baseline is allowed to drift by while grounded -- small enough to catch
  // a real push-off promptly, large enough to ignore pose-noise sway.
  const triggerM = minAmplitudeM * 0.3;

  // How many consecutive near-still SAMPLES count as "landed" rather than a
  // single noisy one -- long enough (in real time, via framesForDuration)
  // to reject jitter, short enough not to eat into the next rep's
  // ground-contact time.
  const SETTLE_FRAMES = framesForDuration(rawPoints, TARGET_SETTLE_MS);
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

          if (flightSeconds > 0 && flightSeconds <= MAX_FLIGHT_SECONDS) {
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

            const repPoints = rawPoints.slice(takeoffIdx, landingIdx + 1);
            const avgConfidence =
              repPoints.reduce((sum, p) => sum + (p.confidence ?? 1), 0) / repPoints.length;

            reps.push({
              repNumber: reps.length + 1,
              flightSeconds: Math.round(flightSeconds * 1000) / 1000,
              jumpHeightCm: Math.round(jumpHeightCm * 10) / 10,
              peakHeightCm: Math.round(peakHeightCm * 10) / 10,
              horizontalDistanceCm,
              groundContactSeconds,
              likelyTrackingGlitch: avgConfidence < MIN_TRACKING_CONFIDENCE,
              takeoffT,
              landingT,
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
        rep.likelyTrackingGlitch = rep.likelyTrackingGlitch || deviationPercent > outlierPercent;
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
