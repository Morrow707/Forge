import { describe, expect, it } from "vitest";
import { findVerbatimLesson, longestSharedRun, MAX_SHARED_RUN_WORDS } from "./academy-draft-guard";

const SOURCE =
  "Periodization is the systematic planning of athletic training. The aim is to reach the best possible performance in the most important competition of the year, and it involves progressive cycling of various aspects of a training program during a specific period.";

describe("the draft guard", () => {
  it("passes a lesson written in its own words that shares a short phrase", () => {
    const lesson =
      "A season is planned backwards from the meet that matters. Periodization is the systematic planning of that season: blocks with a purpose, each one setting up the next.";
    expect(longestSharedRun(lesson, SOURCE)).toBeLessThanOrEqual(MAX_SHARED_RUN_WORDS);
    expect(findVerbatimLesson([{ title: "Planning", content: lesson }], [{ text: SOURCE, label: "Book p. 1" }])).toBeNull();
  });

  it("refuses a lifted sentence, however the punctuation moved", () => {
    const lifted =
      "Remember: the aim is to reach the best possible performance, in the most important competition of the year; and it involves progressive cycling.";
    expect(longestSharedRun(lifted, SOURCE)).toBeGreaterThan(MAX_SHARED_RUN_WORDS);
    const finding = findVerbatimLesson(
      [{ title: "Fine", content: "Own words here." }, { title: "Lifted", content: lifted }],
      [{ text: SOURCE, label: "Book p. 1" }],
    );
    expect(finding).toMatchObject({ lessonIndex: 1, sourceLabel: "Book p. 1" });
  });

  it("counts a shared run in words, case-insensitively", () => {
    expect(longestSharedRun("THE AIM IS TO REACH the best", "the aim is to reach the best possible")).toBe(7);
    expect(longestSharedRun("nothing in common at all", SOURCE)).toBeLessThan(4);
  });
});
