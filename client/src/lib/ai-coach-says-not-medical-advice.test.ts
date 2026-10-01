import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// App Store guideline 1.4.1 (physical harm) is judged on the screen, not the EULA. The athlete
// chat's system prompt refuses to diagnose and sends pain to a doctor, and the legal documents
// carry the disclaimer, but until 2026-10-01 the AI Training Chat screen itself said nothing.
// Every surface where the AI talks to an athlete says, in its own words, that it is not medical
// advice and that pain goes to a person.
const SURFACES = [
  "client/src/components/ai-chat-panel.tsx",
  "client/src/pages/athlete/sport-coach.tsx",
];
const SAYS_NOT_MEDICAL = /not medical advice|talk to a doctor|see a doctor/i;
const SENDS_PAIN_TO_A_PERSON = /pain or injury/i;

describe("every AI chat surface says it is not medical advice", () => {
  for (const file of SURFACES) {
    it(file, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(SAYS_NOT_MEDICAL);
      expect(src).toMatch(SENDS_PAIN_TO_A_PERSON);
    });
  }

  it("the general chat's default description carries it, so a caller that passes no description still shows it", () => {
    const src = readFileSync("client/src/components/ai-chat-panel.tsx", "utf8");
    const def = src.match(/description = "([^"]+)"/)?.[1] ?? "";
    expect(def).toMatch(SAYS_NOT_MEDICAL);
  });
});
