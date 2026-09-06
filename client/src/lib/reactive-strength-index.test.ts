import { describe, it, expect } from "vitest";
import { bestReactiveStrengthIndex } from "./jump-tracking";

describe("reactive strength index", () => {
  // The set-level number used to divide the BEST height in the set by the
  // AVERAGE ground contact across the set -- two different reps, crossed in
  // the direction that always flatters the athlete.
  it("does not pair one rep's height with another rep's contact time", () => {
    const reps = [
      // The high jump, off a slow foot: 40cm over 0.40s is an RSI of 1.00.
      { jumpHeightCm: 40, groundContactSeconds: 0.4 },
      // A lower, snappier rebound: 30cm over 0.20s is 1.50, the real best.
      { jumpHeightCm: 30, groundContactSeconds: 0.2 },
    ];
    expect(bestReactiveStrengthIndex(reps)).toBe(1.5);

    // What the old pairing produced: 40cm against the 0.30s average.
    const crossed = Math.round((0.4 / 0.3) * 100) / 100;
    expect(crossed).toBe(1.33);
    // Neither rep actually did that, and it beats the slow rep's own 1.00.
    expect(crossed).toBeGreaterThan(1.0);
  });

  it("ignores a rep with no usable contact time rather than guessing one", () => {
    const reps = [
      { jumpHeightCm: 55, groundContactSeconds: null },
      { jumpHeightCm: 30, groundContactSeconds: 0.25 },
    ];
    expect(bestReactiveStrengthIndex(reps)).toBe(1.2);
  });

  it("reports nothing when no rep has a contact time", () => {
    expect(bestReactiveStrengthIndex([{ jumpHeightCm: 45, groundContactSeconds: null }])).toBeNull();
    expect(bestReactiveStrengthIndex([{ jumpHeightCm: 45, groundContactSeconds: 0 }])).toBeNull();
    expect(bestReactiveStrengthIndex([])).toBeNull();
  });
});
