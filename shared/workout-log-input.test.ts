import { describe, it, expect } from "vitest";
import { submitWorkoutLogSchema } from "./schema";

// Every field in a logged set that reaches an integer column has to be
// rejected by the schema rather than by Postgres. A decimal rpe used to pass
// validation, reach the insert, and 500 the whole request -- which loses not
// just the RPE but every set in the payload, including an offline queue's
// worth of replayed work.
function log(entry: Record<string, unknown>) {
  return submitWorkoutLogSchema.safeParse({
    assignmentId: 1,
    programDayId: 1,
    date: "2026-09-14",
    entries: [{ programExerciseId: 1, sets: [{ setNumber: 1, reps: "5" }], ...entry }],
  });
}

describe("submitWorkoutLogSchema rpe", () => {
  it("takes the whole-number scale the UI offers", () => {
    for (const rpe of [1, 5, 8, 10]) expect(log({ rpe }).success, String(rpe)).toBe(true);
  });

  it("refuses a decimal instead of letting it reach an integer column", () => {
    for (const rpe of [8.5, 7.5, 0.5]) expect(log({ rpe }).success, String(rpe)).toBe(false);
  });

  it("refuses values off the 1-10 scale", () => {
    for (const rpe of [0, 11, -1, 100]) expect(log({ rpe }).success, String(rpe)).toBe(false);
  });

  it("still allows no rpe at all", () => {
    expect(log({}).success).toBe(true);
    expect(log({ rpe: null }).success).toBe(true);
  });

  it("still takes the rep strings athletes really enter", () => {
    for (const reps of ["5", "8-10", "AMRAP", "5+"]) {
      const parsed = submitWorkoutLogSchema.safeParse({
        assignmentId: 1,
        programDayId: 1,
        date: "2026-09-14",
        entries: [{ programExerciseId: 1, sets: [{ setNumber: 1, reps }] }],
      });
      expect(parsed.success, reps).toBe(true);
    }
  });
});
