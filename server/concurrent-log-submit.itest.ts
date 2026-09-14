import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { workoutLogEntries, workoutLogs, workoutSetEntries } from "@shared/schema";
import { makeAssignedProgram, makeAthlete, makeCoach, makeExercise, resetDatabase } from "./test-support/fixtures";

// TWO REQUESTS CAN BOTH SEE "NO LOG FOR THIS DAY".
//
// submitWorkoutLog reads the day's log and inserts one if there isn't one, and those two steps
// are not atomic. A double-tap on Finish, or the offline queue flushing at the same moment the
// athlete reconnects and saves by hand, both arrive with no row and both try to create one.
//
// The unique index on (assignment_id, program_day_id, date) always did its job -- measured
// against a running server, 40 concurrent identical submissions produced exactly one log and one
// set, so the data was never wrong. But FOUR of those forty answered 500 "Something went wrong
// on our end" for a set that had in fact saved, which is the worst possible answer to give an
// athlete on a bad connection: it invites the one action that makes it worse, logging the set
// again.
describe("concurrent submissions of the same day", () => {
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
    return { athlete, assigned, pe: assigned.programExercises[0] };
  }

  const payload = (ctx: Awaited<ReturnType<typeof setup>>, reps: string) => ({
    assignmentId: ctx.assigned.assignment.id,
    programDayId: ctx.assigned.day.id,
    date: "2026-09-21",
    completed: true,
    entries: [
      {
        programExerciseId: ctx.pe.id,
        weightMode: "numeric" as const,
        weightUnit: "lbs" as const,
        sets: [{ setNumber: 1, reps, weight: "135" }],
      },
    ],
  });

  it("all of them succeed, and leave exactly one log and one set", async () => {
    const ctx = await setup();
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        storage.submitWorkoutLog(ctx.athlete.id, payload(ctx, "5") as never),
      ),
    );

    const rejected = results.filter((r) => r.status === "rejected");
    expect(
      rejected.map((r) => String((r as PromiseRejectedResult).reason)),
      "no submission should fail -- the row existing is the expected outcome of the race",
    ).toEqual([]);

    const logs = await db
      .select()
      .from(workoutLogs)
      .where(eq(workoutLogs.athleteId, ctx.athlete.id));
    expect(logs).toHaveLength(1);

    const entries = await db
      .select()
      .from(workoutLogEntries)
      .where(eq(workoutLogEntries.workoutLogId, logs[0].id));
    const sets = await db
      .select()
      .from(workoutSetEntries)
      .where(eq(workoutSetEntries.logEntryId, entries[0].id));
    // One set, not twelve. The loser of the race replaces the day rather than appending to it,
    // which is the same thing the ordinary update path does.
    expect(sets).toHaveLength(1);
  });

  it("the last writer's numbers are the ones that survive", async () => {
    const ctx = await setup();
    await storage.submitWorkoutLog(ctx.athlete.id, payload(ctx, "5") as never);
    await storage.submitWorkoutLog(ctx.athlete.id, payload(ctx, "8") as never);

    const logs = await db.select().from(workoutLogs).where(eq(workoutLogs.athleteId, ctx.athlete.id));
    const entries = await db
      .select()
      .from(workoutLogEntries)
      .where(eq(workoutLogEntries.workoutLogId, logs[0].id));
    const sets = await db
      .select()
      .from(workoutSetEntries)
      .where(eq(workoutSetEntries.logEntryId, entries[0].id));
    expect(sets).toHaveLength(1);
    expect(sets[0].reps).toBe("8");
  });
});
