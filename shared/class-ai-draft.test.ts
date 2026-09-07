import { describe, it, expect } from "vitest";
import { classAiDraftSchema } from "./schema";

function validDraft() {
  return {
    name: "Hitting Fundamentals",
    description: "The five pillars of athletic hitting.",
    category: "Hitting",
    lessons: [
      {
        title: "What Every Hitter Must Know",
        description: "The foundation every later chapter builds on.",
        content: [{ title: "Split-Second Decisions", body: "A hitter has a fraction of a second..." }],
        quizQuestions: [
          {
            questionText: "What is the last piece of the chain?",
            answers: [
              { answerText: "The swing", isCorrect: true, explanation: "It's the last link, not the whole chain." },
              { answerText: "Seeing the pitch", isCorrect: false, explanation: "That's the first link." },
            ],
          },
        ],
      },
    ],
  };
}

describe("classAiDraftSchema", () => {
  it("accepts a well-formed draft", () => {
    expect(classAiDraftSchema.safeParse(validDraft()).success).toBe(true);
  });

  it("accepts a lesson with no quiz questions -- thin material shouldn't be padded", () => {
    const draft = validDraft();
    draft.lessons[0].quizQuestions = [];
    expect(classAiDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("rejects a lesson with zero content pages", () => {
    const draft = validDraft();
    draft.lessons[0].content = [];
    expect(classAiDraftSchema.safeParse(draft).success).toBe(false);
  });

  it("rejects a quiz question with only one answer", () => {
    const draft = validDraft();
    draft.lessons[0].quizQuestions[0].answers = [draft.lessons[0].quizQuestions[0].answers[0]];
    expect(classAiDraftSchema.safeParse(draft).success).toBe(false);
  });

  it("rejects a draft with no lessons at all", () => {
    const draft = validDraft();
    draft.lessons = [];
    expect(classAiDraftSchema.safeParse(draft).success).toBe(false);
  });

  it("caps runaway output size (cost/latency guardrail, not a realistic count)", () => {
    const draft = validDraft();
    draft.lessons = Array.from({ length: 21 }, (_, i) => ({ ...validDraft().lessons[0], title: `Lesson ${i}` }));
    expect(classAiDraftSchema.safeParse(draft).success).toBe(false);
  });
});

describe("quiz answer key validation", () => {
  const draftWith = (answers: { answerText: string; isCorrect: boolean; explanation: string }[]) => ({
    name: "Hitting",
    lessons: [
      {
        title: "Lesson 1",
        content: [{ body: "Some reading." }],
        quizQuestions: [{ questionText: "Which link is last?", answers }],
      },
    ],
  });

  it("rejects a question with no correct answer", () => {
    // submitClassLessonQuiz scores the submitted answer's own isCorrect flag,
    // so a question nobody can answer right makes the lesson unpassable at the
    // 0.8 threshold -- every athlete stuck on it, permanently.
    const result = classAiDraftSchema.safeParse(
      draftWith([
        { answerText: "The swing", isCorrect: false, explanation: "No." },
        { answerText: "Seeing the pitch", isCorrect: false, explanation: "No." },
      ]),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a question with two correct answers", () => {
    // An athlete picking the other right answer is marked wrong and then shown
    // an explanation telling them they were right.
    const result = classAiDraftSchema.safeParse(
      draftWith([
        { answerText: "The swing", isCorrect: true, explanation: "Yes." },
        { answerText: "The load", isCorrect: true, explanation: "Also yes." },
      ]),
    );
    expect(result.success).toBe(false);
  });

  it("accepts a question with exactly one correct answer", () => {
    const result = classAiDraftSchema.safeParse(
      draftWith([
        { answerText: "The swing", isCorrect: true, explanation: "It's the last link." },
        { answerText: "Seeing the pitch", isCorrect: false, explanation: "That's the first." },
      ]),
    );
    expect(result.success).toBe(true);
  });
});
