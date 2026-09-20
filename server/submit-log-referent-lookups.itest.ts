import { beforeEach, describe, expect, it } from "vitest";
import { db, makeAssignedProgram, makeAthlete, makeCoach, makeExercise, resetDatabase } from "./test-support/fixtures";
import { onDbQuery } from "./db";
import { storage } from "./storage";
import { workoutLogEntries } from "@shared/schema";
import { eq } from "drizzle-orm";

// submitWorkoutLog resolved every entry's program-exercise (and corrective, and snapshot
// exercise) in its own statement inside the save transaction. Those are one statement per
// table now, whatever the day's length. The per-entry PR lookups are still per entry and are
// not this test's subject.

beforeEach(resetDatabase);

async function setup(exerciseCount: number) {
  const coach = await makeCoach();
  const athlete = await makeAthlete();
  const exerciseIds = [];
  for (let i = 0; i < exerciseCount; i++) exerciseIds.push((await makeExercise(coach.id)).id);
  const { assignment, day, programExercises } = await makeAssignedProgram({ coachId: coach.id, athleteId: athlete.id, exerciseIds });
  return { athlete, assignment, day, programExercises, exerciseIds };
}

function countMatching(pattern: RegExp) {
  let count = 0;
  const stop = onDbQuery((sqlText) => {
    if (pattern.test(sqlText)) count++;
  });
  return { get: () => count, stop };
}

describe("submitWorkoutLog referent lookups", () => {
  it("looks program_exercises up once for two entries and once for eight", async () => {
    const lookups = /^select .* from "program_exercises" where "program_exercises"\."id" in \(/;
    const counts: number[] = [];
    for (const n of [2, 8]) {
      await resetDatabase();
      const { athlete, assignment, day, programExercises } = await setup(n);
      const counter = countMatching(lookups);
      try {
        const log = await storage.submitWorkoutLog(athlete.id, {
          assignmentId: assignment.id,
          programDayId: day.id,
          date: "2026-01-05",
          completed: true,
          entries: programExercises.map((pe) => ({
            programExerciseId: pe.id,
            weightMode: "numeric" as const,
            weightUnit: "lbs" as const,
            sets: [{ setNumber: 1, reps: "5", weight: "100" }],
          })),
        });
        expect(log).toBeTruthy();
        const entries = await db.select().from(workoutLogEntries).where(eq(workoutLogEntries.workoutLogId, log!.id));
        expect(entries).toHaveLength(n);
        // Every entry still carries its resolved exercise snapshot.
        expect(entries.every((e) => e.exerciseId != null && e.programExerciseId != null)).toBe(true);
      } finally {
        counter.stop();
      }
      counts.push(counter.get());
    }
    expect(counts).toEqual([1, 1]);
  });

  it("still drops a deleted slot's reference and keeps the client's own exercise id as the snapshot", async () => {
    const { athlete, assignment, day, programExercises, exerciseIds } = await setup(1);
    const deletedSlotId = programExercises[0].id + 1000;
    const log = await storage.submitWorkoutLog(athlete.id, {
      assignmentId: assignment.id,
      programDayId: day.id,
      date: "2026-01-05",
      completed: false,
      entries: [
        { programExerciseId: deletedSlotId, exerciseId: exerciseIds[0], weightMode: "numeric", weightUnit: "lbs", sets: [{ setNumber: 1, reps: "5", weight: "100" }] },
        { programExerciseId: deletedSlotId, exerciseId: 999_999, weightMode: "numeric", weightUnit: "lbs", sets: [{ setNumber: 1, reps: "5", weight: "100" }] },
      ],
    });
    const entries = await db.select().from(workoutLogEntries).where(eq(workoutLogEntries.workoutLogId, log!.id));
    expect(entries.map((e) => [e.programExerciseId, e.exerciseId])).toEqual([
      [null, exerciseIds[0]],
      [null, null],
    ]);
  });
});
