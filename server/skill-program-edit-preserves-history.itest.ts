import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
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

// The skill-program builder had the same wipe-and-rebuild save the class
// builder did, and the same cascades under it: skillSessionLogs (the
// athlete's captured session and its video), skillDayLogs and
// skillDayComments all hang off skillProgramDays with ON DELETE CASCADE.

async function makeDrill(coachId: number, name: string) {
  const [row] = await db
    .insert(skillExercises)
    .values({ coachId, name, sports: ["baseball"], skillType: "Hitting" })
    .returning();
  return row;
}

function structure(name: string, drillIds: number[], ids?: { weekId: number; dayId: number }) {
  return {
    name,
    description: null,
    weeks: [
      {
        id: ids?.weekId,
        weekNumber: 1,
        name: null,
        days: [
          {
            id: ids?.dayId,
            dayNumber: 1,
            title: "Day 1",
            isRestDay: false,
            exercises: drillIds.map((id, i) => ({
              skillExerciseId: id,
              orderIndex: i,
              sets: 3,
              reps: "10",
              trackingLevel: "none" as const,
            })),
          },
        ],
      },
    ],
  };
}

async function setup() {
  const coach = await makeCoach();
  const athlete = await makeAthlete();
  const a = await makeDrill(coach.id, "Tee work");
  const b = await makeDrill(coach.id, "Front toss");
  const [program] = await db
    .insert(skillPrograms)
    .values({ coachId: coach.id, name: "Hitting block" })
    .returning();
  await storage.updateSkillProgramStructure(program.id, structure("Hitting block", [a.id, b.id]) as any, coach.id);

  const [week] = await db.select().from(skillProgramWeeks).where(eq(skillProgramWeeks.programId, program.id));
  const [day] = await db.select().from(skillProgramDays).where(eq(skillProgramDays.weekId, week.id));
  const [ex] = await db.select().from(skillProgramExercises).where(eq(skillProgramExercises.dayId, day.id));
  const [assignment] = await db
    .insert(skillAssignments)
    .values({ skillProgramId: program.id, athleteId: athlete.id, coachId: coach.id, startDate: "2026-01-05" })
    .returning();
  const [log] = await db
    .insert(skillSessionLogs)
    .values({
      skillAssignmentId: assignment.id,
      skillProgramDayId: day.id,
      skillProgramExerciseId: ex.id,
      athleteId: athlete.id,
      trackingLevel: "mechanics",
      videoUrl: "/uploads/skill-videos/kept.mp4",
    })
    .returning();
  return { coach, athlete, a, b, program, week, day, ex, log };
}

describe("editing a skill program preserves athlete history", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("renaming the program does not delete a captured session", async () => {
    const { coach, a, b, program, week, day, log } = await setup();
    await storage.updateSkillProgramStructure(
      program.id,
      structure("Hitting block, week 1", [a.id, b.id], { weekId: week.id, dayId: day.id }) as any,
      coach.id,
    );
    const after = await db.select().from(skillSessionLogs).where(eq(skillSessionLogs.id, log.id));
    expect(after.length).toBe(1);
    expect(after[0].videoUrl).toBe("/uploads/skill-videos/kept.mp4");
  });

  it("keeps the day and exercise rows the session points at", async () => {
    const { coach, a, b, program, week, day, ex } = await setup();
    await storage.updateSkillProgramStructure(
      program.id,
      structure("Hitting block", [a.id, b.id], { weekId: week.id, dayId: day.id }) as any,
      coach.id,
    );
    expect((await db.select().from(skillProgramDays).where(eq(skillProgramDays.id, day.id))).length).toBe(1);
    expect(
      (await db.select().from(skillProgramExercises).where(eq(skillProgramExercises.id, ex.id))).length,
    ).toBe(1);
  });

  it("still applies a genuine drill removal", async () => {
    const { coach, a, program, week, day } = await setup();
    await storage.updateSkillProgramStructure(
      program.id,
      structure("Hitting block", [a.id], { weekId: week.id, dayId: day.id }) as any,
      coach.id,
    );
    const rows = await db.select().from(skillProgramExercises).where(eq(skillProgramExercises.dayId, day.id));
    expect(rows.length).toBe(1);
    expect(rows[0].skillExerciseId).toBe(a.id);
  });
});
