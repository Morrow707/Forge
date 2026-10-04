import { describe, expect, it } from "vitest";
import { speakableText, splitForNarration } from "./read-aloud-text";

describe("speakableText", () => {
  it("drops the marks the reader draws and keeps the words", () => {
    const body = "**Location.** Where the ball crosses.\n\n> A sentence worth remembering.\n\nKey points:\n- First.\n- Second.";
    expect(speakableText(body)).toBe("Location. Where the ball crosses.\n\nA sentence worth remembering.\n\nKey points.\nFirst.\nSecond.");
  });
});

describe("splitForNarration", () => {
  it("keeps short pages whole and splits long ones at paragraphs, then sentences", () => {
    expect(splitForNarration("One.\n\nTwo.")).toEqual(["One.\n\nTwo."]);
    const para = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const pieces = splitForNarration(`${para}\n\n${para}`, 300);
    expect(pieces.length).toBeGreaterThan(2);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(300);
    expect(pieces.join(" ").replace(/\s+/g, " ")).toBe(`${para} ${para}`.replace(/\s+/g, " "));
  });
});
