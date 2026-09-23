import { describe, it, expect } from "vitest";
import {
  torsoAnchorFrom,
  torsoAnchorIsStable,
  torsoWasAtRest,
  TORSO_ANCHOR_HISTORY,
} from "./bar-tracking";

const still = (n: number) => Array.from({ length: n }, () => ({ x: 0, y: 0 }));
const GRIP = 1;

describe("the torso anchor", () => {
  it("averages every torso point that is visible, and needs at least two", () => {
    expect(torsoAnchorFrom({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 4 }, { x: 2, y: 4 }))
      .toEqual({ x: 1, y: 2 });
    // Shoulders only -- a standing press where the hips are out of frame still gets an anchor.
    expect(torsoAnchorFrom({ x: 0, y: 0 }, { x: 2, y: 0 }, null, null)).toEqual({ x: 1, y: 0 });
    expect(torsoAnchorFrom({ x: 0, y: 0 }, null, null, null)).toBeNull();
  });

  it("passes a frame it cannot judge", () => {
    // No history, or no grip to measure the drift in. A frame overwatch cannot judge PASSES --
    // inverting this reproduces the over-eagerness the whole arbiter exists to cure.
    expect(torsoAnchorIsStable({ x: 99, y: 99 }, [], GRIP)).toBe(true);
    expect(torsoAnchorIsStable({ x: 99, y: 99 }, still(5), null)).toBe(true);
  });

  it("rejects a frame whose torso left where the torso has been", () => {
    expect(torsoAnchorIsStable({ x: 0.05, y: 0 }, still(10), GRIP)).toBe(true);
    expect(torsoAnchorIsStable({ x: 0.9, y: 0 }, still(10), GRIP)).toBe(false);
  });

  it("measures against the MEDIAN, so a run of bad frames cannot become the reference", () => {
    // Four good frames and three that jumped. The median still sits at the good position, so
    // the next jumped frame is still caught -- which is the whole point.
    const history = [...still(4), ...Array.from({ length: 3 }, () => ({ x: 0.9, y: 0 }))];
    expect(torsoAnchorIsStable({ x: 0.9, y: 0 }, history, GRIP)).toBe(false);
  });
});

describe("whether a take's torso was at rest is measured, not declared", () => {
  it("says yes for a lift where only the arms moved", () => {
    // Bench, standing press, curl, shrug, Pendlay row -- the torso sits still, with jitter.
    const anchors = Array.from({ length: 40 }, (_, i) => ({ x: (i % 3) * 0.02, y: 0.01 }));
    expect(torsoWasAtRest(anchors, GRIP)).toBe(true);
  });

  it("says no for a lift where the torso travels, so the check switches itself off", () => {
    // A squat: the torso sweeps up and down through the whole set. Rejecting that movement
    // would reject the lift.
    const anchors = Array.from({ length: 40 }, (_, i) => ({ x: 0, y: Math.sin(i / 3) * 1.5 }));
    expect(torsoWasAtRest(anchors, GRIP)).toBe(false);
  });

  it("is not fooled into switching off by a minority of jumped frames", () => {
    // THIS IS THE CASE THE WHOLE THING EXISTS FOR. A bench take whose pose jumps on a fifth of
    // its frames is still a bench take. A range-based spread would read those jumps as a
    // travelling torso and disable the check exactly when it is needed; the median absolute
    // deviation ignores them.
    const anchors = Array.from({ length: 40 }, (_, i) =>
      i % 5 === 0 ? { x: 2, y: 2 } : { x: 0, y: 0 },
    );
    expect(torsoWasAtRest(anchors, GRIP)).toBe(true);
  });

  it("claims nothing from too few frames, or with no grip to measure in", () => {
    expect(torsoWasAtRest(still(TORSO_ANCHOR_HISTORY - 1), GRIP)).toBe(false);
    expect(torsoWasAtRest(still(40), null)).toBe(false);
  });
});
