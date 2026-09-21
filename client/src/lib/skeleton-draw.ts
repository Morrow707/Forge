import type { PoseFrame } from "@/lib/pose-tracking";

/**
 * Drawing a saved skeleton (workoutSetEntries.skeletonFrames) onto a canvas.
 *
 * This is the analysis dialog's drawSkeleton, lifted so the compare tool can draw a skeleton on
 * each of its two sides without importing the dialog (and with it MediaPipe's loader: the dialog
 * reads POSE_CONNECTIONS off `PoseLandmarker`, which is the runtime class). The connection list
 * is MediaPipe's 33-landmark pose topology, pinned here as data -- it is a property of the
 * landmark indices, not of the runtime, and it has not changed across tasks-vision releases.
 *
 * MIN_VISIBILITY matches pose-tracking.ts's threshold of the same name. It is restated rather
 * than imported for the same reason: pose-tracking.ts imports @mediapipe/tasks-vision at module
 * scope.
 */

const MIN_VISIBILITY = 0.5;
export const SKELETON_COLOR = "#2dd4bf";

/** [start, end] landmark indices of every bone MediaPipe draws. */
export const POSE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
];

type Landmark = { x: number; y: number; visibility: number };

/** The saved frame nearest to a clip time, or null when there are none. Frames are in time
 * order, so this is a binary search rather than the dialog's linear scan -- a 30 s iOS capture
 * carries ~450 frames and the compare tool asks twice per animation frame. */
export function nearestSkeletonFrame(frames: PoseFrame[] | null | undefined, tSec: number): PoseFrame | null {
  if (!frames || !frames.length) return null;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t < tSec) lo = mid + 1;
    else hi = mid;
  }
  const candidate = frames[lo];
  const before = frames[lo - 1];
  if (before && Math.abs(before.t - tSec) < Math.abs(candidate.t - tSec)) return before;
  return candidate;
}

/**
 * Draw one frame's landmarks. `transform` maps a normalised landmark (0..1 in both axes) to a
 * canvas pixel, which is how the overlay mode applies mirror, scale and nudge to the right-hand
 * skeleton without a second code path: the plain split view passes the identity.
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  width: number,
  height: number,
  options: {
    color?: string;
    lineWidth?: number;
    alpha?: number;
    transform?: (x: number, y: number) => { x: number; y: number };
  } = {},
) {
  const color = options.color ?? SKELETON_COLOR;
  const map = options.transform ?? ((x: number, y: number) => ({ x: x * width, y: y * height }));
  ctx.save();
  ctx.globalAlpha = options.alpha ?? 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = options.lineWidth ?? 3;
  for (const [start, end] of POSE_CONNECTIONS) {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!a || !b || a.visibility < MIN_VISIBILITY || b.visibility < MIN_VISIBILITY) continue;
    const pa = map(a.x, a.y);
    const pb = map(b.x, b.y);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  for (const lm of landmarks) {
    if (lm.visibility < MIN_VISIBILITY) continue;
    const p = map(lm.x, lm.y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
