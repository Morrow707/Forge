import { describe, it, expect } from "vitest";
import { ALL_COACHES_CORNER_TRACKS } from "./index";
import { SHIPPED_LESSON_CONTENT_HASHES, SHIPPED_QUIZ_QUESTION_HASHES, decideLessonResync, decideQuizQuestionResync, lessonContentHash, quizQuestionHash } from "./shipped-lesson-hashes";

// The lesson re-sync (server/seed-coaches-corner-lessons.ts) can only carry a repo correction
// onto a deployed track if the CURRENT repo text is itself a recorded version -- otherwise the
// next correction after this one would read today's text as an admin edit and leave it. So
// every lesson in the repo must hash into the set. When this fails, run
// `npx tsx scripts/record-shipped-lesson-hashes.ts` and commit the appended hashes.
describe("every repo-written Coaches Corner lesson is a recorded shipped version", () => {
  for (const track of ALL_COACHES_CORNER_TRACKS) {
    for (const lesson of track.lessons) {
      it(`${track.title} / lesson ${lesson.lessonNumber}`, () => {
        expect(SHIPPED_LESSON_CONTENT_HASHES.has(lessonContentHash(lesson.content))).toBe(true);
      });
    }
  }
});

describe("every repo-written Coaches Corner quiz question is a recorded shipped version", () => {
  for (const track of ALL_COACHES_CORNER_TRACKS) {
    for (const q of track.quizQuestions) {
      it(`${track.title} / question ${q.orderIndex}`, () => {
        expect(SHIPPED_QUIZ_QUESTION_HASHES.has(quizQuestionHash(q))).toBe(true);
      });
    }
  }
});

describe("decideQuizQuestionResync", () => {
  const shipped = ALL_COACHES_CORNER_TRACKS[0].quizQuestions[0];
  const corrected = { ...shipped, answers: shipped.answers.map((a, i) => (i === 0 ? { ...a, explanation: a.explanation + " (fixed)" } : a)) };
  it("leaves a matching question alone", () => expect(decideQuizQuestionResync(shipped, shipped)).toBe("unchanged"));
  it("re-syncs a shipped question whose explanation was corrected", () => expect(decideQuizQuestionResync(shipped, corrected)).toBe("resync"));
  it("never overwrites a question an admin rewrote", () =>
    expect(decideQuizQuestionResync({ ...shipped, questionText: "An admin's question" }, corrected)).toBe("admin_edited"));
  it("reads answer order by orderIndex, not array position", () =>
    expect(quizQuestionHash({ ...shipped, answers: [...shipped.answers].reverse() })).toBe(quizQuestionHash(shipped)));
});

describe("decideLessonResync", () => {
  const shipped = ALL_COACHES_CORNER_TRACKS[0].lessons[0].content;
  it("leaves a lesson that already matches the repo alone", () => {
    expect(decideLessonResync(shipped, shipped)).toBe("unchanged");
  });
  it("re-syncs a stored lesson that is a version Forge shipped", () => {
    expect(decideLessonResync(shipped, shipped + "\n\nA correction.")).toBe("resync");
  });
  it("never overwrites a lesson an admin edited", () => {
    expect(decideLessonResync(shipped + " (edited by an admin)", shipped)).toBe("admin_edited");
  });
  it("hashes are never removed: the pre-proofread 2026-10-08 set is still present", () => {
    expect(SHIPPED_LESSON_CONTENT_HASHES.size).toBeGreaterThanOrEqual(96);
    expect(SHIPPED_LESSON_CONTENT_HASHES.has("314dc8393297dfb9f4abf493ac8ecfcafa5e37dd19e4fc5003a302f2cc1b9a4f")).toBe(true);
  });
});
