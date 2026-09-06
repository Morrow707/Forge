import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { workoutLogEntries, workoutLogs, workoutSetEntries } from "@shared/schema";
import { makeAssignedProgram, makeAthlete, makeCoach, makeExercise, resetDatabase } from "./test-support/fixtures";

// The athlete's "last time you did this" line and set-history chart matched
// logged entries by joining out through programExerciseId. That FK is
// nullable, so once a program-day edit nulled it the entry matched nothing
// and the history vanished from the athlete's view -- still in the database,
// just unreachable. workoutLogEntries.exerciseId is the submission-time
// snapshot that exists for exactly this.

describe("performance history survives a program edit", () => {
  beforeEach(resetDatabase);

  it("still finds a past set whose program-exercise link is gone", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const squat = await makeExercise(coach.id, { name: "Back Squat" });
    const assigned = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [squat.id],
    });

    const [log] = await db
      .insert(workoutLogs)
      .values({
        assignmentId: assigned.assignment.id,
        programDayId: assigned.day.id,
        athleteId: athlete.id,
        date: "2026-01-05",
        completed: true,
      })
      .returning();
    // programExerciseId deliberately left null -- what a program-day edit
    // leaves behind. exerciseId carries the identity.
    const [entry] = await db
      .insert(workoutLogEntries)
      .values({ workoutLogId: log.id, exerciseId: squat.id, weightMode: "numeric" })
      .returning();
    await db.insert(workoutSetEntries).values({
      logEntryId: entry.id,
      setNumber: 1,
      reps: "5",
      weight: "225",
      weightUnit: "lbs",
      repsCount: 5,
      weightLbs: 225,
    });

    const logs = await storage.getRecentWorkoutLogsForAthlete(athlete.id, "2026-02-01");
    const detail = await storage.getWorkoutDayDetail(
      athlete.id,
      assigned.assignment.id,
      assigned.day.id,
      "2026-01-12",
    );
    const slot = detail?.day.exercises.find((e: any) => e.exercise.id === squat.id);
    expect(logs.length).toBeGreaterThan(0);
    expect(slot?.lastPerformance?.weight).toBe("225");
    expect(slot?.setHistory?.length ?? 0).toBeGreaterThan(0);
  });
});
