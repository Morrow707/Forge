import { describe, it, expect, beforeAll } from "vitest";
import { resetDatabase, db } from "./test-support/fixtures";
import { academyLessons, academyQuizAnswers, academyQuizQuestions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { resyncRepoTrackLessons } from "./seed-coaches-corner-lessons";
import { ALL_REPO_COACHES_CORNER_TRACKS } from "./seed-data/coaches-corner";
import type { SeedAcademyTrack } from "./seed-data/coaches-corner/types";

/**
 * A REPO CORRECTION TO A COACHES CORNER LESSON REACHES A TRACK THAT ALREADY EXISTS, and an
 * admin's own edit never gets reverted (2026-10-08). The track seed creates by title once and
 * never touches lessons again, so the proofread of all twenty-four tracks would have reached a
 * fresh database only. This drives the re-sync against real rows: one lesson left as shipped
 * (re-synced), one edited by an admin (left alone), one already current (untouched).
 */
const shipped = ALL_REPO_COACHES_CORNER_TRACKS[0];
const quiz = shipped.quizQuestions.map((q) => ({ ...q, questionType: q.questionType ?? ("multiple_choice" as const), payload: q.payload ?? null }));
let trackId: number;

beforeAll(async () => {
  await resetDatabase();
  const created = await storage.createAcademyTrackWithStructure({
    title: shipped.title,
    description: shipped.description,
    keyPrinciplesForAi: shipped.keyPrinciplesForAi,
    orderIndex: 0,
    lessons: shipped.lessons.map((l) => ({ ...l, sources: [], flashcards: l.flashcards ?? [] })),
    quizQuestions: quiz,
  });
  trackId = created!.id;
  // An admin rewrote lesson 2 from the builder.
  const rows = await db.query.academyLessons.findMany({ where: eq(academyLessons.trackId, trackId) });
  const second = rows.find((r) => r.lessonNumber === 2)!;
  await db.update(academyLessons).set({ content: "An admin's own words." }).where(eq(academyLessons.id, second.id));
});

describe("resyncRepoTrackLessons", () => {
  it("re-syncs the shipped lesson, leaves the admin's alone, skips the current one", async () => {
    const corrected: SeedAcademyTrack = {
      ...shipped,
      lessons: shipped.lessons.map((l) =>
        l.lessonNumber === 1
          ? { ...l, title: l.title + " (corrected)", content: l.content + "\n\nA spelling fix.", flashcards: [{ front: "Q", back: "A" }] }
          : l.lessonNumber === 2
            ? { ...l, content: l.content + "\n\nA fix the admin will never see." }
            : l,
      ),
    };
    const result = await resyncRepoTrackLessons([corrected], new Map([[shipped.title, trackId]]));
    expect(result.resynced).toEqual([`${shipped.title} / lesson 1`]);
    expect(result.adminEdited).toEqual([`${shipped.title} / lesson 2`]);

    const rows = await db.query.academyLessons.findMany({ where: eq(academyLessons.trackId, trackId) });
    const byNumber = new Map(rows.map((r) => [r.lessonNumber, r]));
    expect(byNumber.get(1)!.content).toBe(shipped.lessons[0].content + "\n\nA spelling fix.");
    expect(byNumber.get(1)!.title).toBe(shipped.lessons[0].title + " (corrected)");
    expect(byNumber.get(1)!.flashcards).toEqual([{ front: "Q", back: "A" }]);
    expect(byNumber.get(2)!.content).toBe("An admin's own words.");
    expect(byNumber.get(3)!.content).toBe(shipped.lessons[2].content);
  });

  it("re-syncs a corrected quiz explanation in place and leaves an admin's question alone", async () => {
    const questions = await db.query.academyQuizQuestions.findMany({ where: eq(academyQuizQuestions.trackId, trackId), with: { answers: true } });
    const q1 = questions.find((q) => q.orderIndex === 1)!;
    await db.update(academyQuizQuestions).set({ questionText: "An admin's own question" }).where(eq(academyQuizQuestions.id, q1.id));
    const corrected: SeedAcademyTrack = {
      ...shipped,
      quizQuestions: shipped.quizQuestions.map((q) =>
        q.orderIndex <= 1 ? { ...q, answers: q.answers.map((a, i) => (i === 0 ? { ...a, explanation: a.explanation + " Corrected." } : a)) } : q,
      ),
    };
    const result = await resyncRepoTrackLessons([corrected], new Map([[shipped.title, trackId]]));
    expect(result.resynced).toEqual([`${shipped.title} / question 0`]);
    // Lesson 1 now carries the corrected text from the first test, which is not a recorded
    // version of the ORIGINAL track, so against the original it reads as edited -- correct, and
    // the unit test is what makes a real correction's hash get recorded.
    expect(result.adminEdited).toEqual([`${shipped.title} / lesson 1`, `${shipped.title} / lesson 2`, `${shipped.title} / question 1`]);
    const q0 = questions.find((q) => q.orderIndex === 0)!;
    const a0 = await db.query.academyQuizAnswers.findFirst({ where: eq(academyQuizAnswers.questionId, q0.id), orderBy: (t, { asc }) => asc(t.orderIndex) });
    expect(a0!.id).toBe(q0.answers.sort((x, y) => x.orderIndex - y.orderIndex)[0].id); // same row, updated in place
    expect(a0!.explanation).toBe(shipped.quizQuestions[0].answers[0].explanation + " Corrected.");
  });

  it("is idempotent: a second run changes nothing", async () => {
    const result = await resyncRepoTrackLessons([shipped], new Map([[shipped.title, trackId]]));
    // Lesson 1 now carries the corrected text, which is NOT a shipped hash of the ORIGINAL track,
    // so re-running with the original reads it as edited -- which is right: the newer version
    // only becomes "ours" once its hash is recorded, which the unit test enforces.
    expect(result.resynced).toEqual([]);
  });
});
