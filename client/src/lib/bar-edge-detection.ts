// Refines the tracked bar's vertical position using real pixel edges near
// the wrists, instead of relying purely on wrist-landmark height. The bar
// sitting in an athlete's hand isn't at the same height as their wrist
// joint -- grip thickness, wrist flexion/extension, and how they're holding
// it all shift the two apart -- so this closes that gap with a direct
// visual read of the bar's own edge against the background.
//
// There's no barbell/plate object-detection model available on-device (and
// no way to fetch or train one from this offline-first client), so this
// uses classical edge detection instead of a trained model: a real bar
// creates one sharp, sustained brightness step in a vertical profile near
// the wrists (its top or bottom rim against the background), which a
// simple gradient scan can find without needing to recognize "a barbell"
// as a concept at all.
import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { POSE_LANDMARKS } from "./pose-tracking";

const MIN_VISIBILITY = 0.5;
// Real-world hand separation below this isn't a barbell/handle grip -- a
// dumbbell, kettlebell, or bodyweight movement has no bar to find an edge
// of, and searching for one would just risk locking onto a random edge in
// the background near one hand.
const MIN_GRIP_WIDTH_METERS = 0.25;
// How far above/below the wrist line to search, as a fraction of frame
// height -- wide enough to cover realistic grip-to-bar offsets, narrow
// enough to stay clear of the shoulders/hips also being in frame.
const ROI_VERTICAL_PAD_FRACTION = 0.08;
// The winning row's brightness-step size must beat the ROI's own average
// step size by at least this multiple to be trusted as a real edge rather
// than sensor noise or a gradual lighting gradient -- untuned against real
// footage (this sandbox has no camera to test against), so treat this as a
// starting point that may need adjusting once tried on real sets.
const MIN_EDGE_CONFIDENCE_RATIO = 2.5;
// A "bar edge" found further than this from the wrists is almost certainly
// a false positive (a shirt hem, a shadow, background clutter) rather than
// the actual bar, so it's discarded instead of corrupting the trace.
const MAX_OFFSET_METERS = 0.12;
// A real barbell/EZ-bar/dumbbell handle has two edges (its top and bottom
// rim against the background) roughly this close together -- generous
// upper bound covering everything from a bare bar to a loaded one with
// visible collars. Used to find the *other* rim once the strongest one is
// found, so the two can be averaged into the bar's actual center instead
// of latching onto whichever single rim happened to be marginally sharper
// this frame (which would otherwise flip-flop frame to frame and show up
// as noise in the trace).
const MAX_BAR_THICKNESS_METERS = 0.08;
const MIN_EDGE_SEPARATION_ROWS = 2;
// The source ROI is cropped straight from native video resolution (which
// could be 4K+), but always downscaled into a small fixed-size canvas
// before reading pixels back out -- keeps getImageData cheap every frame
// regardless of camera resolution.
const MAX_ROI_WIDTH = 240;
const MAX_ROI_HEIGHT = 120;

let scratchCanvas: HTMLCanvasElement | null = null;
function getScratchCanvas(): HTMLCanvasElement {
  if (!scratchCanvas) scratchCanvas = document.createElement("canvas");
  return scratchCanvas;
}

function visible(lm: { visibility: number } | undefined): boolean {
  return !!lm && lm.visibility >= MIN_VISIBILITY;
}

// Returns a signed offset in real-world meters (same sign convention as
// pose-tracking.ts's worldVerticalSign: positive = downward, matching
// normalized image-space) to add to the wrist-midpoint world Y, or null
// when no confident bar edge was found -- callers should fall back to the
// plain wrist-midpoint height in that case, same as before this existed.
export function refineBarHeightFromEdges(
  video: HTMLVideoElement,
  landmarks: NormalizedLandmark[],
  worldLandmarks: Landmark[],
): number | null {
  const lWrist = landmarks[POSE_LANDMARKS.LEFT_WRIST];
  const rWrist = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
  const lWorldWrist = worldLandmarks[POSE_LANDMARKS.LEFT_WRIST];
  const rWorldWrist = worldLandmarks[POSE_LANDMARKS.RIGHT_WRIST];
  if (!visible(lWrist) || !visible(rWrist) || !lWorldWrist || !rWorldWrist) return null;

  const wristWorldDist = Math.hypot(rWorldWrist.x - lWorldWrist.x, rWorldWrist.y - lWorldWrist.y);
  if (wristWorldDist < MIN_GRIP_WIDTH_METERS) return null;

  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;

  // Local pixels-per-meter, derived fresh every frame from the same two
  // wrist landmarks in both coordinate spaces -- no persistent calibration
  // step needed (that's the whole point of the worldLandmarks switch this
  // builds on), and it self-corrects for however far the athlete is from
  // the camera on any given rep.
  const wristPixelDist = Math.hypot((rWrist.x - lWrist.x) * width, (rWrist.y - lWrist.y) * height);
  const localPixelsPerMeter = wristPixelDist / wristWorldDist;
  if (!(localPixelsPerMeter > 0)) return null;

  const roiLeft = Math.max(0, Math.min(lWrist.x, rWrist.x) * width - wristPixelDist * 0.15);
  const roiRight = Math.min(width, Math.max(lWrist.x, rWrist.x) * width + wristPixelDist * 0.15);
  const wristMidPixelY = ((lWrist.y + rWrist.y) / 2) * height;
  const roiPad = height * ROI_VERTICAL_PAD_FRACTION;
  const roiTop = Math.max(0, wristMidPixelY - roiPad);
  const roiBottom = Math.min(height, wristMidPixelY + roiPad);
  const roiWidthRaw = roiRight - roiLeft;
  const roiHeightRaw = roiBottom - roiTop;
  if (roiWidthRaw < 4 || roiHeightRaw < 4) return null;

  const roiWidth = Math.max(1, Math.round(Math.min(roiWidthRaw, MAX_ROI_WIDTH)));
  const roiHeight = Math.max(1, Math.round(Math.min(roiHeightRaw, MAX_ROI_HEIGHT)));

  const canvas = getScratchCanvas();
  canvas.width = roiWidth;
  canvas.height = roiHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, roiLeft, roiTop, roiWidthRaw, roiHeightRaw, 0, 0, roiWidth, roiHeight);
  const { data } = ctx.getImageData(0, 0, roiWidth, roiHeight);

  // Per-row average brightness, then the sharpest brightness step between
  // neighboring rows -- a real horizontal edge shows up as one sharp jump
  // in this vertical profile, not a gradual slope the way ambient lighting
  // or shadow falloff would.
  const rowBrightness = new Float32Array(roiHeight);
  for (let y = 0; y < roiHeight; y++) {
    let sum = 0;
    for (let x = 0; x < roiWidth; x++) {
      const i = (y * roiWidth + x) * 4;
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    rowBrightness[y] = sum / roiWidth;
  }

  let bestRow = -1;
  let bestGradient = 0;
  let totalGradient = 0;
  for (let y = 1; y < roiHeight - 1; y++) {
    const gradient = Math.abs(rowBrightness[y + 1] - rowBrightness[y - 1]);
    totalGradient += gradient;
    if (gradient > bestGradient) {
      bestGradient = gradient;
      bestRow = y;
    }
  }
  if (bestRow < 0) return null;
  const avgGradient = totalGradient / (roiHeight - 2);
  if (avgGradient <= 0 || bestGradient / avgGradient < MIN_EDGE_CONFIDENCE_RATIO) return null;

  // Downscaled rows per source pixel, to translate a real-world bar
  // thickness into a search window in the (possibly downscaled) row space
  // the gradient scan above operates in.
  const rowsPerSourcePixel = roiHeight / roiHeightRaw;
  const maxThicknessRows = Math.max(
    MIN_EDGE_SEPARATION_ROWS + 1,
    Math.round(MAX_BAR_THICKNESS_METERS * localPixelsPerMeter * rowsPerSourcePixel),
  );

  let secondRow = -1;
  let secondGradient = 0;
  for (let y = 1; y < roiHeight - 1; y++) {
    const distance = Math.abs(y - bestRow);
    if (distance < MIN_EDGE_SEPARATION_ROWS || distance > maxThicknessRows) continue;
    const gradient = Math.abs(rowBrightness[y + 1] - rowBrightness[y - 1]);
    if (gradient > secondGradient) {
      secondGradient = gradient;
      secondRow = y;
    }
  }
  // A relaxed confidence bar for the second edge -- it's confirming/
  // refining the first, already-confident edge, not standing on its own.
  const foundSecondEdge = secondRow >= 0 && secondGradient / avgGradient >= MIN_EDGE_CONFIDENCE_RATIO * 0.6;
  const edgeRow = foundSecondEdge ? (bestRow + secondRow) / 2 : bestRow;

  const edgePixelY = roiTop + (edgeRow / roiHeight) * roiHeightRaw;
  const offsetPixels = edgePixelY - wristMidPixelY;
  const offsetMeters = offsetPixels / localPixelsPerMeter;
  if (Math.abs(offsetMeters) > MAX_OFFSET_METERS) return null;

  return offsetMeters;
}
