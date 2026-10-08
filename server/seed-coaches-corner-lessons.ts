import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { academyLessons, academyQuizAnswers, academyQuizQuestions } from "@shared/schema";
import type { SeedAcademyTrack } from "./seed-data/coaches-corner/types";
import { decideLessonResync, decideQuizQuestionResync } from "./seed-data/coaches-corner/shipped-lesson-hashes";

/** Carries a repo correction to a Coaches Corner lesson onto a track that already exists on the
 * deployed database (2026-10-08). The track seed creates a track once by title and never touches
 * its lessons again, so the 2026-10-08 proofread of all twenty-four tracks would have reached a
 * fresh database only -- the same class of bug as the Barbell Shoulder Press instructions that
 * sat corrected in seed.ts for two weeks while production kept the old text.
 *
 * The rule is in decideLessonResync: a stored lesson is overwritten only when its content is a
 * version Forge shipped (SHIPPED_LESSON_CONTENT_HASHES); a lesson an admin edited is left alone
 * and named in the log. Title and flashcards ride with the content, because they are corrected
 * together and a lesson whose content is still ours has not had its cards edited either (the
 * builder saves the whole lesson). A quiz question follows the same rule by orderIndex (its
 * text, payload and each answer's text, key and explanation updated IN PLACE, never deleted or
 * re-created, because attempts hang off the question and answer ids). Returns what it did, for
 * the seed log and the test. */
export async function resyncRepoTrackLessons(
  tracks: SeedAcademyTrack[],
  trackIdByTitle: Map<string, number>,
): Promise<{ resynced: string[]; adminEdited: string[] }> {
  const resynced: string[] = [];
  const adminEdited: string[] = [];
  for (const track of tracks) {
    const trackId = trackIdByTitle.get(track.title);
    if (trackId == null) continue; // created fresh this deploy, already current
    const stored = await db.query.academyLessons.findMany({
      where: eq(academyLessons.trackId, trackId),
      orderBy: asc(academyLessons.lessonNumber),
    });
    for (const lesson of track.lessons) {
      const row = stored.find((s) => s.lessonNumber === lesson.lessonNumber);
      if (!row) continue;
      const label = `${track.title} / lesson ${lesson.lessonNumber}`;
      const decision = decideLessonResync(row.content, lesson.content);
      if (decision === "unchanged") continue;
      if (decision === "admin_edited") {
        adminEdited.push(label);
        continue;
      }
      await db
        .update(academyLessons)
        .set({ title: lesson.title, content: lesson.content, flashcards: lesson.flashcards ?? [] })
        .where(and(eq(academyLessons.id, row.id), eq(academyLessons.trackId, trackId)));
      resynced.push(label);
    }

    const storedQuestions = await db.query.academyQuizQuestions.findMany({
      where: eq(academyQuizQuestions.trackId, trackId),
      with: { answers: true },
    });
    for (const question of track.quizQuestions) {
      const row = storedQuestions.find((s) => s.orderIndex === question.orderIndex);
      if (!row) continue;
      const label = `${track.title} / question ${question.orderIndex}`;
      const decision = decideQuizQuestionResync(row, question);
      if (decision === "unchanged") continue;
      if (decision === "admin_edited") {
        adminEdited.push(label);
        continue;
      }
      await db
        .update(academyQuizQuestions)
        .set({ questionText: question.questionText, questionType: question.questionType ?? "multiple_choice", payload: question.payload ?? null })
        .where(eq(academyQuizQuestions.id, row.id));
      for (const answer of question.answers) {
        const stored = row.answers.find((a) => a.orderIndex === answer.orderIndex);
        if (!stored) continue;
        await db
          .update(academyQuizAnswers)
          .set({ answerText: answer.answerText, isCorrect: answer.isCorrect, explanation: answer.explanation })
          .where(eq(academyQuizAnswers.id, stored.id));
      }
      resynced.push(label);
    }
  }
  if (resynced.length) console.log(`Coaches Corner: re-synced ${resynced.length} corrected lesson(s): ${resynced.join("; ")}`);
  if (adminEdited.length) console.log(`Coaches Corner: left ${adminEdited.length} admin-edited lesson(s) alone: ${adminEdited.join("; ")}`);
  return { resynced, adminEdited };
}
