/** Constants the CLIENT reads out of the schema, without the schema.
 *
 * `shared/schema.ts` is 7,000 lines of Drizzle tables and zod insert schemas. Importing one
 * literal from it -- `MAX_EXPECTED_ATHLETES` on the signup form -- pulled the whole file, plus
 * zod, drizzle-orm and drizzle-zod, into the eager entry bundle: ~510 kB of JavaScript (136 kB
 * gzipped, three-fifths of everything the login page downloaded) to know that a number should be
 * at most 5,000. The nutrition panels did the same for four meal names.
 *
 * These are the values the client needs, and only those. Each one is pinned to the schema's
 * copy by `shared/schema-constants.test.ts`, so the two cannot drift: change one, the test names
 * the other. The intended end state is for schema.ts to import these from here and re-export
 * them, at which point the test becomes a formality -- that edit belongs to whoever owns
 * schema.ts and is deliberately not made from the client side.
 *
 * Nothing in this file may import from ./schema, zod or drizzle. That is the whole point.
 */

/** Upper bound on the "how many athletes do you expect?" answer. See schema.ts's own comment. */
export const MAX_EXPECTED_ATHLETES = 5000;

export const NUTRITION_GOALS = [
  "build_muscle",
  "lose_fat",
  "improve_performance",
  "general_health",
] as const;
export type NutritionGoal = (typeof NUTRITION_GOALS)[number];
export const NUTRITION_GOAL_LABEL: Record<NutritionGoal, string> = {
  build_muscle: "Build muscle",
  lose_fat: "Lose fat",
  improve_performance: "Improve sport performance",
  general_health: "General health",
};

export const FOOD_LOG_MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type FoodLogMeal = (typeof FOOD_LOG_MEALS)[number];
export const FOOD_LOG_MEAL_LABEL: Record<FoodLogMeal, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

/** The meal to preselect for something being logged right now. A default, not a determination
 * -- see schema.ts's foodLogMealEnum. */
export function suggestedMealForHour(hour: number): FoodLogMeal {
  if (hour >= 4 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 17 && hour < 21) return "dinner";
  return "snack";
}

export const PERIODIZATION_PHASES = [
  "accumulation",
  "intensification",
  "realization",
  "deload",
  "taper",
] as const;
export type PeriodizationPhase = (typeof PERIODIZATION_PHASES)[number];
export const PERIODIZATION_PHASE_LABEL: Record<PeriodizationPhase, string> = {
  accumulation: "Accumulation",
  intensification: "Intensification",
  realization: "Realization",
  deload: "Deload",
  taper: "Taper",
};
