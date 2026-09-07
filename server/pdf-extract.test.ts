import { describe, it, expect } from "vitest";
import { splitIntoPassages, hashBytes, type ExtractedPage } from "./pdf-extract";

// splitIntoPassages is pure, so it belongs in the no-database suite. The
// pdfjs half needs a real file and is covered in pdf-ingest.itest.ts.

const para = (n: number) =>
  `Paragraph ${n}. ` + "The hamstring is loaded eccentrically during terminal swing. ".repeat(6);

describe("splitIntoPassages", () => {
  it("carries the page a passage starts on", () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 41, text: para(1) },
      { pageNumber: 42, text: para(2) },
    ];
    const passages = splitIntoPassages(pages);
    expect(passages.length).toBeGreaterThan(0);
    expect(passages[0].pageNumber).toBe(41);
    // A citation that cannot name a page is a claim with no source.
    expect(passages.every((p) => p.pageNumber >= 41)).toBe(true);
  });

  it("keeps a paragraph that spans a page break in one passage", () => {
    // Torn at the boundary, neither half would match a query about the whole
    // idea, and a quoted half reads as nonsense.
    const pages: ExtractedPage[] = [
      { pageNumber: 1, text: "The eccentric phase begins as the limb" },
      { pageNumber: 2, text: "decelerates before foot strike." },
    ];
    const [passage] = splitIntoPassages(pages);
    expect(passage.text).toContain("begins as the limb");
    expect(passage.text).toContain("decelerates before foot strike");
    expect(passage.pageNumber).toBe(1);
    expect(passage.endPageNumber).toBe(2);
  });

  it("breaks on sentence boundaries rather than mid-word", () => {
    const pages: ExtractedPage[] = [{ pageNumber: 1, text: Array.from({ length: 12 }, (_, i) => para(i)).join("\n\n") }];
    const passages = splitIntoPassages(pages);
    expect(passages.length).toBeGreaterThan(1);
    for (const p of passages) {
      // No passage should start or end mid-word.
      expect(p.text).not.toMatch(/^[a-z]{1,3}\b\s/);
      expect(p.text.trim()).toBe(p.text);
    }
  });

  it("overlaps consecutive passages so an idea at a boundary is not lost", () => {
    const pages: ExtractedPage[] = [{ pageNumber: 1, text: Array.from({ length: 10 }, (_, i) => para(i)).join(" ") }];
    const passages = splitIntoPassages(pages);
    expect(passages.length).toBeGreaterThan(1);
    const firstTail = passages[0].text.slice(-60);
    // Some of the tail of one passage appears in the next.
    expect(passages[1].text.includes(firstTail.slice(-20))).toBe(true);
  });

  it("skips empty pages without losing the numbering of the rest", () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 1, text: "" },
      { pageNumber: 2, text: "" },
      { pageNumber: 3, text: para(1) },
    ];
    const passages = splitIntoPassages(pages);
    expect(passages).toHaveLength(1);
    expect(passages[0].pageNumber).toBe(3);
  });

  it("returns nothing for a document with no text at all", () => {
    expect(splitIntoPassages([{ pageNumber: 1, text: "" }])).toEqual([]);
    expect(splitIntoPassages([])).toEqual([]);
  });
});

describe("hashBytes", () => {
  it("is stable for the same bytes and different for others", () => {
    // The same book uploaded twice must be recognised, or every passage in
    // it doubles and the duplicates contradict each other.
    expect(hashBytes(Buffer.from("abc"))).toBe(hashBytes(Buffer.from("abc")));
    expect(hashBytes(Buffer.from("abc"))).not.toBe(hashBytes(Buffer.from("abd")));
  });
});
