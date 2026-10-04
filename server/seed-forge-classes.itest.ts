import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { classes, classLessons, classLessonQuizQuestions, skillExercises } from "@shared/schema";
import { makeCoach, resetDatabase } from "./test-support/fixtures";
import { seedForgeClasses } from "./seed-forge-classes";
import { FORGE_CLASSES } from "./seed-data/forge-classes";
import { storage } from "./storage";

/** The repo-written classes seed once, re-sync on a second run, and serve to an athlete with
 * every quiz shape and every flashcard intact. */
describe("seedForgeClasses", () => {
  beforeEach(resetDatabase);

  it("creates each class once with its drills, pages, cards and typed quiz, and is idempotent", async () => {
    const owner = await makeCoach({ name: "Forge" });
    const names = new Set(FORGE_CLASSES.flatMap((c) => c.chapters.flatMap((ch) => ch.drills)));
    for (const name of names) {
      await db.insert(skillExercises).values({ coachId: owner.id, name, sports: ["Baseball"], skillType: "Any" });
    }

    await seedForgeClasses(owner.id);
    await seedForgeClasses(owner.id);

    const rows = await db.select().from(classes);
    expect(rows.map((r) => r.name).sort()).toEqual(FORGE_CLASSES.map((c) => c.name).sort());
    for (const cls of FORGE_CLASSES) {
      const row = rows.find((r) => r.name === cls.name)!;
      expect(row.isDraft).toBe(false);
      expect(row.isForgeOfficial).toBe(true);
      expect(row.readingLevel).toBe(cls.readingLevel);
      const full = await storage.getClassFull(row.id);
      expect(full!.lessons).toHaveLength(cls.chapters.length);
      for (const [i, ch] of cls.chapters.entries()) {
        const lesson: any = full!.lessons[i];
        expect(lesson.title).toBe(ch.title);
        expect(lesson.exercises.map((e: any) => e.skillExercise.name)).toEqual(ch.drills);
        expect(lesson.exercises.every((e: any) => e.trackingLevel === "mechanics")).toBe(true);
        expect(lesson.content).toHaveLength(ch.content.length);
        expect(lesson.flashcards).toHaveLength(ch.flashcards.length);
        const qs = await db.select().from(classLessonQuizQuestions).where(eq(classLessonQuizQuestions.classLessonId, lesson.id));
        expect(qs).toHaveLength(ch.quizQuestions.length);
        expect(qs.map((q) => q.questionType).sort()).toEqual(ch.quizQuestions.map((q) => q.questionType ?? "multiple_choice").sort());
        const served = await storage.getClassLessonContent(lesson.id);
        expect(served!.quizQuestions).toHaveLength(ch.quizQuestions.length);
        for (const q of served!.quizQuestions) expect(q.payload?.explanation).toBeUndefined();
      }
    }
    expect(await db.select().from(classLessons)).toHaveLength(FORGE_CLASSES.reduce((n, c) => n + c.chapters.length, 0));
  });
});
