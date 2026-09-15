import { describe, it, expect } from "vitest";
import { implausibleBarPathDeviation } from "./bar-tracking";

// A 75in athlete, which is the one the stored capture corpus is drawn from.
const HEIGHT_IN = 75;

describe("implausibleBarPathDeviation", () => {
  // The readings that prompted this. Range of motion had a plausibility gate and deviation had
  // none, so a take could be rejected for travelling too far up while being accepted reporting
  // that the bar wandered a metre sideways.
  it.each([108, 78])("rejects a %icm drift as a scale failure", (deviationCm) => {
    const problem = implausibleBarPathDeviation(deviationCm, HEIGHT_IN, "horizontal_press_or_row");
    expect(problem).not.toBeNull();
    expect(problem).toContain("scale was misread");
  });

  // The worst a genuine take in the corpus produced: 23.5cm on a back squat, 17cm on a box jump.
  // A gate that rejects those would be deleting real lifting, which is the failure that matters
  // more -- bad bar path is something the athlete needs to SEE, not something to withhold.
  it.each([23.5, 17])("leaves a genuine %icm drift alone", (deviationCm) => {
    expect(implausibleBarPathDeviation(deviationCm, HEIGHT_IN, "squat")).toBeNull();
  });

  // The Olympic lifts loop the bar around the knees on purpose, so a deviation that would be
  // alarming on a squat is the correct shape there.
  it("holds the Olympic lifts to a looser limit than a squat", () => {
    const deviationCm = 50;
    expect(implausibleBarPathDeviation(deviationCm, HEIGHT_IN, "squat")).not.toBeNull();
    expect(implausibleBarPathDeviation(deviationCm, HEIGHT_IN, "olympic")).toBeNull();
  });

  // Unlike range of motion there is no floor: a deviation near zero is a perfect rep, not
  // evidence of a bad scale.
  it("never objects to a small deviation", () => {
    for (const deviationCm of [0, 0.4, 2, 9]) {
      expect(implausibleBarPathDeviation(deviationCm, HEIGHT_IN, "squat")).toBeNull();
    }
  });

  it("declines to judge without a height or a deviation", () => {
    expect(implausibleBarPathDeviation(200, null, "squat")).toBeNull();
    expect(implausibleBarPathDeviation(null, HEIGHT_IN, "squat")).toBeNull();
    expect(implausibleBarPathDeviation(NaN, HEIGHT_IN, "squat")).toBeNull();
  });
});
