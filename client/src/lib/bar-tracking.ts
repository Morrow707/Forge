// Pure signal-processing helpers for the camera-based bar tracker --
// no DOM/camera access here, so this is easy to reason about and test in
// isolation from the getUserMedia/canvas plumbing in bar-tracker-dialog.tsx.

// x/y/z are real-world meters from MediaPipe's worldLandmarks (hip-centered
// origin), not pixels -- no pixelsPerMeter calibration needed to interpret
// them. y follows pose-tracking.ts's worldVerticalSign convention (smaller y
// = higher), applied by the caller before points ever reach this module.
// confidence (0-1) is optional -- only the primary trace's caller currently
// sets it (the same wristConfidence+barConfidence fusion weight that already
// decided this point's x/y), so movingAverage can weight the smoothing pass
// by it; a point with no confidence set (an interpolated occlusion-gap
// filler, a trace built before this field existed) is treated as neutral
// rather than untrustworthy -- see movingAverage's own comment.
export type TrackedPoint = { t: number; x: number; y: number; z: number; confidence?: number };

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

// Same idea as LegDriveAsymmetryEntry above, but for a press/pull's two
// arms instead of a squat's two legs -- see computeArmDriveAsymmetry
// further down for how this gets built from the same left/right
// implement-tracker data bar tilt and grip width already use.
export type ArmDriveAsymmetryEntry = {
  repNumber: number;
  leftVelocityMps: number;
  rightVelocityMps: number;
  asymmetryPercent: number;
  dominantSide: "left" | "right";
};

// See computeRepTrustScores further down -- one entry per rep, folding
// several separate accuracy signals into a single number/label instead of
// leaving the athlete to weigh a handful of indicator pills against each
// other themselves.
export type RepTrustScore = {
  repNumber: number;
  score: number;
  label: "high" | "medium" | "low";
  notes: string[];
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
  // Populated by the caller from this module's own computeArmDriveAsymmetry
  // -- only for a shared-bar press/pull (see bar-tracker-dialog.tsx's gate),
  // same "caller fills it in" pattern as legDriveAsymmetry above. Null when
  // the equipment doesn't apply or no rep had enough clean left/right data.
  armDriveAsymmetry?: ArmDriveAsymmetryEntry[] | null;
  // Populated by the caller from this module's own computeRepTrustScores --
  // one entry per rep in repBreakdown, folding position-fusion confidence,
  // tracker-disagreement rejections, and the whole set's movement-mismatch/
  // camera-alignment status into a single trust indicator. Null when there
  // weren't enough reps/samples to say anything (mirrors the other optional
  // caller-populated fields above).
  trustScores?: RepTrustScore[] | null;
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

// 5 samples was tuned back when every device was assumed to feed ~30fps --
// at 30fps that's ~165ms of averaging, enough to steady position jitter
// without smearing a fast rep. Left as a flat frame count, the same "5
// frames" describes half as much real-world smoothing once a device
// actually grants the 60fps bar-tracker-dialog.tsx now requests (see its
// getUserMedia constraints) -- framesForDuration below converts a fixed
// TIME target into however many frames that takes on THIS trace's own
// measured sample rate, so smoothing strength stays consistent in
// wall-clock terms regardless of what frame rate a given device actually
// negotiated.
const TARGET_SMOOTHING_MS = 165;

// Exported for jump-tracking.ts, which needs the same fps-independent
// window sizing for its own smoothing pass and landing-settle detection.
export function framesForDuration(points: { t: number }[], durationMs: number): number {
  if (points.length < 2) return 1;
  const avgIntervalMs = (points[points.length - 1].t - points[0].t) / (points.length - 1);
  if (avgIntervalMs <= 0) return 1;
  return Math.max(1, Math.round(durationMs / avgIntervalMs));
}

// Exported for jump-tracking.ts, which reuses this same smoothing +
// phase-segmentation pipeline on an ankle trace instead of a wrist/bar
// trace -- the zigzag logic below has no idea what it's tracking, so
// there's no reason to duplicate it for a second signal source.
//
// weights, when given, must be the same length as values -- one confidence
// (0-1) per sample -- and turns the plain average within each window into a
// confidence-weighted one: a frame the position fusion barely trusted (a
// misdetected wrist, a rejected tracker lock) contributes less to the
// smoothed value than a frame it trusted fully, rather than every frame in
// the window counting equally regardless of how good a reading it actually
// was. Omitting weights (every other caller -- jump-tracking.ts's ankle
// trace has no per-frame confidence to weight by) keeps the exact plain
// average this function always computed.
export function movingAverage(values: number[], window: number, weights?: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - Math.floor(window / 2));
    const end = Math.min(values.length, i + Math.ceil(window / 2));
    if (!weights) {
      const slice = values.slice(start, end);
      out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
      continue;
    }
    let weightedSum = 0;
    let weightTotal = 0;
    for (let j = start; j < end; j++) {
      weightedSum += values[j] * weights[j];
      weightTotal += weights[j];
    }
    // Every weight in the window happened to be 0 (every sample fully
    // distrusted) -- fall back to this frame's own raw value rather than
    // dividing by zero or silently reporting 0.
    out.push(weightTotal > 0 ? weightedSum / weightTotal : values[i]);
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

// Same failure mode barPathDeviationCm's own comment describes below for
// position -- a wrist/bar briefly misdetected for one frame (occlusion
// recovery, the implement tracker latching onto the wrong point) -- hits
// velocity even harder: velocity is a rate, so one bad position reading
// turns into one absurd single-frame speed spike, and a raw Math.max
// reports that spike as if it were the athlete's real peak effort. The 95th
// percentile of a phase's speed samples is unmoved by the one or two worst
// frames in an otherwise clean phase (a concentric phase is comfortably
// more than 20 frames at 30fps), while still tracking genuine peak effort
// -- true peak velocity is reached over several consecutive frames, not a
// single isolated one, so trimming just the extreme tail costs nothing on a
// clean rep. peakIdx (for "time to peak velocity") lands on the first frame
// that actually reaches this robust peak, not necessarily the single
// highest raw sample -- that sample may be exactly the outlier the trim
// excluded.
function robustPeakSpeed(
  speedsMps: number[],
  startIdx: number,
  endIdx: number,
): { peak: number; peakIdx: number } {
  const samples: { v: number; idx: number }[] = [];
  for (let i = startIdx; i <= endIdx; i++) samples.push({ v: speedsMps[i], idx: i });
  if (samples.length === 0) return { peak: 0, peakIdx: startIdx };
  const sorted = [...samples].sort((a, b) => a.v - b.v);
  const peak = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))].v;
  const peakIdx = samples.find((s) => s.v >= peak)?.idx ?? startIdx;
  return { peak, peakIdx };
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
// The exercise's known starting posture, when the caller can say so safely
// (see bar-tracker-dialog.tsx's inferFirstPhaseHint) -- "concentric" means
// the very first phase of the trace is known to be the lift itself (a
// conventional deadlift dead-stops on the floor each rep, a row's handle
// starts at arm's length), "eccentric" means it's known to be a controlled
// descent first (a squat/lunge starts standing or racked). Deliberately
// only ever used as a TIE-BREAKER (see FIRST_PHASE_AMBIGUITY_THRESHOLD
// below), never a hard override of what the trace's own speed actually
// shows -- the caller's knowledge of the exercise is a helpful prior on an
// otherwise-close call, not a substitute for what was actually measured.
export type FirstPhaseHint = "concentric" | "eccentric" | null;

export function summarizeTrackedSet(
  rawPoints: TrackedPoint[],
  loadKg?: number,
  heightIn?: number | null,
  firstPhaseHint?: FirstPhaseHint,
): RepMetrics | null {
  if (rawPoints.length < 6) return null;
  const minRepAmplitudeCm = heightScaledAmplitudeCm(BASE_MIN_REP_AMPLITUDE_CM, heightIn);

  const ySmoothed = movingAverage(
    rawPoints.map((p) => p.y),
    framesForDuration(rawPoints, TARGET_SMOOTHING_MS),
    rawPoints.map((p) => p.confidence ?? 1),
  );
  const speedsMps = computeSpeeds(rawPoints, ySmoothed);

  const minAmplitudeM = minRepAmplitudeCm / 100;
  const phases = segmentPhases(ySmoothed, minAmplitudeM);
  if (phases.length === 0) return null;

  const phaseStats = phases.map((phase) => {
    const slice = speedsMps.slice(phase.startIdx, phase.endIdx + 1);
    const duration = (rawPoints[phase.endIdx].t - rawPoints[phase.startIdx].t) / 1000;
    const mean = slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
    // peak/peakIdx (index within the whole trace, used to report how long
    // it took to reach peak velocity, a standard VBT metric) come from
    // robustPeakSpeed rather than a raw max -- see its own comment above.
    const { peak, peakIdx } = robustPeakSpeed(speedsMps, phase.startIdx, phase.endIdx);
    return { peak, mean, duration, startIdx: phase.startIdx, endIdx: phase.endIdx, peakIdx };
  });

  // Heuristic: of each pair of adjacent phases, the one with the higher
  // average speed is concentric (the explosive half of a rep) and the
  // other is eccentric -- there's no way to know "up" vs "down" in image
  // space without knowing the exercise, but concentric-is-faster holds
  // for the compound lifts this feature targets. This is reliable enough on
  // every phase that has two clearly-different-speed neighbors to compare;
  // the one place it can genuinely misfire is the very first phase of the
  // whole trace, which sometimes isn't a real rep at all yet (settling into
  // position, a first partial movement) and can end up close in speed to
  // the phase right after it -- exactly where firstPhaseHint, when the
  // caller could safely infer one, gets a say.
  const FIRST_PHASE_AMBIGUITY_THRESHOLD = 0.15;
  const isConcentric = phaseStats.map((phase, i) => {
    const neighbor = phaseStats[i + 1] ?? phaseStats[i - 1];
    if (i === 0 && firstPhaseHint) {
      if (!neighbor) return firstPhaseHint === "concentric";
      const maxMean = Math.max(phase.mean, neighbor.mean);
      const tooCloseToCall = maxMean > 0 && Math.abs(phase.mean - neighbor.mean) / maxMean < FIRST_PHASE_AMBIGUITY_THRESHOLD;
      if (tooCloseToCall) return firstPhaseHint === "concentric";
    }
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

// One reading of a second, independently-tracked position source --
// bar-tracker-dialog.tsx averages its left and right implement trackers'
// fused grip points into this every frame (see leftImplementTrackerRef's
// own comment for why those are independent of the primary trace this
// whole file otherwise works with). confidence carries that frame's own
// wrist+bar-track blend weight, same scale as everywhere else this
// session's fusion work uses it (0 = no signal at all, 1 = fully trusted).
export type VelocitySample = { t: number; y: number; confidence: number };

// computeArmDriveAsymmetry's own return shape, further down -- repNumber-
// free the same way pose-tracking.ts's LegDriveAsymmetry is (the caller
// zips repNumber back in when building ArmDriveAsymmetryEntry above, same
// pattern bar-tracker-dialog.tsx already uses for legs).
export type ArmDriveAsymmetry = {
  leftVelocityMps: number;
  rightVelocityMps: number;
  asymmetryPercent: number;
  dominantSide: "left" | "right";
};

// Confidence-weighted fusion of the primary trace's per-rep velocity
// (source A -- summarizeTrackedSet's own output, computed above) against
// this second source (source B). Not an override, a blend: source A keeps
// a fixed baseline weight of 1 -- it's the more mature pipeline, with its
// own internal wrist+bar fusion already built in -- while source B is
// computed the same way (moving-average smoothed, 95th-percentile peak)
// over the EXACT SAME rep window source A already identified, weighted by
// how confident that source actually was during that specific window. A
// rep where the side samples barely showed up, or the wrists were barely
// visible, ends up close to 100% source A; a rep with strong left/right
// tracking throughout pulls the reported number meaningfully toward
// source B's own read -- literally "bar speed isn't an average, it's a
// knowledgeable guess between multiple factors."
//
// Mutates nothing; returns a new RepMetrics with updated repBreakdown
// entries and every whole-set number that's derived FROM repBreakdown
// (peak/mean velocity, peak/mean power, velocity loss) recomputed from the
// fused values the same way summarizeTrackedSet itself derives them --
// romCm, eccentric numbers, bar-path deviation, and everything else that
// doesn't come from concentric peak/mean velocity are left untouched.
// Peak/mean speed (and average confidence) for one VelocitySample[] source
// over one rep window, using the same moving-average+robust-percentile
// pipeline the primary trace itself uses (see summarizeTrackedSet above) --
// shared by fuseSideVelocity and computeArmDriveAsymmetry below rather than
// each reimplementing "read a rate off part of a trace." Returns null when
// there aren't enough samples in the window to trust a rate off of, same
// floor computeLegDriveAsymmetry applies to its own per-rep window.
function velocityForWindow(
  speeds: number[],
  points: TrackedPoint[],
  confidences: number[],
  startT: number,
  endT: number,
): { peak: number; mean: number; confidence: number } | null {
  const startIdx = points.findIndex((p) => p.t >= startT);
  let endIdx = -1;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].t <= endT) {
      endIdx = i;
      break;
    }
  }
  if (startIdx === -1 || endIdx === -1 || endIdx - startIdx < 3) return null;
  const { peak } = robustPeakSpeed(speeds, startIdx, endIdx);
  const windowSpeeds = speeds.slice(startIdx, endIdx + 1);
  const mean = windowSpeeds.reduce((a, b) => a + b, 0) / windowSpeeds.length;
  const confidence = confidences.slice(startIdx, endIdx + 1).reduce((a, c) => a + c, 0) / windowSpeeds.length;
  return { peak, mean, confidence };
}

export function fuseSideVelocity(
  metrics: RepMetrics,
  sideSamples: VelocitySample[],
  loadKg?: number,
): RepMetrics {
  if (sideSamples.length < 6 || metrics.repBreakdown.length === 0) return metrics;

  const sidePoints: TrackedPoint[] = sideSamples.map((s) => ({ t: s.t, x: 0, y: s.y, z: 0 }));
  const sideConfidences = sideSamples.map((s) => s.confidence);
  // Confidence-weighted the same way summarizeTrackedSet's own ySmoothed is
  // -- this source's smoothing shouldn't lean on a frame it barely trusted
  // any more than the primary trace's does.
  const sideSmoothed = movingAverage(
    sidePoints.map((p) => p.y),
    framesForDuration(sidePoints, TARGET_SMOOTHING_MS),
    sideConfidences,
  );
  const sideSpeeds = computeSpeeds(sidePoints, sideSmoothed);

  const fusedRepBreakdown = metrics.repBreakdown.map((rep) => {
    const window = velocityForWindow(sideSpeeds, sidePoints, sideConfidences, rep.startT, rep.endT);
    // No side data for this rep (too little of it, or none at all) --
    // keep source A's numbers untouched rather than blending in something
    // built from almost nothing.
    if (!window || window.confidence <= 0) return rep;

    const totalWeight = 1 + window.confidence;
    const peakVelocityMps =
      Math.round(((rep.peakVelocityMps + window.confidence * window.peak) / totalWeight) * 100) / 100;
    const meanVelocityMps =
      Math.round(((rep.meanVelocityMps + window.confidence * window.mean) / totalWeight) * 100) / 100;
    return {
      ...rep,
      peakVelocityMps,
      meanVelocityMps,
      peakPowerWatts: loadKg && loadKg > 0 ? Math.round(loadKg * GRAVITY_MPS2 * peakVelocityMps) : null,
    };
  });

  const concentricPeaks = fusedRepBreakdown.map((r) => r.peakVelocityMps);
  const concentricMeans = fusedRepBreakdown.map((r) => r.meanVelocityMps);
  const peakVelocityMps = Math.round(Math.max(...concentricPeaks, 0) * 100) / 100;
  const meanVelocityMps =
    Math.round((concentricMeans.reduce((a, b) => a + b, 0) / concentricMeans.length) * 100) / 100;

  return {
    ...metrics,
    repBreakdown: fusedRepBreakdown,
    peakVelocityMps,
    meanVelocityMps,
    peakPowerWatts: loadKg && loadKg > 0 ? Math.round(loadKg * GRAVITY_MPS2 * peakVelocityMps) : null,
    meanPowerWatts: loadKg && loadKg > 0 ? Math.round(loadKg * GRAVITY_MPS2 * meanVelocityMps) : null,
    velocityLossPercent:
      fusedRepBreakdown.length > 1 && fusedRepBreakdown[0].peakVelocityMps > 0
        ? Math.round(
            ((fusedRepBreakdown[0].peakVelocityMps -
              fusedRepBreakdown[fusedRepBreakdown.length - 1].peakVelocityMps) /
              fusedRepBreakdown[0].peakVelocityMps) *
              1000,
          ) / 10
        : null,
  };
}

// How much harder one arm drove than the other during each rep's concentric
// (pressing/pulling) phase -- the same idea as pose-tracking.ts's
// computeLegDriveAsymmetry, but built from the left/right implement
// trackers' own fused traces instead of a joint angle, since a press/pull
// doesn't have a knee to measure drive rate from the way a squat does.
// Reuses velocityForWindow (see its own comment) over the exact same rep
// windows the primary trace already identified, same "borrow the caller's
// segmentation, don't re-derive it" pattern fuseSideVelocity uses.
// Returns null for a rep without enough clean, confident data on BOTH
// sides to trust a comparison -- same "no number beats a fake-confident
// one" stance computeLegDriveAsymmetry already takes.
export function computeArmDriveAsymmetry(
  leftSamples: VelocitySample[],
  rightSamples: VelocitySample[],
  repWindows: { startT: number; endT: number }[],
): (ArmDriveAsymmetry | null)[] {
  if (leftSamples.length < 6 || rightSamples.length < 6) return repWindows.map(() => null);

  const leftPoints: TrackedPoint[] = leftSamples.map((s) => ({ t: s.t, x: 0, y: s.y, z: 0 }));
  const rightPoints: TrackedPoint[] = rightSamples.map((s) => ({ t: s.t, x: 0, y: s.y, z: 0 }));
  const leftConfidences = leftSamples.map((s) => s.confidence);
  const rightConfidences = rightSamples.map((s) => s.confidence);
  // Same confidence-weighted smoothing as fuseSideVelocity's sideSmoothed --
  // see its own comment.
  const leftSmoothed = movingAverage(
    leftPoints.map((p) => p.y),
    framesForDuration(leftPoints, TARGET_SMOOTHING_MS),
    leftConfidences,
  );
  const rightSmoothed = movingAverage(
    rightPoints.map((p) => p.y),
    framesForDuration(rightPoints, TARGET_SMOOTHING_MS),
    rightConfidences,
  );
  const leftSpeeds = computeSpeeds(leftPoints, leftSmoothed);
  const rightSpeeds = computeSpeeds(rightPoints, rightSmoothed);

  // Below this, a side's own data for the window is too sparse or too
  // unconfident to trust as "this arm's real speed" rather than mostly the
  // wrist landmark alone -- same spirit as MIN_DRIVE_DURATION_SEC's own
  // floor in computeLegDriveAsymmetry, just expressed as confidence
  // instead of duration since that's what this source actually carries.
  const MIN_WINDOW_CONFIDENCE = 0.3;

  return repWindows.map(({ startT, endT }) => {
    const left = velocityForWindow(leftSpeeds, leftPoints, leftConfidences, startT, endT);
    const right = velocityForWindow(rightSpeeds, rightPoints, rightConfidences, startT, endT);
    if (!left || !right || left.confidence < MIN_WINDOW_CONFIDENCE || right.confidence < MIN_WINDOW_CONFIDENCE) {
      return null;
    }

    const leftVelocityMps = Math.round(left.peak * 100) / 100;
    const rightVelocityMps = Math.round(right.peak * 100) / 100;
    const maxVelocity = Math.max(leftVelocityMps, rightVelocityMps);
    if (maxVelocity <= 0) return null;

    return {
      leftVelocityMps,
      rightVelocityMps,
      asymmetryPercent: Math.round((Math.abs(leftVelocityMps - rightVelocityMps) / maxVelocity) * 1000) / 10,
      dominantSide: leftVelocityMps >= rightVelocityMps ? "left" : "right",
    };
  });
}

// Folds every accuracy signal this module and its caller already track into
// ONE number/label per rep, instead of leaving the athlete to weigh several
// separate indicators (implement-detected pill, tilt warning, mismatch
// warning, camera-alignment hint) against each other themselves. Not a new
// measurement -- purely a summary of ones that already exist:
//   - confidenceSamples: how much the position fusion actually trusted its
//     own sources frame to frame (the same wristConfidence+barConfidence mix
//     that decides the primary trace's position every tick).
//   - rejectionEvents: timestamps where a tracker's own reported position
//     disagreed with the wrist badly enough to be thrown out entirely (see
//     MAX_PLAUSIBLE_IMPLEMENT_OFFSET_M/MAX_PLAUSIBLE_GRIP_OFFSET_M in the
//     caller) -- however briefly, a rejection inside a rep's window is a
//     moment that rep's numbers leaned on a single, unfused source.
//   - patternMismatch/alignmentReason: whole-SET properties (the exercise's
//     motion didn't look like what was selected; the camera wasn't square to
//     the lift) that apply equally to every rep, since neither one changes
//     rep to rep.
export function computeRepTrustScores(
  repBreakdown: { repNumber: number; startT: number; endT: number }[],
  confidenceSamples: { t: number; confidence: number }[],
  rejectionEvents: number[],
  patternMismatch: boolean,
  alignmentReason: "ok" | "angled" | "axial" | "unknown" | null,
): RepTrustScore[] {
  return repBreakdown.map((rep) => {
    const windowSamples = confidenceSamples.filter((s) => s.t >= rep.startT && s.t <= rep.endT);
    // No confidence samples for this rep (shouldn't normally happen -- every
    // tracked frame pushes one) reads as neutral, not failing: there's
    // nothing here to be confident OR unconfident about, unlike a low
    // reading that IS present.
    const avgConfidence =
      windowSamples.length > 0 ? windowSamples.reduce((a, s) => a + s.confidence, 0) / windowSamples.length : 0.6;

    const rejectionCount = rejectionEvents.filter((t) => t >= rep.startT && t <= rep.endT).length;

    const notes: string[] = [];
    let score = avgConfidence * 100;

    if (rejectionCount > 0) {
      score -= Math.min(30, rejectionCount * 8);
      notes.push(
        rejectionCount === 1
          ? "Tracking briefly lost and recovered once during this rep"
          : `Tracking briefly lost and recovered ${rejectionCount} times during this rep`,
      );
    }

    if (patternMismatch) {
      score -= 20;
      notes.push("This set's motion didn't clearly match the selected exercise");
    }

    if (alignmentReason === "angled") {
      score -= 15;
      notes.push("Camera was angled rather than square to the lift");
    } else if (alignmentReason === "unknown") {
      score -= 10;
      notes.push("Camera framing couldn't be confirmed");
    }
    // "axial" (front/foot-on framing) is a legitimate choice -- see
    // evaluateAutoStartReadiness's own comment in bar-tracker-dialog.tsx --
    // so it earns no penalty here; it degrades bar-path drift specifically,
    // not the position/velocity confidence this score is built from.

    score = Math.max(5, Math.min(100, Math.round(score)));
    const label: RepTrustScore["label"] = score >= 80 ? "high" : score >= 55 ? "medium" : "low";
    return { repNumber: rep.repNumber, score, label, notes };
  });
}

