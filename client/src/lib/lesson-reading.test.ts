import { describe, expect, it } from "vitest";
import { countWords, estimateReadingMinutes } from "./lesson-reading";

describe("lesson reading time", () => {
  it("counts words, never markup", () => {
    expect(countWords("**Load** the back hip - then go")).toBe(6);
    expect(countWords("")).toBe(0);
  });
  it("rounds to a whole minute with a floor of one", () => {
    expect(estimateReadingMinutes([{ body: "a few words" }])).toBe(1);
    expect(estimateReadingMinutes([{ body: Array(450).fill("word").join(" ") }, { body: Array(150).fill("word").join(" ") }])).toBe(3);
  });
});
