// Shoulder/hip rotation separation -- the "X-Factor" a golf swing and
// baseball hitting/throwing mechanics both care about: how far the
// shoulders have turned past the hips at a given moment. Deliberately
// platform-agnostic -- it reads world-space landmarks (meters, real 3D),
// the same Landmark[] shape whether they came from ARKit's depth-sensed
// skeleton (see ar-body-landmarks.ts's arJointsToWorldLandmarks) or
// MediaPipe's own world-landmark estimate, so this one module backs both
// the ARKit-native and MediaPipe swing dialogs without duplication.
import type { Landmark } from "@mediapipe/tasks-vision";
import { POSE_LANDMARKS, percentile, type PoseFrame, type SetTrustScore } from "./pose-tracking";

const MIN_VISIBILITY = 0.5;

// Right-shoulder-to-left-hip and left-shoulder-to-right-hip distance (transverse x-z plane only,
// same "looking down from above" convention as lineAngleDeg below) -- a genuinely different
// cross-check on the same four landmarks the angle-based separation already uses, not a
// restatement of it. Both cross-diagonals work out to the SAME distance at any rotation angle in
// either direction (rotating right and rotating left shrink both equally), so this can't tell
// which way the athlete turned -- computeSeparationDeg's sign is still what carries direction.
// What it DOES give: that shared distance genuinely shrinks as rotation magnitude grows, through
// completely different math (a straight-line distance between two points, not a line-angle
// difference), so it fails differently than the angle calculation and makes a real, honest
// magnitude sanity check for it.
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
  // atan2 in the horizontal (x-z) plane, looking down from above --
  // vertical (y) is deliberately excluded, since this measures rotation,
  // not lean/tilt.
  return (Math.atan2(right.z - left.z, right.x - left.x) * 180) / Math.PI;
}

function angleDiffDeg(a: number, b: number): number {
  let diff = a - b;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

/** Signed shoulder-line-vs-hip-line angle for one frame, in degrees --
 * null when any of the four landmarks isn't confidently visible this
 * frame, rather than computing a garbage angle off a landmark the tracker
 * is guessing at. */
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

// Camera overlord: same "sustained drift forces a full reacquisition, an isolated dip just gets
// suppressed" two-check shape ImplementTracker/AvImplementTracker already established for a live
// per-frame implement lock, adapted here to a post-hoc angle trace instead -- this module has no
// live "lock" to drop (Pose/Vision re-detects every frame independently, there's nothing
// stateful carried between calls), so the check operates on the resulting trace itself rather
// than a running detector state.
//
// A real shoulder/hip separation can't physically snap by MAX_PLAUSIBLE_ROTATION_VELOCITY_DEG_PER_S
// and back within a couple of frames -- that signature is a single misdetected frame (a brief
// occlusion, a landmark momentarily swapped left/right), not a real rotation. An ISOLATED spike
// (a short run, both ends bordered by frames back near the pre-spike trend) is interpolated
// through, same repair kb-swing-tracking.ts's own rejectImplausible3dAccelerationSpikes applies
// for the identical "a couple of bad frames, not a real trend" signature. A SUSTAINED run (many
// consecutive frames all reading the same implausible velocity) reads differently -- either the
// tracker lost the athlete's actual left/right sides for a real stretch, or a genuinely chaotic
// misdetection -- and gets dropped from the trace outright instead of interpolated, the same
// "force a fresh reacquisition, don't dead-reckon through it" stance a dropped ImplementTracker
// lock takes rather than reporting a guessed position.
//
// Untuned starting values, no real footage to calibrate against yet -- same caveat every
// heuristic constant in this codebase carries.
const MAX_PLAUSIBLE_ROTATION_VELOCITY_DEG_PER_S = 1200;
const SUSTAINED_DRIFT_MIN_RUN = 4;

function cleanRotationTrace(trace: RotationSample[]): RotationSample[] {
  if (trace.length < 3) return trace;
  const flagged = new Array(trace.length).fill(false);
  for (let i = 1; i < trace.length; i++) {
    const dtSec = (trace[i].t - trace[i - 1].t) / 1000;
    if (dtSec <= 0) continue;
    const velocity = Math.abs(angleDiffDeg(trace[i].separationDeg, trace[i - 1].separationDeg)) / dtSec;
    if (velocity > MAX_PLAUSIBLE_ROTATION_VELOCITY_DEG_PER_S) flagged[i] = true;
  }

  const cleaned: RotationSample[] = [];
  let i = 0;
  while (i < trace.length) {
    if (!flagged[i]) {
      cleaned.push(trace[i]);
      i++;
      continue;
    }
    let runEnd = i;
    while (runEnd < trace.length && flagged[runEnd]) runEnd++;
    const before = trace[i - 1];
    const after = trace[runEnd];
    // Sustained (long run), or a short run with no trustworthy frame on one side to
    // interpolate between (the flagged run starts at index 0, or runs off the end) -- drop
    // outright, same reasoning as the header comment above.
    if (runEnd - i >= SUSTAINED_DRIFT_MIN_RUN || !before || !after) {
      i = runEnd;
      continue;
    }
    // Isolated dip -- interpolate across it.
    const span = after.t - before.t;
    for (let k = i; k < runEnd; k++) {
      const frac = span > 0 ? (trace[k].t - before.t) / span : 0;
      cleaned.push({ t: trace[k].t, separationDeg: before.separationDeg + (after.separationDeg - before.separationDeg) * frac });
    }
    i = runEnd;
  }
  return cleaned;
}

export type RotationSample = { t: number; separationDeg: number };

export type RotationSummary = {
  trace: RotationSample[];
  // The largest-magnitude separation reached during the tracked window --
  // for a golf backswing or a baseball load, this is the classic "X-Factor"
  // number, whichever direction the athlete's dominant side turns.
  peakSeparationDeg: number;
  peakSeparationT: number;
  // Cross-diagonal magnitude sanity check on peakSeparationDeg -- see crossDiagonalSpread's own
  // comment. swingSeparationDeg had no confidence signal at all before this; this is its first
  // one.
  trust: SetTrustScore;
};

export function summarizeRotation(frames: PoseFrame[]): RotationSummary | null {
  const rawTrace: RotationSample[] = [];
  const spreadTrace: { t: number; spread: number }[] = [];
  for (const f of frames) {
    const sep = computeSeparationDeg(f.worldLandmarks);
    if (sep != null) rawTrace.push({ t: f.t, separationDeg: sep });
    const spread = crossDiagonalSpread(f.worldLandmarks);
    if (spread != null) spreadTrace.push({ t: f.t, spread });
  }
  // Camera overlord -- see cleanRotationTrace's own comment above.
  const trace = cleanRotationTrace(rawTrace);
  if (trace.length < 6) return null;

  // 95th percentile of |separation|, not a raw max -- same protection
  // mechanics-tracking.ts's near-identical hipShoulderSeparationDeg already
  // has for the same "X-Factor" concept applied to a throw/jump-shot
  // instead of a swing. This is the headline number a coach reads off a
  // golf/baseball swing, so a single misdetected frame distorting it is
  // worse here than almost anywhere else in this app.
  const magnitudes = trace.map((s) => Math.abs(s.separationDeg));
  const peakMagnitude = percentile(magnitudes, 0.95);
  // The actual (signed) sample closest to that trimmed magnitude, rather
  // than just reporting the number itself, so peakSeparationT still points
  // at a real frame the review UI can scrub to -- same pairing
  // bar-tracking.ts's robustPeakSpeed does for its own peakIdx.
  let peak = trace[0];
  let closestDiff = Infinity;
  for (const s of trace) {
    const diff = Math.abs(Math.abs(s.separationDeg) - peakMagnitude);
    if (diff < closestDiff) {
      closestDiff = diff;
      peak = s;
    }
  }

  // Cross-diagonal sanity check: the widest (least-rotated) reading in the whole trace stands in
  // for the "neutral" baseline (see crossDiagonalSpread's own comment -- spread is maximal at
  // zero rotation and shrinks as rotation grows in either direction), compared against whatever
  // the spread was at the frame closest to the reported peak. A real rotation this large should
  // have narrowed the spread at least SOMEWHAT below that baseline; if it didn't, the
  // peak-separation reading may be a tracking artifact rather than a genuine turn -- see this
  // session's own geometric derivation for why this can only be a magnitude-only check, not a
  // directional one.
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
