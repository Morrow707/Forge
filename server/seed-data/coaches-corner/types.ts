/** The shape the seed's Coaches Corner tracks take (server/seed.ts, seedAcademyTracks). The
 * 2026-10-03 tracks live one per file in this folder, written by Forge in its own words --
 * general strength and conditioning practice, no outside source reproduced and none cited
 * (docs/legal-open-questions.md, question 12). Each is four lessons and an eight-question
 * quiz. A track is added by title on deploy; an existing one is never overwritten. */
export type SeedAcademyTrack = {
  title: string;
  description: string;
  keyPrinciplesForAi: string;
  lessons: Array<{ lessonNumber: number; title: string; content: string; estMinutes: number }>;
  quizQuestions: Array<{
    orderIndex: number;
    questionText: string;
    answers: Array<{ orderIndex: number; answerText: string; isCorrect: boolean; explanation: string }>;
  }>;
};

/** Four answers, one correct, each with its own explanation. Keeps the quiz literals short. */
export function q(
  orderIndex: number,
  questionText: string,
  answers: [string, string][],
  correctIndex: number,
): SeedAcademyTrack["quizQuestions"][number] {
  return {
    orderIndex,
    questionText,
    answers: answers.map(([answerText, explanation], i) => ({
      orderIndex: i,
      answerText,
      isCorrect: i === correctIndex,
      explanation,
    })),
  };
}
