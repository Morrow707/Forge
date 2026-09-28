import { describe, it, expect } from "vitest";
import { replayCapture, type StoredCapture } from "./capture-replay";
import capture from "./__fixtures__/bench-unrack-capture.json";

// A REAL BENCH SET, WITH A BAR SENSOR'S ANSWER BESIDE IT.
//
// Scott's bench press, 2026-09-22, 135lb x 10, filmed while an OVR bar sensor recorded the same
// set. The sensor found ten reps at a mean 0.75 m/s and a 14.7in ROM. The segmenter found
// ELEVEN: the un-rack and the settle before rep 1 read as a reversal, and that phase ran 6.4s
// against a set median concentric of 1.03s, with every genuine rep between 0.83s and 1.97s.
//
// The long-duration test existed but only ran on the first and last phase of a set. This
// artifact is not at an edge once the un-rack has been split off, which is why it survived.
// See isOverlongPhantom in bar-tracking.ts.
const stored = capture as StoredCapture[];

describe("a phase far longer than the set's own reps is not a rep", () => {
  // NINE, NOT TEN, AND TEN WAS THE WRONG ANSWER ARRIVED AT BY ACCIDENT.
  //
  // This pinned 10 to match the sensor. Read rep by rep, the ten were the UN-RACK at 2.1-4.0s
  // (a 0.13s "concentric" seven seconds before the set) plus nine real reps -- and the tenth
  // real rep is inside a 1.1-second hole in the trace at 18.4-19.5s where the tracker lost the
  // bar entirely. Once the concentric window stopped starting on the un-rack's wobble (see
  // trimPhaseToTravel), the un-rack fell to the duration filter it always should have, and the
  // count became the honest nine. Counting a phantom to cover a dropout is exactly the kind of
  // right-by-luck this file exists to remove. The dropout is a tracking problem, recorded as
  // one; it is not this segmenter's to paper over.
  it("lands on the nine reps the tracker actually saw, and no phantom", () => {
    const result = replayCapture(stored[0]);
    expect(result.repCount).toBe(9);
    const reps = result.metrics!.repBreakdown;
    // Every rep sits inside the set, none before it: the un-rack is gone.
    expect(Math.min(...reps.map((r) => r.startT))).toBeGreaterThan(10_000);
  });

  // The un-rack is the phase being removed, so it must not still be sitting in the breakdown
  // under another name -- a rep count that comes out right while the first rep's window still
  // covers six seconds of setup drags every set-level mean with it.
  it("leaves no rep spanning several times the set's median", () => {
    const reps = replayCapture(stored[0]).metrics!.repBreakdown;
    const durations = reps.map((r) => r.concentricSeconds).sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)];
    expect(median).toBeGreaterThan(0);
    expect(Math.max(...durations)).toBeLessThan(median * 2.5);
  });
});
