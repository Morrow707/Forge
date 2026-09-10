import { describe, it, expect } from "vitest";
import { summarizeTrackedSet } from "./bar-tracking";

/** Five back squats at 74cm, 60fps, optionally bracketed by the rack.
 *
 * The rack half is what a real take actually contains and what the app records: the athlete
 * unracks (the bar rises a few inches off the hooks), walks back, does the set, steps in and
 * sets the bar down again. None of that is a rep, all of it is real tracked motion, and both
 * ends are SLOW -- which is exactly why the existing phantom filter, which only catches phases
 * that are anomalously short in TIME, never saw them.
 *
 * The numbers here are not arbitrary. Scott filmed five reps at 135lb and the app reported six,
 * with a set range of motion of 65.1cm and a mean concentric velocity of 0.51 m/s -- both well
 * under every individual rep in the same set's own breakdown. This trace reproduces that to
 * within a centimetre and 0.03 m/s.
 */
function squatSet(withRack: boolean) {
  const points: { x: number; y: number; z: number; t: number; confidence: number }[] = [];
  const fps = 60;
  let frame = 0;
  const push = (alongM: number) =>
    points.push({ x: 0, y: alongM, z: 0, t: (frame++ / fps) * 1000, confidence: 0.9 });

  const ramp = (from: number, to: number, seconds: number) => {
    const n = Math.round(seconds * fps);
    for (let f = 0; f < n; f++) push(from + (to - from) * (f / n));
  };

  if (withRack) {
    ramp(0, 0.12, 1.5); // unrack
    ramp(0.12, 0.12, 1.0); // walk back
    ramp(0.12, 0, 1.0); // settle into the start position
  }
  for (let rep = 0; rep < 5; rep++) {
    ramp(0, -0.74, 1.6); // descend
    ramp(-0.74, 0, 1.0); // drive up
  }
  if (withRack) {
    ramp(0, 0.12, 1.5); // step in and rack
    ramp(0.12, 0.12, 1.0);
  }
  return points;
}

// The axis comes from the bar on a real take (movementAxisFromGrip), which is what puts
// summarizeTrackedSet on its direction-from-displacement path rather than the speed heuristic.
const AXIS = { x: 0, y: 1 };
const summarize = (withRack: boolean) =>
  summarizeTrackedSet(squatSet(withRack), 61, 70, null, [], 1, false, "squat", AXIS)!;

describe("unracking and re-racking are not reps", () => {
  it("counts five reps whether or not the rack is in the trace", () => {
    expect(summarize(false).repBreakdown).toHaveLength(5);
    expect(summarize(true).repBreakdown).toHaveLength(5);
  });

  it("keeps the set's range of motion at the reps' own range, not an average with a walkout", () => {
    const racked = summarize(true);
    expect(racked.romCm).toBeGreaterThan(70);
    // Every rep in the breakdown is a real rep, so none of them is the short one that used to
    // drag this down to 65cm.
    for (const rep of racked.repBreakdown) expect(rep.romCm).toBeGreaterThan(70);
  });

  it("does not let a slow walkout drag the set's mean velocity below its own reps", () => {
    const racked = summarize(true);
    const slowestRep = Math.min(...racked.repBreakdown.map((r) => r.meanVelocityMps));
    expect(racked.meanVelocityMps).toBeGreaterThanOrEqual(slowestRep);
  });

  // The gate is deliberately narrow. A short rep in the MIDDLE of a set is a real rep an
  // athlete should see, not something this file quietly deletes -- under-counting is the worse
  // failure, same stance the duration-based filter already takes.
  it("keeps a shallow rep that is not at either end of the set", () => {
    const points: { x: number; y: number; z: number; t: number; confidence: number }[] = [];
    const fps = 60;
    let frame = 0;
    const push = (alongM: number) =>
      points.push({ x: 0, y: alongM, z: 0, t: (frame++ / fps) * 1000, confidence: 0.9 });
    const ramp = (from: number, to: number, seconds: number) => {
      const n = Math.round(seconds * fps);
      for (let f = 0; f < n; f++) push(from + (to - from) * (f / n));
    };
    const depths = [-0.74, -0.74, -0.3, -0.74, -0.74];
    for (const depth of depths) {
      ramp(0, depth, 1.6);
      ramp(depth, 0, 1.0);
    }
    const metrics = summarizeTrackedSet(points, 61, 70, null, [], 1, false, "squat", AXIS)!;
    expect(metrics.repBreakdown).toHaveLength(5);
  });
});
