/**
 * WHERE THE BODY WENT, AND HOW (2026-11-25).
 *
 * Three bench takes in a row at 0.5x lost the athlete at the chest for 0.7-1.3s on every press,
 * and the export could not say whether Vision returned NO body on those frames or a body whose
 * joints all fell under the native 0.1 confidence guard. Those are different faults with different
 * fixes (the first is the frame, the second is a threshold), so this counts both, from the frames
 * the take already has. It records and gates nothing (Rule #1).
 */
import type { PoseFrame as NativePoseFrame } from "./native-av-preview";

export type BodyLoss = {
  frames: number;
  /** Vision returned no body at all. */
  noBody: number;
  /** A body, but neither wrist above the guard. */
  bodyNoWrists: number;
  /** A body, but neither shoulder above the guard. */
  bodyNoShoulders: number;
  /** The longest run of frames with no body, in seconds. */
  longestNoBodySeconds: number;
  /** Median of Vision's body confidence on tracked frames (null on a native build that sends none). */
  medianBodyConfidence: number | null;
  /** Median body confidence on the tracked frames just either side of a no-body run: low here and
   *  high elsewhere says the body was fading out, not cut off. */
  medianBodyConfidenceAtEdges: number | null;
};

const HALF = 0.5;
const ROUND = 1000;
const TWO = 2;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length * HALF);
  return s.length % TWO ? s[mid] : (s[mid - 1] + s[mid]) * HALF;
}

function has(frame: NativePoseFrame, names: string[]): boolean {
  return frame.joints.some((j) => names.includes(j.name));
}

export function measureBodyLoss(frames: NativePoseFrame[]): BodyLoss {
  const noBodyRuns = frames.reduce<{ longest: number; runStart: number | null }>(
    (acc, f) => {
      if (!f.tracked) return acc.runStart == null ? { ...acc, runStart: f.timestamp } : acc;
      if (acc.runStart == null) return acc;
      const length = f.timestamp - acc.runStart;
      return { longest: Math.max(acc.longest, length), runStart: null };
    },
    { longest: 0, runStart: null },
  );
  const tailRun = noBodyRuns.runStart != null && frames.length > 0 ? frames[frames.length - 1].timestamp - noBodyRuns.runStart : 0;
  const tracked = frames.filter((f) => f.tracked);
  const confidences = tracked.map((f) => f.bodyConfidence).filter((c): c is number => typeof c === "number");
  const edgeConfidences = frames
    .map((f, i) => {
      const nextToGap = (frames[i - 1] && !frames[i - 1].tracked) || (frames[i + 1] && !frames[i + 1].tracked);
      return f.tracked && nextToGap ? f.bodyConfidence : undefined;
    })
    .filter((c): c is number => typeof c === "number");
  const round = (v: number | null) => (v == null ? null : Math.round(v * ROUND) / ROUND);
  return {
    frames: frames.length,
    noBody: frames.length - tracked.length,
    bodyNoWrists: tracked.filter((f) => !has(f, ["leftWrist", "rightWrist"])).length,
    bodyNoShoulders: tracked.filter((f) => !has(f, ["leftShoulder", "rightShoulder"])).length,
    longestNoBodySeconds: round(Math.max(noBodyRuns.longest, tailRun)) ?? 0,
    medianBodyConfidence: round(median(confidences)),
    medianBodyConfidenceAtEdges: round(median(edgeConfidences)),
  };
}
