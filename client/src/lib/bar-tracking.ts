// Pure signal-processing helpers for the camera-based bar tracker --
// no DOM/camera access here, so this is easy to reason about and test in
// isolation from the getUserMedia/canvas plumbing in bar-tracker-dialog.tsx.

export type TrackedPoint = { t: number; x: number; y: number };

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
  startT: number;
  endT: number;
  depthDeg?: number | null;
  velocityCurve?: { positionCm: number; velocityMps: number }[];
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
  // Populated by the caller from pose-tracking.ts's detectFormFaults --
  // kept as a plain field here (rather than computed inside
  // summarizeTrackedSet) since fault detection needs the full per-frame
  // landmark history, not just the derived (t,x,y) trace this module works
  // with.
  formFaults: { code: string; label: string }[];
};

// Decimates a raw pixel-space trace to at most ~200 points and converts it
// to cm relative to `origin` -- shared by the averaged bar-path trace and
// the independent left/right arm-path traces so all three use the same
// coordinate convention.
export function buildPathTrace(
  rawPoints: TrackedPoint[],
  pixelsPerMeter: number,
  origin: { x: number; y: number },
): PathTracePoint[] {
  if (rawPoints.length === 0 || pixelsPerMeter <= 0) return [];
  const stride = Math.max(1, Math.floor(rawPoints.length / 200));
  return rawPoints
    .filter((_, i) => i % stride === 0)
    .map((p) => ({
      t: p.t,
      x: Math.round(((p.x - origin.x) / pixelsPerMeter) * 1000) / 10,
      y: Math.round(((p.y - origin.y) / pixelsPerMeter) * 1000) / 10,
    }));
}

const SMOOTHING_WINDOW = 5;

function movingAverage(values: number[], window: number): number[] {
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
function segmentPhases(
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

// Turns a raw pixel-space trace for one set into real-world metrics. Returns
// null when there isn't enough signal to say anything meaningful (marker
// lost for most of the take, or the athlete stopped before moving).
export function summarizeTrackedSet(
  rawPoints: TrackedPoint[],
  pixelsPerMeter: number,
  minRepAmplitudeCm = 5,
): RepMetrics | null {
  if (rawPoints.length < 6 || pixelsPerMeter <= 0) return null;

  const ySmoothed = movingAverage(rawPoints.map((p) => p.y), SMOOTHING_WINDOW);
  const speedsMps = computeSpeeds(rawPoints, ySmoothed).map((v) => v / pixelsPerMeter);

  const minAmplitudePx = (minRepAmplitudeCm / 100) * pixelsPerMeter;
  const phases = segmentPhases(ySmoothed, minAmplitudePx);
  if (phases.length === 0) return null;

  const phaseStats = phases.map((phase) => {
    const slice = speedsMps.slice(phase.startIdx, phase.endIdx + 1);
    const duration = (rawPoints[phase.endIdx].t - rawPoints[phase.startIdx].t) / 1000;
    const peak = slice.length ? Math.max(...slice) : 0;
    const mean = slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
    return { peak, mean, duration, startIdx: phase.startIdx, endIdx: phase.endIdx };
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
        positionCm: Math.round(((rawPoints[idx].y - rawPoints[phase.startIdx].y) / pixelsPerMeter) * -1000) / 10,
        velocityMps: Math.round(speedsMps[idx] * 100) / 100,
      });
    }
    repBreakdown.push({
      repNumber: repBreakdown.length + 1,
      peakVelocityMps: Math.round(phase.peak * 100) / 100,
      meanVelocityMps: Math.round(phase.mean * 100) / 100,
      concentricSeconds: Math.round(phase.duration * 100) / 100,
      startT: rawPoints[repStartIdx].t,
      endT: rawPoints[phase.endIdx].t,
      velocityCurve,
    });
  });

  const xs = rawPoints.map((p) => p.x);
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const barPathDeviationCm =
    (Math.max(...xs.map((x) => Math.abs(x - meanX))) / pixelsPerMeter) * 100;

  const barPathTrace = buildPathTrace(rawPoints, pixelsPerMeter, { x: rawPoints[0].x, y: rawPoints[0].y });

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
    barPathDeviationCm: Math.round(barPathDeviationCm * 10) / 10,
    barPathTrace,
    repBreakdown,
    formFaults: [],
  };
}

export type MarkerColor = "green" | "pink" | "blue";

export const MARKER_COLOR_SWATCH: Record<MarkerColor, string> = {
  green: "#22c55e",
  pink: "#ec4899",
  blue: "#3b82f6",
};

const MARKER_HUE_RANGES: Record<MarkerColor, [number, number]> = {
  green: [80, 160],
  pink: [280, 340],
  blue: [190, 250],
};

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

// Centroid of pixels matching a bright, saturated marker of the given hue
// (a piece of tape/a band on the bar) -- not a general object tracker, and
// deliberately not: this only needs to work for one high-contrast marker
// placed by the athlete, not arbitrary scenes.
export function findMarkerCentroid(
  imageData: ImageData,
  color: MarkerColor,
): { x: number; y: number } | null {
  const [hueMin, hueMax] = MARKER_HUE_RANGES[color];
  const { data, width, height } = imageData;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  // Every 2nd pixel in both dimensions -- 4x fewer comparisons per frame
  // with negligible centroid error, needed to keep this at camera frame rate.
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const { h, s, l } = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      if (s > 0.4 && l > 0.25 && l < 0.85 && h >= hueMin && h <= hueMax) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }
  if (count < 8) return null;
  return { x: sumX / count, y: sumY / count };
}

export type CalibrationQuality = "move_closer" | "move_back" | "good";

// Sanity-checks the two calibration taps against the frame size -- this is
// the "right distance" setup guide: if the reference is too small on
// screen, tracking will be noisy; if it's too large, the athlete's full
// range of motion probably won't stay in frame.
export function calibrationQuality(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  frameWidth: number,
): CalibrationQuality {
  const ratio = Math.hypot(p2.x - p1.x, p2.y - p1.y) / frameWidth;
  if (ratio < 0.15) return "move_closer";
  if (ratio > 0.92) return "move_back";
  return "good";
}
