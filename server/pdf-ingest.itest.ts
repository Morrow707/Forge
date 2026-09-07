import { describe, it, expect, beforeEach } from "vitest";
import { storage } from "./storage";
import { extractPdf, splitIntoPassages } from "./pdf-extract";
import { searchKnowledgePassages, findSimilarPassages } from "./knowledge-retrieval";
import { makeCoach, resetDatabase } from "./test-support/fixtures";

/**
 * Builds a small but real PDF in memory. A fixture file would be simpler,
 * but the properties under test are about page numbers surviving a round
 * trip through a real parser, so the document has to be genuinely parseable
 * rather than a stub the code agrees to believe.
 */
function makePdf(pageTexts: string[]): Buffer {
  const objects: Buffer[] = [];
  const offsets: number[] = [];
  let out = Buffer.from("%PDF-1.4\n");

  const add = (num: number, body: string | Buffer) => {
    offsets[num] = out.length;
    out = Buffer.concat([
      out,
      Buffer.from(`${num} 0 obj\n`),
      typeof body === "string" ? Buffer.from(body) : body,
      Buffer.from("\nendobj\n"),
    ]);
  };

  const kids = pageTexts.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  add(1, "<< /Type /Catalog /Pages 2 0 R >>");
  add(2, `<< /Type /Pages /Kids [${kids}] /Count ${pageTexts.length} >>`);
  pageTexts.forEach((text, i) => {
    const pageNum = 3 + i * 2;
    const contentNum = 4 + i * 2;
    const stream = `BT /F1 12 Tf 72 700 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
    add(
      pageNum,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNum} 0 R ` +
        `/Resources << /Font << /F1 99 0 R >> >> >>`,
    );
    add(contentNum, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  add(99, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const xrefAt = out.length;
  const max = 100;
  let xref = `xref\n0 ${max}\n0000000000 65535 f \n`;
  for (let n = 1; n < max; n++) {
    xref += `${String(offsets[n] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  out = Buffer.concat([
    out,
    Buffer.from(xref),
    Buffer.from(`trailer\n<< /Size ${max} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`),
  ]);
  return out;
}

describe("PDF ingestion", () => {
  let adminId: number;

  beforeEach(async () => {
    await resetDatabase();
    const admin = await makeCoach({ role: "admin", name: "Admin" });
    adminId = admin.id;
  });

  it("extracts text with the page each piece came from", async () => {
    // Long enough to look like real pages. A printed page runs to a couple
    // of thousand characters, and the scanned-document check is an average
    // over the whole book, so a fixture with one short line per page would
    // read as scanned -- correctly.
    const filler = "The athlete decelerates the limb before foot strike. ".repeat(40);
    const pdf = makePdf([
      "Chapter 1: the eccentric phase of sprinting loads the hamstring heavily. " + filler,
      "Chapter 2: velocity based training uses bar speed to set daily load. " + filler,
      "Chapter 3: return to play criteria after a grade one strain. " + filler,
    ]);
    const extracted = await extractPdf(pdf);

    expect(extracted.pageCount).toBe(3);
    expect(extracted.looksScanned).toBe(false);
    expect(extracted.pages[1].pageNumber).toBe(2);
    expect(extracted.pages[1].text).toContain("velocity based training");
  });

  it("flags a document with no extractable text instead of ingesting blanks", async () => {
    // A scanned book parses fine and yields nothing. Silently ingesting 400
    // empty pages would look like success and answer nothing.
    const pdf = makePdf(["", "", ""]);
    const extracted = await extractPdf(pdf);
    expect(extracted.looksScanned).toBe(true);
    expect(extracted.characterCount).toBeLessThan(50);
  });

  it("stores passages that can cite their page, and deletes them with the source", async () => {
    const filler = "Load is managed across the week rather than the session. ".repeat(30);
    const pdf = makePdf([
      "Page one discusses eccentric hamstring loading during terminal swing. " + filler,
      "Page two covers bar velocity thresholds for a baseball athlete. " + filler,
    ]);
    const extracted = await extractPdf(pdf);
    const passages = splitIntoPassages(extracted.pages);
    expect(passages.length).toBeGreaterThan(0);

    const source = await storage.createKnowledgeSource({
      uploadedByUserId: adminId,
      title: "Test Manual",
      citation: "Test Manual, 2026",
      filePath: null,
      fileHash: extracted.fileHash,
      pageCount: extracted.pageCount,
      domains: ["strength"],
      passages,
    });
    expect(source.status).toBe("ready");

    const stored = await storage.getKnowledgePassages(source.id);
    expect(stored.length).toBe(passages.length);
    expect(stored[0].pageNumber).toBe(1);

    // Deleting a source is the one clean undo, and it has to take the
    // passages with it or a removed book keeps answering questions.
    expect(await storage.deleteKnowledgeSource(source.id)).toBe(true);
    expect(await storage.getKnowledgePassages(source.id)).toHaveLength(0);
  });

  it("recognises the same file uploaded twice", async () => {
    // Re-ingesting would double every passage and make the book contradict
    // itself.
    const pdf = makePdf([
      "Some real content about training load management. " +
        "Weekly volume is compared against the trailing four week average. ".repeat(30),
    ]);
    const extracted = await extractPdf(pdf);
    await storage.createKnowledgeSource({
      uploadedByUserId: adminId,
      title: "First upload",
      filePath: null,
      fileHash: extracted.fileHash,
      pageCount: extracted.pageCount,
      domains: ["strength"],
      passages: splitIntoPassages(extracted.pages),
    });

    const again = await extractPdf(pdf);
    expect(again.fileHash).toBe(extracted.fileHash);
    const existing = await storage.getKnowledgeSourceByHash(again.fileHash);
    expect(existing?.title).toBe("First upload");
  });

  it("marks a source with no passages as needing vision rather than ready", async () => {
    const source = await storage.createKnowledgeSource({
      uploadedByUserId: adminId,
      title: "Scanned book",
      filePath: null,
      fileHash: "scanned-hash",
      pageCount: 400,
      domains: ["strength"],
      passages: [],
    });
    expect(source.status).toBe("needs_vision");
  });
});

describe("knowledge retrieval", () => {
  let adminId: number;

  beforeEach(async () => {
    await resetDatabase();
    const admin = await makeCoach({ role: "admin", name: "Admin" });
    adminId = admin.id;
  });

  async function ingest(title: string, domains: string[], pages: string[]) {
    const pdf = makePdf(pages);
    const extracted = await extractPdf(pdf);
    return storage.createKnowledgeSource({
      uploadedByUserId: adminId,
      title,
      citation: `${title}, 2026`,
      filePath: null,
      fileHash: extracted.fileHash,
      pageCount: extracted.pageCount,
      domains,
      passages: splitIntoPassages(extracted.pages),
    });
  }

  it("finds a passage by its terms and can cite where it came from", async () => {
    await ingest("Strength Manual", ["strength"], [
      "Eccentric hamstring loading during terminal swing is the mechanism behind most sprint " +
        "related strains. ".repeat(20),
    ]);
    const hits = await searchKnowledgePassages({ query: "hamstring strain", domains: ["strength"] });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text).toContain("hamstring");
    // Without a citation a retrieved claim has no source a coach can check.
    expect(hits[0].citation).toBe("Strength Manual, 2026");
    expect(hits[0].pageNumber).toBe(1);
  });

  it("keeps the domains apart so one assistant cannot read another's material", async () => {
    await ingest("Nutrition Manual", ["nutrition"], [
      "Carbohydrate availability around training sessions drives recovery. ".repeat(25),
    ]);
    await ingest("Bar Speed Manual", ["strength"], [
      "Velocity loss thresholds set the stopping point for a strength set. ".repeat(25),
    ]);

    const nutrition = await searchKnowledgePassages({ query: "velocity loss", domains: ["nutrition"] });
    expect(nutrition).toHaveLength(0);

    const strength = await searchKnowledgePassages({ query: "velocity loss", domains: ["strength"] });
    expect(strength.length).toBeGreaterThan(0);
  });

  it("reads across domains when a caller asks for both", async () => {
    // The class AI building a nutrition course reads the nutrition domain
    // deliberately; that is a query parameter, not a special case.
    await ingest("Nutrition Manual", ["nutrition"], [
      "Carbohydrate availability around training sessions drives recovery. ".repeat(25),
    ]);
    const hits = await searchKnowledgePassages({
      query: "carbohydrate recovery",
      domains: ["class", "nutrition"],
    });
    expect(hits.length).toBeGreaterThan(0);
  });

  it("returns nothing rather than raising on a malformed query", async () => {
    await ingest("Manual", ["strength"], ["Something about training load. ".repeat(30)]);
    await expect(
      searchKnowledgePassages({ query: '"unclosed quote AND', domains: ["strength"] }),
    ).resolves.toBeInstanceOf(Array);
  });

  it("does not offer a source's own passages as its contradiction candidates", async () => {
    // A book restating its own point across two pages is not a contradiction,
    // and treating it as one would bury every real conflict.
    const source = await ingest("Repetitive Manual", ["strength"], [
      "Hamstring strains are managed with progressive eccentric loading. ".repeat(30),
      "Hamstring strains are managed with progressive eccentric loading. ".repeat(30),
    ]);
    const passages = await storage.getKnowledgePassages(source.id);
    const similar = await findSimilarPassages({
      passageId: passages[0].id,
      text: passages[0].text,
      domains: ["strength"],
    });
    expect(similar).toHaveLength(0);
  });

  it("finds a near-identical passage in a different source", async () => {
    // Near-identical content, but not byte-identical -- two books can make
    // the same point without being the same file, and the hash dedupe would
    // (correctly) refuse the second if they were.
    await ingest("Book A", ["strength"], [
      "Return to play requires symmetrical eccentric hamstring strength within ten percent. ".repeat(20),
    ]);
    const b = await ingest("Book B", ["strength"], [
      "Return to play requires symmetrical eccentric hamstring strength within ten percent, " +
        "measured on a dynamometer. ".repeat(18),
    ]);
    const passages = await storage.getKnowledgePassages(b.id);
    const similar = await findSimilarPassages({
      passageId: passages[0].id,
      text: passages[0].text,
      domains: ["strength"],
    });
    expect(similar.length).toBeGreaterThan(0);
    expect(similar[0].sourceTitle).toBe("Book A");
  });

  it("raises a conflict once and remembers the ruling", async () => {
    const a = await ingest("Book A", ["strength"], ["Rest three minutes between heavy sets. ".repeat(25)]);
    const b = await ingest("Book B", ["strength"], ["Rest ninety seconds between heavy sets. ".repeat(25)]);
    const [pa] = await storage.getKnowledgePassages(a.id);
    const [pb] = await storage.getKnowledgePassages(b.id);

    const first = await storage.recordKnowledgeConflict({
      passageId: pb.id,
      otherPassageId: pa.id,
      summary: "One says three minutes, the other ninety seconds.",
    });
    expect(first).not.toBeNull();

    // Same pair in the other order is the same disagreement, not a new one.
    const again = await storage.recordKnowledgeConflict({
      passageId: pa.id,
      otherPassageId: pb.id,
      summary: "duplicate",
    });
    expect(again).toBeNull();

    const open = await storage.listKnowledgeConflicts("open");
    expect(open).toHaveLength(1);
    expect(open[0].passage?.text).toContain("Rest");

    await storage.resolveKnowledgeConflict({
      id: open[0].id,
      adminId,
      status: "scoped",
      reason: "Baseball athletes train for velocity, so the shorter rest applies there.",
      scope: { sports: ["Baseball"] },
    });
    expect(await storage.listKnowledgeConflicts("open")).toHaveLength(0);
    const all = await storage.listKnowledgeConflicts("all");
    expect(all[0].status).toBe("scoped");
    expect(JSON.parse(all[0].scopeJson!)).toEqual({ sports: ["Baseball"] });
  });
});
