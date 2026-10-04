import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { skillAssignments, skillProgramDays, skillProgramWeeks, skillExercises } from "@shared/schema";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

/** The drill-day video slot (2026-10-04): a lesson's drill can carry its own clip, which the
 * athlete's drill day serves ahead of the drill's library video; without one the library
 * video is what it always was. */

describe("a lesson drill's own clip", () => {
  beforeEach(resetDatabase);

  it("reaches the drill day, and the library video stands in when there is none", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const [tee] = await db.insert(skillExercises).values({ coachId: coach.id, name: "Tee", sports: ["baseball"], skillType: "Hitting", videoUrl: "https://youtu.be/library1" }).returning();
    const [toss] = await db.insert(skillExercises).values({ coachId: coach.id, name: "Toss", sports: ["baseball"], skillType: "Hitting", videoUrl: "https://youtu.be/library2" }).returning();
    const cls: any = await storage.createClassWithStructure(
      coach.id,
      {
        name: "Clips",
        lessons: [
          {
            lessonNumber: 1,
            title: "Lesson 1",
            unlockRule: "immediate",
            exercises: [
              { skillExerciseId: tee.id, orderIndex: 0, sets: 3, reps: "10", trackingLevel: "none", videoUrl: "https://youtu.be/thisday" },
              { skillExerciseId: toss.id, orderIndex: 1, sets: 3, reps: "10", trackingLevel: "none" },
            ],
            content: [],
            quizQuestions: [],
          },
        ],
      } as any,
      true,
    );
    await storage.enrollAthleteInClass(coach.id, cls.id, athlete.id, "2026-09-14");
    const [assignment] = await db.select().from(skillAssignments).where(eq(skillAssignments.athleteId, athlete.id));
    const [week] = await db.select().from(skillProgramWeeks).where(eq(skillProgramWeeks.programId, assignment.skillProgramId));
    const [day] = await db.select().from(skillProgramDays).where(eq(skillProgramDays.weekId, week.id));
    const served: any = await storage.getSkillDayForAthlete(athlete.id, assignment.id, day.id);
    expect(served.exercises.map((e: any) => e.videoUrl)).toEqual(["https://youtu.be/thisday", "https://youtu.be/library2"]);

    // The clip survives an edit that does not touch it.
    const full = await storage.getClassFull(cls.id);
    expect(full!.lessons[0].exercises.map((e: any) => e.videoUrl)).toEqual(["https://youtu.be/thisday", null]);
  });
});
