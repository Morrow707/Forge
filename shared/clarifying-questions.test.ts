import { describe, it, expect } from "vitest";
import {
  parseClarifyingQuestion,
  ASK_INSTEAD_OF_GUESSING,
  ASK_CLARIFYING_QUESTION_TOOL,
} from "./clarifying-questions";

describe("clarifying questions", () => {
  const good = {
    question: "Are you asking about in-season or off-season?",
    options: ["In season", "Off season"],
    because: "The volume that is sensible differs a lot between them.",
  };

  it("accepts a well-formed question", () => {
    expect(parseClarifyingQuestion(good)).toEqual(good);
  });

  it("rejects a question with only one option", () => {
    // One option is not a question, it is a confirmation, and it wastes a
    // turn that could have been an answer.
    expect(parseClarifyingQuestion({ ...good, options: ["In season"] })).toBeNull();
  });

  it("rejects a question that has become a form", () => {
    expect(
      parseClarifyingQuestion({ ...good, options: ["a", "b", "c", "d", "e"] }),
    ).toBeNull();
  });

  it("rejects an empty question", () => {
    expect(parseClarifyingQuestion({ ...good, question: "   " })).toBeNull();
  });

  it("survives arbitrary junk from a model", () => {
    for (const junk of [null, undefined, 42, "a string", {}, { options: "not an array" }]) {
      expect(parseClarifyingQuestion(junk)).toBeNull();
    }
  });

  it("spends most of the guidance on when NOT to ask", () => {
    // Permission to ask is easy; restraint is the part that has to be
    // taught. An assistant that asks before every answer trains people to
    // click through without reading.
    expect(ASK_INSTEAD_OF_GUESSING).toContain("materially DIFFERENT");
    expect(ASK_INSTEAD_OF_GUESSING).toContain("never ask more than one");
    expect(ASK_INSTEAD_OF_GUESSING).toContain("Do not ask");
  });

  it("forbids asking as a way to dodge a refusal", () => {
    // The failure mode where "what do you mean by that?" becomes a soft
    // refusal the person cannot tell from a real question.
    expect(ASK_INSTEAD_OF_GUESSING).toContain("Decline that plainly");
  });

  it("keeps the tool schema in step with what the parser accepts", () => {
    const required = ASK_CLARIFYING_QUESTION_TOOL.input_schema.required;
    expect(required).toContain("question");
    expect(required).toContain("options");
    expect(required).toContain("because");
  });
});
