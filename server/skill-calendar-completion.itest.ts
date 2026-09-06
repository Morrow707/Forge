import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import {
  skillAssignments,
  skillDayLogs,
  skillExercises,
  skillProgramDays,
  skillProgramExercises,
  skillProgramWeeks,
  skillPrograms,
} from "@shared/schema";
import { coachAthletes } from "@shared/schema";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

// Every skill calendar entry was built with a hardcoded completed: false, so
// a skill day the athlete had finished never showed as done on any calendar,
// and any "completed" count built on these entries was short.

describe("a finished skill day shows as complete on the calendar", () => {
  beforeEach(resetDatabase);

  it("reflects the athlete's completion", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: athlete.id });

    const [drill] = await db
      .insert(skillExercises)
      .values({ coachId: coach.id, name: "Tee", sports: ["baseball"], skillType: "Hitting" })
      .returning();
    const [program] = await db.insert(skillPrograms).values({ coachId: coach.id, name: "Hitting" }).returning();
    const [week] = await db.insert(skillProgramWeeks).values({ programId: program.id, weekNumber: 1 }).returning();
    const [day] = await db
      .insert(skillProgramDays)
      .values({ weekId: week.id, dayNumber: 1, title: "Day 1" })
      .returning();
    await db
      .insert(skillProgramExercises)
      .values({ dayId: day.id, skillExerciseId: drill.id, orderIndex: 0, sets: 3, reps: "10" });
    const [assignment] = await db
      .insert(skillAssignments)
      .values({
        skillProgramId: program.id,
        athleteId: athlete.id,
        coachId: coach.id,
        startDate: "2026-01-05",
      })
      .returning();

    const before = await storage.getSkillCalendarEntries("2026-01-01", "2026-01-31", {
      mode: "athlete",
      athleteId: athlete.id,
    });
    const target = before.find((e: any) => e.programDayId === day.id);
    expect(target).toBeTruthy();
    expect(target!.completed).toBe(false);

    await db.insert(skillDayLogs).values({
      skillAssignmentId: assignment.id,
      skillProgramDayId: day.id,
      athleteId: athlete.id,
      date: target!.date,
      completed: true,
    });

    const after = await storage.getSkillCalendarEntries("2026-01-01", "2026-01-31", {
      mode: "athlete",
      athleteId: athlete.id,
    });
    expect(after.find((e: any) => e.programDayId === day.id)!.completed).toBe(true);
  });
});
