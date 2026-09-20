import { describe, it, expect } from "vitest";
import {
  alignableReps,
  clampTime,
  driftToleranceSeconds,
  estimateFps,
  frameStepSeconds,
  leftToRight,
  linkedTime,
  marksForRep,
  rightToLeft,
  sidesToDrive,
  stepFrame,
  swapMarks,
} from "./video-sync";

/** THE COMPARE TOOL'S TIME MODEL, PINNED.
 *
 * One offset relates the two clips: tRight = tLeft - syncL + syncR. Everything else here --
 * rep alignment, stepping, drift correction -- is expressed in terms of it, so a saved review
 * (Phase 2) that stores two marks and a timeline can reproduce both positions exactly.
 */
describe("video-sync: the offset", () => {
  it("default marks mean the clips start together", () => {
    expect(leftToRight(3.5, { syncL: 0, syncR: 0 })).toBe(3.5);
    expect(rightToLeft(3.5, { syncL: 0, syncR: 0 })).toBe(3.5);
  });

  it("tRight = tLeft - syncL + syncR, and the inverse is exact", () => {
    const marks = { syncL: 2.0, syncR: 5.5 };
    expect(leftToRight(2.0, marks)).toBe(5.5);
    expect(leftToRight(3.0, marks)).toBe(6.5);
    expect(rightToLeft(6.5, marks)).toBe(3.0);
    expect(rightToLeft(leftToRight(4.25, marks), marks)).toBeCloseTo(4.25, 10);
  });

  it("linkedTime picks the direction from the master side", () => {
    const marks = { syncL: 1, syncR: 4 };
    expect(linkedTime("left", 1, marks)).toBe(4);
    expect(linkedTime("right", 4, marks)).toBe(1);
  });

  it("swapping the sides inverts the offset", () => {
    const marks = { syncL: 1, syncR: 4 };
    const swapped = swapMarks(marks);
    expect(leftToRight(4, swapped)).toBe(1);
  });
});

describe("video-sync: clamping at the clip ends", () => {
  it("never seeks before zero or past the end", () => {
    expect(clampTime(-2, 10)).toBe(0);
    expect(clampTime(12, 10)).toBe(10);
    expect(clampTime(5, 10)).toBe(5);
  });

  it("clamps only at zero while the duration is unknown, so an early seek is not thrown away", () => {
    expect(clampTime(7, NaN)).toBe(7);
    expect(clampTime(7, 0)).toBe(7);
    expect(clampTime(7, undefined)).toBe(7);
    expect(clampTime(-1, undefined)).toBe(0);
  });

  it("a linked time past the follower's end parks the follower on its last frame", () => {
    const marks = { syncL: 0, syncR: 8 };
    expect(leftToRight(5, marks, 10)).toBe(10);
    expect(rightToLeft(0, { syncL: 3, syncR: 0 }, 10)).toBe(3);
    expect(rightToLeft(0, { syncL: 0, syncR: 3 }, 10)).toBe(0);
  });

  it("a non-finite time reads as the start", () => {
    expect(clampTime(NaN, 10)).toBe(0);
  });
});

describe("video-sync: rep alignment", () => {
  const left = [
    { repNumber: 1, startT: 1.2, endT: 2.0 },
    { repNumber: 2, startT: 3.1, endT: 3.9 },
  ];
  const right = [
    { repNumber: 1, startT: 0.4, endT: 1.3 },
    { repNumber: 2, startT: 2.2, endT: 3.0 },
    { repNumber: 3, startT: 4.0, endT: 4.9 },
  ];

  it("sets both marks to that rep's start on its own side", () => {
    expect(marksForRep(left, right, 2)).toEqual({ syncL: 3.1, syncR: 2.2 });
    expect(leftToRight(3.1, marksForRep(left, right, 2)!)).toBeCloseTo(2.2, 10);
  });

  it("refuses to half-align when either side lacks the rep", () => {
    expect(marksForRep(left, right, 3)).toBeNull();
    expect(marksForRep(null, right, 1)).toBeNull();
    expect(marksForRep(left, undefined, 1)).toBeNull();
  });

  it("offers only the reps both sides have", () => {
    expect(alignableReps(left, right)).toEqual([1, 2]);
    expect(alignableReps(left, null)).toEqual([]);
    expect(alignableReps([], right)).toEqual([]);
  });
});

describe("video-sync: frame stepping and speed", () => {
  it("defaults to 1/30 s and uses the real rate when known", () => {
    expect(frameStepSeconds(null)).toBeCloseTo(1 / 30, 10);
    expect(frameStepSeconds(undefined)).toBeCloseTo(1 / 30, 10);
    expect(frameStepSeconds(0)).toBeCloseTo(1 / 30, 10);
    expect(frameStepSeconds(60)).toBeCloseTo(1 / 60, 10);
  });

  it("steps land on frame boundaries and never leave the clip", () => {
    expect(stepFrame(0, -1, 30, 10)).toBe(0);
    expect(stepFrame(10, 1, 30, 10)).toBe(10);
    expect(stepFrame(1, 1, 30, 10)).toBeCloseTo(1 + 1 / 30, 5);
    // Ten forward steps from an off-grid start still amount to ten frames.
    let t = 0.011;
    for (let i = 0; i < 10; i++) t = stepFrame(t, 1, 30, 10);
    expect(Math.round(t * 30)).toBe(10);
    // Back off the grid the same way.
    for (let i = 0; i < 10; i++) t = stepFrame(t, -1, 30, 10);
    expect(t).toBe(0);
  });

  it("estimates the frame rate from requestVideoFrameCallback metadata, or declines", () => {
    expect(estimateFps({ presentedFrames: 0, mediaTime: 0 }, { presentedFrames: 60, mediaTime: 1 })).toBeCloseTo(60, 5);
    expect(estimateFps({ presentedFrames: 0, mediaTime: 0 }, { presentedFrames: 3, mediaTime: 0.1 })).toBeNull();
    expect(estimateFps({ presentedFrames: 0, mediaTime: 0 }, { presentedFrames: 30, mediaTime: 0 })).toBeNull();
    expect(estimateFps({ presentedFrames: 0, mediaTime: 0 }, { presentedFrames: 3000, mediaTime: 1 })).toBeNull();
  });

  it("speed scales the drift tolerance, not the offset", () => {
    const marks = { syncL: 1, syncR: 2 };
    // The same clip times relate the same way at every speed: speed never enters the formula.
    expect(leftToRight(4, marks)).toBe(5);
    expect(driftToleranceSeconds(2)).toBeGreaterThan(driftToleranceSeconds(1));
    expect(driftToleranceSeconds(0.1)).toBeCloseTo(driftToleranceSeconds(1), 10);
    expect(driftToleranceSeconds(0.1, 10)).toBeCloseTo(0.1, 10);
  });
});

describe("video-sync: which sides a control drives", () => {
  it("'both' is both, linked or not", () => {
    expect(sidesToDrive("both", true)).toEqual(["left", "right"]);
    expect(sidesToDrive("both", false)).toEqual(["left", "right"]);
  });

  it("an unlinked side drives only itself", () => {
    expect(sidesToDrive("left", false)).toEqual(["left"]);
    expect(sidesToDrive("right", false)).toEqual(["right"]);
  });

  it("a linked side drives itself first and the other follows", () => {
    expect(sidesToDrive("left", true)).toEqual(["left", "right"]);
    expect(sidesToDrive("right", true)).toEqual(["right", "left"]);
  });
});
