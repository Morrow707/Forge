import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ImplementTracker } from "./implement-tracking";
import { POSE_LANDMARKS } from "./pose-tracking";

/**
 * A DROPPED LOCK HAS TO BE GONE, NOT JUST UNREACHABLE BY THE USUAL ROUTE.
 *
 * ImplementTracker carries its lock as two pairs -- pixel-space, for the search window and the
 * drift check, and world-space, which is what callers actually read. The field declarations say
 * the two are "always cleared together, so one is never briefly stale relative to the other",
 * and dropLock() cleared only the pixel pair.
 *
 * That gap is reachable, and by the most ordinary thing a barbell does. track()'s first branch
 * is the stationary-bar hold: under MIN_WRIST_SPEED_PX of wrist motion there is no new motion to
 * search for, so a lock that is already held is reported again unchanged rather than re-earning
 * its confidence from zero at the start of every rep. That branch is guarded on the WORLD pair
 * being non-null, not the pixel pair -- so after any drop it was still satisfied, by the very
 * position that had just been thrown away.
 *
 * rejectLock() is the case that matters most, because it is the caller saying, in as many words,
 * "this position is implausible, stop dead-reckoning forward from it" (see
 * bar-tracker-dialog.tsx's MAX_PLAUSIBLE_IMPLEMENT_OFFSET_M call site). The very next stationary
 * frame -- lockout, the pause at the bottom of a bench press -- handed it straight back.
 *
 * Everything else about the pipeline meant this cost no metric: lockStreak is reset by the same
 * drop, so confidence() comes out 0 and the caller's position fusion weights the stale point to
 * nothing. But that is an accident of one multiply in another file, not a property of this one,
 * and setImplementDetected() -- which reads the result's existence, not its confidence -- did
 * report the drifted-and-rejected lock as a live detection. A tracker's answer to "where is the
 * implement" should not depend on the caller multiplying it by zero.
 */

const DIM = 160;

/** A 160x160 RGBA frame, uniform grey, with an optional bright block to make motion. */
function frame(block?: { x0: number; y0: number; size: number }): Uint8ClampedArray {
  const data = new Uint8ClampedArray(DIM * DIM * 4);
  if (block) {
    for (let y = block.y0; y < block.y0 + block.size; y++) {
      for (let x = block.x0; x < block.x0 + block.size; x++) {
        const i = (y * DIM + x) * 4;
        data[i] = 220;
        data[i + 1] = 220;
        data[i + 2] = 220;
        data[i + 3] = 255;
      }
    }
  }
  return data;
}

/** What the fake canvas will hand back on the next track() call. */
let currentFrame = frame();

const originalDocument = (globalThis as Record<string, unknown>).document;

beforeEach(() => {
  (globalThis as Record<string, unknown>).document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => {},
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: currentFrame,
          width: w,
          height: h,
        }),
      }),
    }),
  };
});

afterEach(() => {
  (globalThis as Record<string, unknown>).document = originalDocument;
});

const video = { videoWidth: DIM, videoHeight: DIM } as unknown as HTMLVideoElement;

/** Shoulders wide enough and confident enough for shoulderPixelsPerMeter to return a scale. */
function landmarks() {
  const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  lm[POSE_LANDMARKS.LEFT_SHOULDER] = { x: 0.35, y: 0.4, z: 0, visibility: 0.95 };
  lm[POSE_LANDMARKS.RIGHT_SHOULDER] = { x: 0.65, y: 0.4, z: 0, visibility: 0.95 };
  return lm;
}
function worldLandmarks() {
  const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  lm[POSE_LANDMARKS.LEFT_SHOULDER] = { x: -0.2, y: 0, z: 0, visibility: 0.95 };
  lm[POSE_LANDMARKS.RIGHT_SHOULDER] = { x: 0.2, y: 0, z: 0, visibility: 0.95 };
  return lm;
}

function track(tracker: ImplementTracker, wristNormX: number, wristNormY: number) {
  return tracker.track(
    video,
    wristNormX,
    wristNormY,
    landmarks() as never,
    worldLandmarks() as never,
    wristNormX,
    wristNormY,
  );
}

/** Two frames that establish a real lock: a baseline, then motion under a wrist that moved. */
function establishLock(tracker: ImplementTracker): ReturnType<ImplementTracker["track"]> {
  currentFrame = frame();
  expect(track(tracker, 0.4, 0.5)).toBeNull(); // no previous frame yet -- baseline only
  currentFrame = frame({ x0: 77, y0: 77, size: 8 });
  return track(tracker, 0.5, 0.5);
}

describe("a lock that was dropped is not reported again by the stationary-bar hold", () => {
  it("establishes a lock at all, so the rest of this file is testing something", () => {
    const tracker = new ImplementTracker();
    const locked = establishLock(tracker);
    expect(locked).not.toBeNull();
  });

  it("holds a lock that is still held when the bar stops moving", () => {
    // The behaviour the hold exists for, asserted first so the fix below cannot be mistaken for
    // "stop holding stationary locks" -- that would put the confidence ramp back at the start of
    // every single rep, which is what the hold was added to stop.
    const tracker = new ImplementTracker();
    const locked = establishLock(tracker)!;
    const held = track(tracker, 0.5, 0.5); // wrist did not move: the stationary branch
    expect(held).not.toBeNull();
    expect(held!.worldX).toBeCloseTo(locked.worldX, 10);
    expect(held!.worldY).toBeCloseTo(locked.worldY, 10);
  });

  it("reports nothing after rejectLock(), even on a frame where the bar sat still", () => {
    // THE BUG. The caller has just said this position is implausible. A stationary frame must
    // not hand it back.
    const tracker = new ImplementTracker();
    expect(establishLock(tracker)).not.toBeNull();
    tracker.rejectLock();
    expect(track(tracker, 0.5, 0.5)).toBeNull();
  });

  it("reports nothing after a failed search, on the stationary frame that follows", () => {
    // The same hole reached by the other route: a frame whose motion search turns up nothing
    // drops the lock too, and the next stationary frame must not resurrect it.
    const tracker = new ImplementTracker();
    expect(establishLock(tracker)).not.toBeNull();
    // Same pixels as the last frame -- the wrist moved but nothing in the image changed, so the
    // motion search has nothing to find and the lock is dropped.
    expect(track(tracker, 0.6, 0.5)).toBeNull();
    expect(track(tracker, 0.6, 0.5)).toBeNull();
  });

  it("still reports nothing before any lock has ever been established", () => {
    const tracker = new ImplementTracker();
    currentFrame = frame();
    expect(track(tracker, 0.5, 0.5)).toBeNull();
    expect(track(tracker, 0.5, 0.5)).toBeNull();
  });

  it("forgets the lock across reset(), which is what separates one set from the next", () => {
    const tracker = new ImplementTracker();
    expect(establishLock(tracker)).not.toBeNull();
    tracker.reset();
    expect(track(tracker, 0.5, 0.5)).toBeNull();
  });
});
