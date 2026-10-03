/** The pass mark for a Coaches Corner quiz, as a fraction of questions correct. 80% is the
 * mark most continuing-education providers use, and a track with ten questions passes at
 * eight. One constant, read by the grader and by the screen that says what passing takes. */
export const ACADEMY_QUIZ_PASS_MARK = 0.8;

export function academyQuizPassed(correct: number, total: number): boolean {
  if (total <= 0) return false;
  return correct / total >= ACADEMY_QUIZ_PASS_MARK;
}
