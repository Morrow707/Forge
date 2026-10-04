import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { classes, classLessons, classLessonQuizAnswers, classLessonQuizQuestions, classStructureSchema } from "@shared/schema";
import { FORGE_CLASSES } from "./seed-data/forge-classes";
import type { ForgeClassContent } from "./seed-data/forge-classes/types";

/** Creates each repo-written Forge class once, by name, under the class owner, and on every
 * deploy re-syncs the parts that are plain data: reading level, pages, flashcards and the
 * quiz. The drill tree is created once and left alone afterwards, as the hitting class's is,
 * because athletes' session logs hang off those exercise ids. Every drill is tracked as
 * "mechanics" so a drill day has a Record action on it (see americanHittingTrackingLevel in
 * seed.ts for why "none" leaves a lesson un-loggable). */
export async function seedForgeClasses(ownerId: number, only: ForgeClassContent[] = FORGE_CLASSES) {
  const allSkills = await storage.getAllSkillExercises();
  const skillIdByName = new Map(allSkills.map((s) => [s.name, s.id]));

  for (const cls of only) {
    let row = await db.query.classes.findFirst({ where: and(eq(classes.name, cls.name), eq(classes.coachId, ownerId)) });
    if (!row) {
      const structure = classStructureSchema.parse({
        name: cls.name,
        description: cls.description,
        category: cls.category,
        readingLevel: cls.readingLevel,
        lessons: cls.chapters.map((ch, i) => ({
          lessonNumber: i + 1,
          title: ch.title,
          description: ch.description,
          unlockRule: "immediate",
          unlockThreshold: null,
          priceCents: cls.pricedChapters?.[i + 1] ?? null,
          exercises: ch.drills.map((name, orderIndex) => {
            const skillExerciseId = skillIdByName.get(name);
            if (!skillExerciseId) throw new Error(`Forge class "${cls.name}": missing skill exercise "${name}"`);
            return { skillExerciseId, orderIndex, sets: 3, reps: "10", restSeconds: null, notes: null, trackingLevel: "mechanics" };
          }),
          content: ch.content,
          flashcardsEnabled: ch.flashcards.length > 0,
          flashcards: ch.flashcards,
          quizQuestions: [],
        })),
      });
      const created = await storage.createClassWithStructure(ownerId, structure, true);
      // Live from the start, as the hitting class is: it is Forge's own catalog, not a draft.
      await db.update(classes).set({ isDraft: false }).where(eq(classes.id, created.id));
      row = (await db.query.classes.findFirst({ where: eq(classes.id, created.id) }))!;
      console.log(`Seeded "${cls.name}" class.`);
    }

    await db.update(classes).set({ description: cls.description, category: cls.category, readingLevel: cls.readingLevel }).where(eq(classes.id, row.id));
    const lessons = await db.query.classLessons.findMany({ where: eq(classLessons.classId, row.id), orderBy: asc(classLessons.lessonNumber) });
    for (const lesson of lessons) {
      const ch = cls.chapters[lesson.lessonNumber - 1];
      if (!ch) continue;
      await db
        .update(classLessons)
        .set({ title: ch.title, description: ch.description, content: ch.content, flashcardsEnabled: ch.flashcards.length > 0, flashcards: ch.flashcards })
        .where(eq(classLessons.id, lesson.id));
      // Quiz: wipe and rebuild, as the hitting seed does. Attempts keep question ids only for
      // the coach's "what was missed" view, and a question that no longer exists reads as such.
      await db.delete(classLessonQuizQuestions).where(eq(classLessonQuizQuestions.classLessonId, lesson.id));
      for (const [orderIndex, q] of ch.quizQuestions.entries()) {
        const [question] = await db
          .insert(classLessonQuizQuestions)
          .values({ classLessonId: lesson.id, orderIndex, questionText: q.questionText, questionType: q.questionType ?? "multiple_choice", payload: q.payload ?? null })
          .returning();
        if (q.answers?.length) {
          await db.insert(classLessonQuizAnswers).values(q.answers.map((a, i) => ({ questionId: question.id, orderIndex: i, answerText: a.answerText, isCorrect: a.isCorrect, explanation: a.explanation })));
        }
      }
    }
  }
}
