// Locates whatever the athlete is actually holding and moving -- a
// barbell, a dumbbell, a kettlebell, a medicine ball, anything -- by
// motion rather than by recognizing it as an object. There's no
// barbell/dumbbell/kettlebell/medicine-ball detection model available
// on-device (and no way to train or fetch one from this offline-first
// client -- the same constraint the old static edge-detector this
// replaces was built around), but motion turns out to be a better signal
// for this anyway: whatever is moving in the same direction and roughly
// the same amount as the athlete's own wrist, frame to frame, is what
// they're holding. A rack, stored plates, a mirror, or another lifter in
// the background simply isn't moving in sync with THIS athlete's hand, so
// it's excluded by construction -- no per-object recognition needed, and
// it generalizes to any implement (including ones nobody thought to name)
// instead of only the few classes a trained model would have been taught.
import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { POSE_LANDMARKS } from "./pose-tracking";

const MIN_VISIBILITY = 0.5;
function visible(lm: { visibility: number } | undefined): boolean {
  return !!lm && lm.visibility >= MIN_VISIBILITY;
}

// Downscaled working resolution for the motion-diff scan -- large enough
// to localize a held implement's centroid usefully, small enough that a
// full-frame grayscale diff is cheap every tick regardless of the camera's
// native resolution (which could be 4K+ on a modern phone).
const WORKING_MAX_DIM = 160;
// Grayscale delta (0-255) counted as "this pixel moved" -- comfortably
// above ordinary sensor noise and video-compression artifacts, well below
// a real lit/shadowed edge sweeping past as an implement or limb moves
// through it. Untuned against real footage (this environment has no
// camera to test against) -- treat as a starting point to revisit once
// tried against a real set.
const MOTION_DIFF_THRESHOLD = 18;
// How far out from the wrist to scan for motion, as a fraction of the
// working frame's shorter side -- wide enough to catch an implement that
// hangs below or out from the hand (a kettlebell swinging past the wrist,
// a medicine ball held at the chest), narrow enough to stay clear of a
// neighboring lifter or a rack a couple feet away.
const SEARCH_RADIUS_FRACTION = 0.22;
// Below this many moved pixels in the search window, there's nothing to
// trust as "an implement moved here" -- likely sensor noise, or the
// athlete standing still with nothing actually happening in frame.
const MIN_HOT_PIXELS = 6;
// Below this much actual wrist displacement (working-resolution pixels
// per frame), don't even look for implement motion. A stationary
// athlete's implement won't show up in a frame diff at all -- treating
// "nothing changed because nothing moved" as "found nothing" is exactly
// the right fallback here, not a gap to paper over.
const MIN_WRIST_SPEED_PX = 1;
// Below this, two shoulders are too close together in-frame (a very
// oblique camera angle, or a partial detection) to trust as a real-world
// scale reference -- same reasoning as the old edge-detector's grip-width
// floor, just applied to shoulders instead of wrists.
const MIN_SHOULDER_WORLD_DIST = 0.05;

export type PixelPoint = { x: number; y: number };

// Pure motion-diff scan over a search window centered on the wrist --
// split out from ImplementTracker itself so it's testable with plain
// arrays (no canvas/video needed): construct two synthetic grayscale
// frames, assert the returned centroid lands where the "moved" pixels
// were placed. currGray/prevGray are both w*h grayscale buffers in the
// same coordinate space. Returns the centroid of pixels that changed by
// at least MOTION_DIFF_THRESHOLD within the search window, or null when
// too few pixels changed to trust as "an implement moved here" rather
// than noise.
export function findMotionCentroid(
  currGray: ArrayLike<number>,
  prevGray: ArrayLike<number>,
  w: number,
  h: number,
  wristX: number,
  wristY: number,
): PixelPoint | null {
  const radius = Math.max(6, Math.round(SEARCH_RADIUS_FRACTION * Math.min(w, h)));
  const left = Math.max(0, Math.round(wristX - radius));
  const right = Math.min(w, Math.round(wristX + radius));
  const top = Math.max(0, Math.round(wristY - radius));
  const bottom = Math.min(h, Math.round(wristY + radius));

  let sumX = 0;
  let sumY = 0;
  let hotCount = 0;
  for (let y = top; y < bottom; y++) {
    const rowOffset = y * w;
    for (let x = left; x < right; x++) {
      const idx = rowOffset + x;
      if (Math.abs(currGray[idx] - prevGray[idx]) >= MOTION_DIFF_THRESHOLD) {
        sumX += x;
        sumY += y;
        hotCount++;
      }
    }
  }
  if (hotCount < MIN_HOT_PIXELS) return null;
  return { x: sumX / hotCount, y: sumY / hotCount };
}

// Real meters per working-resolution pixel, derived fresh every frame from
// shoulder width in both normalized image-space and world-space -- pure
// landmark math, split out for the same testability reason as
// findMotionCentroid above. Shoulder width (not wrist separation, which
// the old edge-detector used) is the scale reference here because
// shoulders are visible in effectively every exercise this tracks, unlike
// wrist separation, which is near zero for a close two-handed grip (a
// kettlebell handle, a single dumbbell) and would make the conversion
// wildly unstable exactly when it's needed for those implements. Returns
// null when the shoulders aren't both confidently visible or are too
// close together in-frame to trust (an oblique camera angle).
export function shoulderPixelsPerMeter(
  landmarks: NormalizedLandmark[],
  worldLandmarks: Landmark[],
  workingWidth: number,
  workingHeight: number,
): number | null {
  const lShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const lShoulderWorld = worldLandmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rShoulderWorld = worldLandmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  if (!visible(lShoulder) || !visible(rShoulder) || !lShoulderWorld || !rShoulderWorld) return null;

  const shoulderWorldDist = Math.hypot(
    rShoulderWorld.x - lShoulderWorld.x,
    rShoulderWorld.y - lShoulderWorld.y,
  );
  if (shoulderWorldDist < MIN_SHOULDER_WORLD_DIST) return null;
  const shoulderPixelDist = Math.hypot(
    (rShoulder.x - lShoulder.x) * workingWidth,
    (rShoulder.y - lShoulder.y) * workingHeight,
  );
  const perMeter = shoulderPixelDist / shoulderWorldDist;
  return perMeter > 0 ? perMeter : null;
}

export type ImplementOffset = { x: number; y: number };

// Stateful across frames within one tracked set (keeps the previous
// frame's downscaled grayscale image to diff against) -- one instance per
// tracking session, reset() between sets so a stale previous frame from
// the last rep never gets diffed against the first frame of a new one.
export class ImplementTracker {
  private prevGray: Uint8ClampedArray | null = null;
  private prevWristX = 0;
  private prevWristY = 0;
  private canvas: HTMLCanvasElement | null = null;

  reset(): void {
    this.prevGray = null;
  }

  private getCanvas(): HTMLCanvasElement {
    if (!this.canvas) this.canvas = document.createElement("canvas");
    return this.canvas;
  }

  // wristNormX/Y: the tracked wrist point (or wrist midpoint for a
  // two-handed grip), in normalized [0,1] image-space -- same convention
  // as every landmark elsewhere in this codebase, so callers can pass
  // whatever they already derive the "bar point" from directly. Returns a
  // real-world-meters (x, y) offset to add to that point's world
  // position -- the same contract the old edge-detector had (just now
  // covering x as well as y, since an implement isn't always purely
  // vertically offset from the wrist the way a barbell grip is), or null
  // when no confident implement motion was found this frame (callers
  // should fall back to the plain wrist position).
  track(
    video: HTMLVideoElement,
    wristNormX: number,
    wristNormY: number,
    landmarks: NormalizedLandmark[],
    worldLandmarks: Landmark[],
  ): ImplementOffset | null {
    if (!video.videoWidth || !video.videoHeight) return null;

    let w = WORKING_MAX_DIM;
    let h = Math.round((WORKING_MAX_DIM * video.videoHeight) / video.videoWidth);
    if (h > WORKING_MAX_DIM) {
      h = WORKING_MAX_DIM;
      w = Math.round((WORKING_MAX_DIM * video.videoWidth) / video.videoHeight);
    }
    w = Math.max(1, w);
    h = Math.max(1, h);

    const canvas = this.getCanvas();
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const currGray = new Uint8ClampedArray(w * h);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      currGray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    const wristX = wristNormX * w;
    const wristY = wristNormY * h;

    const prevGray = this.prevGray;
    const prevWristX = this.prevWristX;
    const prevWristY = this.prevWristY;
    // Store this frame as the baseline for the next call before any early
    // return below -- every path from here needs it updated regardless of
    // whether this particular frame yields a confident offset.
    this.prevGray = currGray;
    this.prevWristX = wristX;
    this.prevWristY = wristY;

    if (!prevGray || prevGray.length !== currGray.length) return null;

    const wristSpeed = Math.hypot(wristX - prevWristX, wristY - prevWristY);
    if (wristSpeed < MIN_WRIST_SPEED_PX) return null;

    const centroid = findMotionCentroid(currGray, prevGray, w, h, wristX, wristY);
    if (!centroid) return null;

    const pixelsPerMeter = shoulderPixelsPerMeter(landmarks, worldLandmarks, w, h);
    if (!pixelsPerMeter) return null;

    return {
      x: (centroid.x - wristX) / pixelsPerMeter,
      y: (centroid.y - wristY) / pixelsPerMeter,
    };
  }
}
