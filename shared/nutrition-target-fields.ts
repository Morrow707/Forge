/* EVERY NUMBER A NUTRITION TARGET CAN HOLD, IN ONE LIST.
 *
 * `nutritionTargets` (shared/schema.ts) holds the macros, water and eight micronutrients, and the
 * targets editor, the food log and the barcode, search and photo-logging paths all carry all of
 * them. The photographed-sheet import (a coach photographs a dietitian's sheet) was the one path
 * with its own shorter, hand-typed list -- calories, protein, carbs, fat, fiber, sodium -- so an
 * iron or vitamin D target written on the sheet was read past and never offered. The import's
 * AI tool, its row schema, its apply route and its review screen all read this list now, and
 * `nutrition-target-fields.test.ts` holds it equal to the table's columns.
 *
 * Kept free of `./schema` on purpose: the review dialog imports it, and the schema module must
 * never enter the client bundle (see schema-constants.ts). */
export const NUTRITION_TARGET_FIELDS = [
  { key: "caloriesKcal", label: "Calories", unit: "kcal", integer: true },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "carbsG", label: "Carbs", unit: "g" },
  { key: "fatG", label: "Fat", unit: "g" },
  { key: "fiberG", label: "Fiber", unit: "g" },
  { key: "waterOz", label: "Water", unit: "oz" },
  { key: "sodiumMg", label: "Sodium", unit: "mg" },
  { key: "calciumMg", label: "Calcium", unit: "mg" },
  { key: "ironMg", label: "Iron", unit: "mg" },
  { key: "vitaminDMcg", label: "Vitamin D", unit: "mcg" },
  { key: "potassiumMg", label: "Potassium", unit: "mg" },
  { key: "magnesiumMg", label: "Magnesium", unit: "mg" },
  { key: "vitaminB12Mcg", label: "Vitamin B12", unit: "mcg" },
  { key: "zincMg", label: "Zinc", unit: "mg" },
] as const;

export type NutritionTargetKey = (typeof NUTRITION_TARGET_FIELDS)[number]["key"];
