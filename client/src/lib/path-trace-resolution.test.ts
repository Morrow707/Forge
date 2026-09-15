import { describe, it, expect } from "vitest";
import { buildPathTrace, type TrackedPoint } from "./bar-tracking";

// The pose stage runs near 30Hz: a 60fps recording halved by ANALYSIS_SAMPLE_STRIDE.
const POSE_HZ = 30;

function capture(seconds: number): TrackedPoint[] {
  const points: TrackedPoint[] = [];
  const n = Math.round(seconds * POSE_HZ);
  for (let i = 0; i < n; i++) {
    points.push({ t: (i / POSE_HZ) * 1000, x: 0, y: -0.3 * Math.sin((i / POSE_HZ) * Math.PI), z: 0, confidence: 1 });
  }
  return points;
}

const storedHz = (trace: { t: number }[]) =>
  (trace.length - 1) / ((trace[trace.length - 1].t - trace[0].t) / 1000);

describe("what resolution a set keeps of itself", () => {
  // THE OLD CAP MADE A SET'S RECORD COARSER THE LONGER THE SET WAS.
  //
  // At 200 points a 20s set stored 10Hz and a 28s set 7Hz, so the rate depended on clip length
  // rather than on the capture. Replays -- which is where this file's thresholds get calibrated
  // -- were reading a signal three times coarser than the live pipeline analysed.
  it.each([10, 20, 33])("keeps the full pose rate for a %is set", (seconds) => {
    const trace = buildPathTrace(capture(seconds), { x: 0, y: 0 });
    expect(storedHz(trace)).toBeGreaterThan(POSE_HZ * 0.95);
  });

  // A cap still has to exist, and past it the old graceful degradation is the right behaviour --
  // an AMRAP or a long carry gets a coarser record rather than an unbounded one.
  it("still bounds a very long set rather than storing it whole", () => {
    const raw = capture(120);
    const trace = buildPathTrace(raw, { x: 0, y: 0 });
    // The stride is a floor division, so the ceiling is just under twice the target rather than
    // the target itself -- 3600 raw points take stride 3 and come back as 1200. Always been true
    // of this function; the old cap of 200 could return 399 the same way.
    expect(trace.length).toBeLessThan(2000);
    expect(trace.length).toBeLessThan(raw.length / 2);
    expect(storedHz(trace)).toBeGreaterThan(8);
  });

  // Frame presentation times arrive as 2233.3333333333335 -- seventeen characters to place a
  // sample inside a 33ms window. Rounding pays for a third of the extra points.
  it("stores whole milliseconds rather than float noise", () => {
    const trace = buildPathTrace(capture(5), { x: 0, y: 0 });
    for (const p of trace) expect(Number.isInteger(p.t)).toBe(true);
  });

  // Rounding the clock must not move the clock. A whole set's duration has to survive it, or
  // every velocity in the set shifts with it.
  it("does not shift the set's own timeline", () => {
    const raw = capture(20);
    const trace = buildPathTrace(raw, { x: 0, y: 0 });
    const rawDuration = raw[raw.length - 1].t - raw[0].t;
    const storedDuration = trace[trace.length - 1].t - trace[0].t;
    expect(Math.abs(storedDuration - rawDuration)).toBeLessThan(1);
  });

  it("still returns nothing for an empty capture", () => {
    expect(buildPathTrace([], { x: 0, y: 0 })).toEqual([]);
  });
});
