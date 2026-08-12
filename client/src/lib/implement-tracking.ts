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
//
// Once it has a lock on the implement, ImplementTracker follows the
// implement's OWN frame-to-frame motion -- each new search centers on
// where IT last found the implement, not on the current wrist reading, and
// a successful match advances its own tracked world position by the
// motion it itself just measured. The wrist only feeds in at the moment a
// lock is (re)acquired, as a seed/anchor -- never on a frame where a lock
// is already held. That's deliberate: a per-frame "wrist plus a local
// offset" design (the previous version of this file) means noise in the
// wrist estimate passes straight through to the reported position every
// single frame, correction or not. Tracking the implement's own trajectory
// once locked means it isn't limited by wrist accuracy anymore -- it's an
// independent second signal, not a decoration on the first one. The two
// still don't compete, though: bar-tracker-dialog.tsx fuses this tracker's
// own confidence (how long the current lock has held) against the wrist's
// own visibility score every frame, so both have a real, continuous say in
// the final tracked point rather than one silently overriding the other.
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

// How many consecutive locked frames it takes for the tracker's own
// confidence to ramp from a fresh (re)acquisition up to fully trusted.
// Now that a stationary pause holds the existing lock instead of dropping
// it (see the MIN_WRIST_SPEED_PX branch in track() below), a genuine
// (re)acquisition is a rarer event than it used to be -- normally just
// once, at the very start of a set, plus the occasional real tracking
// loss (an arm crossing the bar, a misdetected frame), rather than at the
// top/bottom of every single rep. That's what makes it safe to keep this
// short: 3 frames is enough that one or two lucky matches right after a
// reacquire can't immediately outweigh the wrist, without dragging out
// full confidence for the whole rest of a rep the way a longer ramp would.
const LOCK_RAMP_FRAMES = 3;

// How far (working-resolution pixels) a held lock is allowed to drift from
// the CURRENT wrist reading before it's no longer trusted as "still the
// same implement" and has to reacquire fresh from the wrist instead.
// Generous enough to cover an implement that hangs or swings some real
// distance from the hand (a kettlebell, a med ball at the chest), tight
// enough that a lock can't wander clear across the frame onto some
// unrelated moving object and stay stuck there.
const MAX_LOCK_DRIFT_FRACTION = 0.45;

export type BarTrackResult = {
  // World-space position the tracker itself is reporting this frame, in
  // the same raw (hip-centered, not yet vertical-sign-corrected)
  // convention deriveBarPoint's own output uses -- callers combine this
  // with the wrist's own reading, not substitute it wholesale, so it needs
  // to already be directly comparable/addable, not a delta.
  worldX: number;
  worldY: number;
  // 0-1, ramping up over LOCK_RAMP_FRAMES of continuous, unbroken lock on
  // what this tracker believes is the same object -- the caller's cue for
  // how much weight to give worldX/Y against the wrist's own reading, not
  // a hard yes/no gate. Starts low right after a (re)acquisition (see the
  // header comment above for why that's the one point the wrist
  // contributes) and climbs back to 1 the longer the lock holds unbroken.
  confidence: number;
};

// Stateful across frames within one tracked set (keeps the previous
// frame's downscaled grayscale image to diff against, plus wherever it
// currently believes the implement is) -- one instance per tracking
// session, reset() between sets so a stale previous frame or lock from the
// last rep never carries into the first frame of a new one.
export class ImplementTracker {
  private prevGray: Uint8ClampedArray | null = null;
  private prevWristX = 0;
  private prevWristY = 0;
  private canvas: HTMLCanvasElement | null = null;
  // The tracker's own running lock -- once set, each new frame's motion
  // search centers HERE instead of on the wrist, and a successful match
  // advances lockWorldX/Y by the motion THIS search measured (not by
  // re-reading the wrist), so a held lock follows the implement's own
  // trajectory rather than the pose model's per-frame wrist estimate.
  // Pixel-space (for the search window and the drift check) and
  // world-space (what callers actually want) are carried together and
  // always cleared together, so one is never briefly stale relative to
  // the other.
  private lockPixelX: number | null = null;
  private lockPixelY: number | null = null;
  private lockWorldX: number | null = null;
  private lockWorldY: number | null = null;
  private lockStreak = 0;

  reset(): void {
    this.prevGray = null;
    this.lockPixelX = null;
    this.lockPixelY = null;
    this.lockWorldX = null;
    this.lockWorldY = null;
    this.lockStreak = 0;
  }

  private getCanvas(): HTMLCanvasElement {
    if (!this.canvas) this.canvas = document.createElement("canvas");
    return this.canvas;
  }

  private dropLock(): void {
    this.lockPixelX = null;
    this.lockPixelY = null;
    this.lockStreak = 0;
  }

  // wristNormX/Y: the tracked wrist point (or wrist midpoint for a
  // two-handed grip), in normalized [0,1] image-space -- same convention
  // as every landmark elsewhere in this codebase. wristWorldX/Y: that same
  // point's real-world position (deriveBarPoint's own raw x/y, before
  // vertical-sign correction) -- used ONLY to seed or reacquire a lock,
  // never blended in on a frame where a lock is already held, so wrist
  // noise can't leak into an established, independently-tracked position.
  // Returns null when no confident implement motion was found this frame
  // (callers should fall back to the wrist position entirely, same as
  // before).
  track(
    video: HTMLVideoElement,
    wristNormX: number,
    wristNormY: number,
    landmarks: NormalizedLandmark[],
    worldLandmarks: Landmark[],
    wristWorldX: number,
    wristWorldY: number,
  ): BarTrackResult | null {
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
    // whether this particular frame yields a confident result.
    this.prevGray = currGray;
    this.prevWristX = wristX;
    this.prevWristY = wristY;

    if (!prevGray || prevGray.length !== currGray.length) {
      this.dropLock();
      return null;
    }

    const wristSpeed = Math.hypot(wristX - prevWristX, wristY - prevWristY);
    if (wristSpeed < MIN_WRIST_SPEED_PX) {
      // A stationary bar (top of a squat, bottom of a paused bench press,
      // any dead-still moment between reps) hasn't gone anywhere -- there's
      // no new motion to search for, but also no reason to believe an
      // already-held lock is suddenly wrong. Dropping it here (the
      // previous behavior) meant every single rep re-earned its confidence
      // from zero the instant it started moving again, even though nothing
      // was ever actually lost -- the practical effect was the SAME brief
      // dip in tracked precision repeating at the start of every rep, not
      // just the first. Hold the lock's position and confidence exactly as
      // they were instead; only a frame that actually FAILS to reacquire
      // below (no lock ever established, or a real search that turns up
      // nothing) drops it. A lock that was never established yet has
      // nothing to hold, so this still reports null before the first real
      // acquisition of the set.
      if (this.lockWorldX != null && this.lockWorldY != null) {
        return {
          worldX: this.lockWorldX,
          worldY: this.lockWorldY,
          confidence: Math.min(1, this.lockStreak / LOCK_RAMP_FRAMES),
        };
      }
      return null;
    }

    // Search around the held lock's own last position when it still looks
    // plausible (within MAX_LOCK_DRIFT_FRACTION of the current wrist);
    // otherwise fall back to searching around the wrist itself, which
    // doubles as a fresh acquisition attempt.
    const maxDrift = MAX_LOCK_DRIFT_FRACTION * Math.min(w, h);
    const hasPlausibleLock =
      this.lockPixelX != null &&
      this.lockPixelY != null &&
      Math.hypot(this.lockPixelX - wristX, this.lockPixelY - wristY) < maxDrift;
    const searchX = hasPlausibleLock ? this.lockPixelX! : wristX;
    const searchY = hasPlausibleLock ? this.lockPixelY! : wristY;

    const centroid = findMotionCentroid(currGray, prevGray, w, h, searchX, searchY);
    if (!centroid) {
      this.dropLock();
      return null;
    }

    const pixelsPerMeter = shoulderPixelsPerMeter(landmarks, worldLandmarks, w, h);
    if (!pixelsPerMeter) {
      this.dropLock();
      return null;
    }

    if (hasPlausibleLock && this.lockWorldX != null && this.lockWorldY != null) {
      // Continuing a held lock: advance by the motion THIS search measured
      // relative to the tracker's own last pixel position, not by
      // re-reading the wrist -- the whole point of a held lock.
      this.lockWorldX += (centroid.x - this.lockPixelX!) / pixelsPerMeter;
      this.lockWorldY += (centroid.y - this.lockPixelY!) / pixelsPerMeter;
      this.lockStreak += 1;
    } else {
      // Fresh acquisition or reacquisition: the one point per lock where
      // the wrist contributes directly, seeding both the pixel and world
      // position so the next frame has something to continue from.
      this.lockWorldX = wristWorldX + (centroid.x - wristX) / pixelsPerMeter;
      this.lockWorldY = wristWorldY + (centroid.y - wristY) / pixelsPerMeter;
      this.lockStreak = 1;
    }
    this.lockPixelX = centroid.x;
    this.lockPixelY = centroid.y;

    return {
      worldX: this.lockWorldX,
      worldY: this.lockWorldY,
      confidence: Math.min(1, this.lockStreak / LOCK_RAMP_FRAMES),
    };
  }
}
