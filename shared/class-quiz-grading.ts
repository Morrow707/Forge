/** QUIZ QUESTION TYPES AND THEIR GRADING (2026-10-04).
 *
 * Four shapes, one grader, used by the server (submitClassLessonQuiz) and by the class
 * builder's preview (graded in the browser against the answer key it already holds), so the
 * two can never disagree about what passes.
 *
 * - multiple_choice: the original. Answers rows carry the key; payload is unused.
 * - fill_blank:      the question text has one blank written as ___ ; payload.accepted lists
 *                    every answer that counts, compared after normalising case, punctuation
 *                    and spacing. payload.explanation is shown after.
 * - ordering:        payload.items is the correct order; the athlete arranges a shuffled copy.
 * - matching:        payload.pairs is left -> right; the athlete pairs them from a shuffled
 *                    right column.
 *
 * Nothing here reads the database. A question is graded whole: right or wrong, never partial,
 * because the pass bar is a share of questions. */

export const QUIZ_QUESTION_TYPES = ["multiple_choice", "fill_blank", "ordering", "matching"] as const;
export type QuizQuestionType = (typeof QUIZ_QUESTION_TYPES)[number];

export type QuizQuestionPayload = {
  /** fill_blank: every accepted answer. */
  accepted?: string[];
  /** ordering: the items in the correct order. */
  items?: string[];
  /** matching: the correct pairs. */
  pairs?: { left: string; right: string }[];
  /** fill_blank, ordering, matching: shown after grading. */
  explanation?: string;
};

export type GradableQuestion = {
  id: number;
  questionType: QuizQuestionType;
  payload: QuizQuestionPayload | null;
  answers: { id: number; isCorrect: boolean }[];
};

export type QuizSubmission = {
  questionId: number;
  /** multiple_choice */
  answerId?: number | null;
  /** fill_blank */
  text?: string | null;
  /** ordering: the athlete's order, as the item strings */
  order?: string[] | null;
  /** matching: left -> the right the athlete chose */
  matches?: Record<string, string> | null;
};

/** Case, punctuation and run-on spaces do not decide a fill-in-the-blank. "Stretch-shortening
 * cycle" and "stretch shortening cycle" are the same answer. */
export function normalizeAnswerText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function gradeQuestion(q: GradableQuestion, sub: QuizSubmission | undefined): boolean {
  if (!sub) return false;
  switch (q.questionType) {
    case "multiple_choice": {
      const picked = q.answers.find((a) => a.id === sub.answerId);
      return Boolean(picked?.isCorrect);
    }
    case "fill_blank": {
      const accepted = (q.payload?.accepted ?? []).map(normalizeAnswerText).filter(Boolean);
      const given = normalizeAnswerText(sub.text ?? "");
      return given.length > 0 && accepted.includes(given);
    }
    case "ordering": {
      const items = q.payload?.items ?? [];
      const order = sub.order ?? [];
      return items.length > 0 && order.length === items.length && items.every((it, i) => it === order[i]);
    }
    case "matching": {
      const pairs = q.payload?.pairs ?? [];
      const matches = sub.matches ?? {};
      return pairs.length > 0 && pairs.every((p) => matches[p.left] === p.right);
    }
    default:
      return false;
  }
}

/** Is a submission complete enough to submit? The reader disables Submit until every
 * question has an answer of its own kind. */
export function isAnswered(q: { questionType: QuizQuestionType; payload: QuizQuestionPayload | null }, sub: QuizSubmission | undefined): boolean {
  if (!sub) return false;
  switch (q.questionType) {
    case "multiple_choice":
      return sub.answerId != null;
    case "fill_blank":
      return (sub.text ?? "").trim().length > 0;
    case "ordering":
      return (sub.order?.length ?? 0) === (q.payload?.items?.length ?? 0) && (q.payload?.items?.length ?? 0) > 0;
    case "matching":
      return (q.payload?.pairs ?? []).every((p) => Boolean(sub.matches?.[p.left]));
    default:
      return false;
  }
}

/** The payload an athlete may see before answering: never the key. Ordering gets the items
 * ALREADY shuffled, matching gets the lefts in order against a shuffled column of rights, and
 * fill-in-the-blank gets nothing beyond the question text. The shuffle happens here, on the
 * server, so the order on the wire carries no information -- a client-side shuffle would leave
 * the key readable in the network tab. */
export function athleteFacingPayload(questionType: QuizQuestionType, payload: QuizQuestionPayload | null): QuizQuestionPayload | null {
  if (!payload) return null;
  switch (questionType) {
    case "ordering":
      return { items: shuffledAway(payload.items ?? []) };
    case "matching": {
      const pairs = payload.pairs ?? [];
      const rights = shuffledAway(pairs.map((p) => p.right));
      return { pairs: pairs.map((p, i) => ({ left: p.left, right: rights[i] })) };
    }
    default:
      return null;
  }
}

/** A shuffle that never returns the input order for two or more distinct items, so the wire
 * order is never accidentally the key. */
function shuffledAway<T>(items: T[]): T[] {
  if (new Set(items).size < 2) return [...items];
  for (let attempt = 0; attempt < 20; attempt++) {
    const out = shuffled(items);
    if (out.some((it, i) => it !== items[i])) return out;
  }
  return [...items.slice(1), items[0]];
}

/** Deterministic-enough shuffle for a quiz: a copy, Fisher-Yates. */
export function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
