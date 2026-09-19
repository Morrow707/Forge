import { describe, it, expect } from "vitest";
import { MAX_EXPECTED_ATHLETES, signupSchema } from "./schema";

/** ONE BOUND, NAMED ONCE.
 *
 * "How many athletes do you expect?" is asked in three places -- the signup form, the signup
 * schema and PUT /api/coach/plan -- and a literal in any of them is how they start disagreeing
 * about what a valid answer is. Everything reads MAX_EXPECTED_ATHLETES; this asserts the schema
 * actually enforces that number and not a copy of it that has drifted. Asserted by parsing
 * rather than by reading zod's internals, so it keeps meaning the same thing across zod
 * versions. */
function coachSignup(expectedAthletes: unknown) {
  return signupSchema.safeParse({
    email: "coach@example.test",
    password: "correct-horse-battery-staple-9",
    name: "Head Coach",
    role: "coach",
    dateOfBirth: "1985-04-02",
    agreedToTerms: true,
    expectedAthletes,
  });
}

describe("the expected-athletes bound", () => {
  it("accepts exactly the maximum", () => {
    expect(coachSignup(MAX_EXPECTED_ATHLETES).success).toBe(true);
  });

  it("refuses one past it, and refuses zero, a fraction and a negative", () => {
    expect(coachSignup(MAX_EXPECTED_ATHLETES + 1).success).toBe(false);
    expect(coachSignup(0).success).toBe(false);
    expect(coachSignup(12.5).success).toBe(false);
    expect(coachSignup(-3).success).toBe(false);
  });

  it("is optional in the schema -- the ROUTE is what requires it of a coach", () => {
    // Same "required by the route, not the schema" posture as sport/position/height: the schema
    // cannot see role, and an athlete signup has no plan to pick.
    expect(coachSignup(undefined).success).toBe(true);
  });
});
