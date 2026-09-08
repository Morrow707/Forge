import { describe, it, expect } from "vitest";
import {
  answerStyleInstruction,
  ANSWER_REGISTERS,
  ANSWER_LENGTHS,
  isAnswerRegister,
  isAnswerLength,
} from "@shared/answer-style";

describe("answer style", () => {
  it("costs nothing for someone who never set a preference", () => {
    // Every reader who has not touched this must get byte-identical prompts
    // to before the feature existed. A paragraph saying "be normal" would
    // change every answer in the app for no reason.
    expect(answerStyleInstruction(null, null)).toBe("");
    expect(answerStyleInstruction("standard", "standard")).toBe("");
    expect(answerStyleInstruction(undefined, undefined)).toBe("");
  });

  it("ignores a value that is not a real setting", () => {
    expect(answerStyleInstruction("shakespearean", "epic")).toBe("");
  });

  it("carries each axis independently", () => {
    // The two are not one expertise slider. A coach may want technical
    // language in two sentences; an athlete plain language at length.
    const technicalBrief = answerStyleInstruction("technical", "brief");
    expect(technicalBrief).toContain("terminology");
    expect(technicalBrief).toContain("three sentences");

    const plainOnly = answerStyleInstruction("plain", null);
    expect(plainOnly).toContain("plain, everyday language");
    expect(plainOnly).not.toContain("three sentences");
  });

  it("says out loud that style never overrides a rule", () => {
    // The failure this guards is a model reading "be brief" as permission to
    // drop a referral or a caution. The boundary is stated rather than hoped
    // for, and it must be present in every non-empty instruction.
    for (const register of ["plain", "technical"]) {
      for (const length of ["brief", "thorough"]) {
        const text = answerStyleInstruction(register, length);
        expect(text).toContain("STYLE ONLY");
        expect(text.toLowerCase()).toContain("never a reason to drop");
      }
    }
  });

  it("recognises exactly the keys it offers", () => {
    for (const r of ANSWER_REGISTERS) expect(isAnswerRegister(r.key)).toBe(true);
    for (const l of ANSWER_LENGTHS) expect(isAnswerLength(l.key)).toBe(true);
    expect(isAnswerRegister("nope")).toBe(false);
    expect(isAnswerLength("nope")).toBe(false);
  });
});
