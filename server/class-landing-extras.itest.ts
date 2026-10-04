import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { classLessons, skillExercises } from "@shared/schema";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

/** The Classes landing page's additions (2026-10-04): where "Continue" goes on each enrolled
 * class, and the cross-class review deck that holds back the cards of lessons not yet read. */

async function classWith(coachId: number, name: string) {
  const [drill] = await db.insert(skillExercises).values({ coachId, name: `Drill ${name}`, sports: ["baseball"], skillType: "Hitting" }).returning();
  const exercises = [{ skillExerciseId: drill.id, orderIndex: 0, sets: 3, reps: "10", trackingLevel: "none" }];
  return storage.createClassWithStructure(
    coachId,
    {
      name,
      lessons: [
        {
          lessonNumber: 1,
          title: "One",
          unlockRule: "immediate",
          exercises,
          content: [{ body: "First." }],
          quizQuestions: [
            { orderIndex: 0, questionText: "Q?", questionType: "multiple_choice", answers: [{ orderIndex: 0, answerText: "Yes", isCorrect: true, explanation: "Yes." }, { orderIndex: 1, answerText: "No", isCorrect: false, explanation: "No." }] },
          ],
          flashcardsEnabled: true,
          flashcards: [{ front: `${name} front 1`, back: "b" }, { front: `${name} front 2`, back: "b" }],
        },
        {
          lessonNumber: 2,
          title: "Two",
          unlockRule: "immediate",
          exercises,
          content: [{ body: "Second." }],
          quizQuestions: [],
          flashcardsEnabled: true,
          flashcards: [{ front: `${name} front 3`, back: "b" }],
        },
      ],
    } as any,
    true,
  ) as Promise<any>;
}

describe("Continue and the review deck", () => {
  beforeEach(resetDatabase);

  it("names the next lesson to read, then the quiz left, then nothing; and deals only read lessons' cards", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const a = await classWith(coach.id, "A");
    const b = await classWith(coach.id, "B");
    const { enrollment: enrollA } = await storage.enrollAthleteInClass(coach.id, a.id, athlete.id, "2026-09-14");
    await storage.enrollAthleteInClass(coach.id, b.id, athlete.id, "2026-09-14");
    const lessonsA = await db.select().from(classLessons).where(eq(classLessons.classId, a.id));
    const [l1, l2] = [...lessonsA].sort((x, y) => x.lessonNumber - y.lessonNumber);

    // Nothing read: Continue goes to lesson one's reading; the deck is empty.
    let mine = await storage.getEnrolledClassesForAthlete(athlete.id);
    expect(mine.find((c) => c.classId === a.id)!.next).toEqual({ lessonId: l1.id, startAt: "reading" });
    expect(await storage.getFlashcardDeckForAthlete(athlete.id)).toEqual([]);

    // Lesson one read, quiz not passed: Continue goes to that quiz; its two cards are dealt.
    await storage.markClassLessonContentCompleted(enrollA.id, l1.id);
    mine = await storage.getEnrolledClassesForAthlete(athlete.id);
    expect(mine.find((c) => c.classId === a.id)!.next).toEqual({ lessonId: l1.id, startAt: "quiz" });
    const deck1 = await storage.getFlashcardDeckForAthlete(athlete.id);
    expect(deck1.map((c) => c.front).sort()).toEqual(["A front 1", "A front 2"]);
    expect(deck1[0]).toMatchObject({ className: "A", lessonNumber: 1, lessonTitle: "One" });

    // Quiz passed: on to lesson two's reading. Lesson two has no quiz, so once read the
    // class has no next.
    // The athlete-facing content carries no key; the full class does.
    const full = (await storage.getClassFull(a.id)) as any;
    const question = full.lessons.find((l: any) => l.id === l1.id).quizQuestions[0];
    await storage.submitClassLessonQuiz(enrollA.id, l1.id, [{ questionId: question.id, answerId: question.answers.find((x: any) => x.isCorrect).id }]);
    mine = await storage.getEnrolledClassesForAthlete(athlete.id);
    expect(mine.find((c) => c.classId === a.id)!.next).toEqual({ lessonId: l2.id, startAt: "reading" });
    // Lesson two's row exists only once lesson one is on the calendar and the pacing
    // recomputed, which is the order the app does it in.
    await storage.activateClassLesson(enrollA.id, l1.id);
    await storage.recomputeClassProgress(enrollA.id);
    await storage.markClassLessonContentCompleted(enrollA.id, l2.id);
    mine = await storage.getEnrolledClassesForAthlete(athlete.id);
    expect(mine.find((c) => c.classId === a.id)!.next).toBeNull();
    expect((await storage.getFlashcardDeckForAthlete(athlete.id)).map((c) => c.front).sort()).toEqual(["A front 1", "A front 2", "A front 3"]);
    // Class B, unread, contributes nothing.
    expect(mine.find((c) => c.classId === b.id)!.next).toMatchObject({ startAt: "reading" });
  });
});
