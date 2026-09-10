import { describe, it, expect } from "vitest";
import { suggestedMealForHour, FOOD_LOG_MEALS, FOOD_LOG_MEAL_LABEL } from "@shared/schema";

// The picker's starting position, not a determination -- the athlete is looking at it when it is
// applied. What matters is that it lands somewhere sensible for every hour of the day and never
// returns something that is not a meal.
describe("the meal a new entry starts on", () => {
  it("follows ordinary eating hours", () => {
    expect(suggestedMealForHour(7)).toBe("breakfast");
    expect(suggestedMealForHour(12)).toBe("lunch");
    expect(suggestedMealForHour(18)).toBe("dinner");
  });

  it("calls the in-between hours a snack rather than stretching a meal over them", () => {
    for (const hour of [16, 22, 2]) expect(suggestedMealForHour(hour)).toBe("snack");
  });

  it("returns a real meal for every hour", () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(FOOD_LOG_MEALS).toContain(suggestedMealForHour(hour));
    }
  });

  it("has a label for every meal, since the picker renders by label", () => {
    for (const meal of FOOD_LOG_MEALS) {
      expect(FOOD_LOG_MEAL_LABEL[meal]).toBeTruthy();
    }
    // Labels have to be distinct -- the picker maps a tapped label back to a meal.
    const labels = FOOD_LOG_MEALS.map((m) => FOOD_LOG_MEAL_LABEL[m]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
