// Shoulder/hip rotation separation -- the "X-Factor" a golf swing and
// baseball hitting/throwing mechanics both care about: how far the
// shoulders have turned past the hips at a given moment. Deliberately
// platform-agnostic -- it reads world-space landmarks (meters, real 3D),
// the same Landmark[] shape whether they came from ARKit's depth-sensed
// skeleton (see ar-body-landmarks.ts's arJointsToWorldLandmarks) or
// MediaPipe's own world-landmark estimate, so this one module backs both
// the ARKit-native and MediaPipe swing dialogs without duplication.
import type { Landmark } from "@mediapipe/tasks-vision";
import { POSE_LANDMARKS, percentile, type PoseFrame } from "./pose-tracking";

const MIN_VISIBILITY = 0.5;

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
};

export function summarizeRotation(frames: PoseFrame[]): RotationSummary | null {
  const trace: RotationSample[] = [];
  for (const f of frames) {
    const sep = computeSeparationDeg(f.worldLandmarks);
    if (sep != null) trace.push({ t: f.t, separationDeg: sep });
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

  return {
    trace,
    peakSeparationDeg: Math.round(peak.separationDeg * 10) / 10,
    peakSeparationT: peak.t,
  };
}
