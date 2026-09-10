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

  // Scott's box jumps: land on the box, step down, square up, go again. The gaps between reps
  // were 2.3 to 4.8 seconds, and dividing by them produced 0.27 -- a number in the ordinary
  // range for an RSI, sitting on a card labelled as one, describing nothing that happened.
  it("reports nothing when the athlete reset between reps instead of rebounding", () => {
    const boxJumps = [
      { jumpHeightCm: 69.9, groundContactSeconds: 4.8 },
      { jumpHeightCm: 65, groundContactSeconds: 2.267 },
      { jumpHeightCm: 70, groundContactSeconds: 2.268 },
      { jumpHeightCm: 68.8, groundContactSeconds: 2.3 },
    ];
    expect(bestReactiveStrengthIndex(boxJumps)).toBeNull();
  });

  it("still reads a real rebound in a set that also contains a reset", () => {
    const reps = [
      // A reset between the first two, then a genuine repeat hop.
      { jumpHeightCm: 40, groundContactSeconds: 3.2 },
      { jumpHeightCm: 30, groundContactSeconds: 0.22 },
    ];
    expect(bestReactiveStrengthIndex(reps)).toBe(1.36);
  });

  // A second is well outside any rebound a coach would call reactive, and generous enough that
  // a slow-but-real one is never thrown away.
  it("keeps a slow rebound and drops the one just past the line", () => {
    expect(bestReactiveStrengthIndex([{ jumpHeightCm: 40, groundContactSeconds: 1.0 }])).toBe(0.4);
    expect(bestReactiveStrengthIndex([{ jumpHeightCm: 40, groundContactSeconds: 1.01 }])).toBeNull();
  });

  it("reports nothing when no rep has a contact time", () => {
    expect(bestReactiveStrengthIndex([{ jumpHeightCm: 45, groundContactSeconds: null }])).toBeNull();
    expect(bestReactiveStrengthIndex([{ jumpHeightCm: 45, groundContactSeconds: 0 }])).toBeNull();
    expect(bestReactiveStrengthIndex([])).toBeNull();
  });
});
