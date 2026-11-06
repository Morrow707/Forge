import { describe, it, expect } from "vitest";
import {
  MAX_SWAY_GAP_SECONDS,
  MIN_SWAY_SAMPLES,
  MIN_SWAY_SECONDS,
  SWAY_THRESHOLDS_FITTED,
  measureSway,
  type SwaySample,
} from "./anvil-sway";

function trace(opts: { n?: number; hz?: number; amp?: number; gapAt?: number; gap?: number } = {}) {
  const { n = 300, hz = 30, amp = 1, gapAt, gap = 0 } = opts;
  const out: SwaySample[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    if (gapAt != null && i === gapAt) t += gap;
    out.push({ tSeconds: t, xUnits: amp * Math.sin(i / 7) });
    t += 1 / hz;
  }
  return out;
}

describe("the sway measure is arithmetic on a trace and needs no published constant", () => {
  it("measures a steady stand", () => {
    const r = measureSway(trace());
    expect("measure" in r).toBe(true);
    if ("measure" in r) {
      expect(r.measure.rms).toBeGreaterThan(0);
      expect(r.measure.meanVelocity).toBeGreaterThan(0);
      expect(r.measure.range).toBeGreaterThan(r.measure.rms);
      expect(r.measure.effectiveHz).toBeCloseTo(30, 0);
      expect(r.measure.samples).toBe(300);
    }
  });

  it("scales with the sway it is measuring", () => {
    const a = measureSway(trace({ amp: 1 }));
    const b = measureSway(trace({ amp: 3 }));
    if ("measure" in a && "measure" in b) {
      expect(b.measure.rms / a.measure.rms).toBeCloseTo(3, 1);
      expect(b.measure.range / a.measure.range).toBeCloseTo(3, 1);
    }
  });

  it("separates RMS from velocity, which is why both are reported", () => {
    // Same amplitude, faster correction: RMS is unchanged and velocity is not. A single headline
    // would lose exactly the athlete who holds position by correcting constantly.
    const slow = trace({ amp: 1 });
    const fast: SwaySample[] = slow.map((s, i) => ({
      tSeconds: s.tSeconds,
      xUnits: Math.sin(i / 2),
    }));
    const a = measureSway(slow);
    const b = measureSway(fast);
    if ("measure" in a && "measure" in b) {
      expect(b.measure.meanVelocity).toBeGreaterThan(a.measure.meanVelocity * 2);
      expect(Math.abs(b.measure.rms - a.measure.rms)).toBeLessThan(a.measure.rms * 0.5);
    }
  });

  it("is unaffected by where the athlete stood, only by how much they moved", () => {
    const centred = trace();
    const offset = centred.map((s) => ({ tSeconds: s.tSeconds, xUnits: s.xUnits + 500 }));
    const a = measureSway(centred);
    const b = measureSway(offset);
    if ("measure" in a && "measure" in b) expect(b.measure.rms).toBeCloseTo(a.measure.rms, 9);
  });

  it("states a reason for every way a trace is unusable", () => {
    expect(measureSway(trace({ n: MIN_SWAY_SAMPLES - 1 }))).toEqual({ absent: "too_few_samples" });
    expect(measureSway(trace({ n: 120, hz: 200 }))).toEqual({ absent: "too_short" });
    expect(measureSway(trace({ n: 200, hz: 5 }))).toEqual({ absent: "sampling_too_sparse" });
    expect(
      measureSway(trace({ gapAt: 100, gap: MAX_SWAY_GAP_SECONDS + 0.1 })),
    ).toEqual({ absent: "trace_has_a_hole" });
    expect(measureSway([])).toEqual({ absent: "too_few_samples" });
  });

  it("checks the hole before the rate, because a hole is the more specific answer", () => {
    // A trace with one long hole also has a low effective rate. Reporting "sampling too sparse"
    // would send somebody to look at the camera when the athlete left the frame.
    const t = trace({ n: 300, hz: 30, gapAt: 150, gap: 5 });
    expect(measureSway(t)).toEqual({ absent: "trace_has_a_hole" });
  });

  it("sorts an out-of-order trace rather than reporting a hole that is not there", () => {
    const t = trace();
    const shuffled = [t[5], ...t.slice(0, 5), ...t.slice(6)];
    expect("measure" in measureSway(shuffled)).toBe(true);
  });

  it("has fitted no threshold, and the empty list says so", () => {
    expect(SWAY_THRESHOLDS_FITTED).toEqual([]);
    expect(MIN_SWAY_SECONDS).toBeGreaterThan(0);
  });
});
