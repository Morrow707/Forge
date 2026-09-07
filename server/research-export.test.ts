import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import {
  buildResearchExportPdf,
  RESEARCH_EXPORT_MIN_CELL,
  type ResearchExportData,
} from "./research-export";

/**
 * These assert against the rendered PDF, not the input data, because the
 * promise this document makes is about what a reader can see on the page. A
 * suppression rule that is correct in a helper but bypassed by the renderer
 * would pass any test written against the helper alone, and would still put
 * a small group's numbers in front of an outside party.
 *
 * pdfkit Flate-compresses its content streams, so the text has to be
 * inflated before it can be searched. Decompressing here rather than turning
 * compression off in the builder keeps the test honest: it reads exactly the
 * bytes a recipient would receive.
 */
function extractPdfText(pdf: Buffer): string {
  const parts: string[] = [];
  const marker = Buffer.from("stream");
  let index = pdf.indexOf(marker);
  while (index !== -1) {
    let start = index + marker.length;
    if (pdf[start] === 0x0d) start++;
    if (pdf[start] === 0x0a) start++;
    const end = pdf.indexOf(Buffer.from("endstream"), start);
    if (end === -1) break;
    try {
      parts.push(inflateSync(pdf.subarray(start, end)).toString("latin1"));
    } catch {
      // Font programs and other non-Flate objects.
    }
    // Past the whole "endstream" keyword, not just past its start. The word
    // "endstream" contains "stream", so advancing to `end` alone made the
    // next search land inside it and pair up the wrong delimiters, which
    // silently dropped every other page. The extract grew to two pages
    // before anything noticed.
    index = pdf.indexOf(marker, end + "endstream".length);
  }
  // pdfkit emits text as hex strings inside TJ arrays, split wherever it
  // applies kerning, so "Anonymity" can arrive as several fragments. Decode
  // every hex run and concatenate: the result is the page's words back in
  // order, which is what these assertions are about.
  const content = parts.join("\n");
  const hexRuns = content.match(/<[0-9a-fA-F\s]+>/g) ?? [];
  return hexRuns
    .map((run) => Buffer.from(run.slice(1, -1).replace(/\s/g, ""), "hex").toString("latin1"))
    .join("");
}

function baseData(overrides: Partial<ResearchExportData> = {}): ResearchExportData {
  return {
    generatedAt: new Date("2026-09-07T00:00:00Z"),
    cohortDescription: "17-year-old football athletes",
    filters: [
      { label: "Age", value: "17" },
      { label: "Sport", value: "Football" },
    ],
    windowStart: "2026-01-01",
    windowEnd: "2026-09-01",
    totalAthletes: 240,
    totalSuppressed: false,
    groups: [],
    injuries: null,
    notes: [],
    ...overrides,
  };
}

const metric = (n: number) => ({
  metric: "Vertical jump",
  unit: "in",
  n,
  mean: 28.4,
  p25: 26.1,
  p75: 30.9,
  min: 21.5,
  max: 36.2,
});

describe("research export PDF", () => {
  it("prints values for a group at or above the threshold", async () => {
    const pdf = await buildResearchExportPdf(
      baseData({
        groups: [
          { groupLabel: "Football", n: 120, metrics: [metric(RESEARCH_EXPORT_MIN_CELL)] },
        ],
      }),
    );
    const text = extractPdfText(pdf);
    expect(text).toContain("28.4");
    expect(text).toContain("26.1");
  });

  it("suppresses every statistic for a group below the threshold", async () => {
    // The numbers are present in the input and must not reach the page.
    const pdf = await buildResearchExportPdf(
      baseData({
        groups: [
          { groupLabel: "Water polo", n: 4, metrics: [metric(RESEARCH_EXPORT_MIN_CELL - 1)] },
        ],
      }),
    );
    const text = extractPdfText(pdf);
    expect(text).not.toContain("28.4");
    expect(text).not.toContain("26.1");
    expect(text).not.toContain("36.2");
    expect(text).toContain("suppressed");
  });

  it("suppresses the cohort total when the whole cohort is too small", async () => {
    const pdf = await buildResearchExportPdf(
      baseData({ totalAthletes: 3, totalSuppressed: true }),
    );
    const text = extractPdfText(pdf);
    expect(text).not.toContain("Athletes in cohort:  3");
    expect(text).toContain("suppressed");
  });

  it("suppresses a small injury region without dropping the row", async () => {
    // Dropping the row would understate the total; the reader must see that
    // the region exists and was withheld.
    const pdf = await buildResearchExportPdf(
      baseData({
        injuries: [
          { region: "hamstring", athletesAffected: 41, injuryCount: 52 },
          { region: "achilles", athletesAffected: 2, injuryCount: 2 },
        ],
      }),
    );
    const text = extractPdfText(pdf);
    expect(text).toContain("Hamstring");
    expect(text).toContain("41");
    expect(text).toContain("Achilles");
    expect(text).toContain("suppressed");
  });

  it("states the anonymity guarantees and the suppression rule on the page", async () => {
    // A recipient who cannot see the code has only this document to tell
    // them what the numbers do and do not represent.
    const pdf = await buildResearchExportPdf(baseData());
    const text = extractPdfText(pdf);
    expect(text).toContain("Anonymity");
    expect(text).toContain("Suppression rule");
    expect(text).toContain("Method and limitations");
    expect(text).toContain("no per-athlete records at all");
  });

  it("carries no row-level or identity wording at all", async () => {
    const pdf = await buildResearchExportPdf(
      baseData({
        groups: [{ groupLabel: "Football", n: 120, metrics: [metric(50)] }],
      }),
    );
    const text = extractPdfText(pdf);
    for (const forbidden of ["@example", "Athlete 1", "subjectCode"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
