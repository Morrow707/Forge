import { describe, it, expect } from "vitest";
import { summarizeKbSwingSet, MAX_PLAUSIBLE_KB_SWING_SPEED_MPS } from "./kb-swing-tracking";
import type { TrackedPoint } from "./bar-tracking";

// The five capture modes that had no MovementProfile at all until now -- golf_swing,
// baseball_swing, med_ball, kb_swing, horizontal_load -- scored against constants nobody
// could touch. These cover the contract the plumbing has to keep: a profile's value wins,
// an absent or null field falls back to the file's own default, and the fallback is per
// field so tuning one threshold never silently resets another.
//
// Deliberately about the WIRING, not about which numbers are right. Every threshold in
// this pipeline is uncalibrated (see docs/camera-tracking-notes.md) -- asserting that 8
// m/s is the correct ceiling for a kettlebell would be asserting against a guess.

/** A clean two-rep swing arc: the wrist midpoint rising and falling through ~60cm, at a
 * speed well inside every ceiling under test, so nothing is filtered for being implausible
 * and only the amplitude floor decides how many reps come back. */
function swingArc(amplitudeM: number, reps: number): TrackedPoint[] {
  const points: TrackedPoint[] = [];
  const samplesPerRep = 30;
  for (let rep = 0; rep < reps; rep++) {
    for (let i = 0; i < samplesPerRep; i++) {
      const phase = (i / samplesPerRep) * Math.PI * 2;
      points.push({
        t: (rep * samplesPerRep + i) * 33,
        x: 0,
        y: (amplitudeM / 2) * (1 - Math.cos(phase)),
        z: 0,
        confidence: 1,
      });
    }
  }
  return points;
}

describe("kb_swing thresholds come from the profile when one is applied", () => {
  it("stops segmenting short swings into reps once the profile raises the floor above them", () => {
    // Three 14cm swings: over the 12cm built-in floor, under a profile that raises it to 25.
    const shortSwings = swingArc(0.14, 3);

    const withDefaults = summarizeKbSwingSet(shortSwings);
    expect(withDefaults?.repBreakdown.length).toBe(3);

    // Not zero: with every individual swing under the floor, segmentPhases still returns one
    // phase spanning the trace rather than nothing at all. What matters -- and what the
    // profile controls -- is that three separate swings stop being counted as three reps.
    const withRaisedFloor = summarizeKbSwingSet(shortSwings, null, { minRepAmplitudeCm: 25 });
    expect(withRaisedFloor?.repBreakdown.length).toBe(1);
  });

  it("caps reported speed at the profile's ceiling instead of the built-in one", () => {
    const fast = swingArc(0.6, 2);
    const withDefaults = summarizeKbSwingSet(fast);
    expect(withDefaults).not.toBeNull();
    expect(withDefaults!.peakSpeedMps).toBeLessThanOrEqual(MAX_PLAUSIBLE_KB_SWING_SPEED_MPS);

    // A ceiling far below anything in this trace has to bite: every sample above it is
    // discarded as noise, so the reported peak cannot exceed it.
    const withLowCeiling = summarizeKbSwingSet(fast, null, { maxPlausibleSpeedMps: 0.5 });
    expect(withLowCeiling).not.toBeNull();
    expect(withLowCeiling!.peakSpeedMps).toBeLessThanOrEqual(0.5);
  });

  it("falls back per field -- setting only the ceiling leaves the amplitude floor alone", () => {
    const shortSwings = swingArc(0.14, 3);
    const speedOnly = summarizeKbSwingSet(shortSwings, null, { maxPlausibleSpeedMps: 9 });
    const baseline = summarizeKbSwingSet(shortSwings);
    expect(speedOnly?.repBreakdown.length).toBe(baseline?.repBreakdown.length);
  });

  it("treats an explicit null the same as an absent field", () => {
    const swings = swingArc(0.5, 2);
    const withNulls = summarizeKbSwingSet(swings, null, {
      maxPlausibleSpeedMps: null,
      minRepAmplitudeCm: null,
    });
    const baseline = summarizeKbSwingSet(swings);
    expect(withNulls?.peakSpeedMps).toBe(baseline?.peakSpeedMps);
    expect(withNulls?.repBreakdown.length).toBe(baseline?.repBreakdown.length);
  });
});
