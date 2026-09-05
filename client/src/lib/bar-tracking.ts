// Pure signal-processing helpers for the camera-based bar tracker --
// no DOM/camera access here, so this is easy to reason about and test in
// isolation from the getUserMedia/canvas plumbing in bar-tracker-dialog.tsx.

// Type-only -- erased at compile time, so this doesn't actually pull native-av-preview.ts's
// real Capacitor bridge code (or its runtime dependency on a native platform) into this module.
import type { CaptureDeviceInfo } from "./native-av-preview";
import type { TrackingDiagnostics } from "./tracking-diagnostics";

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

// Inverse of toKg -- for summing weights entered in different units (e.g. a
// superset with one exercise logged in lbs and another in kg) into a single
// display unit: normalize each to kg with toKg, sum, then convert the total
// back with this.
export function fromKg(weightKg: number, unit: "lbs" | "kg"): number {
  return unit === "kg" ? weightKg : weightKg * LBS_PER_KG;
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
  // OVR (the matched commercial VBT device referenced throughout this file's own calibration
  // work) shows a per-rep "EAI" column alongside Peak/TPV with no formula documented anywhere
  // public -- reverse-engineered here by cross-checking OVR's own displayed EAI against its own
  // displayed Peak/TPV across two real sets (20 reps total): peakVelocityMps / timeToPeak-
  // VelocitySeconds reproduces every one of OVR's own EAI values to within its own 2-decimal
  // display rounding, consistently (never a random miss on some reps and a match on others),
  // which is what confirms the formula rather than a coincidence. Functionally an average
  // acceleration to peak -- how fast the bar got up to its fastest point, not just how fast it
  // ultimately got there. Named to match OVR's own label since that's what a coach comparing
  // the two devices side by side is looking for; the literal acronym expansion isn't publicly
  // documented anywhere this could be sourced from, so it isn't guessed at here.
  eai: number;
  startT: number;
  endT: number;
  depthDeg?: number | null;
  velocityCurve?: { positionCm: number; velocityMps: number }[];
  // Vertical range of motion for this rep's concentric phase, in cm.
  romCm: number;
  // Peak and mean concentric power for this rep -- null whenever the
  // caller didn't supply a load (summarizeTrackedSet's loadKg), same as
  // the whole-set power fields below being null in that case.
  peakPowerWatts: number | null;
  meanPowerWatts: number | null;
  // The eccentric (lowering) phase immediately before this rep's lift --
  // null for rep 1 when the set starts from a dead stop, since there's
  // nothing to lower first.
  eccentricSeconds: number | null;
  eccentricVelocityMps: number | null;
};

export type PathTracePoint = { t: number; x: number; y: number };

export type RepMetrics = {
  // Nullable because a lift can have a rep whose peak velocity is genuinely not measurable
  // rather than zero. On an Olympic lift the bar deliberately does not travel a straight line,
  // so both this and barPathDeviationCm are read off an assumption that does not hold -- see
  // barPathAssumptionInvalid. Zero would be a different lie: charts plot it, coaches read it.
  peakVelocityMps: number | null;
  // True when this lift's bar deliberately does not travel a straight vertical line, so the two
  // numbers derived from that assumption -- barPathDeviationCm and peakVelocityMps -- are
  // withheld at the set level and the per-rep equivalents must not be charted either. The
  // per-rep fields stay non-null so every internal computation and every existing consumer keeps
  // its types; this flag is how a renderer knows not to trust them. See barPathAssumptionInvalid
  // in exercise-camera-profile.ts for why a straight-line assumption inverts on these lifts.
  barPathAssumptionInvalid?: boolean;
  meanVelocityMps: number | null;
  concentricSeconds: number;
  eccentricSeconds: number;
  barPathDeviationCm: number | null;
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
  // Average of repBreakdown's own eai across the set -- same "whole-set number is the average
  // of the per-rep ones" pattern as romCm above, matching the average row OVR's own per-set
  // table shows under this same column.
  meanEai: number;
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
  // Average per-rep vertical range of motion, in cm. Null when no real-world scale could be
  // established, which is a different thing from zero -- see peakVelocityMps above.
  romCm: number | null;
  // How much mean concentric velocity dropped from the first rep to the
  // last, as a percentage -- the standard within-set fatigue signal in
  // velocity-based training. Mean, not peak: peak is one noisy single-frame
  // sample, so a tracking spike on any one rep would corrupt a peak-based
  // loss figure; mean is far more stable rep to rep. Null for single-rep
  // sets (nothing to compare).
  velocityLossPercent: number | null;
  // Session-level camera/AI context (device, lens, format, AF/AE stability) for this
  // recording -- populated by the caller from use-av-body-tracking.ts's
  // stopRecordingAndAnalyze, same "caller fills it in" pattern as trustScores above.
  captureDeviceInfo?: CaptureDeviceInfo | null;
  // Pipeline-stage diagnostics (calibration, body-pose/object-detection frame stats) --
  // populated by the caller from tracking-diagnostics.ts's buildTrackingDiagnostics, same
  // "caller fills it in" pattern as captureDeviceInfo above.
  trackingDiagnostics?: TrackingDiagnostics | null;
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

// How much to discount an interpolated point's confidence relative to a
// straight blend of its two real neighbors' own confidence. These points
// are a straight-line GUESS bridging a real dropout, not a measurement --
// even when both real neighbors were highly confident, the guess itself
// shouldn't come back reporting as trustworthy as an actual reading would.
// Before this existed, these points left `confidence` unset, and every
// downstream consumer fell back to its OWN default for that -- `?? 1` in
// summarizeTrackedSet's outlier filters, Kalman-smoothing weights, and
// phantom-phase detection, but `?? 0.6` in computeRepTrustScores. Neither
// default reflected anything real about the gap being bridged, and the `?? 1`
// case meant a fabricated stretch of a rep could outrank most of the set's
// actual measurements (a real fused point's confidence tops out at 1 only
// when both the wrist and the implement read perfectly, see fuseSide) --
// exactly backwards for data nobody actually measured. Setting a real,
// blended-and-discounted value here instead means every consumer reads the
// same honest number.
const OCCLUSION_CONFIDENCE_DISCOUNT = 0.7;

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
  // Missing confidence on a real neighbor shouldn't happen in practice
  // (every fused trace point carries one, see fuseSide) but falls back to 0
  // rather than 1 here -- an unmeasured neighbor is exactly the case where
  // trusting the gap between them is least justified.
  const prevConfidence = prev.confidence ?? 0;
  const currConfidence = curr.confidence ?? 0;
  const points: TrackedPoint[] = [];
  for (let i = 1; i < steps; i++) {
    const frac = i / steps;
    points.push({
      t: prev.t + gap * frac,
      x: prev.x + (curr.x - prev.x) * frac,
      y: prev.y + (curr.y - prev.y) * frac,
      z: prev.z + (curr.z - prev.z) * frac,
      confidence: (prevConfidence + (currConfidence - prevConfidence) * frac) * OCCLUSION_CONFIDENCE_DISCOUNT,
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

// Kalman-filtered alternative to movingAverage for the primary saved-trace
// position signal. A moving average has no model of the bar's own motion --
// every sample in its window is just averaged together, blind to how much
// time actually separates them (a real problem across an occlusion gap,
// where framesForDuration's fixed frame-count window spans a much longer,
// unevenly-spaced stretch of wall-clock time than it does through a clean
// run of frames). A constant-velocity Kalman filter instead predicts
// forward from the bar's last known position+velocity using each frame's
// actual dt, then blends that prediction against the new measurement --
// weighted by how much this exact frame is trusted (same confidence input
// movingAverage's weights arg takes), rather than every frame in a window
// counting equally regardless of how good a reading it actually was.
// Forward-pass only (not a two-pass RTS smoother) -- still applied as a
// full post-hoc pass over the whole captured trace, same as
// movingAverage, just processed in time order.
export function kalmanSmooth(values: number[], times: number[], weights?: number[]): number[] {
  if (values.length === 0) return [];
  const out: number[] = new Array(values.length);
  let pos = values[0];
  let vel = 0;
  // Covariance for state [pos, vel] -- starts wide (the first sample is a
  // guess with no velocity information yet) and converges within a few
  // frames once real measurements start arriving.
  let pPos = 1;
  let pPosVel = 0;
  let pVel = 1;
  out[0] = pos;

  // How much the bar's velocity is allowed to drift per second ((m/s)^2 per
  // second) -- loose enough that a rep's real direction change (the top/
  // bottom of a rep) isn't lagged out by the model insisting on constant
  // velocity, tight enough that frame-to-frame position jitter still gets
  // smoothed away. Same qualitative trade-off TARGET_SMOOTHING_MS's window
  // duration makes for movingAverage, just expressed as an acceleration
  // variance instead of a window size.
  const processNoise = 4;
  // Position measurement noise (m^2) at full confidence -- roughly a 2cm
  // standard deviation, in line with typical pose-landmark position noise
  // in world-space meters. Scaled up (never down) as confidence drops, so a
  // barely-trusted frame pulls the filtered position only a little rather
  // than snapping to a misdetection the way an unweighted measurement
  // update would.
  const baseMeasurementNoise = 0.0004;

  for (let i = 1; i < values.length; i++) {
    const dt = Math.max((times[i] - times[i - 1]) / 1000, 1e-3);

    // Predict: F = [[1, dt], [0, 1]], process noise from a discretized
    // white-noise-acceleration model.
    pos += vel * dt;
    const q = processNoise;
    const predPPos = pPos + 2 * dt * pPosVel + dt * dt * pVel + (q * dt ** 3) / 3;
    const predPPosVel = pPosVel + dt * pVel + (q * dt * dt) / 2;
    const predPVel = pVel + q * dt;

    // Update: measurement is position only (H = [1, 0]).
    const confidence = weights ? Math.max(weights[i], 0.001) : 1;
    const measurementNoise = baseMeasurementNoise / confidence;
    const innovation = values[i] - pos;
    const s = predPPos + measurementNoise;
    const k0 = predPPos / s;
    const k1 = predPPosVel / s;
    pos += k0 * innovation;
    vel += k1 * innovation;
    pPos = (1 - k0) * predPPos;
    pPosVel = (1 - k0) * predPPosVel;
    pVel = predPVel - k1 * predPPosVel;

    out[i] = pos;
  }
  return out;
}

// A window's least-squares quadratic fit, evaluated at offset 0 (the
// window's center) -- computed fresh from the actual points every call
// (via the 3x3 normal-equations system, solved by Cramer's rule) rather
// than a hardcoded coefficient table, so it's correct by construction and
// naturally handles a truncated/asymmetric window (savitzkyGolay's own
// boundary handling below) with no special case. Falls back to a plain
// mean when there aren't enough points to fit a quadratic (never happens
// at window >= 3, only possible right at the very ends of a short trace).
function quadraticFitAtZero(offsets: number[], values: number[]): number {
  const n = offsets.length;
  let s0 = n,
    s1 = 0,
    s2 = 0,
    s3 = 0,
    s4 = 0;
  let t0 = 0,
    t1 = 0,
    t2 = 0;
  for (let k = 0; k < n; k++) {
    const x = offsets[k];
    const y = values[k];
    const x2 = x * x;
    s1 += x;
    s2 += x2;
    s3 += x2 * x;
    s4 += x2 * x2;
    t0 += y;
    t1 += x * y;
    t2 += x2 * y;
  }
  const det3 = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const M = [
    [s0, s1, s2],
    [s1, s2, s3],
    [s2, s3, s4],
  ];
  const D = det3(M);
  if (Math.abs(D) < 1e-9) return t0 / n;
  // Cramer's rule: the intercept `a` of y = a + b*x + c*x^2 is what we
  // want, since the fit's value at x=0 is just `a`.
  const Ma = [
    [t0, s1, s2],
    [t1, s2, s3],
    [t2, s3, s4],
  ];
  return det3(Ma) / D;
}

// Savitzky-Golay smoothing: at every point, fits a quadratic to the local
// window and takes the fit's value at the center, instead of movingAverage's
// flat mean. The two differ in exactly the case that matters for peak
// velocity: a flat mean can't represent curvature, so it systematically
// blunts a real peak (verified: smoothing a pure quadratic test signal with
// movingAverage introduces a real, nonzero bias; savitzkyGolay reproduces it
// exactly, since fitting a quadratic to quadratic data has zero residual by
// construction). Not a movingAverage replacement everywhere -- jump-tracking.ts
// still uses movingAverage for its own signal, unchanged -- this is specifically
// for summarizeTrackedSet's velocity curve, where peak-velocity fidelity is
// the point.
export function savitzkyGolay(values: number[], window: number): number[] {
  const out: number[] = [];
  const half = Math.floor(window / 2);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length, i + half + 1);
    if (end - start < 3) {
      const slice = values.slice(start, end);
      out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
      continue;
    }
    const offsets: number[] = [];
    const slice: number[] = [];
    for (let k = start; k < end; k++) {
      offsets.push(k - i);
      slice.push(values[k]);
    }
    out.push(quadraticFitAtZero(offsets, slice));
  }
  return out;
}

// A barbell (or any tracked point) can't actually accelerate arbitrarily
// fast between two frames -- a tracking glitch (a wrist briefly "jumping" to
// a wrong position, e.g. passing in front of the chest on a bench press, per
// the comment on barPathDeviationCm below) produces an instantaneous position
// jump that implies an acceleration far beyond anything a real lift produces.
// This repairs that raw point (linear interpolation between its neighbors --
// same spirit as interpolateOcclusionGap above, just for an implausible jump
// instead of a time gap) before it ever reaches smoothing or a computed
// metric, rather than leaving a glitch for downstream code to somehow
// discount. MAX_PLAUSIBLE_ACCEL_G is deliberately generous (well above even
// an aggressive Olympic-lift pull's turnaround) so this only ever catches a
// genuine glitch, never a real explosive rep -- untuned against real footage
// (this sandbox has no camera to test against).
const MAX_PLAUSIBLE_ACCEL_G = 6;

export function rejectImplausibleAccelerationSpikes(points: TrackedPoint[]): TrackedPoint[] {
  if (points.length < 3) return points;
  const maxAccelMps2 = MAX_PLAUSIBLE_ACCEL_G * GRAVITY_MPS2;

  // Pass 1: flag every interior point whose local (3-point) acceleration
  // implies something physically impossible. A single one-frame glitch
  // shows up at THREE consecutive indices here, not just the glitched one
  // -- the jump into it (centered on the point before) and the jump back
  // out (centered on the point after) both look "impossible" too. Pass 2
  // below accounts for that instead of repairing each flagged point
  // in place, which would reach into a still-corrupt neighbor.
  const flagged = new Array(points.length).fill(false);
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const dt1 = (curr.t - prev.t) / 1000;
    const dt2 = (next.t - curr.t) / 1000;
    if (dt1 <= 0 || dt2 <= 0) continue;
    const v1 = (curr.y - prev.y) / dt1;
    const v2 = (next.y - curr.y) / dt2;
    const accel = Math.abs(v2 - v1) / ((dt1 + dt2) / 2);
    if (accel > maxAccelMps2) flagged[i] = true;
  }

  // Pass 2: repair each contiguous run of flagged points by linearly
  // interpolating between the nearest CONFIRMED-CLEAN point before and
  // after the run -- never from another flagged point, which is what made
  // a single-pass, repair-as-you-go version corrupt the glitch's own
  // clean neighbors too (their "impossible acceleration" was only ever an
  // artifact of being next to the real glitch, not a problem of their own).
  // The detection loop above only checks indices 1..length-2, so index 0
  // and the last index are never flagged -- every run is guaranteed a
  // clean point on both sides.
  const cleaned = points.map((p) => ({ ...p }));
  let i = 0;
  while (i < points.length) {
    if (!flagged[i]) {
      i++;
      continue;
    }
    let runEnd = i;
    while (runEnd < points.length && flagged[runEnd]) runEnd++;
    const before = points[i - 1];
    const after = points[runEnd];
    const span = after.t - before.t;
    for (let k = i; k < runEnd; k++) {
      const frac = span > 0 ? (points[k].t - before.t) / span : 0;
      cleaned[k] = {
        ...points[k],
        x: before.x + (after.x - before.x) * frac,
        y: before.y + (after.y - before.y) * frac,
        z: before.z + (after.z - before.z) * frac,
      };
    }
    i = runEnd;
  }
  return cleaned;
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
//
// No loaded barbell squat/deadlift/press/row/curl in this feature's target
// population reaches anywhere near this in real concentric bar speed --
// published VBT data tops out around 1.5-2.2 m/s even for deliberately fast
// empty-bar/speed work. A reading above this is categorically a tracking
// artifact (a smoothing-window edge effect at the very start of a trace, a
// misdetected wrist for one frame), not a real rep -- excluded from both the
// peak and mean calculations below the same way an implausible single-frame
// POSITION jump is already rejected in bar-tracker-dialog.tsx, rather than
// being averaged in or reported as the set's peak effort.
export const MAX_PLAUSIBLE_LIFT_VELOCITY_MPS = 3;

// Below this, a frame's implement-tracker lock was too fresh/shaky to trust
// its position (and therefore the speed computed from it) at all -- same
// threshold computeArmDriveAsymmetry uses (as its own local constant,
// before this was hoisted) for the identical judgment call on a
// side-camera source, so robustPeakSpeed/plausibleMean's within-trace
// filtering and that cross-source gate agree on what "too unconfident to
// use" means. This is
// the "cold" half of the hot/cold problem the physical-ceiling filter next
// to it can't catch: MAX_PLAUSIBLE_LIFT_VELOCITY_MPS only rejects a frame
// reading IMPOSSIBLY FAST (a spike); a brief lock-loss-and-recover instead
// typically reads as an implausibly SLOW or FROZEN stretch, well under that
// ceiling, that the old filter let straight through into the mean/peak.
// 0.5, not the originally-hoisted 0.3 -- matches pose-tracking.ts's own
// MIN_VISIBILITY, the same "trust this frame's position" bar already
// established there for the identical landmark-confidence judgment call.
// 0.3 let too much marginal-confidence tracking (the implement barely
// re-acquired, not genuinely locked) still count as "confident enough,"
// which is exactly what let a low-quality stretch of frames dominate a
// rep's reported bar-path drift or velocity instead of being excluded.
export const MIN_TRACKING_CONFIDENCE = 0.5;

function robustPeakSpeed(
  speedsMps: number[],
  startIdx: number,
  endIdx: number,
  confidences?: number[],
): { peak: number; peakIdx: number } {
  const samples: { v: number; idx: number }[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    if (confidences && confidences[i] < MIN_TRACKING_CONFIDENCE) continue;
    samples.push({ v: speedsMps[i], idx: i });
  }
  // Confidence filtering emptied the window (a genuinely bad stretch, not
  // just a couple of low frames) -- fall back to every raw sample rather
  // than reporting zero, same "never silently zero out a whole rep" stance
  // as the ceiling filter below.
  const pool0 =
    samples.length > 0
      ? samples
      : (() => {
          const raw: { v: number; idx: number }[] = [];
          for (let i = startIdx; i <= endIdx; i++) raw.push({ v: speedsMps[i], idx: i });
          return raw;
        })();
  if (pool0.length === 0) return { peak: 0, peakIdx: startIdx };
  // Filtered out BEFORE the percentile trim runs -- the 95th-percentile trim
  // alone assumes only a handful of frames are bad, which doesn't hold when a
  // contiguous smoothing-window edge effect corrupts several consecutive
  // frames near the start of a trace (worst exactly where robustPeakSpeed's
  // own moving-average edge-effect note above applies hardest).
  const plausible = pool0.filter((s) => s.v <= MAX_PLAUSIBLE_LIFT_VELOCITY_MPS);
  // Every remaining sample is above the physical ceiling -- the whole phase
  // was corrupted (a real rep never does this). The old behavior fell back
  // to the raw, over-ceiling pool here, which defeated the ceiling entirely
  // and reported the tracking glitch itself as the athlete's peak (e.g. a
  // reported "24 m/s" bar speed). Clamping to the ceiling keeps this
  // function's "never just report zero" stance -- still a non-zero,
  // physically-real number -- without ever surfacing an impossible one.
  if (plausible.length === 0) return { peak: MAX_PLAUSIBLE_LIFT_VELOCITY_MPS, peakIdx: pool0[0].idx };
  const sorted = [...plausible].sort((a, b) => a.v - b.v);
  const peak = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))].v;
  const peakIdx = plausible.find((s) => s.v >= peak)?.idx ?? startIdx;
  return { peak, peakIdx };
}

// Same outlier-exclusion reasoning as robustPeakSpeed's own comment -- a
// single physically-impossible OR untrustworthy-confidence frame shouldn't
// get to drag a phase's MEAN speed off just because it wasn't extreme
// enough to be the reported peak. Shared by summarizeTrackedSet's
// phaseStats and velocityForWindow below so both mean calculations get the
// same protection robustPeakSpeed already gives peak.
function plausibleMean(speeds: number[], confidences?: number[]): number {
  if (speeds.length === 0) return 0;
  const confident = confidences
    ? speeds.filter((_, i) => confidences[i] >= MIN_TRACKING_CONFIDENCE)
    : speeds;
  const pool0 = confident.length > 0 ? confident : speeds;
  const plausible = pool0.filter((v) => v <= MAX_PLAUSIBLE_LIFT_VELOCITY_MPS);
  // Same clamp-instead-of-raw-fallback fix as robustPeakSpeed above -- see
  // its comment. A window entirely above the physical ceiling shouldn't get
  // to report its own impossible average as the rep's mean speed either.
  if (plausible.length === 0) return MAX_PLAUSIBLE_LIFT_VELOCITY_MPS;
  return plausible.reduce((a, b) => a + b, 0) / plausible.length;
}

// Peak speed (m/s) over a short live segment -- e.g. the trace since the
// previous rep boundary -- for bar-tracker-dialog.tsx's live spoken
// velocity cue (see its own comment on why this exists alongside the
// precise batch pipeline: same "cheap live estimate now, precise pass at
// Stop" split the live rep counter above it already uses). Deliberately
// simpler than robustPeakSpeed's percentile trim: a live segment is only
// ~10-40 samples (one rep's worth at typical frame rates), too few for a
// stable 95th-percentile cut to mean anything, so this instead just
// excludes anything past the same physically-implausible ceiling
// robustPeakSpeed uses and reports the max of what's left -- a single bad
// frame skews a max more than a percentile would, but a live cue calling
// out an occasional slightly-high number is a much smaller cost than the
// latency a steadier estimator would add before it could speak at all.
// Null when there's too little data in the segment to say anything.
export function estimateLiveRepVelocityMps(segment: { t: number; y: number }[]): number | null {
  if (segment.length < 4) return null;
  let peak = 0;
  for (let i = 1; i < segment.length - 1; i++) {
    const dt = (segment[i + 1].t - segment[i - 1].t) / 1000;
    if (dt <= 0) continue;
    const speed = Math.abs(segment[i + 1].y - segment[i - 1].y) / dt;
    if (speed <= MAX_PLAUSIBLE_LIFT_VELOCITY_MPS && speed > peak) peak = speed;
  }
  return peak > 0 ? Math.round(peak * 100) / 100 : null;
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
  // Timestamps where a frame-to-frame reading got thrown out as physically
  // implausible (see isPlausibleVelocity's callers) -- optional and
  // additive so every existing caller keeps working unchanged with none of
  // this filtering applied. See the phantomPhase comment below for what it
  // actually gates.
  rejectionEvents: number[] = [],
  // From the active MovementProfile's positionScaleCorrection (see
  // shared/schema.ts) -- a multiplier near 1.0 correcting a residual,
  // movement-specific bias the athlete-height auto-calibration doesn't
  // reach (a particular camera distance/angle this movement is typically
  // filmed at). Defaults to 1 (no correction, today's behavior) so every
  // existing caller keeps working unchanged until it's wired to fetch and
  // pass its own movementType's profile. Applied once, here, to every x/y/z
  // in the trace before anything downstream reads it -- ROM (a position
  // difference), velocity (position's own derivative), and power (derived
  // from velocity) all scale by exactly this factor as a result, with no
  // separate correction needed for each.
  positionScaleCorrection = 1,
  // Segment reps by each reversal's size relative to this take's OWN typical rep, instead of
  // against an absolute centimetre floor.
  //
  // Only for a trace with no real-world scale. BASE_MIN_REP_AMPLITUDE_CM is a good gate when a
  // scale exists and meaningless without one -- a threshold in centimetres applied to a trace in
  // arbitrary units is not a threshold at all. Worse, when the scale was merely WRONG it did
  // visible damage: at a 4x-inflated scale an athlete's ordinary settling wobble cleared the
  // 20cm floor and 11 real bench reps segmented into 18.
  //
  // Everything else in this function is left alone deliberately. The concentric-vs-eccentric
  // call, the first-phase hint, and the phantom-phase filter are all ratios and comparisons
  // within the set, so they work identically with or without a scale -- and duplicating them
  // into a parallel function would be how the two copies drift apart.
  relativeSegmentation = false,
): RepMetrics | null {
  if (rawPoints.length < 6) return null;
  const minRepAmplitudeCm = heightScaledAmplitudeCm(BASE_MIN_REP_AMPLITUDE_CM, heightIn);

  // Repair single-frame implausible-acceleration glitches before anything
  // downstream (smoothing, phase segmentation, bar-path deviation) ever
  // sees them -- see rejectImplausibleAccelerationSpikes above. `points` is
  // used everywhere below instead of the raw parameter.
  const repairedPoints = rejectImplausibleAccelerationSpikes(rawPoints);
  const points =
    positionScaleCorrection !== 1
      ? repairedPoints.map((p) => ({ ...p, x: p.x * positionScaleCorrection, y: p.y * positionScaleCorrection, z: p.z * positionScaleCorrection }))
      : repairedPoints;

  const ySmoothed = kalmanSmooth(
    points.map((p) => p.y),
    points.map((p) => p.t),
    points.map((p) => p.confidence ?? 1),
  );
  const speedsMps = computeSpeeds(points, ySmoothed);
  // Same array robustPeakSpeed/plausibleMean already read for the physical-
  // ceiling filter, indexed identically to speedsMps/points -- lets both
  // also exclude a frame the implement tracker itself barely trusted, not
  // just one that read impossibly fast.
  const confidences = points.map((p) => p.confidence ?? 1);

  const minAmplitudeM = minRepAmplitudeCm / 100;
  const phases = relativeSegmentation
    ? (segmentPhasesRelative(ySmoothed) ?? [])
    : segmentPhases(ySmoothed, minAmplitudeM);
  if (phases.length === 0) return null;

  const phaseStats = phases.map((phase) => {
    const slice = speedsMps.slice(phase.startIdx, phase.endIdx + 1);
    const confidenceSlice = confidences.slice(phase.startIdx, phase.endIdx + 1);
    const duration = (points[phase.endIdx].t - points[phase.startIdx].t) / 1000;
    const mean = plausibleMean(slice, confidenceSlice);
    // peak/peakIdx (index within the whole trace, used to report how long
    // it took to reach peak velocity, a standard VBT metric) come from
    // robustPeakSpeed rather than a raw max -- see its own comment above.
    const { peak, peakIdx } = robustPeakSpeed(speedsMps, phase.startIdx, phase.endIdx, confidences);
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

  // segmentPhases counts ANY retrace past minAmplitude as a real rep
  // boundary, with no way to tell "the athlete actually moved the bar back
  // up 20cm+" apart from "tracking briefly lost the bar/wrist, jumped to a
  // wrong position, and recovered" -- both cross the same threshold. The
  // second case is exactly what isPlausibleVelocity's per-frame rejection
  // (rejectionEvents) already exists to flag, but until now nothing fed
  // that back into the count itself -- it only ever showed up afterward as
  // a lower trust score on a rep that was already counted. That's the
  // mechanism behind a set logging more reps than were actually performed:
  // a lock-loss-and-recover blip mid-set can register as one or two extra
  // phantom phases.
  //
  // Deliberately conservative about which phases this excludes -- an
  // athlete's own logged workout history is worse off under-counted (a
  // real rep silently vanishing with no explanation) than over-counted (a
  // spurious one, at least flagged "shaky" today). Only a phase that's
  // BOTH unusually short next to this same set's other reps AND directly
  // overlaps a rejection event (a single-frame implausible-acceleration
  // spike) OR was tracked at low average confidence throughout gets
  // dropped; duration alone isn't enough -- a genuinely fast rep with
  // clean tracking has neither signal near it, and a slower rep that
  // happens to have one incidental rejection (or a brief confidence dip)
  // elsewhere in a long phase isn't anomalously short. The confidence leg
  // catches what a single-frame rejection event can't: a SUSTAINED
  // low-lock stretch (the implement tracker never quite re-acquiring
  // through a whole short phase, e.g. the bar low/occluded near the floor
  // on a Pendlay row) that never trips a single-frame rejection but still
  // isn't a real rep -- exactly the mechanism behind a set logging more
  // reps than were actually performed.
  const concentricDurations = concentric.map((p) => p.duration).sort((a, b) => a - b);
  const medianConcentricDuration =
    concentricDurations.length > 0 ? concentricDurations[Math.floor(concentricDurations.length / 2)] : 0;
  const PHANTOM_DURATION_RATIO = 0.4;
  function isPhantomPhase(phase: (typeof phaseStats)[number]): boolean {
    // Fewer than 3 concentric phases isn't enough of a sample to call
    // anything "anomalously short" relative to the rest of the set with
    // any confidence -- skip the filter entirely rather than risk a bad
    // call on a single- or double-rep set.
    if (concentric.length < 3 || medianConcentricDuration <= 0) return false;
    if (phase.duration >= medianConcentricDuration * PHANTOM_DURATION_RATIO) return false;
    const startT = points[phase.startIdx].t;
    const endT = points[phase.endIdx].t;
    if (rejectionEvents.some((t) => t >= startT && t <= endT)) return true;
    const phaseConfidences = confidences.slice(phase.startIdx, phase.endIdx + 1);
    const avgConfidence =
      phaseConfidences.length > 0 ? phaseConfidences.reduce((a, c) => a + c, 0) / phaseConfidences.length : 1;
    return avgConfidence < MIN_TRACKING_CONFIDENCE;
  }

  // One entry per concentric phase, in chronological order -- rep 1, 2, 3...
  // Each rep's window starts at the beginning of the phase before it (the
  // bottom of the preceding eccentric, i.e. the bottom of the rep) so depth
  // and the sticking-point curve cover the whole rep, not just its lockout.
  const repBreakdown: RepBreakdown[] = [];
  phaseStats.forEach((phase, i) => {
    if (!isConcentric[i]) return;
    if (isPhantomPhase(phase)) return;
    const repStartIdx = i > 0 ? phaseStats[i - 1].startIdx : phase.startIdx;
    const curveStride = Math.max(1, Math.floor((phase.endIdx - phase.startIdx) / 20));
    const velocityCurve: { positionCm: number; velocityMps: number }[] = [];
    for (let idx = phase.startIdx; idx <= phase.endIdx; idx += curveStride) {
      // Clamped, not excluded -- the sticking-point chart needs one point
      // per sampled position to stay continuous, so an implausible single
      // frame here is capped at the ceiling rather than dropped, same
      // "never report a physically impossible number" stance as
      // MAX_PLAUSIBLE_LIFT_VELOCITY_MPS's other two call sites above.
      velocityCurve.push({
        positionCm: Math.round((points[idx].y - points[phase.startIdx].y) * -1000) / 10,
        velocityMps: Math.round(Math.min(speedsMps[idx], MAX_PLAUSIBLE_LIFT_VELOCITY_MPS) * 100) / 100,
      });
    }
    // The phase right before this one always alternates direction by
    // construction (segmentPhases flips direction at every split), so
    // whenever this rep isn't the very first phase, phaseStats[i - 1] is
    // guaranteed to be the eccentric that led into it.
    const pairedEccentric = i > 0 ? phaseStats[i - 1] : null;
    const romCm = Math.round(Math.abs(points[phase.endIdx].y - points[phase.startIdx].y) * 1000) / 10;

    const rawTimeToPeakSeconds = (points[phase.peakIdx].t - points[phase.startIdx].t) / 1000;
    const timeToPeakVelocitySeconds = Math.round(rawTimeToPeakSeconds * 100) / 100;
    // Divides the RAW (unrounded) peak/time, not the already-rounded display fields above --
    // see this rep's own `eai` field comment for why matching OVR meant reverse-engineering
    // against its full-precision internal values, not its 2-decimal display.
    const eai = rawTimeToPeakSeconds > 0 ? Math.round((phase.peak / rawTimeToPeakSeconds) * 100) / 100 : 0;

    repBreakdown.push({
      repNumber: repBreakdown.length + 1,
      peakVelocityMps: Math.round(phase.peak * 100) / 100,
      meanVelocityMps: Math.round(phase.mean * 100) / 100,
      concentricSeconds: Math.round(phase.duration * 100) / 100,
      timeToPeakVelocitySeconds,
      eai,
      startT: points[repStartIdx].t,
      endT: points[phase.endIdx].t,
      velocityCurve,
      romCm,
      peakPowerWatts:
        loadKg && loadKg > 0 ? Math.round(loadKg * GRAVITY_MPS2 * phase.peak) : null,
      meanPowerWatts:
        loadKg && loadKg > 0 ? Math.round(loadKg * GRAVITY_MPS2 * phase.mean) : null,
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
  // points spans the whole Start Set-to-Stop Set window, not just the
  // reps themselves -- it includes stepping back out of the rack before the
  // first rep and stepping/bending back in to re-rack after the last one.
  // Both are real, correctly-tracked motion, not noise, but neither is bar
  // drift: a 2m step back out of a rack reads as a bigger "deviation from
  // center" than any real rep's bar path ever would, and dominates the
  // median/percentile below if left in.
  //
  // Scoped to the CONCENTRIC portion of each rep specifically, not
  // repBreakdown's full rep window (which also covers the eccentric return
  // and, for a dead-stop lift like a Pendlay row, a real pause sitting on
  // the floor between reps). A bar that isn't moving has no "path" to judge
  // straightness on -- any apparent scatter during a static hold is pure
  // tracking noise, not drift -- and a floor-level dead stop is also
  // exactly where the implement tracker is worst (occluded by legs/floor),
  // so including it let the single worst-tracked, least meaningful stretch
  // of the whole set dominate the reported number. Concentric is also
  // already this function's definition of "the lift" for every other
  // per-rep number (peakVelocityMps/meanVelocityMps below are concentric-
  // only), so scoping drift to match keeps every rep-level metric
  // answering the same question. Falls back to the full trace when there's
  // no concentric data at all (e.g. every phase got filtered as phantom)
  // rather than computing deviation over nothing.
  const concentricPhases = phaseStats.filter((phase, i) => isConcentric[i] && !isPhantomPhase(phase));
  const activePoints: TrackedPoint[] = [];
  for (const phase of concentricPhases) {
    for (let idx = phase.startIdx; idx <= phase.endIdx; idx++) activePoints.push(points[idx]);
  }
  const repScopedPoints = activePoints.length > 0 ? activePoints : points;
  // Same MIN_TRACKING_CONFIDENCE filter robustPeakSpeed/plausibleMean apply
  // to velocity -- this metric had never had it: every point counted
  // equally toward the median/percentile regardless of how much the
  // implement tracker actually trusted it, so a stretch of low-lock frames
  // (the bar low/occluded near the floor on a Pendlay row, same failure
  // mode as the velocity one) could inflate the reported drift even though
  // p90 already trims the most extreme 10%. Falls back to the unfiltered
  // set if confidence filtering would leave nothing, same "never compute
  // over an empty pool" stance as everywhere else this filter is applied.
  const confidentPoints = repScopedPoints.filter((p) => (p.confidence ?? 1) >= MIN_TRACKING_CONFIDENCE);
  const driftPoints = confidentPoints.length > 0 ? confidentPoints : repScopedPoints;

  const medianOf = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const medianX = medianOf(driftPoints.map((p) => p.x));
  const medianZ = medianOf(driftPoints.map((p) => p.z));
  const sortedDeviations = driftPoints
    .map((p) => Math.hypot(p.x - medianX, p.z - medianZ))
    .sort((a, b) => a - b);
  const p90Idx = Math.min(sortedDeviations.length - 1, Math.floor(sortedDeviations.length * 0.9));
  const barPathDeviationCm = sortedDeviations[p90Idx] * 100;

  const barPathTrace = buildPathTrace(points, { x: points[0].x, y: points[0].y });

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
    meanEai:
      repBreakdown.length > 0
        ? Math.round((repBreakdown.reduce((a, r) => a + r.eai, 0) / repBreakdown.length) * 100) / 100
        : 0,
    velocityLossPercent:
      repBreakdown.length > 1 && repBreakdown[0].meanVelocityMps > 0
        ? Math.round(
            ((repBreakdown[0].meanVelocityMps -
              repBreakdown[repBreakdown.length - 1].meanVelocityMps) /
              repBreakdown[0].meanVelocityMps) *
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
  const { peak } = robustPeakSpeed(speeds, startIdx, endIdx, confidences);
  const windowSpeeds = speeds.slice(startIdx, endIdx + 1);
  const windowConfidences = confidences.slice(startIdx, endIdx + 1);
  const mean = plausibleMean(windowSpeeds, windowConfidences);
  const confidence = windowConfidences.reduce((a, c) => a + c, 0) / windowSpeeds.length;
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
      meanPowerWatts: loadKg && loadKg > 0 ? Math.round(loadKg * GRAVITY_MPS2 * meanVelocityMps) : null,
      // Recomputed against the fused peak so it doesn't go stale against rep's own original
      // (pre-fusion) eai -- see this rep's own `eai` field comment for the formula. This blend
      // has no raw (unrounded) time-to-peak available the way the primary computation does, so
      // this divides by the already-rounded timeToPeakVelocitySeconds -- a small precision loss
      // that's immaterial next to the fusion blend itself being an approximation.
      eai:
        rep.timeToPeakVelocitySeconds > 0
          ? Math.round((peakVelocityMps / rep.timeToPeakVelocitySeconds) * 100) / 100
          : rep.eai,
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
  // Same threshold MIN_TRACKING_CONFIDENCE uses above, for the identical
  // judgment call on the primary trace.

  return repWindows.map(({ startT, endT }) => {
    const left = velocityForWindow(leftSpeeds, leftPoints, leftConfidences, startT, endT);
    const right = velocityForWindow(rightSpeeds, rightPoints, rightConfidences, startT, endT);
    if (!left || !right || left.confidence < MIN_TRACKING_CONFIDENCE || right.confidence < MIN_TRACKING_CONFIDENCE) {
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
  // Per-rep kinetic-chain consistency penalty (see pose-tracking.ts's chainConsistencyPenalty) --
  // a real signal this position-fusion-only score couldn't see on its own: a hip or ankle
  // landmark quietly glitching while the knee kept tracking cleanly still reads as high
  // confidenceSamples here (Vision's own per-point confidence can stay high on a misdetected
  // point), so this folds in as an ADDITIONAL deduction rather than a competing score, the same
  // "cross-check so nothing interferes with each other" reasoning as every other signal this
  // function already blends. Optional and keyed by repNumber so callers that don't have a
  // relevant chain (no Squat/Hinge/Lunge leg chain, no Push/Pull arm chain) can simply omit it.
  chainPenalties?: Map<number, { penalty: number; note: string | null }>,
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

    const chainPenalty = chainPenalties?.get(rep.repNumber);
    if (chainPenalty && chainPenalty.penalty > 0) {
      score -= chainPenalty.penalty;
      if (chainPenalty.note) notes.push(chainPenalty.note);
    }

    score = Math.max(5, Math.min(100, Math.round(score)));
    const label: RepTrustScore["label"] = score >= 80 ? "high" : score >= 55 ? "medium" : "low";
    return { repNumber: rep.repNumber, score, label, notes };
  });
}


// The largest bar travel each movement pattern can physically produce, as a fraction of the
// athlete's own standing height. Deliberately generous -- these are not form judgements, they
// are "no human body can do this" ceilings, sized so a legitimate rep by anyone never trips
// them and a broken calibration always does.
//
// Why this exists at all: every check upstream of here asks whether the CAMERA GEOMETRY looks
// trustworthy, and that turned out to be genuinely hard to get right. Two attempts failed on
// real footage. The first required head-to-ankle to be mostly vertical, which a bench filmed
// end-on satisfies perfectly because the body runs up the frame just like a standing one. The
// second compared head-to-ankle against shoulder width, expecting foreshortening to shrink the
// body and leave the shoulders alone -- but under the strong perspective of a wide lens with
// the athlete's feet close to it, the near ankles are magnified and the far shoulders shrink,
// so the ratio moves the WRONG WAY and the check passes the very case it was written to catch.
// Confirmed on a real set: camera at the foot of a bench, 121 of 639 frames still calibrated,
// range of motion reported as 180.5cm against roughly 39cm actually pressed.
//
// This check asks a different question -- not "does the geometry look right" but "is the
// ANSWER possible". It needs no view of the camera at all, so no angle can defeat it. It is a
// backstop, not a cure: it makes a bad calibration fail loudly instead of publishing confident
// nonsense. Getting a right answer for a given angle is a separate problem.
const MAX_ROM_FRACTION_OF_HEIGHT: Record<string, number> = {
  // Bounded by arm length. Upper arm plus forearm is ~0.35 of height, and a press cannot
  // exceed it; 0.5 leaves generous room for a long-armed athlete and a deep arch.
  horizontal_press_or_row: 0.5,
  // Hip travel from lockout to below parallel; ~0.3 of height typically.
  squat: 0.6,
  // Floor to lockout, bounded by the distance from the bar's start height to the hip.
  deadlift: 0.7,
  overhead_press: 0.7,
  // Buckets below come from exercise-camera-profile.ts's romBucketForExercise -- see its own
  // comment for why they are deliberately generous. An Olympic lift is the one movement that
  // legally travels further than the athlete is tall: the bar starts on the floor and finishes
  // locked out overhead.
  olympic: 1.35,
  vertical_pull: 0.55,
  elbow_flexion_extension: 0.45,
  // A calf raise moves ~0.05 of standing height. Under the old 1.3x default a scale several
  // times too large still landed inside the ceiling and reported as an ordinary number.
  ankle_or_shrug: 0.2,
  lunge_or_step: 0.55,
  dip_or_pushup: 0.45,
};

// Anything not named above (jumps, carries, Olympic lifts, unknown exercises) gets this. A
// snatch legitimately moves the bar from the floor to overhead, which for a short athlete can
// exceed their own height, so the catch-all has to sit above 1.0 or it would reject correct
// Olympic lifts -- see this file's note in docs/camera-tracking-notes.md about those needing
// their own model regardless.
const DEFAULT_MAX_ROM_FRACTION = 1.3;

// The other half, and it was missing. A ceiling alone only catches a scale read too LARGE. A
// simulation over 48 realistic camera positions produced published ranges of motion from 6.1cm
// upward against a true 39.4cm -- so under-reads are just as real as over-reads, and a 6cm
// bench press is exactly as impossible as a 299cm one. Anything at or below these fractions
// is not a rep that was measured badly, it is a scale that was read wrong.
//
// Set well under any real working range: a bench press moves the bar roughly 0.2x of standing
// height even for a very short-armed lifter benching to a high touch point, so 0.08 leaves
// generous room while still catching a scale several times too small.
const MIN_ROM_FRACTION_OF_HEIGHT: Record<string, number> = {
  horizontal_press_or_row: 0.08,
  squat: 0.10,
  deadlift: 0.12,
  overhead_press: 0.10,
  olympic: 0.15,
  vertical_pull: 0.08,
  elbow_flexion_extension: 0.04,
  ankle_or_shrug: 0.01,
  lunge_or_step: 0.06,
  dip_or_pushup: 0.05,
};

const DEFAULT_MIN_ROM_FRACTION = 0.05;

/**
 * Whether a computed range of motion is physically possible for this athlete and movement.
 * Returns null when it is fine (or when there is not enough information to judge), otherwise a
 * human-readable reason the caller should surface INSTEAD of the metrics.
 *
 * Takes the athlete's height because every ceiling above is anthropometric -- an absolute
 * centimetre limit would be wrong at both ends of the height range.
 */
export function implausibleRangeOfMotion(
  // Nullable: a take with no real-world scale has no range of motion to judge, and "no answer"
  // is the correct response rather than a rejection.
  romCm: number | null,
  heightIn: number | null | undefined,
  movementPattern: string | null | undefined,
): string | null {
  if (!heightIn || heightIn <= 0) return null;
  if (romCm == null || !Number.isFinite(romCm) || romCm <= 0) return null;
  const heightCm = heightIn * 2.54;
  const fraction = movementPattern
    ? (MAX_ROM_FRACTION_OF_HEIGHT[movementPattern] ?? DEFAULT_MAX_ROM_FRACTION)
    : DEFAULT_MAX_ROM_FRACTION;
  const ceilingCm = heightCm * fraction;
  const floorFraction = movementPattern
    ? (MIN_ROM_FRACTION_OF_HEIGHT[movementPattern] ?? DEFAULT_MIN_ROM_FRACTION)
    : DEFAULT_MIN_ROM_FRACTION;
  const floorCm = heightCm * floorFraction;
  if (romCm < floorCm) {
    const underBy = Math.round((floorCm / romCm) * 10) / 10;
    return (
      `Range of motion came out as ${Math.round(romCm)}cm, about ${underBy}x SHORTER than this ` +
      `movement can travel for your height. That means the camera's real-world scale was ` +
      `misread, so every number from this take would be wrong by the same factor.`
    );
  }
  if (romCm <= ceilingCm) return null;
  const overBy = Math.round((romCm / ceilingCm) * 10) / 10;
  return (
    `Range of motion came out as ${Math.round(romCm)}cm, about ${overBy}x further than this ` +
    `movement can physically travel for your height. That means the camera's real-world scale ` +
    `was misread, so every number from this take would be wrong by the same factor.`
  );
}

// Fraction of a take's own typical rep size that a reversal must clear to count as a rep.
//
// The existing rep gate is BASE_MIN_REP_AMPLITUDE_CM, an absolute 20cm. That is a good gate
// when a real-world scale exists, and it stays in use for every lift that has one. It cannot
// work without one: a threshold in centimetres applied to a trace in pixel-units is meaningless,
// and when the scale was merely WRONG it did visible damage -- at a 4x-inflated scale an
// athlete's ordinary settling wobble cleared 20cm and 11 real bench reps segmented into 18.
//
// So when there is no scale, the take calibrates its own gate. Real reps in a set are all
// roughly the same size and are far larger than the noise between them, so a fraction of the
// take's own typical reversal separates them cleanly without knowing what a centimetre is.
//
// 0.4 sits in the wide gap between those two populations: settling, grip adjustment and pose
// jitter run well under half a real rep, while genuine reps -- including a last rep that
// shortens with fatigue -- stay comfortably above it.
const RELATIVE_REP_AMPLITUDE_FRACTION = 0.4;

// A take needs at least this many candidate reversals before its own typical size means
// anything. Below it there is nothing to take a median of, and one reversal would define
// itself as typical and always pass.
const MIN_REVERSALS_FOR_RELATIVE_GATE = 3;

/**
 * Segments reps WITHOUT a real-world scale, by deriving the amplitude gate from the trace
 * itself. `positions` may be in any consistent unit, including raw pixel-space.
 *
 * Two passes. The first uses a deliberately permissive gate to enumerate every reversal,
 * including noise. The median of those amplitudes is then the take's own sense of "a normal
 * movement", and the second pass gates at a fraction of it.
 *
 * A median, not a mean or a max: a single tracking spike would drag a mean upward and would
 * BE the max, and either would then raise the gate high enough to discard real reps -- the
 * failure mode that matters most, since a missed rep is worse than an extra one here.
 *
 * Returns null when the take has too few reversals to judge, so the caller can fall back
 * rather than trust a gate derived from nothing.
 */
export function segmentPhasesRelative(
  positions: number[],
): { startIdx: number; endIdx: number }[] | null {
  if (positions.length < 2) return null;
  const span = Math.max(...positions) - Math.min(...positions);
  if (!(span > 0)) return null;

  // Permissive enough to catch everything real while still collapsing single-sample jitter.
  const exploratory = segmentPhases(positions, span * 0.02);
  if (exploratory.length < MIN_REVERSALS_FOR_RELATIVE_GATE) return null;

  const amplitudes = exploratory
    .map((p) => Math.abs(positions[p.endIdx] - positions[p.startIdx]))
    .filter((a) => a > 0)
    .sort((a, b) => a - b);
  if (amplitudes.length < MIN_REVERSALS_FOR_RELATIVE_GATE) return null;

  const mid = Math.floor(amplitudes.length / 2);
  const typical =
    amplitudes.length % 2 === 0 ? (amplitudes[mid - 1] + amplitudes[mid]) / 2 : amplitudes[mid];
  if (!(typical > 0)) return null;

  return segmentPhases(positions, typical * RELATIVE_REP_AMPLITUDE_FRACTION);
}

// A trace with no real-world scale still has to pass through filters that assume one.
//
// rejectImplausibleAccelerationSpikes caps acceleration at a multiple of gravity, and
// robustPeakSpeed discards any frame reading faster than MAX_PLAUSIBLE_LIFT_VELOCITY_MPS. Both
// are stated in metres. Handed a trace in arbitrary units they do not merely stop helping, they
// actively corrupt: a trace whose numbers happen to be large reads as one continuous
// physically-impossible event, so every frame is rejected and the peak collapses to the ceiling;
// one whose numbers are small sails through unfiltered. The same five reps segmented as four at
// one scale and eight at another, which is how this was found.
//
// So the trace is first rescaled to a nominal, physically ordinary size. The choice of nominal
// value does not matter and is not a claim about the athlete: every number the scale-free path
// reports is either a duration or a ratio, and multiplying every position by a constant changes
// neither. What it buys is that the filters run in the regime they were tuned for and go back to
// removing tracking glitches, which is their real job.
const NOMINAL_SCALE_FREE_ROM_M = 0.5;

export function normalizeTraceScale(points: TrackedPoint[]): TrackedPoint[] {
  if (points.length < 2) return points;
  const ys = points.map((p) => p.y).sort((a, b) => a - b);
  // 5th to 95th percentile rather than min-to-max, so one stray frame cannot set the scale for
  // the whole take.
  const low = ys[Math.floor(ys.length * 0.05)];
  const high = ys[Math.floor(ys.length * 0.95)];
  const span = Math.abs(high - low);
  if (!(span > 0) || !Number.isFinite(span)) return points;
  const factor = NOMINAL_SCALE_FREE_ROM_M / span;
  return points.map((p) => ({ ...p, x: p.x * factor, y: p.y * factor, z: p.z * factor }));
}

// What a set is still worth reporting when no real-world scale could be established.
//
// Until now the answer was "nothing". A bench press, and every seated lift after the posture
// work, saved its video and withheld every number -- including the ones that never needed a
// scale in the first place. How long each rep took, how much the bar slowed across the set, how
// long it took to reach top speed, and how far it drifted as a share of its own travel are all
// times or ratios. Metres cancel out of every one of them.
//
// That matters most on exactly the lift where it was worst. Velocity loss across a set is the
// number a velocity-based-training athlete actually trains against, and it is a percentage. It
// was being thrown away with the metres it does not need.
//
// Nothing here carries a unit that depends on calibration. There is deliberately no "velocity"
// field of any kind, in any disguise: a number in trace units per second would look like a
// speed, sort like a speed, and be compared against last week's speed by an athlete who has no
// way to know the units changed.
export type ScaleFreeRep = {
  repNumber: number;
  concentricSeconds: number;
  eccentricSeconds: number | null;
  timeToPeakVelocitySeconds: number;
  /** This rep's peak speed as a share of the set's fastest rep. The fastest rep is 1. */
  relativePeakVelocity: number;
  /** Knee/hip angle at the bottom, in degrees. An angle is a ratio of two lengths, so it needs
   * no scale -- this is the one positional metric that survives. */
  depthDeg?: number | null;
};

export type ScaleFreeMetrics = {
  repCount: number;
  reps: ScaleFreeRep[];
  /** Mean concentric and eccentric duration across the set, in seconds. */
  concentricSeconds: number;
  eccentricSeconds: number | null;
  /** Drop in mean speed from the first rep to the last, as a percentage. Null for a single rep. */
  velocityLossPercent: number | null;
  /** Bar drift, as a percentage of the distance the bar actually travelled. The absolute
   * centimetre version needs a scale; this one is drift divided by travel, so it does not. */
  barPathDriftPercentOfRom: number | null;
};

/** The scale-invariant part of a set's metrics.
 *
 * Takes a RepMetrics computed from an UNSCALED trace (summarizeTrackedSet with
 * relativeSegmentation on). Every unit-bearing field on that input is in arbitrary trace units
 * and is dropped here rather than reported. */
export function toScaleFreeMetrics(metrics: RepMetrics): ScaleFreeMetrics | null {
  const reps = metrics.repBreakdown;
  if (!reps.length) return null;

  const fastest = Math.max(...reps.map((r) => r.peakVelocityMps), 0);
  const scaleFreeReps: ScaleFreeRep[] = reps.map((r, i) => ({
    repNumber: r.repNumber ?? i + 1,
    concentricSeconds: r.concentricSeconds,
    eccentricSeconds: r.eccentricSeconds ?? null,
    timeToPeakVelocitySeconds: r.timeToPeakVelocitySeconds,
    relativePeakVelocity:
      fastest > 0 ? Math.round((r.peakVelocityMps / fastest) * 1000) / 1000 : 0,
    depthDeg: r.depthDeg ?? null,
  }));

  const meanConcentric =
    Math.round((reps.reduce((a, r) => a + r.concentricSeconds, 0) / reps.length) * 100) / 100;
  const eccentricValues = reps
    .map((r) => r.eccentricSeconds)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const meanEccentric =
    eccentricValues.length > 0
      ? Math.round((eccentricValues.reduce((a, v) => a + v, 0) / eccentricValues.length) * 100) / 100
      : null;

  // Both sides of this ratio come from the same unscaled trace, so whatever the units were, they
  // divide out. Guarded on the mean ROM being positive: a set whose reps registered no travel at
  // all has nothing to express drift as a share of.
  const meanRom = reps.reduce((a, r) => a + (r.romCm ?? 0), 0) / reps.length;
  const deviation = metrics.barPathDeviationCm;
  const barPathDriftPercentOfRom =
    meanRom > 0 && deviation != null && Number.isFinite(deviation)
      ? Math.round((deviation / meanRom) * 1000) / 10
      : null;

  return {
    repCount: reps.length,
    reps: scaleFreeReps,
    concentricSeconds: meanConcentric,
    eccentricSeconds: meanEccentric,
    velocityLossPercent: metrics.velocityLossPercent ?? null,
    barPathDriftPercentOfRom,
  };
}
