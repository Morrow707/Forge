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
  const trace: RotationSample[] = [];
  const spreadTrace: { t: number; spread: number }[] = [];
  for (const f of frames) {
    const sep = computeSeparationDeg(f.worldLandmarks);
    if (sep != null) trace.push({ t: f.t, separationDeg: sep });
    const spread = crossDiagonalSpread(f.worldLandmarks);
    if (spread != null) spreadTrace.push({ t: f.t, spread });
  }
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
