import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  skillAssignments,
  skillExercises,
  skillProgramDays,
  skillProgramExercises,
  skillProgramWeeks,
  skillPrograms,
  skillSessionLogs,
} from "@shared/schema";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

/** A COACH EDITING A SKILL PROGRAM MUST NOT DESTROY WHAT AN ATHLETE ALREADY FILMED.
 *
 * skillSessionLogs.skillProgramExerciseId was NOT NULL with ON DELETE CASCADE, so removing a
 * drill from a day deleted every athlete's logged session for it -- the video, the velocities,
 * the trust scores, the PR flag -- silently, on an ordinary edit. The strength side settled this
 * years of code ago (workoutLogEntries.programExerciseId is SET NULL with an exerciseId
 * snapshot); the skill side never did.
 *
 * Measured, not assumed: before the change this test's first case went from one logged session
 * to zero.
 */
async function build() {
  const coach = await makeCoach();
  const athlete = await makeAthlete();
  const [drill] = await db
    .insert(skillExercises)
    .values({ coachId: coach.id, name: "Snatch Pull", sport: "weightlifting" } as never)
    .returning();
  const [program] = await db
    .insert(skillPrograms)
    .values({ coachId: coach.id, name: "Block", sport: "weightlifting" } as never)
    .returning();
  const [week] = await db
    .insert(skillProgramWeeks)
    .values({ programId: program.id, weekNumber: 1 } as never)
    .returning();
  const [day] = await db
    .insert(skillProgramDays)
    .values({ weekId: week.id, dayNumber: 1, title: "Day 1" } as never)
    .returning();
  const [slot] = await db
    .insert(skillProgramExercises)
    .values({ dayId: day.id, skillExerciseId: drill.id, orderIndex: 0, sets: 3, reps: "3" } as never)
    .returning();
  const [assignment] = await db
    .insert(skillAssignments)
    .values({
      skillProgramId: program.id,
      athleteId: athlete.id,
      coachId: coach.id,
      startDate: "2026-01-05",
    } as never)
    .returning();
  return { athlete, drill, day, slot, assignment };
}

describe("a skill session logged against a drill the coach later removes", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("survives the edit", async () => {
    const { athlete, drill, day, slot, assignment } = await build();
    await db.insert(skillSessionLogs).values({
      skillAssignmentId: assignment.id,
      skillProgramDayId: day.id,
      skillProgramExerciseId: slot.id,
      skillExerciseId: drill.id,
      athleteId: athlete.id,
      trackingLevel: "mechanics",
      videoUrl: "/uploads/form-videos/take.mp4",
    } as never);

    await db.delete(skillProgramExercises).where(eq(skillProgramExercises.id, slot.id));

    const after = await db
      .select()
      .from(skillSessionLogs)
      .where(eq(skillSessionLogs.athleteId, athlete.id));
    // The capture is still there. This read returned zero rows before the fix.
    expect(after).toHaveLength(1);
    // The link is the disposable half -- there is nothing left to point at.
    expect(after[0].skillProgramExerciseId).toBeNull();
    // What it was remains answerable, which is the whole point of the snapshot.
    expect(after[0].skillExerciseId).toBe(drill.id);
    expect(after[0].videoUrl).toBe("/uploads/form-videos/take.mp4");
  });

  it("keeps the link while the drill is still on the day", async () => {
    // The fix must not quietly stop recording the link in the ordinary case.
    const { athlete, drill, day, slot, assignment } = await build();
    await db.insert(skillSessionLogs).values({
      skillAssignmentId: assignment.id,
      skillProgramDayId: day.id,
      skillProgramExerciseId: slot.id,
      skillExerciseId: drill.id,
      athleteId: athlete.id,
      trackingLevel: "mechanics",
    } as never);

    const [row] = await db
      .select()
      .from(skillSessionLogs)
      .where(eq(skillSessionLogs.athleteId, athlete.id));
    expect(row.skillProgramExerciseId).toBe(slot.id);
    expect(row.skillExerciseId).toBe(drill.id);
  });
});
