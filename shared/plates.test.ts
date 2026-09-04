import { describe, it, expect } from "vitest";
import { calculatePlateBreakdown, roundToLoadable, buildWarmupRamp, DEFAULT_BAR_WEIGHT } from "./plates";

describe("roundToLoadable", () => {
  it("rounds pounds to the nearest 5", () => {
    expect(roundToLoadable(137, "lbs")).toBe(135);
    expect(roundToLoadable(138, "lbs")).toBe(140);
    expect(roundToLoadable(135, "lbs")).toBe(135);
  });

  it("rounds kilos to the nearest 2.5", () => {
    expect(roundToLoadable(61, "kg")).toBe(60);
    expect(roundToLoadable(61.5, "kg")).toBe(62.5);
    expect(roundToLoadable(62.5, "kg")).toBe(62.5);
  });

  it("rounds a half-step up", () => {
    expect(roundToLoadable(137.5, "lbs")).toBe(140);
    expect(roundToLoadable(61.25, "kg")).toBe(62.5);
  });

  it("handles zero and negative input without inventing weight", () => {
    expect(roundToLoadable(0, "lbs")).toBe(0);
    expect(roundToLoadable(-10, "lbs")).toBe(-10);
  });
});

describe("calculatePlateBreakdown in pounds", () => {
  it("loads a 225 squat as two 45s a side", () => {
    const b = calculatePlateBreakdown(225, "lbs");
    expect(b.plates).toEqual([45, 45]);
    expect(b.perSideWeight).toBe(90);
    expect(b.achievedWeight).toBe(225);
    expect(b.exact).toBe(true);
  });

  it("loads largest-first", () => {
    const b = calculatePlateBreakdown(315, "lbs");
    expect(b.plates).toEqual([45, 45, 45]);
  });

  it("mixes denominations down to the smallest plate", () => {
    const b = calculatePlateBreakdown(140, "lbs");
    // 47.5 a side: 45 + 2.5.
    expect(b.plates).toEqual([45, 2.5]);
    expect(b.achievedWeight).toBe(140);
    expect(b.exact).toBe(true);
  });

  it("returns an empty bar when the target is the bar itself", () => {
    const b = calculatePlateBreakdown(45, "lbs");
    expect(b.plates).toEqual([]);
    expect(b.achievedWeight).toBe(45);
    expect(b.exact).toBe(true);
  });

  it("never returns negative plates for a target under the bar", () => {
    const b = calculatePlateBreakdown(20, "lbs");
    expect(b.plates).toEqual([]);
    expect(b.perSideWeight).toBe(0);
    expect(b.achievedWeight).toBe(45);
    expect(b.exact).toBe(false);
  });

  it("falls back to the closest loadable weight below an unreachable target", () => {
    // 133 needs 44 a side; the plate set cannot hit it exactly.
    const b = calculatePlateBreakdown(133, "lbs");
    expect(b.exact).toBe(false);
    expect(b.achievedWeight).toBeLessThan(133);
    expect(133 - b.achievedWeight).toBeLessThan(5);
  });

  it("honours a custom bar weight", () => {
    const b = calculatePlateBreakdown(125, "lbs", 35);
    expect(b.perSideWeight).toBe(45);
    expect(b.achievedWeight).toBe(125);
    expect(b.exact).toBe(true);
  });

  it("hits every multiple of 5 from the bar up to 500 exactly", () => {
    for (let w = 45; w <= 500; w += 5) {
      const b = calculatePlateBreakdown(w, "lbs");
      expect(b.exact, `${w} lbs should be loadable`).toBe(true);
    }
  });
});

describe("calculatePlateBreakdown in kilos", () => {
  it("loads a 100kg squat off a 20kg bar", () => {
    const b = calculatePlateBreakdown(100, "kg");
    expect(b.plates).toEqual([25, 15]);
    expect(b.achievedWeight).toBe(100);
    expect(b.exact).toBe(true);
  });

  it("uses the 1.25 plate the pound set does not have", () => {
    const b = calculatePlateBreakdown(22.5, "kg");
    expect(b.plates).toEqual([1.25]);
    expect(b.exact).toBe(true);
  });

  it("hits every multiple of 2.5 from the bar up to 250 exactly", () => {
    for (let w = 20; w <= 250; w += 2.5) {
      const b = calculatePlateBreakdown(w, "kg");
      expect(b.exact, `${w} kg should be loadable`).toBe(true);
    }
  });

  it("does not accumulate floating point error across many small plates", () => {
    const b = calculatePlateBreakdown(62.5, "kg");
    expect(b.achievedWeight).toBeCloseTo(62.5, 10);
    expect(b.exact).toBe(true);
  });
});

describe("buildWarmupRamp", () => {
  it("always starts with the empty bar", () => {
    const ramp = buildWarmupRamp(315, "lbs");
    expect(ramp[0]).toEqual({ label: "Bar", weight: 45, reps: "8-10" });
  });

  it("ramps 40, 60 and 80 percent, rounded to loadable weights", () => {
    const ramp = buildWarmupRamp(315, "lbs");
    expect(ramp.map((s) => s.label)).toEqual(["Bar", "40%", "60%", "80%"]);
    expect(ramp.map((s) => s.weight)).toEqual([45, 125, 190, 250]);
  });

  it("ascends monotonically", () => {
    for (const workWeight of [135, 225, 315, 405, 500]) {
      const weights = buildWarmupRamp(workWeight, "lbs").map((s) => s.weight);
      expect(weights).toEqual([...weights].sort((a, b) => a - b));
    }
  });

  it("skips a step that would land at or below the bar", () => {
    // 40% of 95 is 38, which rounds to 40 -- below the 45 bar.
    const ramp = buildWarmupRamp(95, "lbs");
    expect(ramp.map((s) => s.label)).toEqual(["Bar", "60%", "80%"]);
  });

  it("leaves just the bar for a work weight the bar already covers", () => {
    expect(buildWarmupRamp(45, "lbs").map((s) => s.label)).toEqual(["Bar"]);
  });

  it("drops rep counts as the weight climbs", () => {
    const ramp = buildWarmupRamp(315, "lbs");
    expect(ramp.map((s) => s.reps)).toEqual(["8-10", "5", "3", "2"]);
  });

  it("uses the kilo bar by default in kilos", () => {
    expect(buildWarmupRamp(140, "kg")[0].weight).toBe(DEFAULT_BAR_WEIGHT.kg);
  });

  it("honours a custom bar weight for both the first step and the skip rule", () => {
    const ramp = buildWarmupRamp(135, "lbs", 35);
    expect(ramp[0].weight).toBe(35);
    expect(ramp.every((s) => s.weight >= 35)).toBe(true);
  });

  it("produces steps that are all loadable", () => {
    for (const step of buildWarmupRamp(315, "lbs")) {
      expect(calculatePlateBreakdown(step.weight, "lbs").exact).toBe(true);
    }
  });
});
