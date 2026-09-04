import { describe, it, expect } from "vitest";
import { segmentPhases, segmentPhasesRelative } from "./bar-tracking";

// Builds a trace of `reps` up-down cycles of the given amplitude, with small settling wobble
// before the first rep -- the athlete grabbing the bar, sliding their hands out, back in.
function benchTrace(reps: number, amplitude: number, wobble: number) {
  const out: number[] = [];
  for (let i = 0; i < 3; i++) {
    out.push(0, wobble, 0, -wobble, 0);
  }
  for (let r = 0; r < reps; r++) {
    for (let k = 0; k <= 8; k++) out.push(-amplitude * Math.sin((Math.PI * k) / 8));
  }
  return out;
}

describe("segmentPhasesRelative", () => {
  // The real failure: 11 bench reps reported as 18, because a 4x-inflated scale let ordinary
  // settling wobble clear the absolute 20cm gate.
  it("counts reps in pixel-space, where an absolute centimetre gate is meaningless", () => {
    // Amplitude 0.05 in whatever unit the pipeline happens to be in. An absolute 0.2 gate
    // cannot resolve reps at this scale at all; a relative one does not care about the unit.
    // segmentPhases yields one entry per HALF rep (down, then up), so 11 reps is ~22.
    const trace = benchTrace(11, 0.05, 0.004);
    expect(segmentPhases(trace, 0.2).length).toBeLessThan(3);
    const phases = segmentPhasesRelative(trace);
    expect(phases).not.toBeNull();
    expect(phases!.length).toBeGreaterThanOrEqual(20);
  });

  it("ignores setup wobble rather than counting it as reps", () => {
    // Not exact equality: the transition out of the wobble region into the first rep is a
    // real, large movement and legitimately bounds one extra phase. What matters is that a
    // dozen settling reversals do not become a dozen reps, which is the reported bug.
    const withWobble = segmentPhasesRelative(benchTrace(10, 1, 0.08))!;
    const withoutWobble = segmentPhasesRelative(benchTrace(10, 1, 0))!;
    expect(Math.abs(withWobble.length - withoutWobble.length)).toBeLessThanOrEqual(1);
  });

  it("gives the same count regardless of the unit the trace is in", () => {
    const small = segmentPhasesRelative(benchTrace(9, 0.4, 0.03))!;
    const large = segmentPhasesRelative(benchTrace(9, 400, 30))!;
    expect(small.length).toBe(large.length);
  });

  it("is not dragged off by a single tracking spike", () => {
    const clean = benchTrace(8, 1, 0.05);
    const spiked = [...clean];
    spiked[Math.floor(spiked.length / 2)] = 40; // one wild frame
    expect(segmentPhasesRelative(spiked)!.length).toBeGreaterThanOrEqual(
      segmentPhasesRelative(clean)!.length - 1,
    );
  });

  it("refuses a take with too few reversals to judge, instead of inventing a gate", () => {
    expect(segmentPhasesRelative([0, 1])).toBeNull();
    expect(segmentPhasesRelative([0, 0, 0, 0, 0])).toBeNull();
    expect(segmentPhasesRelative([])).toBeNull();
  });

  it("leaves the absolute gate alone -- it is still what scaled lifts use", () => {
    // A real squat trace in metres, 0.5m reps, against the shipped 20cm gate.
    const squat = benchTrace(5, 0.5, 0.02);
    expect(segmentPhases(squat, 0.2).length).toBeGreaterThanOrEqual(5);
  });
});
