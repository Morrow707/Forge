// Sharpens hip/knee/ankle landmark precision by re-running Pose on a tight
// crop around the lower body -- the same detect-then-crop-and-refine
// principle Hand Landmarker itself uses internally (see hand-tracking.ts's
// own comment), applied manually since MediaPipe ships no dedicated "Leg
// Landmarker" to do it for us. A full-frame Pose estimate spends its fixed
// input resolution across the athlete's entire body; re-running on a crop
// around just the lower body effectively zooms in, giving a materially
// sharper read on exactly the landmarks squat-depth, knee-valgus, and
// jump-takeoff/landing calculations most depend on.
//
// Real cost: a second Pose inference call per refinement. The caller (see
// bar-tracker-dialog.tsx) throttles how often this runs rather than
// calling it every single frame, since knee/ankle angle doesn't change
// fast enough at 30fps for that to matter and a full second inference
// every frame risked doubling per-frame cost.
import { PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { POSE_LANDMARKS } from "./pose-tracking";

const LOWER_BODY_INDICES = [
  POSE_LANDMARKS.LEFT_HIP,
  POSE_LANDMARKS.RIGHT_HIP,
  POSE_LANDMARKS.LEFT_KNEE,
  POSE_LANDMARKS.RIGHT_KNEE,
  POSE_LANDMARKS.LEFT_ANKLE,
  POSE_LANDMARKS.RIGHT_ANKLE,
  POSE_LANDMARKS.LEFT_HEEL,
  POSE_LANDMARKS.RIGHT_HEEL,
  POSE_LANDMARKS.LEFT_FOOT_INDEX,
  POSE_LANDMARKS.RIGHT_FOOT_INDEX,
];
const MIN_VISIBILITY = 0.5;

// Padding around the raw lower-body bounding box, as a fraction of its own
// size -- generous enough that a rep's natural motion between this
// frame's detection and the crop actually being drawn doesn't move a
// joint outside the cropped region before the second pass reads it.
const BOX_PADDING_FRACTION = 0.35;
// Don't crop tighter than this share of the frame, even if the raw
// lower-body points happen to cluster close together (e.g. early in a
// countermovement) -- an overly tight crop is exactly as fragile to
// between-frame motion as no padding at all.
const MIN_BOX_FRACTION = 0.15;
const CROP_CANVAS_SIZE = 384;

let scratchCanvas: HTMLCanvasElement | null = null;
function getScratchCanvas(): HTMLCanvasElement {
  if (!scratchCanvas) scratchCanvas = document.createElement("canvas");
  return scratchCanvas;
}

export type LowerBodyBox = { left: number; top: number; width: number; height: number };

// Pure bounding-box math, split out from the canvas/video/model-calling
// code below for the same testability reason as bar-tracking.ts's
// segmentPhases and implement-tracking.ts's findMotionCentroid -- easy to
// assert against synthetic landmark sets without a real video frame.
// Returns null when there isn't enough of the lower body confidently
// visible to trust a crop at all.
export function computeLowerBodyBox(landmarks: NormalizedLandmark[]): LowerBodyBox | null {
  const points = LOWER_BODY_INDICES.map((i) => landmarks[i]).filter(
    (lm): lm is NormalizedLandmark => !!lm && lm.visibility >= MIN_VISIBILITY,
  );
  if (points.length < 4) return null;

  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const boxW = Math.max(maxX - minX, MIN_BOX_FRACTION);
  const boxH = Math.max(maxY - minY, MIN_BOX_FRACTION);
  const padX = boxW * BOX_PADDING_FRACTION;
  const padY = boxH * BOX_PADDING_FRACTION;

  const left = Math.max(0, minX - padX);
  const top = Math.max(0, minY - padY);
  const right = Math.min(1, maxX + padX);
  const bottom = Math.min(1, maxY + padY);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return null;
  return { left, top, width, height };
}

// Remaps a crop-space normalized landmark array back into full-frame
// normalized coordinates given the crop box it came from -- pure math,
// independently testable from the canvas/model plumbing around it.
export function remapCropLandmark(
  landmark: NormalizedLandmark,
  box: LowerBodyBox,
): NormalizedLandmark {
  return {
    ...landmark,
    x: box.left + landmark.x * box.width,
    y: box.top + landmark.y * box.height,
  };
}

// Re-runs `landmarker` (expected to be pose-tracking.ts's
// getRoiPoseLandmarker instance, never the main one -- see its own
// comment) on a crop of `video` around the lower-body landmarks in
// `landmarks`, and returns a COPY of `landmarks` with just the lower-body
// indices replaced by the refined, remapped-back-to-full-frame values --
// everything else (shoulders, wrists, etc.) is untouched. Returns the
// original array unchanged if a crop can't be formed (too little of the
// lower body confidently visible) or the second pass finds nobody in it.
export function refineLowerBodyLandmarks(
  landmarker: PoseLandmarker,
  video: HTMLVideoElement,
  landmarks: NormalizedLandmark[],
  timestamp: number,
): NormalizedLandmark[] {
  const box = computeLowerBodyBox(landmarks);
  if (!box) return landmarks;

  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  if (!videoWidth || !videoHeight) return landmarks;

  const canvas = getScratchCanvas();
  // Upscaled beyond the crop's native pixel footprint -- this is exactly
  // what gives the model more effective resolution to work with on this
  // region than it had scanning the whole frame at once.
  canvas.width = CROP_CANVAS_SIZE;
  canvas.height = CROP_CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return landmarks;

  ctx.drawImage(
    video,
    box.left * videoWidth,
    box.top * videoHeight,
    box.width * videoWidth,
    box.height * videoHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const result = landmarker.detectForVideo(canvas, timestamp);
  const refinedFrame = result.landmarks[0];
  if (!refinedFrame) return landmarks;

  const merged = landmarks.slice();
  for (const i of LOWER_BODY_INDICES) {
    const refined = refinedFrame[i];
    if (!refined || refined.visibility < MIN_VISIBILITY) continue;
    merged[i] = remapCropLandmark(refined, box);
  }
  return merged;
}
