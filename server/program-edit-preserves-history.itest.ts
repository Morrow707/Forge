import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { programDays, programExercises, programWeeks, workoutLogs } from "@shared/schema";
import { makeAssignedProgram, makeAthlete, makeCoach, makeExercise, resetDatabase } from "./test-support/fixtures";

// A coach editing a program that athletes are already training on must not
// destroy what those athletes have logged. workoutLogs.programDayId is
// notNull and ON DELETE CASCADE from programDays, which cascades in turn
// from programWeeks -- so anything that deletes the week tree deletes the
// training history hanging off it.

async function setup() {
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
  return { coach, athlete, squat, assigned, log };
}

function structure(name: string, exerciseId: number, ids?: { weekId: number; dayId: number }) {
  return {
    name,
    description: null,
    blocks: [],
    weeks: [
      {
        id: ids?.weekId,
        weekNumber: 1,
        name: null,
        blockIndex: null,
        days: [
          {
            id: ids?.dayId,
            dayNumber: 1,
            title: "Day 1",
            isRestDay: false,
            exercises: [{ exerciseId, orderIndex: 0, sets: 3, reps: "5" }],
          },
        ],
      },
    ],
  };
}

describe("editing a program preserves athlete history", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("renaming the program does not delete a logged workout", async () => {
    const { coach, squat, assigned, log } = await setup();
    await storage.updateProgramStructure(
      assigned.program.id,
      structure("Renamed Program", squat.id, { weekId: assigned.week.id, dayId: assigned.day.id }) as any,
      coach.id,
    );
    const after = await db.select().from(workoutLogs).where(eq(workoutLogs.id, log.id));
    expect(after.length).toBe(1);
  });

  it("keeps the day row identity the log points at", async () => {
    const { coach, squat, assigned } = await setup();
    await storage.updateProgramStructure(
      assigned.program.id,
      structure("Same Program", squat.id, { weekId: assigned.week.id, dayId: assigned.day.id }) as any,
      coach.id,
    );
    const days = await db.select().from(programDays).where(eq(programDays.id, assigned.day.id));
    expect(days.length).toBe(1);
  });

  it("still applies the coach's actual edits", async () => {
    const { coach, assigned } = await setup();
    const other = await makeExercise(coach.id, { name: "Front Squat" });
    await storage.updateProgramStructure(
      assigned.program.id,
      structure("Edited", other.id, { weekId: assigned.week.id, dayId: assigned.day.id }) as any,
      coach.id,
    );
    const rows = await db.select().from(programExercises).where(eq(programExercises.dayId, assigned.day.id));
    expect(rows.length).toBe(1);
    expect(rows[0].exerciseId).toBe(other.id);
    const weeks = await db.select().from(programWeeks).where(eq(programWeeks.programId, assigned.program.id));
    expect(weeks.length).toBe(1);
  });
});
