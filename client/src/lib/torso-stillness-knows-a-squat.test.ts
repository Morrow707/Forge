import { describe, expect, it } from "vitest";
import {
  TORSO_EXCURSION_MIN_FRAMES,
  torsoLongestExcursionFrames,
  torsoWasAtRest,
} from "./bar-tracking";

// THE "TORSO HELD STILL" CHECK WAS DELETING THE BOTTOM OF EVERY SQUAT. Scott's 2026-09-28
// back squat: torsoStillThisTake TRUE, 94 frames thrown out as "jumped pose", spread 0.093
// grips -- because the typical frame of a squat set is the athlete standing. See
// torsoWasAtRest.

const GRIP = 0.6;

function squat(reps: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < 40; i++) out.push({ x: 0, y: 0 }); // standing, most of the take
    for (let i = 0; i < 30; i++) out.push({ x: 0, y: 0.6 * Math.sin((i / 30) * Math.PI) }); // down and up
  }
  for (let i = 0; i < 60; i++) out.push({ x: 0, y: 0 });
  return out;
}

describe("torso stillness knows a squat when it sees one", () => {
  it("does not call a paused squat still, even though the typical frame is standing", () => {
    const anchors = squat(5);
    expect(torsoLongestExcursionFrames(anchors, GRIP)!).toBeGreaterThanOrEqual(TORSO_EXCURSION_MIN_FRAMES);
    expect(torsoWasAtRest(anchors, GRIP)).toBe(false);
  });

  it("still calls a bench with a few jumped frames still", () => {
    const anchors = Array.from({ length: 300 }, () => ({ x: 0, y: 0 }));
    // A landmark that jumps for two frames at a time, several times.
    for (const i of [40, 41, 120, 121, 200, 201]) anchors[i] = { x: 2, y: 2 };
    expect(torsoLongestExcursionFrames(anchors, GRIP)).toBe(2);
    expect(torsoWasAtRest(anchors, GRIP)).toBe(true);
  });

  it("never treats a movement that travels by definition as still", () => {
    const still = Array.from({ length: 300 }, () => ({ x: 0, y: 0 }));
    expect(torsoWasAtRest(still, GRIP, "Squat")).toBe(false);
    expect(torsoWasAtRest(still, GRIP, "Hinge")).toBe(false);
    expect(torsoWasAtRest(still, GRIP, "Push")).toBe(true);
  });
});
