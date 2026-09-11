import { describe, it, expect } from "vitest";
import { convertWeight } from "./progression";

// HISTORY SHOWN IN THE UNIT THE ATHLETE IS READING IN.
//
// The app defaulted to kilograms until recently, so a bench logged today in pounds sat directly
// under "LAST TIME 3 x 10 @ 135 kg" -- same exercise, same number, two units, one screen. Read
// quickly that says the weight is unchanged when it is not: 135kg is 297lb.
//
// The page now converts before it prints. This pins the conversion itself, which is the part a
// rounding change or a swapped argument would break silently.
describe("a stored weight restated in the unit being read", () => {
  const restate = (weight: number, stored: "lbs" | "kg", display: "lbs" | "kg") =>
    Math.round(convertWeight(weight, stored, display) * 10) / 10;

  it("turns the 135 kg row that sat under a 135 lb set into its real weight", () => {
    expect(restate(135, "kg", "lbs")).toBe(297.6);
  });

  it("leaves a row alone when it is already in the unit being read", () => {
    expect(restate(135, "lbs", "lbs")).toBe(135);
    expect(restate(60, "kg", "kg")).toBe(60);
  });

  it("goes the other way for an athlete reading in kilograms", () => {
    expect(restate(135, "lbs", "kg")).toBe(61.2);
  });

  // A conversion that does not round-trip would drift a number every time a unit is toggled.
  it("round-trips", () => {
    expect(restate(restate(225, "lbs", "kg"), "kg", "lbs")).toBeCloseTo(225, 0);
  });
});
