import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as light from "./schema-constants";
import * as schema from "./schema";

/** The client-side copies in schema-constants.ts must equal the schema's own. See that file's
 * header for why a copy exists at all. If this fails, one side was edited without the other. */
describe("schema-constants mirrors schema.ts", () => {
  it("MAX_EXPECTED_ATHLETES", () => {
    expect(light.MAX_EXPECTED_ATHLETES).toBe(schema.MAX_EXPECTED_ATHLETES);
  });
  it("nutrition goals and labels", () => {
    expect(light.NUTRITION_GOALS).toEqual(schema.NUTRITION_GOALS);
    expect(light.NUTRITION_GOAL_LABEL).toEqual(schema.NUTRITION_GOAL_LABEL);
  });
  it("food log meals, labels and the default-meal rule", () => {
    expect(light.FOOD_LOG_MEALS).toEqual(schema.FOOD_LOG_MEALS);
    expect(light.FOOD_LOG_MEAL_LABEL).toEqual(schema.FOOD_LOG_MEAL_LABEL);
    for (let h = 0; h < 24; h++) expect(light.suggestedMealForHour(h)).toBe(schema.suggestedMealForHour(h));
  });
  it("periodization phases and labels", () => {
    expect(light.PERIODIZATION_PHASES).toEqual(schema.PERIODIZATION_PHASES);
    expect(light.PERIODIZATION_PHASE_LABEL).toEqual(schema.PERIODIZATION_PHASE_LABEL);
  });
  it("imports nothing heavy -- that is its reason to exist", () => {
    const src = readFileSync(join(__dirname, "schema-constants.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["'](\.\/schema|zod|drizzle-orm|drizzle-zod)["']/);
  });
});
