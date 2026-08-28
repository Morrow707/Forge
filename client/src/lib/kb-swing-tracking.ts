// Kettlebell swing (arc-pattern) tracking -- see trackingLevelEnum's own comment in
// shared/schema.ts for why this needs different math from bar-tracking.ts's vertical-only
// formulas. A swing's bell travels in a forward-back arc through the hips, not a straight
// vertical line: peak speed happens near the BOTTOM of the arc, where motion is mostly
// horizontal, so bar-tracking.ts's own peakVelocityMps (built from the vertical position delta
// only) would badly undercount it, and barPathDeviationCm (horizontal drift from a vertical
// line) would flag the swing's own arc as a "fault" when the arc itself is the rep, not a
// deviation from one.
//
// Deliberately reuses bar-tracking.ts's segmentPhases, heightScaledAmplitudeCm, kalmanSmooth,
// and MIN_TRACKING_CONFIDENCE rather than reimplementing any of them -- rep boundaries still
// come from the wrist's vertical oscillation (the bell still rises and falls every rep even
// though it also swings forward-back), so that part of the pipeline is genuinely unchanged;
// only the velocity/acceleration-repair math, which assumes a vertical-only trajectory, needed
// its own version.
//
// Tracks the wrist MIDPOINT directly, not a separate implement -- a two-handed swing's grip
// sits right on the bell, unlike a barbell held away from the body, so the wrist position is
// already a good proxy for the bell's own position. No AvImplementTracker/object-tracking
// involvement needed, same reasoning mechanics-tracking.ts's own wrist-speed proxy already
// established for a thrown object.
import {
  segmentPhases,
  heightScaledAmplitudeCm,
  kalmanSmooth,
  MIN_TRACKING_CONFIDENCE,
  type TrackedPoint,
} from "./bar-tracking";

// Elite/hard kettlebell swing bell speeds run roughly 3-6 m/s at the bottom of the arc --
// meaningfully faster than a controlled barbell lift's own MAX_PLAUSIBLE_LIFT_VELOCITY_MPS (3
// m/s) ceiling would allow, since a swing is a ballistic, not a controlled, movement. Set
// generously above that real-world range, same "well above even an elite real effort" margin
// used throughout this app, so this only ever catches a genuine tracking glitch. Untuned
// against real footage (this sandbox has no camera to test against).
export const MAX_PLAUSIBLE_KB_SWING_SPEED_MPS = 8;

// A swing's own vertical excursion is real but smaller than a squat/deadlift's full ROM -- the
// bell only rises from about between-the-legs to roughly chest/eye height, not floor-to-lockout
// -- so this floor sits below bar-tracking.ts's own BASE_MIN_REP_AMPLITUDE_CM (20cm), just
// enough to separate a real rep's oscillation from tracking noise.
const BASE_MIN_SWING_AMPLITUDE_CM = 12;

// Same physical-impossibility repair as bar-tracking.ts's rejectImplausibleAccelerationSpikes,
// but computed from full 3D displacement magnitude instead of the Y-only acceleration that
// function checks -- a swing's real acceleration is dominated by the horizontal component near
// the bottom of the arc, which the vertical-only version would never even look at, let alone
// catch a glitch in.
const MAX_PLAUSIBLE_SWING_ACCEL_MPS2 = 60;

function rejectImplausible3dAccelerationSpikes(points: TrackedPoint[]): TrackedPoint[] {
  if (points.length < 3) return points;
  const flagged = new Array(points.length).fill(false);
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const dt1 = (curr.t - prev.t) / 1000;
    const dt2 = (next.t - curr.t) / 1000;
    if (dt1 <= 0 || dt2 <= 0) continue;
    const v1 = { x: (curr.x - prev.x) / dt1, y: (curr.y - prev.y) / dt1, z: (curr.z - prev.z) / dt1 };
    const v2 = { x: (next.x - curr.x) / dt2, y: (next.y - curr.y) / dt2, z: (next.z - curr.z) / dt2 };
    const dtAvg = (dt1 + dt2) / 2;
    const accel = Math.hypot(v2.x - v1.x, v2.y - v1.y, v2.z - v1.z) / dtAvg;
    if (accel > MAX_PLAUSIBLE_SWING_ACCEL_MPS2) flagged[i] = true;
  }

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

export type KbSwingRepBreakdown = {
  repNumber: number;
  peakSpeedMps: number;
  heightCm: number;
};

export type KbSwingSetMetrics = {
  peakSpeedMps: number;
  meanSpeedMps: number;
  peakHeightCm: number;
  repBreakdown: KbSwingRepBreakdown[];
};

// heightIn: same athlete-height nudge to the rep-amplitude floor every other tracked mode
// already applies (see heightScaledAmplitudeCm's own comment) -- optional, falls back to the
// flat BASE_MIN_SWING_AMPLITUDE_CM when unset. Returns null when there isn't enough signal to
// say anything meaningful, same "no number is better than a wrong one" stance every other
// summarize* function in this app takes.
export function summarizeKbSwingSet(rawPoints: TrackedPoint[], heightIn?: number | null): KbSwingSetMetrics | null {
  if (rawPoints.length < 6) return null;

  const points = rejectImplausible3dAccelerationSpikes(rawPoints);
  const ySmoothed = kalmanSmooth(
    points.map((p) => p.y),
    points.map((p) => p.t),
    points.map((p) => p.confidence ?? 1),
  );

  const minAmplitudeM = heightScaledAmplitudeCm(BASE_MIN_SWING_AMPLITUDE_CM, heightIn) / 100;
  const phases = segmentPhases(ySmoothed, minAmplitudeM);
  if (phases.length === 0) return null;

  // Full 3D speed magnitude, central-difference -- the whole reason this file exists instead of
  // reusing bar-tracking.ts's own computeSpeeds (vertical-only).
  const speeds: number[] = new Array(points.length).fill(0);
  for (let i = 1; i < points.length - 1; i++) {
    const dt = (points[i + 1].t - points[i - 1].t) / 1000;
    if (dt <= 0) continue;
    const dx = points[i + 1].x - points[i - 1].x;
    const dy = points[i + 1].y - points[i - 1].y;
    const dz = points[i + 1].z - points[i - 1].z;
    speeds[i] = Math.hypot(dx, dy, dz) / dt;
  }
  const confidences = points.map((p) => p.confidence ?? 1);

  const repBreakdown: KbSwingRepBreakdown[] = [];
  const allPlausibleSpeeds: number[] = [];
  phases.forEach((phase, i) => {
    const confidentSpeeds: number[] = [];
    for (let idx = phase.startIdx; idx <= phase.endIdx; idx++) {
      if (confidences[idx] < MIN_TRACKING_CONFIDENCE) continue;
      confidentSpeeds.push(speeds[idx]);
    }
    // Same "fall back to the unfiltered window rather than compute over nothing" stance as
    // bar-tracking.ts's own robustPeakSpeed.
    const pool = confidentSpeeds.length > 0 ? confidentSpeeds : speeds.slice(phase.startIdx, phase.endIdx + 1);
    const plausible = pool.filter((v) => v <= MAX_PLAUSIBLE_KB_SWING_SPEED_MPS);
    // Clamp to the ceiling rather than fall back to the raw (possibly-impossible) pool -- same
    // "never report a physically impossible number" fix bar-tracking.ts's own robustPeakSpeed
    // applies.
    const repPeak = plausible.length > 0 ? Math.max(...plausible) : MAX_PLAUSIBLE_KB_SWING_SPEED_MPS;
    allPlausibleSpeeds.push(...plausible);

    let repMinY = Infinity;
    let repMaxY = -Infinity;
    for (let idx = phase.startIdx; idx <= phase.endIdx; idx++) {
      repMinY = Math.min(repMinY, ySmoothed[idx]);
      repMaxY = Math.max(repMaxY, ySmoothed[idx]);
    }
    // Range, not a signed difference -- correct regardless of which physical direction this
    // pipeline's Y axis happens to increase toward (see vision-body-landmarks.ts's own Y-flip
    // for why that isn't a safe assumption to bake in here).
    const heightCm = Math.round((repMaxY - repMinY) * 1000) / 10;

    repBreakdown.push({ repNumber: i + 1, peakSpeedMps: Math.round(repPeak * 100) / 100, heightCm });
  });

  if (repBreakdown.length === 0) return null;
  const peakSpeedMps = Math.max(...repBreakdown.map((r) => r.peakSpeedMps));
  const meanSpeedMps =
    allPlausibleSpeeds.length > 0
      ? Math.round((allPlausibleSpeeds.reduce((a, b) => a + b, 0) / allPlausibleSpeeds.length) * 100) / 100
      : 0;
  const peakHeightCm = Math.max(...repBreakdown.map((r) => r.heightCm));

  return { peakSpeedMps, meanSpeedMps, peakHeightCm, repBreakdown };
}
