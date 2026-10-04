import type { QuizQuestionType, QuizQuestionPayload } from "@shared/class-quiz-grading";
import type { ClassReadingLevel } from "@shared/class-reading-level";

/** A Forge-official class written in the repo (2026-10-04), the shape the American Hitting
 * class pioneered, generalised so one seed routine creates and syncs every one of them.
 *
 * - Drills are named, never numbered: `drills` are skill-library names from server/seed.ts,
 *   and the seed throws if one is missing so a rename cannot silently empty a drill day.
 * - Every chapter ends on a "Key points:" page the reader draws as a box.
 * - Quiz questions carry a type (shared/class-quiz-grading.ts); multiple choice carries its
 *   answers, the other three carry a payload.
 * - Content, flashcards, reading level and quizzes are re-synced on every deploy, as the
 *   hitting class's are, so a wording fix here reaches an already-seeded class. */
export interface ForgeClassQuizQuestion {
  questionText: string;
  questionType?: QuizQuestionType;
  payload?: QuizQuestionPayload;
  answers?: { answerText: string; isCorrect: boolean; explanation: string }[];
}

export interface ForgeClassChapter {
  title: string;
  description: string;
  drills: string[];
  content: { title?: string; body: string; videoUrl?: string }[];
  flashcards: { front: string; back: string }[];
  quizQuestions: ForgeClassQuizQuestion[];
}

export interface ForgeClassContent {
  name: string;
  description: string;
  category: string;
  readingLevel: ClassReadingLevel;
  /** Chapter numbers (1-based) that cost money; the rest ride free. Empty: the whole class is free. */
  pricedChapters?: Record<number, number>;
  chapters: ForgeClassChapter[];
}

/** A chapter's closing page, drawn as a boxed summary by the reader. */
export function keyPoints(points: string[]): { title: string; body: string } {
  return { title: "Key Points", body: "Key points:\n" + points.map((p) => `- ${p}`).join("\n") };
}
