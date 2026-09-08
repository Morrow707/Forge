import { describe, it, expect, beforeEach } from "vitest";
import { storage } from "./storage";
import { makeCoach, resetDatabase } from "./test-support/fixtures";

/**
 * The Sources list and the Coverage table both count passages and must
 * agree. A screenshot showed them disagreeing by three orders of magnitude
 * -- coverage reporting thousands while the source row said 1 -- and only
 * one of those can be true.
 */
describe("passage counts agree between the two places that show them", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("reports the same number of passages in the source list as were ingested", async () => {
    const admin = await makeCoach({ role: "admin" });
    const passages = Array.from({ length: 137 }, (_, i) => ({
      pageNumber: i + 1,
      endPageNumber: i + 1,
      text: `Passage number ${i} about velocity loss and rate of force development.`,
      topics: ["strength"],
    }));

    const source = await storage.createKnowledgeSource({
      uploadedByUserId: admin.id,
      title: "Test Book",
      filePath: null,
      fileHash: `hash-${Date.now()}`,
      pageCount: 200,
      domains: ["strength", "nutrition"],
      passages,
    });

    const listed = await storage.listKnowledgeSources();
    const row = listed.find((r) => r.id === source.id)!;
    expect(row.passageCount).toBe(137);
  });

  it("counts a passage once per area it is filed under, and totals match", async () => {
    const admin = await makeCoach({ role: "admin" });
    const source = await storage.createKnowledgeSource({
      uploadedByUserId: admin.id,
      title: "Multi Topic Book",
      filePath: null,
      fileHash: `hash2-${Date.now()}`,
      pageCount: 10,
      domains: ["strength", "nutrition"],
      passages: [
        { pageNumber: 1, endPageNumber: 1, text: "Squat mechanics.", topics: ["strength"] },
        { pageNumber: 2, endPageNumber: 2, text: "Protein timing.", topics: ["nutrition"] },
        { pageNumber: 3, endPageNumber: 3, text: "Fuelling a lift.", topics: ["strength", "nutrition"] },
      ],
    });

    const listed = await storage.listKnowledgeSources();
    expect(listed.find((r) => r.id === source.id)!.passageCount).toBe(3);

    const coverage = await storage.getKnowledgeCoverage();
    const strength = coverage.find((c) => c.domain === "strength")!;
    const nutrition = coverage.find((c) => c.domain === "nutrition")!;
    // Two strength-tagged passages, two nutrition-tagged, one counted in both.
    expect(strength.passages).toBe(2);
    expect(nutrition.passages).toBe(2);
    // And never more than the real passage count per area.
    expect(strength.passages).toBeLessThanOrEqual(3);
  });
});

describe("removing a page range", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("drops only the passages in the range, and keeps the source", async () => {
    const admin = await makeCoach({ role: "admin" });
    const source = await storage.createKnowledgeSource({
      uploadedByUserId: admin.id,
      title: "Book with an index",
      filePath: null,
      fileHash: `hash3-${Date.now()}`,
      pageCount: 100,
      domains: ["strength"],
      passages: [
        { pageNumber: 1, endPageNumber: 1, text: "Foreword.", topics: ["strength"] },
        { pageNumber: 50, endPageNumber: 50, text: "Real chapter content.", topics: ["strength"] },
        { pageNumber: 95, endPageNumber: 95, text: "Index entry.", topics: ["strength"] },
        { pageNumber: 99, endPageNumber: 99, text: "Another index entry.", topics: ["strength"] },
      ],
    });

    const removed = await storage.deleteKnowledgePassagesInRange(source.id, 95, 100);
    expect(removed).toBe(2);

    const left = await storage.getKnowledgePassages(source.id);
    expect(left.map((p) => p.pageNumber)).toEqual([1, 50]);

    // The book itself survives, which is the whole point -- otherwise the
    // only fix would be re-ingesting and paying again.
    const listed = await storage.listKnowledgeSources();
    expect(listed.find((r) => r.id === source.id)!.passageCount).toBe(2);
  });

  it("takes a passage that straddles the boundary", async () => {
    // One that starts on the last chapter page and ends on the first index
    // page belongs to the index as much as the chapter; leaving it defeats
    // the point of removing the range.
    const admin = await makeCoach({ role: "admin" });
    const source = await storage.createKnowledgeSource({
      uploadedByUserId: admin.id,
      title: "Straddler",
      filePath: null,
      fileHash: `hash4-${Date.now()}`,
      pageCount: 100,
      domains: ["strength"],
      passages: [
        { pageNumber: 94, endPageNumber: 95, text: "Spans the boundary.", topics: ["strength"] },
        { pageNumber: 10, endPageNumber: 10, text: "Well clear.", topics: ["strength"] },
      ],
    });

    expect(await storage.deleteKnowledgePassagesInRange(source.id, 95, 100)).toBe(1);
    const left = await storage.getKnowledgePassages(source.id);
    expect(left).toHaveLength(1);
    expect(left[0].pageNumber).toBe(10);
  });
});

describe("the source list returns everything the screen renders", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("includes progress, licence and resume fields, not just the basics", async () => {
    // Each of these was declared in the client's type and missing from the
    // server's select, so a whole feature typechecked, shipped and did
    // nothing: the progress bar had no counts, the licence never showed, and
    // the transcribe dialog could not tell a resumable source from a fresh
    // one.
    const admin = await makeCoach({ role: "admin" });
    const source = await storage.createKnowledgeSource({
      uploadedByUserId: admin.id,
      title: "Fielded Book",
      licenceNote: "Internal use only",
      filePath: null,
      fileHash: `hash5-${Date.now()}`,
      pageCount: 400,
      domains: ["strength"],
      initialStatus: "extracting",
      passages: [],
    });
    await storage.setKnowledgeProgress(source.id, 240, 1800, "Filing passages by subject...");
    await storage.setTranscriptionCheckpoint(source.id, 120);

    const row = (await storage.listKnowledgeSources()).find((r) => r.id === source.id)!;
    expect(row.progressDone).toBe(240);
    expect(row.progressTotal).toBe(1800);
    expect(row.licenceNote).toBe("Internal use only");
    expect(row.transcribedThroughPage).toBe(120);
    expect(row.status).toBe("extracting");
  });

  it("starts a text ingest as extracting, never as needs_vision", async () => {
    // Created as needs_vision and corrected a moment later, a text PDF
    // flashed "No readable text was found" while its passages were being
    // filed -- the opposite of the truth, and the message an admin acts on.
    const admin = await makeCoach({ role: "admin" });
    const source = await storage.createKnowledgeSource({
      uploadedByUserId: admin.id,
      title: "Text Book",
      filePath: null,
      fileHash: `hash6-${Date.now()}`,
      pageCount: 100,
      domains: ["strength"],
      initialStatus: "extracting",
      passages: [],
    });
    const row = (await storage.listKnowledgeSources()).find((r) => r.id === source.id)!;
    expect(row.status).toBe("extracting");
  });
});
