import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { skillAssignments, skillExercises } from "@shared/schema";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

// Two defects met here. The start date a coach picks when enrolling an
// athlete was stored on the enrolment and then ignored, so a class set to
// begin later began immediately. And every lesson unlocked in one pass took
// that same date, which matters because overlapping skill assignments
// collapse to the newest -- so a quiz-less class opened all its lessons on
// one day and all but the last disappeared from the athlete's calendar.

async function makeDrill(coachId: number, name: string) {
  const [row] = await db
    .insert(skillExercises)
    .values({ coachId, name, sports: ["baseball"], skillType: "Hitting" })
    .returning();
  return row;
}

function lesson(n: number, drillId: number) {
  return {
    lessonNumber: n,
    title: `Lesson ${n}`,
    unlockRule: "immediate" as const,
    exercises: [{ skillExerciseId: drillId, orderIndex: 0, sets: 3, reps: "10", trackingLevel: "none" as const }],
    content: [],
    quizQuestions: [],
  };
}

describe("class enrolment honours the coach's start date", () => {
  beforeEach(resetDatabase);

  it("starts on the chosen date and gives each lesson its own day", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const drill = await makeDrill(coach.id, "Tee work");
    const cls = await storage.createClassWithStructure(
      coach.id,
      { name: "Hitting", lessons: [lesson(1, drill.id), lesson(2, drill.id), lesson(3, drill.id)] } as any,
      false,
    );
    const classId = (cls as any).id ?? cls;

    await storage.enrollAthleteInClass(coach.id, classId, athlete.id, "2026-09-14");

    const assigned = await db
      .select({ startDate: skillAssignments.startDate })
      .from(skillAssignments)
      .where(eq(skillAssignments.athleteId, athlete.id));
    const dates = assigned.map((a) => a.startDate).sort();

    expect(dates.length).toBe(3);
    // The coach's date, not today.
    expect(dates[0]).toBe("2026-09-14");
    // And three distinct days, so none of them collapses onto another.
    expect(new Set(dates).size).toBe(3);
    expect(dates).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
  });
});
