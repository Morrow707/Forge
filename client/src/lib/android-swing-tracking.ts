// Android/MediaPipe's OWN copy of the golf/baseball swing math -- rotation.ts's shoulder/hip
// separation ("X-Factor") and swing-tracking.ts's phase/tempo/head-sway detection, both of which
// this file was forked from. Deliberately a real duplicate, not a shared import, per explicit
// instruction: retuning one of these two files (after real iOS footage shows TAKEAWAY_TRIGGER_MPS
// needs to move, say) must never silently also retune the other -- same reasoning
// implement-tracking.ts's own camera-overlord checks were kept as an independent copy of
// AvImplementTracker.swift's checks rather than one shared implementation. If the two ever DO
// need to diverge in actual approach (not just constants), that's fine too -- nothing here is
// meant to track its iOS twin line-for-line forever, only to start from the same place.
//
// Everything below operates on pose-tracking.ts's own PoseFrame -- MediaPipe's PoseLandmarker
// already reports worldLandmarks in real-world meters directly (unlike Vision's raw 2D-derived
// output, which needs the athlete-height calibration av-swing-tracker-dialog.tsx applies before
// calling its own twin of this file), so there's no scaleFactor step here at all -- see
// swing-tracker-dialog.tsx's own comment on why this makes the Android path simpler for this one
// specific piece.
import type { Landmark } from "@mediapipe/tasks-vision";
import { POSE_LANDMARKS, percentile, type PoseFrame, type SetTrustScore } from "./pose-tracking";
import { movingAverage, framesForDuration, type TrackedPoint } from "./bar-tracking";

const MIN_VISIBILITY = 0.5;

// ---- Rotation / "X-Factor" (forked from rotation-tracking.ts) ----

// See rotation-tracking.ts's own crossDiagonalSpread comment for the full geometric reasoning --
// unchanged here, this is a magnitude-only cross-check, not a restatement of the angle
// calculation below.
function crossDiagonalSpread(landmarks: Landmark[]): number | null {
  const ls = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rs = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const lh = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rh = landmarks[POSE_LANDMARKS.RIGHT_HIP];
  if (
    !ls ||
    !rs ||
    !lh ||
    !rh ||
    (ls.visibility ?? 1) < MIN_VISIBILITY ||
    (rs.visibility ?? 1) < MIN_VISIBILITY ||
    (lh.visibility ?? 1) < MIN_VISIBILITY ||
    (rh.visibility ?? 1) < MIN_VISIBILITY
  ) {
    return null;
  }
  const d1 = Math.hypot(rs.x - lh.x, rs.z - lh.z);
  const d2 = Math.hypot(ls.x - rh.x, ls.z - rh.z);
  return (d1 + d2) / 2;
}

function lineAngleDeg(left: Landmark, right: Landmark): number {
  return (Math.atan2(right.z - left.z, right.x - left.x) * 180) / Math.PI;
}

function angleDiffDeg(a: number, b: number): number {
  let diff = a - b;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

export function computeSeparationDeg(landmarks: Landmark[]): number | null {
  const ls = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rs = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const lh = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rh = landmarks[POSE_LANDMARKS.RIGHT_HIP];
  if (!ls || !rs || !lh || !rh) return null;
  if (
    (ls.visibility ?? 1) < MIN_VISIBILITY ||
    (rs.visibility ?? 1) < MIN_VISIBILITY ||
    (lh.visibility ?? 1) < MIN_VISIBILITY ||
    (rh.visibility ?? 1) < MIN_VISIBILITY
  ) {
    return null;
  }
  return angleDiffDeg(lineAngleDeg(ls, rs), lineAngleDeg(lh, rh));
}

export type RotationSample = { t: number; separationDeg: number };

export type RotationSummary = {
  trace: RotationSample[];
  peakSeparationDeg: number;
  peakSeparationT: number;
  trust: SetTrustScore;
};

export function summarizeRotation(frames: PoseFrame[]): RotationSummary | null {
  const trace: RotationSample[] = [];
  const spreadTrace: { t: number; spread: number }[] = [];
  for (const f of frames) {
    const sep = computeSeparationDeg(f.worldLandmarks);
    if (sep != null) trace.push({ t: f.t, separationDeg: sep });
    const spread = crossDiagonalSpread(f.worldLandmarks);
    if (spread != null) spreadTrace.push({ t: f.t, spread });
  }
  if (trace.length < 6) return null;

  const magnitudes = trace.map((s) => Math.abs(s.separationDeg));
  const peakMagnitude = percentile(magnitudes, 0.95);
  let peak = trace[0];
  let closestDiff = Infinity;
  for (const s of trace) {
    const diff = Math.abs(Math.abs(s.separationDeg) - peakMagnitude);
    if (diff < closestDiff) {
      closestDiff = diff;
      peak = s;
    }
  }

  let trust: SetTrustScore;
  if (spreadTrace.length < 6) {
    trust = { score: 55, label: "medium", notes: ["Not enough clean hip/shoulder frames to cross-check this reading"] };
  } else {
    const baselineSpread = percentile(
      spreadTrace.map((s) => s.spread),
      0.95,
    );
    let spreadAtPeak = spreadTrace[0].spread;
    let closestSpreadDiff = Infinity;
    for (const s of spreadTrace) {
      const diff = Math.abs(s.t - peak.t);
      if (diff < closestSpreadDiff) {
        closestSpreadDiff = diff;
        spreadAtPeak = s.spread;
      }
    }
    trust =
      spreadAtPeak <= baselineSpread
        ? { score: 85, label: "high", notes: [] }
        : {
            score: 45,
            label: "low",
            notes: ["Cross-diagonal check didn't confirm this rotation -- the peak reading may be a tracking artifact"],
          };
  }

  return {
    trace,
    trust,
    peakSeparationDeg: Math.round(peak.separationDeg * 10) / 10,
    peakSeparationT: peak.t,
  };
}

// ---- Phase / tempo / head sway (forked from swing-tracking.ts) ----

// First-pass constants, independently tunable from av-swing-tracker-dialog.tsx's twin of these
// -- see this file's own header comment. Started at the same values (no reason to guess a
// different starting point than the already-reasoned iOS constants), not yet validated against
// real MediaPipe swing footage on a real device.
const TARGET_SMOOTHING_MS = 80;
const TAKEAWAY_TRIGGER_MPS = 0.3;
const TOP_SETTLE_MPS = 0.25;

function gripPoint(frame: PoseFrame): TrackedPoint | null {
  const lw = frame.worldLandmarks[POSE_LANDMARKS.LEFT_WRIST];
  const rw = frame.worldLandmarks[POSE_LANDMARKS.RIGHT_WRIST];
  if (!lw || !rw) return null;
  if ((lw.visibility ?? 1) < MIN_VISIBILITY || (rw.visibility ?? 1) < MIN_VISIBILITY) return null;
  return {
    t: frame.t,
    x: (lw.x + rw.x) / 2,
    y: (lw.y + rw.y) / 2,
    z: (lw.z + rw.z) / 2,
  };
}

function speedsMps(points: TrackedPoint[]): number[] {
  const speeds = [0];
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i].t - points[i - 1].t) / 1000;
    if (dt <= 0) {
      speeds.push(0);
      continue;
    }
    const dist = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
      points[i].z - points[i - 1].z,
    );
    speeds.push(dist / dt);
  }
  return speeds;
}

export type SwingPhases = {
  takeawayT: number;
  topT: number;
  impactT: number;
  backswingMs: number;
  downswingMs: number;
  tempoRatio: number;
};

function detectPhases(points: TrackedPoint[]): SwingPhases | null {
  if (points.length < 6) return null;
  const smoothWindow = framesForDuration(points, TARGET_SMOOTHING_MS);
  const speeds = movingAverage(speedsMps(points), smoothWindow);

  let state: "address" | "backswing" | "downswing" = "address";
  let takeawayIdx = -1;
  let topIdx = -1;
  let impactIdx = -1;
  let peakSpeedSoFar = 0;

  for (let i = 1; i < speeds.length; i++) {
    if (state === "address") {
      if (speeds[i] >= TAKEAWAY_TRIGGER_MPS) {
        state = "backswing";
        takeawayIdx = i;
      }
    } else if (state === "backswing") {
      if (speeds[i] <= TOP_SETTLE_MPS) {
        state = "downswing";
        topIdx = i;
        peakSpeedSoFar = 0;
      }
    } else {
      if (speeds[i] > peakSpeedSoFar) {
        peakSpeedSoFar = speeds[i];
        impactIdx = i;
      } else if (impactIdx !== -1 && i - impactIdx > smoothWindow && speeds[i] < peakSpeedSoFar * 0.6) {
        break;
      }
    }
  }

  if (takeawayIdx === -1 || topIdx === -1 || impactIdx === -1) return null;

  const takeawayT = points[takeawayIdx].t;
  const topT = points[topIdx].t;
  const impactT = points[impactIdx].t;
  const backswingMs = topT - takeawayT;
  const downswingMs = impactT - topT;
  if (backswingMs <= 0 || downswingMs <= 0) return null;

  return {
    takeawayT,
    topT,
    impactT,
    backswingMs,
    downswingMs,
    tempoRatio: Math.round((backswingMs / downswingMs) * 100) / 100,
  };
}

function computeHeadSwayCm(frames: PoseFrame[], startT: number, endT: number): number | null {
  const noses = frames
    .filter((f) => f.t >= startT && f.t <= endT)
    .map((f) => f.worldLandmarks[POSE_LANDMARKS.NOSE])
    .filter((n): n is Landmark => !!n && (n.visibility ?? 1) >= MIN_VISIBILITY);
  if (noses.length < 3) return null;
  const xs = noses.map((n) => n.x);
  const zs = noses.map((n) => n.z);
  const rangeX = Math.max(...xs) - Math.min(...xs);
  const rangeZ = Math.max(...zs) - Math.min(...zs);
  return Math.round(Math.hypot(rangeX, rangeZ) * 100 * 10) / 10;
}

export type SwingSummary = {
  phases: SwingPhases | null;
  headSwayCm: number | null;
  gripTrace: TrackedPoint[];
};

export function summarizeSwing(frames: PoseFrame[]): SwingSummary {
  const gripTrace = frames.map(gripPoint).filter((p): p is TrackedPoint => p != null);
  const phases = detectPhases(gripTrace);
  const headSwayCm = phases ? computeHeadSwayCm(frames, phases.takeawayT, phases.impactT) : null;
  return { phases, headSwayCm, gripTrace };
}
