import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { classLessons, skillExercises } from "@shared/schema";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

/** Lesson flashcards (2026-10-04): stored with the lesson, served to the athlete only when
 * the lesson has them turned on, and kept across an edit. */

async function classWith(coachId: number, flashcardsEnabled: boolean) {
  const [drill] = await db.insert(skillExercises).values({ coachId, name: "Tee", sports: ["baseball"], skillType: "Hitting" }).returning();
  return storage.createClassWithStructure(
    coachId,
    {
      name: "Cards",
      lessons: [
        {
          lessonNumber: 1,
          title: "Lesson 1",
          unlockRule: "immediate",
          exercises: [{ skillExerciseId: drill.id, orderIndex: 0, sets: 3, reps: "10", trackingLevel: "none" }],
          content: [{ body: "See it, decide, move." }],
          quizQuestions: [],
          flashcardsEnabled,
          flashcards: [{ front: "First pillar?", back: "See it." }, { front: "Second?", back: "Decide." }],
        },
      ],
    } as any,
    true,
  ) as Promise<any>;
}

describe("lesson flashcards", () => {
  beforeEach(resetDatabase);

  it("reach the athlete only when turned on, and survive an edit", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const on = await classWith(coach.id, true);
    await storage.enrollAthleteInClass(coach.id, on.id, athlete.id, "2026-09-14");
    const [lesson] = await db.select().from(classLessons).where(eq(classLessons.classId, on.id));
    const served = await storage.getClassLessonContent(lesson.id);
    expect(served?.flashcards).toEqual([{ front: "First pillar?", back: "See it." }, { front: "Second?", back: "Decide." }]);

    // Turned off in an edit: the cards stay stored, the athlete stops seeing them.
    const full = await storage.getClassFull(on.id);
    await storage.updateClassStructure(on.id, {
      name: full!.name,
      lessons: full!.lessons.map((l: any) => ({
        id: l.id,
        lessonNumber: l.lessonNumber,
        title: l.title,
        unlockRule: l.unlockRule,
        exercises: l.exercises.map((e: any, i: number) => ({ skillExerciseId: e.skillExercise.id, orderIndex: i, sets: e.sets, reps: e.reps, trackingLevel: e.trackingLevel ?? "none" })),
        content: l.content,
        quizQuestions: [],
        flashcardsEnabled: false,
        flashcards: l.flashcards,
      })),
    } as any);
    expect((await storage.getClassLessonContent(lesson.id))?.flashcards).toEqual([]);
    expect((await storage.getClassFull(on.id))!.lessons[0].flashcards).toHaveLength(2);
  });

  it("a lesson created without cards serves none", async () => {
    const coach = await makeCoach();
    const off = await classWith(coach.id, false);
    const [lesson] = await db.select().from(classLessons).where(eq(classLessons.classId, off.id));
    expect((await storage.getClassLessonContent(lesson.id))?.flashcards).toEqual([]);
  });
});
