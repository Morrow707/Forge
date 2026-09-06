import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { classLessons, skillAssignments, skillExercises } from "@shared/schema";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

// manuallyUnlockLesson is documented as forcing a lesson open "regardless of
// its unlock rule or payment gate". It only cleared the rule, so on a priced
// Forge lesson a coach's unlock set the flag, changed nothing, and reported
// the lesson still locked with no reason given.

describe("a coach's manual unlock frees a priced lesson", () => {
  beforeEach(resetDatabase);

  it("activates a priced Forge lesson the athlete never bought", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const [drill] = await db
      .insert(skillExercises)
      .values({ coachId: coach.id, name: "Tee", sports: ["baseball"], skillType: "Hitting" })
      .returning();

    // A Forge-official class whose first lesson costs money.
    const cls: any = await storage.createClassWithStructure(
      coach.id,
      {
        name: "Paid Hitting",
        lessons: [
          {
            lessonNumber: 1,
            title: "Lesson 1",
            unlockRule: "immediate",
            priceCents: 2500,
            exercises: [
              { skillExerciseId: drill.id, orderIndex: 0, sets: 3, reps: "10", trackingLevel: "none" },
            ],
            content: [],
            quizQuestions: [],
          },
        ],
      } as any,
      true,
    );

    await storage.enrollAthleteInClass(coach.id, cls.id, athlete.id, "2026-09-14");
    // Nothing activates while it is unpaid.
    expect((await db.select().from(skillAssignments).where(eq(skillAssignments.athleteId, athlete.id))).length).toBe(0);

    const [lesson] = await db.select().from(classLessons).where(eq(classLessons.classId, cls.id));
    const enrollment = await storage.getClassEnrollmentForAthlete(athlete.id, cls.id);
    await storage.manuallyUnlockLesson(enrollment!.id, lesson.id);

    // The unlock actually frees them.
    const assigned = await db.select().from(skillAssignments).where(eq(skillAssignments.athleteId, athlete.id));
    expect(assigned.length).toBe(1);

    // And the athlete's own progress view agrees it is open.
    const progress: any = await storage.getClassProgressForAthlete(athlete.id, cls.id);
    const row = (progress?.lessons ?? []).find((l: any) => l.lessonId === lesson.id || l.id === lesson.id);
    if (row) expect(row.locked ?? row.state === "locked").toBeFalsy();
  });
});
