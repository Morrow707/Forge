import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { classLessons, skillExercises } from "@shared/schema";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

/** Notes, quiz attempts, the coach's insights, the streak and the class certificate
 * (2026-10-04). */

async function classWithQuiz(coachId: number) {
  const [drill] = await db.insert(skillExercises).values({ coachId, name: "Tee", sports: ["baseball"], skillType: "Hitting" }).returning();
  return storage.createClassWithStructure(
    coachId,
    {
      name: "Insights",
      readingLevel: "middle_school",
      lessons: [
        {
          lessonNumber: 1,
          title: "Lesson 1",
          unlockRule: "immediate",
          exercises: [{ skillExerciseId: drill.id, orderIndex: 0, sets: 3, reps: "10", trackingLevel: "none" }],
          content: [{ body: "Load, then swing." }, { body: "Finish tall." }],
          quizQuestions: [
            {
              orderIndex: 0,
              questionText: "First?",
              answers: [
                { orderIndex: 0, answerText: "Load", isCorrect: true, explanation: "Yes." },
                { orderIndex: 1, answerText: "Swing", isCorrect: false, explanation: "No." },
              ],
            },
            {
              orderIndex: 1,
              questionText: "Last?",
              answers: [
                { orderIndex: 0, answerText: "Finish", isCorrect: true, explanation: "Yes." },
                { orderIndex: 1, answerText: "Load", isCorrect: false, explanation: "No." },
              ],
            },
          ],
        },
      ],
    } as any,
    true,
  ) as Promise<any>;
}

describe("notes, attempts, insights, streak and certificate", () => {
  beforeEach(resetDatabase);

  it("keeps every attempt, shows the coach what was missed and what was written, and issues the certificate", async () => {
    const coach = await makeCoach();
    const other = await makeCoach({ name: "Other coach" });
    const athlete = await makeAthlete();
    const cls = await classWithQuiz(coach.id);
    expect((await storage.getClassFull(cls.id))!.readingLevel).toBe("middle_school");
    await storage.enrollAthleteInClass(coach.id, cls.id, athlete.id, "2026-09-14");
    const [lesson] = await db.select().from(classLessons).where(eq(classLessons.classId, cls.id));
    const enrollment = (await storage.getClassEnrollmentForAthlete(athlete.id, cls.id))!;
    const content = await storage.getClassLessonContent(lesson.id);
    const [q1, q2] = content!.quizQuestions;

    await storage.saveClassLessonNote(enrollment.id, lesson.id, 1, "  Finish tall means chest up.  ");
    await storage.saveClassLessonNote(enrollment.id, lesson.id, 0, "to delete");
    await storage.saveClassLessonNote(enrollment.id, lesson.id, 0, "   ");
    expect(await storage.getClassLessonNotes(enrollment.id, lesson.id)).toMatchObject([{ pageIndex: 1, body: "Finish tall means chest up." }]);

    // Before any quiz: no certificate, no streak.
    expect((await storage.getClassCertificateForAthlete(athlete.id, cls.id))!.completedAt).toBeNull();
    expect(await storage.getLearningStreakForAthlete(athlete.id)).toEqual({ current: 0, longest: 0, activeToday: false });

    const fail = await storage.submitClassLessonQuiz(enrollment.id, lesson.id, [
      { questionId: q1.id, answerId: q1.answers.find((a: any) => a.answerText === "Load")!.id },
      { questionId: q2.id, answerId: q2.answers.find((a: any) => a.answerText === "Load")!.id },
    ]);
    expect(fail.passed).toBe(false);
    await storage.markClassLessonContentCompleted(enrollment.id, lesson.id);
    const pass = await storage.submitClassLessonQuiz(enrollment.id, lesson.id, [
      { questionId: q1.id, answerId: q1.answers.find((a: any) => a.answerText === "Load")!.id },
      { questionId: q2.id, answerId: q2.answers.find((a: any) => a.answerText === "Finish")!.id },
    ]);
    expect(pass.passed).toBe(true);

    const insights = await storage.getClassInsightsForCoach(coach.id, cls.id);
    expect(insights.questions.map((q) => [q.questionText, q.attempts, q.missed])).toEqual([
      ["First?", 2, 0],
      ["Last?", 2, 1],
    ]);
    expect(insights.athletes).toHaveLength(1);
    const [a] = insights.athletes;
    expect(a.attempts.map((t) => [t.correctCount, t.passed])).toEqual([[2, true], [1, false]]);
    expect(a.attempts[1].missed.map((m) => m.questionText)).toEqual(["Last?"]);
    expect(a.notes).toMatchObject([{ pageIndex: 1, body: "Finish tall means chest up.", lessonNumber: 1 }]);

    // Another coach sees nothing of this athlete.
    const theirs = await storage.getClassInsightsForCoach(other.id, cls.id);
    expect(theirs.athletes).toEqual([]);

    expect(await storage.getLearningStreakForAthlete(athlete.id)).toMatchObject({ current: 1, longest: 1, activeToday: true });
    const cert = (await storage.getClassCertificateForAthlete(athlete.id, cls.id))!;
    expect(cert.completedAt).not.toBeNull();
    expect(cert).toMatchObject({ className: "Insights", lessonCount: 1, quizCount: 1 });
  });
});
