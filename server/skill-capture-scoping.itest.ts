import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import {
  skillAssignments,
  skillExercises,
  skillProgramDays,
  skillProgramExercises,
  skillProgramWeeks,
  skillPrograms,
} from "@shared/schema";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

// skillProgramExerciseId is how every read resolves which drill a capture
// belongs to, and nothing constrained it to the day being logged -- so a
// capture naming any row in the table was stored against it, and surfaced in
// that drill's history and on its leaderboard.

async function programWithTwoDays(coachId: number) {
  const [drillA] = await db
    .insert(skillExercises)
    .values({ coachId, name: "Tee", sports: ["baseball"], skillType: "Hitting" })
    .returning();
  const [drillB] = await db
    .insert(skillExercises)
    .values({ coachId, name: "Front toss", sports: ["baseball"], skillType: "Hitting" })
    .returning();
  const [program] = await db.insert(skillPrograms).values({ coachId, name: "Hitting" }).returning();
  const [week] = await db.insert(skillProgramWeeks).values({ programId: program.id, weekNumber: 1 }).returning();
  const [day1] = await db.insert(skillProgramDays).values({ weekId: week.id, dayNumber: 1, title: "D1" }).returning();
  const [day2] = await db.insert(skillProgramDays).values({ weekId: week.id, dayNumber: 2, title: "D2" }).returning();
  const [exOnDay1] = await db
    .insert(skillProgramExercises)
    .values({ dayId: day1.id, skillExerciseId: drillA.id, orderIndex: 0, sets: 3, reps: "10" })
    .returning();
  const [exOnDay2] = await db
    .insert(skillProgramExercises)
    .values({ dayId: day2.id, skillExerciseId: drillB.id, orderIndex: 0, sets: 3, reps: "10" })
    .returning();
  return { program, day1, day2, exOnDay1, exOnDay2 };
}

describe("a skill capture must name a drill that is on the day", () => {
  beforeEach(resetDatabase);

  it("refuses a drill belonging to a different day", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const { program, day1, exOnDay2 } = await programWithTwoDays(coach.id);
    const [assignment] = await db
      .insert(skillAssignments)
      .values({ skillProgramId: program.id, athleteId: athlete.id, coachId: coach.id, startDate: "2026-01-05" })
      .returning();

    await expect(
      storage.createSkillSessionLog(athlete.id, {
        skillAssignmentId: assignment.id,
        skillProgramDayId: day1.id,
        skillProgramExerciseId: exOnDay2.id,
        trackingLevel: "mechanics",
      } as any),
    ).rejects.toThrow(/isn't on this day/i);
  });

  it("still accepts a drill that is on the day", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const { program, day1, exOnDay1 } = await programWithTwoDays(coach.id);
    const [assignment] = await db
      .insert(skillAssignments)
      .values({ skillProgramId: program.id, athleteId: athlete.id, coachId: coach.id, startDate: "2026-01-05" })
      .returning();

    const row = await storage.createSkillSessionLog(athlete.id, {
      skillAssignmentId: assignment.id,
      skillProgramDayId: day1.id,
      skillProgramExerciseId: exOnDay1.id,
      trackingLevel: "mechanics",
    } as any);
    expect(row.skillProgramExerciseId).toBe(exOnDay1.id);
  });
});
