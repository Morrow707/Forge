import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { classLessons, classLessonQuizQuestions, skillExercises, classLessonQuizQuestionInputSchema } from "@shared/schema";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

/** Quiz question types (2026-10-04): fill in the blank, ordering and matching beside multiple
 * choice. The athlete is never handed the key before grading, every shape is graded by the
 * one shared function, and the input schema refuses a question that cannot be graded. */

async function classWithFourTypes(coachId: number) {
  const [drill] = await db.insert(skillExercises).values({ coachId, name: "Tee", sports: ["baseball"], skillType: "Hitting" }).returning();
  return storage.createClassWithStructure(
    coachId,
    {
      name: "Types",
      lessons: [
        {
          lessonNumber: 1,
          title: "Lesson 1",
          unlockRule: "immediate",
          exercises: [{ skillExerciseId: drill.id, orderIndex: 0, sets: 3, reps: "10", trackingLevel: "none" }],
          content: [{ body: "Load, stride, swing." }],
          quizQuestions: [
            {
              orderIndex: 0,
              questionText: "Which comes first?",
              questionType: "multiple_choice",
              answers: [
                { orderIndex: 0, answerText: "Load", isCorrect: true, explanation: "Yes." },
                { orderIndex: 1, answerText: "Swing", isCorrect: false, explanation: "No." },
              ],
            },
            {
              orderIndex: 1,
              questionText: "The swing starts from the ___.",
              questionType: "fill_blank",
              payload: { accepted: ["ground", "the ground up"], explanation: "Force starts at the feet." },
              answers: [],
            },
            {
              orderIndex: 2,
              questionText: "Put the swing in order.",
              questionType: "ordering",
              payload: { items: ["Load", "Stride", "Swing", "Finish"] },
              answers: [],
            },
            {
              orderIndex: 3,
              questionText: "Match the phase to its cue.",
              questionType: "matching",
              payload: { pairs: [{ left: "Load", right: "Sit back" }, { left: "Stride", right: "Land soft" }, { left: "Swing", right: "Turn hard" }] },
              answers: [],
            },
          ],
        },
      ],
    } as any,
    true,
  ) as Promise<any>;
}

describe("quiz question types", () => {
  beforeEach(resetDatabase);

  it("the athlete sees every shape without its key, and the grader passes a right set", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const cls = await classWithFourTypes(coach.id);
    await storage.enrollAthleteInClass(coach.id, cls.id, athlete.id, "2026-09-14");
    const [lesson] = await db.select().from(classLessons).where(eq(classLessons.classId, cls.id));
    const served = await storage.getClassLessonContent(lesson.id);
    const qs = served!.quizQuestions;
    expect(qs.map((q: any) => q.questionType)).toEqual(["multiple_choice", "fill_blank", "ordering", "matching"]);

    // No key on the wire: the blank's accepted answers are absent, the ordering is never in the
    // correct order, the matching rights are never in the pairs' order, and no explanation.
    expect(qs[1].payload).toBeNull();
    expect([...qs[2].payload!.items!].sort()).toEqual(["Finish", "Load", "Stride", "Swing"]);
    expect(qs[2].payload!.items).not.toEqual(["Load", "Stride", "Swing", "Finish"]);
    expect(qs[3].payload!.pairs!.map((p: any) => p.left)).toEqual(["Load", "Stride", "Swing"]);
    expect(qs[3].payload!.pairs!.map((p: any) => p.right)).not.toEqual(["Sit back", "Land soft", "Turn hard"]);
    for (const q of qs) expect(q.payload?.explanation).toBeUndefined();
    for (const q of qs) for (const a of q.answers) expect(a).not.toHaveProperty("isCorrect");

    const enrollment = await storage.getClassEnrollmentForAthlete(athlete.id, cls.id);
    const right = qs[0].answers[0].id;
    const result = await storage.submitClassLessonQuiz(enrollment!.id, lesson.id, [
      { questionId: qs[0].id, answerId: right },
      { questionId: qs[1].id, text: "  The GROUND, up! " },
      { questionId: qs[2].id, order: ["Load", "Stride", "Swing", "Finish"] },
      { questionId: qs[3].id, matches: { Load: "Sit back", Stride: "Land soft", Swing: "Turn hard" } },
    ]);
    expect(result.correctCount).toBe(4);
    expect(result.passed).toBe(true);
    // The key comes back only now, with the explanation.
    expect(result.results[1].payload?.accepted).toEqual(["ground", "the ground up"]);
    expect(result.results[1].payload?.explanation).toBe("Force starts at the feet.");
    expect(result.results[2].payload?.items).toEqual(["Load", "Stride", "Swing", "Finish"]);

    const wrong = await storage.submitClassLessonQuiz(enrollment!.id, lesson.id, [
      { questionId: qs[0].id, answerId: right },
      { questionId: qs[1].id, text: "the hands" },
      { questionId: qs[2].id, order: ["Stride", "Load", "Swing", "Finish"] },
      { questionId: qs[3].id, matches: { Load: "Sit back", Stride: "Turn hard", Swing: "Land soft" } },
    ]);
    expect(wrong.results.map((r) => r.isCorrect)).toEqual([true, false, false, false]);
    expect(wrong.passed).toBe(false);
  });

  it("a question type is kept across an edit", async () => {
    const coach = await makeCoach();
    const cls = await classWithFourTypes(coach.id);
    const full = await storage.getClassFull(cls.id);
    await storage.updateClassStructure(cls.id, {
      name: full!.name,
      lessons: full!.lessons.map((l: any) => ({
        id: l.id,
        lessonNumber: l.lessonNumber,
        title: l.title,
        unlockRule: l.unlockRule,
        exercises: l.exercises.map((e: any, i: number) => ({ skillExerciseId: e.skillExercise.id, orderIndex: i, sets: e.sets, reps: e.reps, trackingLevel: e.trackingLevel ?? "none" })),
        content: l.content,
        quizQuestions: l.quizQuestions.map((q: any, i: number) => ({ ...q, orderIndex: i, answers: q.answers.map((a: any, j: number) => ({ ...a, orderIndex: j })) })),
      })),
    } as any);
    const rows = await db.select().from(classLessonQuizQuestions);
    expect(rows.map((r) => r.questionType).sort()).toEqual(["fill_blank", "matching", "multiple_choice", "ordering"]);
    expect(rows.find((r) => r.questionType === "matching")!.payload?.pairs).toHaveLength(3);
  });

  it("the input schema refuses a question that cannot be graded", () => {
    const bad = (q: any) => classLessonQuizQuestionInputSchema.safeParse({ orderIndex: 0, ...q }).success;
    expect(bad({ questionText: "No blank here", questionType: "fill_blank", payload: { accepted: ["x"] } })).toBe(false);
    expect(bad({ questionText: "A ___", questionType: "fill_blank", payload: { accepted: [] } })).toBe(false);
    expect(bad({ questionText: "Order", questionType: "ordering", payload: { items: ["a", "b"] } })).toBe(false);
    expect(bad({ questionText: "Order", questionType: "ordering", payload: { items: ["a", "a", "b"] } })).toBe(false);
    expect(bad({ questionText: "Match", questionType: "matching", payload: { pairs: [{ left: "a", right: "b" }] } })).toBe(false);
    expect(bad({ questionText: "MC", questionType: "multiple_choice", answers: [{ answerText: "a", isCorrect: true, explanation: "e" }] })).toBe(false);
    expect(bad({ questionText: "A ___", questionType: "fill_blank", payload: { accepted: ["x"] } })).toBe(true);
    // A question with no type is multiple choice, as every one stored before today is.
    expect(classLessonQuizQuestionInputSchema.parse({ orderIndex: 0, questionText: "MC", answers: [{ answerText: "a", isCorrect: true, explanation: "e" }, { answerText: "b", isCorrect: false, explanation: "e" }] }).questionType).toBe("multiple_choice");
  });
});
