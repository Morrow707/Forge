import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { workoutLogEntries, workoutLogs, workoutSetEntries } from "@shared/schema";
import { makeAssignedProgram, makeAthlete, makeCoach, makeExercise, resetDatabase } from "./test-support/fixtures";

// The prior best is read from dates strictly before today and never updated
// as the session's own sets are evaluated, so every set of an ascending
// ladder at one rep count beat the same historical number. The athlete got a
// celebration for each, and the Team PR Wall and weekly digest counted each.

describe("only the top set of an ascending ladder is a personal record", () => {
  beforeEach(resetDatabase);

  async function setup() {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const squat = await makeExercise(coach.id, { name: "Back Squat" });
    const assigned = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [squat.id],
    });
    return { coach, athlete, squat, assigned, pe: assigned.programExercises[0] };
  }

  async function log(ctx: any, date: string, sets: { reps: string; weight: string }[]) {
    await storage.submitWorkoutLog(ctx.athlete.id, {
      assignmentId: ctx.assigned.assignment.id,
      programDayId: ctx.assigned.day.id,
      date,
      completed: true,
      entries: [
        {
          programExerciseId: ctx.pe.id,
          weightMode: "numeric",
          weightUnit: "lbs",
          sets: sets.map((s, i) => ({ setNumber: i + 1, reps: s.reps, weight: s.weight })),
        },
      ],
    } as any);
  }

  async function prCount(athleteId: number) {
    const rows = await db
      .select({ isPr: workoutSetEntries.isPr })
      .from(workoutSetEntries)
      .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
      .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
      .where(eq(workoutLogs.athleteId, athleteId));
    return rows.filter((r) => r.isPr).length;
  }

  it("counts one record for a three-set ladder, not three", async () => {
    const ctx = await setup();
    // A baseline session, so a prior best exists at 5 reps.
    await log(ctx, "2026-08-01", [{ reps: "5", weight: "175" }]);
    // Then the ladder, every set above that baseline.
    await log(ctx, "2026-08-08", [
      { reps: "5", weight: "185" },
      { reps: "5", weight: "195" },
      { reps: "5", weight: "205" },
    ]);
    expect(await prCount(ctx.athlete.id)).toBe(1);
  });

  it("still records a record at each distinct rep count", async () => {
    const ctx = await setup();
    await log(ctx, "2026-08-01", [
      { reps: "5", weight: "175" },
      { reps: "3", weight: "185" },
    ]);
    // Different rep counts are separate ladders, so both improve.
    await log(ctx, "2026-08-08", [
      { reps: "5", weight: "185" },
      { reps: "3", weight: "195" },
    ]);
    expect(await prCount(ctx.athlete.id)).toBe(2);
  });

  it("does not record anything when the ladder stays under the old best", async () => {
    const ctx = await setup();
    await log(ctx, "2026-08-01", [{ reps: "5", weight: "225" }]);
    await log(ctx, "2026-08-08", [
      { reps: "5", weight: "185" },
      { reps: "5", weight: "195" },
    ]);
    expect(await prCount(ctx.athlete.id)).toBe(0);
  });
});
