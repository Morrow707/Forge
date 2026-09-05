import { describe, it, expect } from "vitest";
import {
  summarizeTrackedSet,
  toScaleFreeMetrics,
  normalizeTraceScale,
  type TrackedPoint,
} from "./bar-tracking";

// Reps as a triangle wave, each slightly smaller than the last the way a real set fatigues.
//
// The fatigue matters. An earlier version of this fixture made every rep exactly identical,
// which put the segmenter's reversal test exactly on a tie and let floating-point dust decide
// it -- the same set then counted 5 reps at one scale and 7 at another. Real sets are never
// that uniform, but the lesson stands: rep counting is only stable where reps actually differ.
function syntheticSet(repCount: number, amplitude: number, repSeconds = 2): TrackedPoint[] {
  const points: TrackedPoint[] = [];
  const samplesPerRep = 60;
  let t = 0;
  for (let rep = 0; rep < repCount; rep++) {
    const thisRep = amplitude * (1 - rep * 0.04);
    for (let i = 0; i < samplesPerRep; i++) {
      const phase = i / samplesPerRep;
      const y = phase < 0.5 ? phase * 2 * thisRep : (1 - phase) * 2 * thisRep;
      points.push({ t, x: 0, y, z: 0, confidence: 1 });
      t += (repSeconds * 1000) / samplesPerRep;
    }
  }
  return points;
}

function analyse(points: TrackedPoint[]) {
  const metrics = summarizeTrackedSet(
    normalizeTraceScale(points),
    undefined,
    undefined,
    undefined,
    [],
    1,
    true,
  );
  return metrics ? toScaleFreeMetrics(metrics) : null;
}

describe("the scale-free path", () => {
  // The property everything else rests on. With no calibration the trace is in arbitrary units,
  // so nothing reported may change when those units do.
  it("gives the same answer for the same movement across four orders of magnitude", () => {
    const results = [0.02, 0.3, 30, 250].map((amplitude) => analyse(syntheticSet(6, amplitude)));
    for (const r of results) expect(r).not.toBeNull();
    const [first, ...rest] = results.map((r) => r!);
    for (const other of rest) {
      expect(other.repCount).toBe(first.repCount);
      expect(other.concentricSeconds).toBeCloseTo(first.concentricSeconds, 6);
      expect(other.velocityLossPercent).toBe(first.velocityLossPercent);
      expect(other.barPathDriftPercentOfRom).toBe(first.barPathDriftPercentOfRom);
      expect(other.reps.map((x) => x.relativePeakVelocity)).toEqual(
        first.reps.map((x) => x.relativePeakVelocity),
      );
    }
  });

  // Why normalizeTraceScale exists at all. The physics filters cap acceleration and velocity in
  // metres, so on a trace whose numbers happen to be large every frame reads as impossible.
  it("needs the trace normalised first, or the physics filters corrupt it", () => {
    const raw = syntheticSet(6, 250);
    const withoutNormalising = summarizeTrackedSet(raw, undefined, undefined, undefined, [], 1, true);
    const withNormalising = analyse(raw);
    const unnormalisedPeaks = withoutNormalising!.repBreakdown.map((r) => r.peakVelocityMps);
    // Every frame rejected as impossible, so every peak collapses to the same ceiling value.
    expect(new Set(unnormalisedPeaks).size).toBe(1);
    // Normalised, the reps are distinguishable from each other again.
    expect(new Set(withNormalising!.reps.map((r) => r.relativePeakVelocity)).size).toBeGreaterThan(1);
  });

  // The failure this path replaces: an absolute 20cm rep gate applied to a trace with no scale.
  it("counts reps the absolute centimetre gate cannot find", () => {
    const unscaled = syntheticSet(6, 0.02);
    const absolute = summarizeTrackedSet(unscaled, undefined, undefined, undefined, [], 1, false);
    const relative = analyse(unscaled)!;
    expect(absolute?.repBreakdown.length ?? 0).toBeLessThan(relative.repCount);
    expect(relative.repCount).toBeGreaterThanOrEqual(6);
  });

  it("reports the fastest rep as 1 and every other rep below it", () => {
    const relatives = analyse(syntheticSet(5, 1))!.reps.map((r) => r.relativePeakVelocity);
    expect(Math.max(...relatives)).toBe(1);
    for (const r of relatives) expect(r).toBeLessThanOrEqual(1);
  });

  it("keeps timing in real seconds, which never depended on a scale", () => {
    const free = analyse(syntheticSet(4, 0.5, 2))!;
    expect(free.concentricSeconds).toBeGreaterThan(0.2);
    expect(free.concentricSeconds).toBeLessThan(2);
  });

  it("returns null rather than an empty shell when nothing moved", () => {
    const flat: TrackedPoint[] = Array.from({ length: 40 }, (_, i) => ({
      t: i * 33, x: 0, y: 1, z: 0, confidence: 1,
    }));
    expect(analyse(flat)).toBeNull();
  });

  // A number in trace units per second would look like a speed, sort like a speed, and be
  // compared against last week's speed by an athlete with no way to know the units changed.
  it("exposes no field that could be mistaken for a real-world measurement", () => {
    const free = analyse(syntheticSet(3, 1))! as unknown as Record<string, unknown>;
    for (const key of Object.keys(free)) expect(key).not.toMatch(/Mps|Cm$|Watts/);
    const rep = (free.reps as Record<string, unknown>[])[0];
    for (const key of Object.keys(rep)) expect(key).not.toMatch(/Mps$|Cm$|Watts/);
  });
});
