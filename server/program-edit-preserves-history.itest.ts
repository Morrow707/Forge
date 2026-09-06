import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import {
  assignmentCorrectives,
  assignmentExerciseOverrides,
  programDays,
  programExercises,
  programWeeks,
  workoutLogEntries,
  workoutLogs,
} from "@shared/schema";
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

// assignmentExerciseOverrides is each athlete's own substitution for one
// exercise on one day -- the leg press a coach put in place of a back squat
// for someone with a knee injury. It cascades off programExercises, so a
// day edit that replaced those rows wholesale silently dropped it.
describe("editing a single day preserves athlete substitutions", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("keeps an athlete's exercise substitution when the day is edited", async () => {
    const { coach, squat, assigned } = await setup();
    const legPress = await makeExercise(coach.id, { name: "Leg Press" });
    const [override] = await db
      .insert(assignmentExerciseOverrides)
      .values({
        assignmentId: assigned.assignment.id,
        programDayId: assigned.day.id,
        programExerciseId: assigned.programExercises[0].id,
        substituteExerciseId: legPress.id,
        reason: "knee",
      })
      .returning();

    await storage.updateProgramDay(
      assigned.day.id,
      {
        title: "Renamed Day",
        isRestDay: false,
        exercises: [{ id: assigned.programExercises[0].id, exerciseId: squat.id, orderIndex: 0, sets: 3, reps: "5" }],
      } as any,
      coach.id,
    );

    const after = await db
      .select()
      .from(assignmentExerciseOverrides)
      .where(eq(assignmentExerciseOverrides.id, override.id));
    expect(after.length).toBe(1);
    expect(after[0].substituteExerciseId).toBe(legPress.id);
  });

  it("still drops an override whose exercise the coach actually removed", async () => {
    const { coach, assigned } = await setup();
    const legPress = await makeExercise(coach.id, { name: "Leg Press" });
    await db.insert(assignmentExerciseOverrides).values({
      assignmentId: assigned.assignment.id,
      programDayId: assigned.day.id,
      programExerciseId: assigned.programExercises[0].id,
      substituteExerciseId: legPress.id,
      reason: "knee",
    });

    await storage.updateProgramDay(
      assigned.day.id,
      { title: "Day 1", isRestDay: false, exercises: [] } as any,
      coach.id,
    );

    expect(await db.select().from(assignmentExerciseOverrides)).toEqual([]);
    expect(await db.select().from(programExercises).where(eq(programExercises.dayId, assigned.day.id))).toEqual([]);
  });
});

// workoutLogEntries.correctiveId cascades from assignmentCorrectives, so
// replacing a day's correctives deleted the sets the athlete had already
// logged against them.
describe("editing correctives preserves what the athlete already logged", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("keeps a logged corrective entry when the coach adjusts the corrective", async () => {
    const { coach, athlete, assigned, log } = await setup();
    const banded = await makeExercise(coach.id, { name: "Banded Pull-Apart" });
    const [corrective] = await db
      .insert(assignmentCorrectives)
      .values({
        assignmentId: assigned.assignment.id,
        programDayId: assigned.day.id,
        exerciseId: banded.id,
        orderIndex: 0,
        sets: 2,
        reps: "15",
      })
      .returning();
    const [entry] = await db
      .insert(workoutLogEntries)
      .values({ workoutLogId: log.id, exerciseId: banded.id, correctiveId: corrective.id })
      .returning();

    // The coach bumps the corrective from 2 sets to 3.
    await storage.updateCorrectivesForAssignmentDay(
      assigned.assignment.id,
      assigned.day.id,
      { correctives: [{ exerciseId: banded.id, orderIndex: 0, sets: 3, reps: "15" }] } as any,
      coach.id,
    );

    const after = await db.select().from(workoutLogEntries).where(eq(workoutLogEntries.id, entry.id));
    expect(after.length).toBe(1);
    const corr = await db
      .select()
      .from(assignmentCorrectives)
      .where(eq(assignmentCorrectives.id, corrective.id));
    expect(corr[0].sets).toBe(3);
    expect(athlete.id).toBeGreaterThan(0);
  });

  it("still removes a corrective the coach deleted", async () => {
    const { coach, assigned } = await setup();
    const banded = await makeExercise(coach.id, { name: "Banded Pull-Apart" });
    await db.insert(assignmentCorrectives).values({
      assignmentId: assigned.assignment.id,
      programDayId: assigned.day.id,
      exerciseId: banded.id,
      orderIndex: 0,
      sets: 2,
      reps: "15",
    });

    await storage.updateCorrectivesForAssignmentDay(
      assigned.assignment.id,
      assigned.day.id,
      { correctives: [] } as any,
      coach.id,
    );

    expect(await db.select().from(assignmentCorrectives)).toEqual([]);
  });
});

// A client holding an id from a read that has since changed must not cause
// the reconcile to insert a fresh row and delete the old one as stale --
// that is precisely the data loss the reconcile exists to prevent.
describe("a stale id falls back to position rather than replacing the row", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("keeps the logged workout when the payload carries an id that no longer exists", async () => {
    const { coach, squat, assigned, log } = await setup();
    await storage.updateProgramStructure(
      assigned.program.id,
      structure("Stale Ids", squat.id, { weekId: 999_999, dayId: 999_998 }) as any,
      coach.id,
    );
    expect((await db.select().from(workoutLogs).where(eq(workoutLogs.id, log.id))).length).toBe(1);
    expect((await db.select().from(programDays).where(eq(programDays.id, assigned.day.id))).length).toBe(1);
  });
});

// Rows are matched on which exercise they are for, not on their slot, so
// reordering a day carries each athlete's substitution along with the lift
// it replaced instead of leaving it attached to position one.
describe("reordering a day keeps each substitution with its own exercise", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("moves the override with the exercise, not the slot", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const squat = await makeExercise(coach.id, { name: "Back Squat" });
    const bench = await makeExercise(coach.id, { name: "Bench Press" });
    const legPress = await makeExercise(coach.id, { name: "Leg Press" });
    const assigned = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [squat.id, bench.id],
    });
    const squatRow = assigned.programExercises.find((p) => p.exerciseId === squat.id)!;
    await db.insert(assignmentExerciseOverrides).values({
      assignmentId: assigned.assignment.id,
      programDayId: assigned.day.id,
      programExerciseId: squatRow.id,
      substituteExerciseId: legPress.id,
      reason: "knee",
    });

    // Coach swaps the order: bench first, squat second.
    await storage.updateProgramDay(
      assigned.day.id,
      {
        title: "Day 1",
        isRestDay: false,
        exercises: [
          { exerciseId: bench.id, orderIndex: 0, sets: 3, reps: "5" },
          { exerciseId: squat.id, orderIndex: 1, sets: 3, reps: "5" },
        ],
      } as any,
      coach.id,
    );

    const overrides = await db.select().from(assignmentExerciseOverrides);
    expect(overrides.length).toBe(1);
    const rows = await db.select().from(programExercises).where(eq(programExercises.dayId, assigned.day.id));
    const stillSquat = rows.find((r) => r.id === overrides[0].programExerciseId);
    // The override must still point at the squat row, now in slot two.
    expect(stillSquat?.exerciseId).toBe(squat.id);
    expect(stillSquat?.orderIndex).toBe(1);
  });
});
