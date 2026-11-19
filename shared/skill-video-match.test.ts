import { describe, expect, it } from "vitest";
import { skillSearchQuery, skillTitleVerdict } from "./skill-video-match";

// A SKILL DRILL IS MATCHED BY ITS OWN NAME'S WORDS, NOT BY THE LIFT GRAMMAR (2026-11-19).

describe("a skill drill title", () => {
  it.each([
    ["Tee Work - Inside Pitch", "Inside Pitch Tee Work | Baseball Hitting"],
    ["Bunt Placement Drill", "Bunt Placement | Youth Baseball"],
    ["Front Toss", "How to Do Front Toss for Hitters"],
    ["Two-Strike Approach Drill", "Two Strike Approach Drill for Softball Hitters"],
  ])("accepts %s <- %s", (name, title) => {
    expect(skillTitleVerdict(name, title)).toEqual({ ok: true });
  });

  it("refuses a title missing a word of the name, which is usually a different drill", () => {
    expect(skillTitleVerdict("Tee Work - Inside Pitch", "Tee Work for Hitters")).toMatchObject({ ok: false, reason: "missing_words" });
    expect(skillTitleVerdict("Soft Toss", "Front Toss Drill")).toMatchObject({ ok: false, reason: "missing_words" });
  });

  it("refuses a title framed as something other than a demonstration", () => {
    expect(skillTitleVerdict("Front Toss", "Front Toss MISTAKES to avoid")).toMatchObject({ ok: false, reason: "red_flag" });
    expect(skillTitleVerdict("Front Toss", "Best Front Toss Drill vs Tee Work")).toMatchObject({ ok: false, reason: "red_flag" });
  });

  it("is searched with its skill type for context", () => {
    expect(skillSearchQuery("Front Toss", "Hitting")).toBe("Front Toss Hitting drill");
    expect(skillSearchQuery("Front Toss", null)).toBe("Front Toss drill");
  });
});
