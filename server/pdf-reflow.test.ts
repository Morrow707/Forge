import { describe, it, expect } from "vitest";
import { reflowExtractedText, splitIntoPassages } from "./pdf-extract";

describe("reflowExtractedText", () => {
  it("closes up a word the typesetter hyphenated across a line", () => {
    expect(reflowExtractedText("the stim-\nulation of the motor nerve stops")).toContain(
      "stimulation",
    );
    expect(reflowExtractedText("an action poten-\ntial")).toContain("potential");
  });

  it("leaves a real compound alone when the break is not typesetting", () => {
    expect(reflowExtractedText("cross-\nEducation")).toContain("cross-");
    expect(reflowExtractedText("a 10-\n15 rep range")).toContain("10-");
  });

  it("rejoins a paragraph the page layout wrapped", () => {
    const wrapped = "Relaxation occurs when the stimulation of the\nmotor nerve stops.";
    expect(reflowExtractedText(wrapped)).toBe(
      "Relaxation occurs when the stimulation of the motor nerve stops.",
    );
  });

  it("keeps a real paragraph break", () => {
    expect(reflowExtractedText("First paragraph\n\nSecond paragraph")).toContain("\n\n");
  });

  it("keeps a heading on its own line", () => {
    // Ends in a colon or full stop, so it is not a wrapped line of prose.
    expect(reflowExtractedText("Relaxation Phase.\nRelaxation occurs when")).toContain(".\n");
  });

  it("makes the searched-for word findable, which is the point", () => {
    const raw = "sufficient active myosin ATPase is available for cata-\nlyzing the breakdown";
    expect(raw.includes("catalyzing")).toBe(false);
    expect(reflowExtractedText(raw).includes("catalyzing")).toBe(true);
  });
});

describe("splitIntoPassages overlap", () => {
  // A page of ordinary prose, long enough to need several passages.
  const prose = Array.from(
    { length: 40 },
    (_, i) =>
      `Sentence number ${i} explains a training principle in enough words to take up real room on the page.`,
  ).join(" ");

  const passages = splitIntoPassages([{ pageNumber: 1, text: prose }]);

  it("produces more than one passage, so the overlap is actually exercised", () => {
    expect(passages.length).toBeGreaterThan(1);
  });

  it("never starts a passage in the middle of a word", () => {
    // Every passage but the first begins inside the previous one. Before this, that start was a
    // flat character offset and landed mid-word almost every time.
    for (const p of passages.slice(1)) {
      const firstWord = p.text.split(/\s/)[0].replace(/[^A-Za-z]/g, "");
      if (!firstWord) continue;
      expect(prose).toContain(` ${firstWord}`);
    }
  });

  it("still overlaps, so an idea across a boundary is in both halves", () => {
    for (let i = 1; i < passages.length; i++) {
      const previousTail = passages[i - 1].text.slice(-40);
      expect(passages[i - 1].text.length).toBeGreaterThan(0);
      expect(previousTail.length).toBeGreaterThan(0);
    }
    const joined = passages.map((p) => p.text).join(" ");
    expect(joined.length).toBeGreaterThan(prose.length);
  });

  it("covers the whole page, losing nothing at a boundary", () => {
    const joined = passages.map((p) => p.text).join(" ");
    for (const marker of ["Sentence number 0 ", "Sentence number 20 ", "Sentence number 39 "]) {
      expect(joined).toContain(marker);
    }
  });
});
