import { describe, expect, it } from "vitest";
import {
  convertWeight,
  parsePrescribedWeight,
  parseProgression,
  composeProgression,
  stripProgression,
} from "./progression";

// A coach programs in whichever unit they think in, per exercise -- the
// builder writes it into the prescription text. The athlete's screen then
// renders a number against THEIR unit, so anything the parser drops here
// comes back as a relabelled lift.

describe("parsePrescribedWeight keeps the coach's unit", () => {
  it("reads a kilogram prescription as kilograms", () => {
    expect(parsePrescribedWeight("100 kg")).toEqual({ value: 100, unit: "kg" });
  });

  it("reads a pound prescription as pounds", () => {
    expect(parsePrescribedWeight("225 lbs")).toEqual({ value: 225, unit: "lbs" });
  });

  it("accepts the singular and spaced-out spellings a coach actually types", () => {
    expect(parsePrescribedWeight("45lb")).toEqual({ value: 45, unit: "lbs" });
    expect(parsePrescribedWeight("  60   kgs")).toEqual({ value: 60, unit: "kg" });
  });

  it("leaves an unlabelled number unlabelled", () => {
    // Not a guess at pounds: unlabelled has always meant the reader's own
    // unit, and inventing one here would change existing prescriptions.
    expect(parsePrescribedWeight("225")).toEqual({ value: 225, unit: null });
  });

  it("handles a decimal and returns null for text with no number", () => {
    expect(parsePrescribedWeight("62.5 kg")).toEqual({ value: 62.5, unit: "kg" });
    expect(parsePrescribedWeight("bodyweight")).toBeNull();
    expect(parsePrescribedWeight("")).toBeNull();
  });
});

describe("convertWeight", () => {
  it("converts kilograms to pounds", () => {
    expect(convertWeight(100, "kg", "lbs")).toBeCloseTo(220.462, 3);
  });

  it("converts pounds to kilograms", () => {
    expect(convertWeight(220.462, "lbs", "kg")).toBeCloseTo(100, 3);
  });

  it("leaves a value alone when the units already match", () => {
    expect(convertWeight(225, "lbs", "lbs")).toBe(225);
  });

  it("leaves an unlabelled value alone", () => {
    expect(convertWeight(225, null, "kg")).toBe(225);
  });

  it("round-trips", () => {
    expect(convertWeight(convertWeight(140, "lbs", "kg"), "kg", "lbs")).toBeCloseTo(140, 6);
  });
});

describe("a progression increment carries its own unit", () => {
  it("keeps kilograms on the increment", () => {
    expect(parseProgression("100 kg +2.5 kg/week")).toEqual({
      baseText: "100 kg",
      amount: 2.5,
      isPercent: false,
      unit: "kg",
    });
  });

  it("keeps pounds on the increment", () => {
    expect(parseProgression("225 lbs +5 lbs/week")).toMatchObject({
      amount: 5,
      isPercent: false,
      unit: "lbs",
    });
  });

  it("treats a percentage as unitless", () => {
    expect(parseProgression("70% 1RM +2%/week")).toMatchObject({
      amount: 2,
      isPercent: true,
      unit: null,
    });
  });

  it("still parses an increment with no unit written", () => {
    // Bare "+5/week" defaults to a percentage, which is the behaviour that
    // already existed and is not what this change is about.
    expect(parseProgression("225 +5/week")).toMatchObject({ amount: 5, unit: null });
  });

  it("round-trips through the builder's own composer", () => {
    const composed = composeProgression("100 kg", 2.5, false, "kg");
    expect(parseProgression(composed)).toMatchObject({ amount: 2.5, unit: "kg" });
    expect(stripProgression(composed)).toBe("100 kg");
  });
});

describe("the whole path: what a lbs athlete sees for a kg prescription", () => {
  it("converts the base rather than relabelling it", () => {
    const parsed = parsePrescribedWeight("100 kg")!;
    // The bug rendered this as "100 lbs" -- the same number, 45% of the lift.
    expect(convertWeight(parsed.value, parsed.unit, "lbs")).toBeCloseTo(220.462, 3);
  });

  it("converts the weekly increment too", () => {
    const p = parseProgression("100 kg +2.5 kg/week")!;
    expect(convertWeight(p.amount, p.unit, "lbs")).toBeCloseTo(5.512, 3);
  });

  it("leaves a kg athlete's own kg prescription untouched", () => {
    const parsed = parsePrescribedWeight("100 kg")!;
    expect(convertWeight(parsed.value, parsed.unit, "kg")).toBe(100);
  });
});
