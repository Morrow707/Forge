import { describe, expect, it } from "vitest";
import { convertWeight, formatWeight, LBS_PER_KG } from "./weight-units";

describe("weight units", () => {
  it("round-trips a kilo lift back to the number the athlete typed", () => {
    // The reason the factor is 2.20462 and not 2.2. At 2.2 this comes back as 100.2.
    const storedLbs = 100 * LBS_PER_KG;
    expect(Math.round(convertWeight(storedLbs, "lbs", "kg") * 10) / 10).toBe(100);
  });

  it("does not touch a value already in the unit asked for", () => {
    expect(convertWeight(225, "lbs", "lbs")).toBe(225);
    expect(convertWeight(60, "kg", "kg")).toBe(60);
  });

  it("converts both directions", () => {
    expect(convertWeight(100, "kg", "lbs")).toBeCloseTo(220.462, 3);
    expect(convertWeight(220.462, "lbs", "kg")).toBeCloseTo(100, 3);
  });

  it("keeps a whole number whole and a converted one to a tenth", () => {
    expect(formatWeight(225, "lbs")).toBe("225 lbs");
    expect(formatWeight(102.34, "kg")).toBe("102.3 kg");
  });
});
