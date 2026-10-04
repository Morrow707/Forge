import { describe, expect, it } from "vitest";
import { gradeQuestion, isAnswered, normalizeAnswerText, athleteFacingPayload } from "./class-quiz-grading";

describe("quiz grading", () => {
  it("fill in the blank ignores case, punctuation and spacing", () => {
    const q = { id: 1, questionType: "fill_blank" as const, payload: { accepted: ["Stretch-shortening cycle", "SSC"] }, answers: [] };
    expect(gradeQuestion(q, { questionId: 1, text: "stretch shortening   cycle" })).toBe(true);
    expect(gradeQuestion(q, { questionId: 1, text: "ssc." })).toBe(true);
    expect(gradeQuestion(q, { questionId: 1, text: "stretch cycle" })).toBe(false);
    expect(gradeQuestion(q, { questionId: 1, text: "" })).toBe(false);
    expect(normalizeAnswerText("  Hello,  World! ")).toBe("hello world");
  });

  it("ordering is whole or nothing", () => {
    const q = { id: 2, questionType: "ordering" as const, payload: { items: ["See it", "Decide", "Move"] }, answers: [] };
    expect(gradeQuestion(q, { questionId: 2, order: ["See it", "Decide", "Move"] })).toBe(true);
    expect(gradeQuestion(q, { questionId: 2, order: ["Decide", "See it", "Move"] })).toBe(false);
    expect(gradeQuestion(q, { questionId: 2, order: ["See it", "Decide"] })).toBe(false);
  });

  it("matching needs every pair", () => {
    const q = { id: 3, questionType: "matching" as const, payload: { pairs: [{ left: "Phosphates", right: "Seconds" }, { left: "Aerobic", right: "Minutes" }] }, answers: [] };
    expect(gradeQuestion(q, { questionId: 3, matches: { Phosphates: "Seconds", Aerobic: "Minutes" } })).toBe(true);
    expect(gradeQuestion(q, { questionId: 3, matches: { Phosphates: "Minutes", Aerobic: "Seconds" } })).toBe(false);
    expect(isAnswered(q, { questionId: 3, matches: { Phosphates: "Seconds" } })).toBe(false);
  });

  it("multiple choice still grades by the answer row", () => {
    const q = { id: 4, questionType: "multiple_choice" as const, payload: null, answers: [{ id: 10, isCorrect: false }, { id: 11, isCorrect: true }] };
    expect(gradeQuestion(q, { questionId: 4, answerId: 11 })).toBe(true);
    expect(gradeQuestion(q, { questionId: 4, answerId: 10 })).toBe(false);
    expect(gradeQuestion(q, undefined)).toBe(false);
  });

  it("the athlete never receives the key", () => {
    expect(athleteFacingPayload("fill_blank", { accepted: ["x"], explanation: "why" })).toBeNull();
    const ordering = athleteFacingPayload("ordering", { items: ["a", "b", "c"], explanation: "why" });
    expect([...(ordering?.items ?? [])].sort()).toEqual(["a", "b", "c"]);
    expect(ordering?.items).not.toEqual(["a", "b", "c"]);
    expect(ordering).not.toHaveProperty("explanation");
    const matching = athleteFacingPayload("matching", { pairs: [{ left: "l1", right: "r1" }, { left: "l2", right: "r2" }], explanation: "why" });
    expect(matching?.pairs?.map((p) => p.left)).toEqual(["l1", "l2"]);
    expect([...(matching?.pairs?.map((p) => p.right) ?? [])].sort()).toEqual(["r1", "r2"]);
    expect(matching?.pairs?.map((p) => p.right)).not.toEqual(["r1", "r2"]);
  });
});
