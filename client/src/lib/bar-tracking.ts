// Pure signal-processing helpers for the camera-based bar tracker --
// no DOM/camera access here, so this is easy to reason about and test in
// isolation from the getUserMedia/canvas plumbing in bar-tracker-dialog.tsx.

// x/y/z are real-world meters from MediaPipe's worldLandmarks (hip-centered
// origin), not pixels -- no pixelsPerMeter calibration needed to interpret
// them. y follows pose-tracking.ts's worldVerticalSign convention (smaller y
// = higher), applied by the caller before points ever reach this module.
export type TrackedPoint = { t: number; x: number; y: number; z: number };

// One entry per rep that had enough clean per-side pose data to trust a
// left/right comparison -- see pose-tracking.ts's computeLegDriveAsymmetry.
// A rep without a valid comparison is simply absent, not included as a null
// placeholder, since the flagging logic downstream only cares about the
// reps that actually say something.
export type LegDriveAsymmetryEntry = {
  repNumber: number;
  leftDriveDegPerSec: number;
  rightDriveDegPerSec: number;
  asymmetryPercent: number;
  dominantSide: "left" | "right";
};

const LBS_PER_KG = 2.20462;

// Converts a set's entered weight to kg for summarizeTrackedSet's loadKg --
// the athlete's weight input is unitless text in whatever unit they prefer,
// so callers need this rather than assuming kg directly.
export function toKg(weight: number, unit: "lbs" | "kg"): number {
  return unit === "kg" ? weight : weight / LBS_PER_KG;
}

// One "rep" = one concentric (lifting) phase plus whatever phase precedes
// it -- matches how the live rep counter already counts reps (on the start
// of each upward movement). depthDeg and velocityCurve are left undefined
// here and filled in by the caller from pose-tracking.ts, same pattern as
// formFaults below: this module has no landmark data to compute depth from.
export type RepBreakdown = {
  repNumber: number;
  peakVelocityMps: number;
  meanVelocityMps: number;
  concentricSeconds: number;
  // How long into the concentric phase peak velocity was reached -- a
  // standard VBT metric distinct from concentricSeconds (the whole phase's
  // duration): a rep that reaches its peak early and decelerates for the
  // rest of the lift reads very differently from one that's still
  // accelerating right up to lockout, even at the same total duration.
  timeToPeakVelocitySeconds: number;
  startT: number;
  endT: number;
  depthDeg?: number | null;
  velocityCurve?: { positionCm: number; velocityMps: number }[];
  // Vertical range of motion for this rep's concentric phase, in cm.
  romCm: number;
  // Peak concentric power for this rep -- null whenever the caller didn't
  // supply a load (summarizeTrackedSet's loadKg), same as the whole-set
  // power fields below being null in that case.
  peakPowerWatts: number | null;
  // The eccentric (lowering) phase immediately before this rep's lift --
  // null for rep 1 when the set starts from a dead stop, since there's
  // nothing to lower first.
  eccentricSeconds: number | null;
  eccentricVelocityMps: number | null;
};

export type PathTracePoint = { t: number; x: number; y: number };

export type RepMetrics = {
  peakVelocityMps: number;
  meanVelocityMps: number;
  concentricSeconds: number;
  eccentricSeconds: number;
  barPathDeviationCm: number;
  barPathTrace: PathTracePoint[];
  // Per-rep numbers for the velocity-decay / depth-consistency breakdown --
  // the whole-set numbers above stay as they were (best/average across the
  // set) so nothing downstream that reads them needs to change.
  repBreakdown: RepBreakdown[];
  // Populated by the caller (bar-tracker-dialog.tsx tracks each wrist
  // separately alongside the averaged bar point) rather than computed here,
  // same reasoning as formFaults below -- null when one side was out of
  // frame for too much of the set to build a meaningful trace.
  armPathTrace?: { left: PathTracePoint[]; right: PathTracePoint[] } | null;
  // Populated by the caller from pose-tracking.ts's computeLegDriveAsymmetry
  // -- only for bilateral lower-body lifts (see bar-tracker-dialog.tsx's
  // gate on movementType/laterality), same "caller fills it in" pattern as
  // armPathTrace above. Null when the movement doesn't apply or no rep had
  // enough clean data.
  legDriveAsymmetry?: LegDriveAsymmetryEntry[] | null;
  // Populated by the caller from pose-tracking.ts's detectFormFaults --
  // kept as a plain field here (rather than computed inside
  // summarizeTrackedSet) since fault detection needs the full per-frame
  // landmark history, not just the derived (t,x,y) trace this module works
  // with.
  formFaults: { code: string; label: string }[];
  // Estimated output power (mass * g * concentric velocity) -- null unless
  // summarizeTrackedSet was given a load, since bodyweight-only sets have
  // no well-defined external load to base this on.
  peakPowerWatts: number | null;
  meanPowerWatts: number | null;
  // Mean velocity of the eccentric (lowering) phase, averaged across the
  // set -- the concentric numbers above are the "lift"; this is the other
  // half, reported separately the way VBT tools like Perch do rather than
  // folded into a single figure.
  eccentricMeanVelocityMps: number;
  // Average per-rep vertical range of motion, in cm.
  romCm: number;
  // How much peak concentric velocity dropped from the first rep to the
  // last, as a percentage -- the standard within-set fatigue signal in
  // velocity-based training. Null for single-rep sets (nothing to compare).
  velocityLossPercent: number | null;
};

// Decimates a raw world-space (meters) trace to at most ~200 points and
// converts it to cm relative to `origin` -- shared by the averaged bar-path
// trace and the independent left/right arm-path traces so all three use the
// same coordinate convention.
export function buildPathTrace(
  rawPoints: TrackedPoint[],
  origin: { x: number; y: number },
): PathTracePoint[] {
  if (rawPoints.length === 0) return [];
  const stride = Math.max(1, Math.floor(rawPoints.length / 200));
  return rawPoints
    .filter((_, i) => i % stride === 0)
    .map((p) => ({
      t: p.t,
      x: Math.round((p.x - origin.x) * 1000) / 10,
      y: Math.round((p.y - origin.y) * 1000) / 10,
    }));
}

// A brief camera dropout (an arm crossing in front of the bar, a chalk
// cloud, a lighting flicker) shouldn't corrupt what comes out the other
// end: with no interpolation, the next confident point after a gap looks
// like the bar teleported there in a single frame, and peak velocity gets
// computed from that one oversized step -- a fake spike with nothing to do
// with how the athlete actually moved. Below OCCLUSION_MIN_GAP_MS this
// never fires (that's just ordinary frame-to-frame spacing); above
// OCCLUSION_MAX_GAP_MS the dropout is long enough that guessing what
// happened in between would fabricate more than it recovers, so the caller
// sees the real gap untouched, same as before this existed.
const OCCLUSION_MIN_GAP_MS = 70;
const OCCLUSION_MAX_GAP_MS = 200;
const OCCLUSION_STEP_MS = 33;

// Linearly-interpolated points to splice in between `prev` and `curr` when
// the gap between them looks like a brief dropout rather than real motion
// -- empty array (nothing to insert) otherwise. Caller pushes these before
// pushing `curr` itself; `prev`/`curr` are never duplicated or altered.
export function interpolateOcclusionGap(
  prev: TrackedPoint,
  curr: TrackedPoint,
  maxGapMs = OCCLUSION_MAX_GAP_MS,
): TrackedPoint[] {
  const gap = curr.t - prev.t;
  if (gap < OCCLUSION_MIN_GAP_MS || gap > maxGapMs) return [];
  const steps = Math.floor(gap / OCCLUSION_STEP_MS);
  if (steps < 2) return [];
  const points: TrackedPoint[] = [];
  for (let i = 1; i < steps; i++) {
    const frac = i / steps;
    points.push({
      t: prev.t + gap * frac,
      x: prev.x + (curr.x - prev.x) * frac,
      y: prev.y + (curr.y - prev.y) * frac,
      z: prev.z + (curr.z - prev.z) * frac,
    });
  }
  return points;
}

const SMOOTHING_WINDOW = 5;

// Exported for jump-tracking.ts, which reuses this same smoothing +
// phase-segmentation pipeline on an ankle trace instead of a wrist/bar
// trace -- the zigzag logic below has no idea what it's tracking, so
// there's no reason to duplicate it for a second signal source.
export function movingAverage(values: number[], window: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - Math.floor(window / 2));
    const end = Math.min(values.length, i + Math.ceil(window / 2));
    const slice = values.slice(start, end);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}

// Central-difference speed (pixels/second, always positive) from a smoothed
// vertical-position trace.
function computeSpeeds(points: TrackedPoint[], positions: number[]): number[] {
  const speeds: number[] = new Array(points.length).fill(0);
  for (let i = 1; i < points.length - 1; i++) {
    const dt = (points[i + 1].t - points[i - 1].t) / 1000;
    if (dt <= 0) continue;
    speeds[i] = Math.abs(positions[i + 1] - positions[i - 1]) / dt;
  }
  return speeds;
}

// Splits a continuous vertical-position trace into alternating up/down
// phases using a running-extreme zigzag: a phase only ends once the
// position has retraced by minAmplitude from its peak/trough so far, not
// simply "moved the other way from the phase start". A rep returns close
// to its own starting height, so comparing against a fixed start point
// (rather than the most recent extreme) would miss the reversal almost
// entirely -- it wouldn't register until the *next* phase re-passed the
// previous phase's starting value.
export function segmentPhases(
  positions: number[],
  minAmplitude: number,
): { startIdx: number; endIdx: number }[] {
  const phases: { startIdx: number; endIdx: number }[] = [];
  if (positions.length < 2) return phases;

  let phaseStart = 0;
  let direction: 1 | -1 | 0 = 0;
  let extremeIdx = 0;

  for (let i = 1; i < positions.length; i++) {
    if (direction === 0) {
      if (positions[i] > positions[extremeIdx]) {
        direction = 1;
        extremeIdx = i;
      } else if (positions[i] < positions[extremeIdx]) {
        direction = -1;
        extremeIdx = i;
      }
      continue;
    }

    if (direction === 1) {
      if (positions[i] >= positions[extremeIdx]) {
        extremeIdx = i;
      } else if (positions[extremeIdx] - positions[i] >= minAmplitude) {
        phases.push({ startIdx: phaseStart, endIdx: extremeIdx });
        phaseStart = extremeIdx;
        direction = -1;
        extremeIdx = i;
      }
    } else {
      if (positions[i] <= positions[extremeIdx]) {
        extremeIdx = i;
      } else if (positions[i] - positions[extremeIdx] >= minAmplitude) {
        phases.push({ startIdx: phaseStart, endIdx: extremeIdx });
        phaseStart = extremeIdx;
        direction = 1;
        extremeIdx = i;
      }
    }
  }
  if (extremeIdx > phaseStart) {
    phases.push({ startIdx: phaseStart, endIdx: extremeIdx });
  }
  return phases;
}

const GRAVITY_MPS2 = 9.81;

// Reference height (5'9", a common adult-average baseline) the flat
// per-movement minimum amplitudes below are calibrated around -- a
// meaningfully shorter or taller athlete moves proportionally less or
// more through the same exercise (a 5'6" squat's absolute depth isn't a
// 6'3" squat's), so a single flat cm threshold either lets a tall
// athlete's genuine partial rep through as "big enough motion," or risks
// reading a short athlete's full-depth rep as barely-there movement by
// comparison. This is a coarse linear nudge, not a real biomechanical
// model of how limb length actually maps to range of motion (which varies
// by exercise and by individual proportions, not just height) -- clamped
// to +/-25% so an unusually short or tall entry doesn't overcorrect into
// a threshold that's worse than the flat one it's replacing.
const REFERENCE_HEIGHT_IN = 69;
const MIN_HEIGHT_SCALE = 0.75;
const MAX_HEIGHT_SCALE = 1.25;

// Exported for jump-tracking.ts, which applies the same height nudge to
// its own flight-amplitude floor. Returns baseCm unscaled when heightIn
// isn't on file -- an athlete who hasn't filled in their profile gets
// exactly today's flat behavior, not a guess.
export function heightScaledAmplitudeCm(baseCm: number, heightIn?: number | null): number {
  if (!heightIn || heightIn <= 0) return baseCm;
  const scale = Math.min(MAX_HEIGHT_SCALE, Math.max(MIN_HEIGHT_SCALE, heightIn / REFERENCE_HEIGHT_IN));
  return baseCm * scale;
}

const BASE_MIN_REP_AMPLITUDE_CM = 20;

// Turns a raw pixel-space trace for one set into real-world metrics. Returns
// null when there isn't enough signal to say anything meaningful (marker
// lost for most of the take, or the athlete stopped before moving).
// loadKg, when given, is the external load for this set (the athlete's
// entered weight, converted to kg by the caller) -- power is mass * g *
// velocity, so it's left null throughout whenever there's no load to use
// as mass (bodyweight-only sets have no well-defined external load here).
//
// heightIn (the athlete's stored height, when on file) scales
// BASE_MIN_REP_AMPLITUDE_CM via heightScaledAmplitudeCm above -- the
// smallest vertical reversal segmentPhases will treat as a real rep
// boundary rather than noise. 5cm (the original flat default before this
// existed) was well within pose-jitter and incidental-motion range
// (settling under the bar, a grip adjustment, unracking/reracking at the
// start and end of the set), so a set tracked start-to-finish could
// segment several extra "reps" out of motion that was never a rep at all.
// Every exercise this tracks -- squat, deadlift, press, row, curl --
// moves the bar/wrist well over 15cm through a genuine rep for an
// average-height athlete, so 20cm (~8in) comfortably clears real reps of
// any of them while sitting well above ordinary rack noise; the height
// scaling shifts that floor proportionally for anyone far from average.
export function summarizeTrackedSet(
  rawPoints: TrackedPoint[],
  loadKg?: number,
  heightIn?: number | null,
): RepMetrics | null {
  if (rawPoints.length < 6) return null;
  const minRepAmplitudeCm = heightScaledAmplitudeCm(BASE_MIN_REP_AMPLITUDE_CM, heightIn);

  const ySmoothed = movingAverage(rawPoints.map((p) => p.y), SMOOTHING_WINDOW);
  const speedsMps = computeSpeeds(rawPoints, ySmoothed);

  const minAmplitudeM = minRepAmplitudeCm / 100;
  const phases = segmentPhases(ySmoothed, minAmplitudeM);
  if (phases.length === 0) return null;

  const phaseStats = phases.map((phase) => {
    const slice = speedsMps.slice(phase.startIdx, phase.endIdx + 1);
    const duration = (rawPoints[phase.endIdx].t - rawPoints[phase.startIdx].t) / 1000;
    const peak = slice.length ? Math.max(...slice) : 0;
    const mean = slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
    // Index (within the whole trace, not the slice) of the peak-speed frame
    // -- used to report how long it took to reach peak velocity, a standard
    // VBT metric ("time to peak velocity") this didn't previously compute.
    let peakIdx = phase.startIdx;
    let peakSpeed = -Infinity;
    for (let i = phase.startIdx; i <= phase.endIdx; i++) {
      if (speedsMps[i] > peakSpeed) {
        peakSpeed = speedsMps[i];
        peakIdx = i;
      }
    }
    return { peak, mean, duration, startIdx: phase.startIdx, endIdx: phase.endIdx, peakIdx };
  });

  // Heuristic: of each pair of adjacent phases, the one with the higher
  // average speed is concentric (the explosive half of a rep) and the
  // other is eccentric -- there's no way to know "up" vs "down" in image
  // space without knowing the exercise, but concentric-is-faster holds
  // for the compound lifts this feature targets.
  const isConcentric = phaseStats.map((phase, i) => {
    const neighbor = phaseStats[i + 1] ?? phaseStats[i - 1];
    return !neighbor || phase.mean >= neighbor.mean;
  });
  const concentric = phaseStats.filter((_, i) => isConcentric[i]);
  const eccentric = phaseStats.filter((_, i) => !isConcentric[i]);

  // One entry per concentric phase, in chronological order -- rep 1, 2, 3...
  // Each rep's window starts at the beginning of the phase before it (the
  // bottom of the preceding eccentric, i.e. the bottom of the rep) so depth
  // and the sticking-point curve cover the whole rep, not just its lockout.
  const repBreakdown: RepBreakdown[] = [];
  phaseStats.forEach((phase, i) => {
    if (!isConcentric[i]) return;
    const repStartIdx = i > 0 ? phaseStats[i - 1].startIdx : phase.startIdx;
    const curveStride = Math.max(1, Math.floor((phase.endIdx - phase.startIdx) / 20));
    const velocityCurve: { positionCm: number; velocityMps: number }[] = [];
    for (let idx = phase.startIdx; idx <= phase.endIdx; idx += curveStride) {
      velocityCurve.push({
        positionCm: Math.round((rawPoints[idx].y - rawPoints[phase.startIdx].y) * -1000) / 10,
        velocityMps: Math.round(speedsMps[idx] * 100) / 100,
      });
    }
    // The phase right before this one always alternates direction by
    // construction (segmentPhases flips direction at every split), so
    // whenever this rep isn't the very first phase, phaseStats[i - 1] is
    // guaranteed to be the eccentric that led into it.
    const pairedEccentric = i > 0 ? phaseStats[i - 1] : null;
    const romCm = Math.round(Math.abs(rawPoints[phase.endIdx].y - rawPoints[phase.startIdx].y) * 1000) / 10;

    const timeToPeakVelocitySeconds =
      Math.round(((rawPoints[phase.peakIdx].t - rawPoints[phase.startIdx].t) / 1000) * 100) / 100;

    repBreakdown.push({
      repNumber: repBreakdown.length + 1,
      peakVelocityMps: Math.round(phase.peak * 100) / 100,
      meanVelocityMps: Math.round(phase.mean * 100) / 100,
      concentricSeconds: Math.round(phase.duration * 100) / 100,
      timeToPeakVelocitySeconds,
      startT: rawPoints[repStartIdx].t,
      endT: rawPoints[phase.endIdx].t,
      velocityCurve,
      romCm,
      peakPowerWatts:
        loadKg && loadKg > 0 ? Math.round(loadKg * GRAVITY_MPS2 * phase.peak) : null,
      eccentricSeconds: pairedEccentric ? Math.round(pairedEccentric.duration * 100) / 100 : null,
      eccentricVelocityMps: pairedEccentric ? Math.round(pairedEccentric.mean * 100) / 100 : null,
    });
  });

  // Robust-statistics approach, not a smoothed max: a wrist briefly
  // "jumping" to a wrong position for one frame -- e.g. passing in front of
  // the chest on a bench press -- can throw a single x/z reading off by a
  // huge margin, and moving-average smoothing doesn't fix that; it just
  // spreads the bad frame's influence into its neighbors too (worse still
  // at the very start/end of the trace, where the averaging window has
  // fewer real neighbors to dilute it with). The median is unmoved by a
  // small number of such outliers (its breakdown point is ~50% of the
  // data), so it anchors "center" reliably even with a few bad frames in
  // the mix, and the 90th percentile of (raw) deviation from that median
  // reports how far a genuinely drifting bar path travels while still
  // excluding the rare single-frame misdetection. Deviation is now measured
  // in the full horizontal plane (x and z, i.e. side-to-side AND
  // forward/backward drift from a straight vertical line) now that real
  // depth is available -- 2D pixel tracking could only ever see x drift.
  const medianOf = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const medianX = medianOf(rawPoints.map((p) => p.x));
  const medianZ = medianOf(rawPoints.map((p) => p.z));
  const sortedDeviations = rawPoints
    .map((p) => Math.hypot(p.x - medianX, p.z - medianZ))
    .sort((a, b) => a - b);
  const p90Idx = Math.min(sortedDeviations.length - 1, Math.floor(sortedDeviations.length * 0.9));
  const barPathDeviationCm = sortedDeviations[p90Idx] * 100;

  const barPathTrace = buildPathTrace(rawPoints, { x: rawPoints[0].x, y: rawPoints[0].y });

  return {
    peakVelocityMps: Math.round((Math.max(...concentric.map((c) => c.peak), 0)) * 100) / 100,
    meanVelocityMps:
      Math.round(
        (concentric.reduce((a, c) => a + c.mean, 0) / (concentric.length || 1)) * 100,
      ) / 100,
    concentricSeconds:
      Math.round(
        (concentric.reduce((a, c) => a + c.duration, 0) / (concentric.length || 1)) * 100,
      ) / 100,
    eccentricSeconds:
      eccentric.length > 0
        ? Math.round((eccentric.reduce((a, c) => a + c.duration, 0) / eccentric.length) * 100) /
          100
        : 0,
    eccentricMeanVelocityMps:
      eccentric.length > 0
        ? Math.round((eccentric.reduce((a, c) => a + c.mean, 0) / eccentric.length) * 100) / 100
        : 0,
    barPathDeviationCm: Math.round(barPathDeviationCm * 10) / 10,
    barPathTrace,
    repBreakdown,
    formFaults: [],
    peakPowerWatts:
      loadKg && loadKg > 0
        ? Math.round(loadKg * GRAVITY_MPS2 * Math.max(...concentric.map((c) => c.peak), 0))
        : null,
    meanPowerWatts:
      loadKg && loadKg > 0
        ? Math.round(
            loadKg *
              GRAVITY_MPS2 *
              (concentric.reduce((a, c) => a + c.mean, 0) / (concentric.length || 1)),
          )
        : null,
    romCm:
      repBreakdown.length > 0
        ? Math.round(
            (repBreakdown.reduce((a, r) => a + r.romCm, 0) / repBreakdown.length) * 10,
          ) / 10
        : 0,
    velocityLossPercent:
      repBreakdown.length > 1 && repBreakdown[0].peakVelocityMps > 0
        ? Math.round(
            ((repBreakdown[0].peakVelocityMps -
              repBreakdown[repBreakdown.length - 1].peakVelocityMps) /
              repBreakdown[0].peakVelocityMps) *
              1000,
          ) / 10
        : null,
  };
}

