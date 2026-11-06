import { describe, it, expect } from "vitest";
import {
  LAPSE_THRESHOLD_SIGMAS,
  PART_WEIGHT_ORDER,
  TAPPING_DEAD_BAND_PLACEHOLDER,
  TAPPING_DEAD_BAND_SIGMAS,
  TAPPING_TRIALS,
  countLapses,
  lapseThresholdFor,
  reportedTapCount,
  tappingDeadBand,
  tappingMoved,
} from "./anvil-part-metrics";

describe("part 1's second number is a per-person lapse count", () => {
  it("defines the tail against THIS athlete, never against an imported 355 ms", () => {
    // The whole point of item 6. A fast athlete and a slow one get different thresholds.
    expect(lapseThresholdFor(250, 40)).toBeCloseTo(300, 6);
    expect(lapseThresholdFor(310, 60)).toBeCloseTo(385, 6);
    expect(lapseThresholdFor(250, 40)).not.toBe(355);
  });

  it("holds the multiple the sweep landed on", () => {
    expect(LAPSE_THRESHOLD_SIGMAS).toBe(1.25);
    // The LOWEST k at which separation is at its plateau (2.64 at 1.25 and flat above; 2.44 at
    // 0.75), while damage rises monotonically with k. tools/anvil-sim/items367.py.
  });

  it("counts strictly above the threshold", () => {
    const thr = lapseThresholdFor(250, 40); // 300
    expect(countLapses([299, 300, 301, 500], thr)).toBe(2);
    expect(countLapses([], thr)).toBe(0);
  });

  it("is a TAIL and not a second median", () => {
    // At k = 1.25 a rested athlete lapses on about 4.3 trials of 25. A metric that fires on more
    // than half the trials has stopped describing the tail, which is why k does not go lower
    // even though the ratio keeps improving.
    const trials = Array.from({ length: 25 }, (_, i) => 240 + i * 4); // 240..336
    const n = countLapses(trials, lapseThresholdFor(280, 40)); // threshold 330
    expect(n).toBeLessThan(trials.length / 2);
  });
});

describe("part 4 takes the best of three, which is the opposite of part 1 for the same reason", () => {
  it("reports the best, because a fumble can only make a maximal count lower", () => {
    expect(reportedTapCount([62, 48, 61])).toBe(62);
    // The median would hand back 61 and the mean 57 on a trial the athlete simply fumbled.
    expect(TAPPING_TRIALS).toBe(3);
  });

  it("states a reason rather than a zero when nothing was recorded", () => {
    expect(reportedTapCount([])).toBeNull();
    expect(reportedTapCount([0, -3, Number.NaN])).toBeNull();
  });

  it("uses the athlete's own spread once there is one, and says when it is a placeholder", () => {
    expect(tappingDeadBand(0.04)).toEqual({ band: TAPPING_DEAD_BAND_SIGMAS * 0.04, measured: true });
    expect(tappingDeadBand(null)).toEqual({ band: TAPPING_DEAD_BAND_PLACEHOLDER, measured: false });
    expect(tappingDeadBand(0)).toEqual({ band: TAPPING_DEAD_BAND_PLACEHOLDER, measured: false });
    // `measured: false` is the whole point: 6% was fitted to a simulation's own assumption about
    // a between-day spread nobody has observed, and a caller must be able to tell.
  });

  it("calls a move inside the band no move, in both directions", () => {
    expect(tappingMoved(62, 62, null)).toBe(false);
    expect(tappingMoved(59, 62, null)).toBe(false); // -4.8%, inside 6%
    expect(tappingMoved(57, 62, null)).toBe(true); // -8.1%
    expect(tappingMoved(67, 62, null)).toBe(true); // +8.1%
    expect(tappingMoved(62, 0, null)).toBe(false);
  });

  it("narrows the band for a steady athlete and widens it for a variable one", () => {
    expect(tappingDeadBand(0.02).band).toBeLessThan(TAPPING_DEAD_BAND_PLACEHOLDER);
    expect(tappingDeadBand(0.09).band).toBeGreaterThan(TAPPING_DEAD_BAND_PLACEHOLDER);
  });
});

describe("the part weights are an ORDER, because nothing has been fitted", () => {
  it("puts the practice-resistant headline first and the quantized task last", () => {
    expect(PART_WEIGHT_ORDER[0]).toBe("reaction_time");
    expect(PART_WEIGHT_ORDER[PART_WEIGHT_ORDER.length - 1]).toBe("go_no_go");
  });

  it("ranks tapping below the two with flat practice curves", () => {
    const at = (p: string) => PART_WEIGHT_ORDER.indexOf(p as never);
    expect(at("tapping")).toBeGreaterThan(at("reaction_time"));
    expect(at("tapping")).toBeGreaterThan(at("sequence_span"));
  });

  it("names every part exactly once", () => {
    expect(new Set(PART_WEIGHT_ORDER).size).toBe(PART_WEIGHT_ORDER.length);
    expect(PART_WEIGHT_ORDER.length).toBe(4);
  });
});
