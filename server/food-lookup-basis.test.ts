import { describe, it, expect } from "vitest";
import { offBasis, offValue } from "./food-lookup";

// Open Food Facts populates _serving and _100g independently. Falling back
// per nutrient built one entry out of both bases and labelled it with the
// product's serving size: for a 30 g serving the per-100 g figures were more
// than three times too high, and for a 250 g serving well under half.

describe("Open Food Facts values come from one basis", () => {
  it("uses per-serving numbers when the product has them", () => {
    const n = {
      "energy-kcal_serving": 120,
      "energy-kcal_100g": 400,
      proteins_serving: 5,
      proteins_100g: 16.7,
      // Minerals only carry a per-100 g figure, which is the common case.
      calcium_100g: 0.12,
    };
    const basis = offBasis(n);
    expect(basis).toBe("serving");
    expect(offValue(n, "energy-kcal", basis)).toBe(120);
    expect(offValue(n, "proteins", basis)).toBe(5);
    // The mineral is reported as missing rather than silently mixed in at
    // the wrong scale.
    expect(offValue(n, "calcium", basis)).toBeUndefined();
  });

  it("uses per-100 g numbers together when there is no serving data", () => {
    const n = { "energy-kcal_100g": 400, proteins_100g: 16.7, calcium_100g: 0.12 };
    const basis = offBasis(n);
    expect(basis).toBe("100g");
    expect(offValue(n, "energy-kcal", basis)).toBe(400);
    expect(offValue(n, "proteins", basis)).toBe(16.7);
    expect(offValue(n, "calcium", basis)).toBe(0.12);
  });

  it("never reaches across to the other basis", () => {
    const perServing = { "energy-kcal_serving": 120, fat_100g: 9 };
    expect(offValue(perServing, "fat", offBasis(perServing))).toBeUndefined();
    const perHundred = { "energy-kcal_100g": 400, fat_serving: 3 };
    expect(offValue(perHundred, "fat", offBasis(perHundred))).toBeUndefined();
  });
});
