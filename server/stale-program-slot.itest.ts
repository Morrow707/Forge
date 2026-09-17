import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { db } from "./db";
import { programExercises, workoutLogEntries, workoutLogs } from "@shared/schema";
import {
  makeAssignedProgram,
  makeAthlete,
  makeCoach,
  makeExercise,
  resetDatabase,
} from "./test-support/fixtures";

/** WHAT HAPPENS WHEN A COACH EDITS A DAY WHILE THE ATHLETE IS TRAINING IT.
 *
 * updateProgramDay replaces a day's whole programExercises row set -- delete all, reinsert
 * fresh -- on every edit, even one that does not touch the exercise being logged. An athlete
 * part-way through is holding the old ids, so their next save names rows that no longer exist.
 *
 * The column is a foreign key, so that was not a bad row: it was a failed TRANSACTION, taking
 * every set in the request with it. And it failed invisibly, because the client files a 5xx as
 * transient and queues it for retry -- so the queue replayed the same doomed payload forever
 * while the screen said nothing.
 *
 * Needs a real database: the whole bug is a constraint, and a mocked Drizzle builder has no
 * constraints to violate.
 */
describe("a save against a program slot the coach has deleted", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  async function setUp() {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const squat = await makeExercise(coach.id, { name: "Back Squat" });
    const bench = await makeExercise(coach.id, { name: "Bench Press" });
    const built = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [squat.id, bench.id],
    });
    return { athlete, squat, bench, ...built };
  }

  it("keeps the session instead of losing it to a foreign-key violation", async () => {
    const { athlete, squat, day, assignment, programExercises: slots } = await setUp();
    const staleSlotId = slots[0].id;

    // The coach edits the day. Every slot on it is replaced.
    await db.delete(programExercises).where(eq(programExercises.dayId, day.id));

    const saved = await storage.submitWorkoutLog(athlete.id, {
      assignmentId: assignment.id,
      programDayId: day.id,
      date: "2026-01-05",
      completed: true,
      entries: [
        {
          programExerciseId: staleSlotId,
          exerciseId: squat.id,
          weightMode: "numeric",
          sets: [{ setNumber: 1, reps: "5", weight: "225" }],
        },
      ],
    } as never);

    expect(saved).not.toBeNull();

    const [log] = await db
      .select()
      .from(workoutLogs)
      .where(eq(workoutLogs.assignmentId, assignment.id));
    expect(log).toBeDefined();

    const entries = await db
      .select()
      .from(workoutLogEntries)
      .where(eq(workoutLogEntries.workoutLogId, log.id));
    expect(entries).toHaveLength(1);

    // The LINK is the disposable half -- there is nothing left to point at.
    expect(entries[0].programExerciseId).toBeNull();
    // The athlete's work is not. It is still a squat, and every historical read resolves
    // identity through this column.
    expect(entries[0].exerciseId).toBe(squat.id);
  });

  it("does not take the client's word for which exercise it was without checking", async () => {
    // exerciseId is client-supplied. It can only ever label this athlete's own set, but an
    // unchecked one would put a dead reference into the column PR detection reads.
    const { athlete, day, assignment, programExercises: slots } = await setUp();
    const staleSlotId = slots[0].id;
    await db.delete(programExercises).where(eq(programExercises.dayId, day.id));

    const saved = await storage.submitWorkoutLog(athlete.id, {
      assignmentId: assignment.id,
      programDayId: day.id,
      date: "2026-01-05",
      completed: true,
      entries: [
        {
          programExerciseId: staleSlotId,
          exerciseId: 9_999_999,
          weightMode: "numeric",
          sets: [{ setNumber: 1, reps: "5", weight: "225" }],
        },
      ],
    } as never);

    expect(saved).not.toBeNull();
    const [log] = await db
      .select()
      .from(workoutLogs)
      .where(eq(workoutLogs.assignmentId, assignment.id));
    const entries = await db
      .select()
      .from(workoutLogEntries)
      .where(eq(workoutLogEntries.workoutLogId, log.id));
    // Saved -- the sets are the point -- but unlabelled rather than wrongly labelled.
    expect(entries).toHaveLength(1);
    expect(entries[0].exerciseId).toBeNull();
  });

  it("still links a slot that is genuinely still there", async () => {
    // The fix must not quietly stop recording the link in the ordinary case.
    const { athlete, squat, day, assignment, programExercises: slots } = await setUp();

    await storage.submitWorkoutLog(athlete.id, {
      assignmentId: assignment.id,
      programDayId: day.id,
      date: "2026-01-05",
      completed: true,
      entries: [
        {
          programExerciseId: slots[0].id,
          exerciseId: squat.id,
          weightMode: "numeric",
          sets: [{ setNumber: 1, reps: "5", weight: "225" }],
        },
      ],
    } as never);

    const [log] = await db
      .select()
      .from(workoutLogs)
      .where(eq(workoutLogs.assignmentId, assignment.id));
    const entries = await db
      .select()
      .from(workoutLogEntries)
      .where(eq(workoutLogEntries.workoutLogId, log.id));
    expect(entries[0].programExerciseId).toBe(slots[0].id);
    expect(entries[0].exerciseId).toBe(squat.id);
  });
});
