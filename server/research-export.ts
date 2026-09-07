import PDFDocument from "pdfkit";
import { injuryRegionLabel, type InjuryRegion } from "@shared/injury-taxonomy";

/**
 * The dataset document Forge hands to an outside party.
 *
 * Three rules shape it, and all three are about what it must NOT contain,
 * because this is the one artifact in the codebase designed to leave the
 * building and be read by people who cannot see how it was produced.
 *
 *   1. No row-level data. Every number here describes a group. A recipient
 *      never receives one athlete's measurements, so there is no record to
 *      re-identify even in principle.
 *   2. Nothing below the suppression threshold is printed, and the fact of
 *      suppression is printed instead. A blank cell invites a guess; a cell
 *      that says "suppressed (n<10)" tells the reader exactly why it is
 *      empty and stops them treating absence as zero.
 *   3. The method is on the page, not in a covering email. A reader
 *      evaluating whether these numbers mean anything needs the cohort
 *      definition, the window, the suppression rule and the known
 *      limitations in front of them.
 *
 * The suppression threshold here is deliberately higher than the in-app
 * one. Five is a reasonable floor for an operator looking at their own
 * platform; it is thin for a document leaving the organisation, where a
 * reader may hold outside knowledge that narrows a group further. A
 * 17-year-old female shot putter can be one of five people in a way she
 * cannot be one of ten.
 */
export const RESEARCH_EXPORT_MIN_CELL = 10;

export type ResearchMetricSummary = {
  metric: string;
  unit: string | null;
  n: number;
  mean: number | null;
  p25: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
};

export type ResearchGroupSummary = {
  groupLabel: string;
  n: number;
  metrics: ResearchMetricSummary[];
};

export type ResearchInjurySummary = {
  region: InjuryRegion;
  athletesAffected: number;
  injuryCount: number;
};

export type ResearchExportData = {
  generatedAt: Date;
  // What the requester asked for, in their words, so the document explains
  // itself a year later when nobody remembers the request.
  cohortDescription: string;
  // The filters as actually applied, rendered label/value.
  filters: { label: string; value: string }[];
  windowStart: string;
  windowEnd: string;
  totalAthletes: number;
  totalSuppressed: boolean;
  groups: ResearchGroupSummary[];
  injuries: ResearchInjurySummary[] | null;
  // Anything the operator wants the reader to know about this extract.
  notes: string[];
};

const SUPPRESSED = "suppressed";

function cell(value: number | null, n: number, digits = 1): string {
  if (n < RESEARCH_EXPORT_MIN_CELL) return SUPPRESSED;
  if (value == null) return "--";
  return value.toFixed(digits);
}

export function buildResearchExportPdf(data: ResearchExportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 54 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const right = () => doc.page.width - doc.page.margins.right;

    const heading = (text: string) => {
      doc.moveDown(1.1).font("Helvetica-Bold").fontSize(13).fillColor("#000000").text(text);
      doc.moveTo(doc.x, doc.y + 2).lineTo(right(), doc.y + 2).strokeColor("#000000").stroke();
      doc.moveDown(0.4);
    };
    const body = (text: string) => {
      doc.font("Helvetica").fontSize(10).fillColor("#000000").text(text, { lineGap: 2 });
    };
    const small = (text: string) => {
      doc.font("Helvetica").fontSize(9).fillColor("#444444").text(text, { lineGap: 2 });
    };
    const row = (label: string, value: string) => {
      doc.font("Helvetica").fontSize(10).fillColor("#000000").text(`${label}:  ${value}`);
    };
    const bullet = (text: string) => {
      doc.font("Helvetica").fontSize(10).fillColor("#000000").text(`• ${text}`, { indent: 10, lineGap: 2 });
    };

    // ---- Cover ----
    doc.font("Helvetica-Bold").fontSize(18).text("Forge -- De-identified Dataset Extract");
    doc.font("Helvetica").fontSize(9).fillColor("#444444").text(`Generated ${data.generatedAt.toISOString()}`);
    doc.moveDown(0.6);
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor("#444444")
      .text(
        "This document contains group-level statistics only. It contains no individual records, " +
          "no names, no dates of birth, no free text written by an athlete or coach, and no " +
          "identifiers of any kind. Cells describing fewer people than the stated threshold are " +
          "suppressed rather than shown.",
        { lineGap: 2 },
      );

    // ---- Cohort ----
    heading("Cohort");
    body(data.cohortDescription);
    doc.moveDown(0.4);
    for (const f of data.filters) row(f.label, f.value);
    row("Observation window", `${data.windowStart} to ${data.windowEnd}`);
    row(
      "Athletes in cohort",
      data.totalSuppressed
        ? `suppressed (fewer than ${RESEARCH_EXPORT_MIN_CELL})`
        : String(data.totalAthletes),
    );

    // ---- Anonymity ----
    heading("Anonymity");
    body(
      "This extract contains no per-athlete records at all. Every figure below describes a " +
        "group, so there is no row for a reader to re-link to a person even in principle, and " +
        "no identifier of any kind -- not a name, not a code, not a sequence number -- appears " +
        "anywhere in this document.",
    );
    doc.moveDown(0.3);
    body(
      "The figures were not computed from live athlete accounts. Forge maintains a separate " +
        "store holding only the consenting population, written ahead of time with the identifying " +
        "columns absent rather than removed on the way out, and the software that produced this " +
        "document reads that store and never queries the account records. Within Forge, an " +
        "account can still be matched to its entry in that store, and it must be: that is what " +
        "allows an athlete who withdraws consent to be removed from it. Nothing outside Forge " +
        "can perform that match, and nothing in this document is an input to it.",
    );
    doc.moveDown(0.3);
    bullet("No name, email, date of birth, address, phone number, or account identifier is included.");
    bullet("No coach, team, school, or class affiliation is included, so a group cannot be traced to one program.");
    bullet(
      "No free text is included. Injury descriptions, food logs, coach notes and AI-written " +
        "summaries are excluded entirely, because free text written by a person routinely names " +
        "people, places and dates no structured field would.",
    );
    bullet("No video, image, or frame-by-frame capture data is included.");
    bullet(
      "Dates are reported as the observation window only. No individual event date appears, so a " +
        "reader who knows when something happened to a specific athlete cannot locate them.",
    );
    bullet(
      "Athletes who have opted out of platform data collection are excluded from the source " +
        "population before any statistic is computed.",
    );

    // ---- Suppression ----
    heading("Suppression rule");
    body(
      `Any figure describing fewer than ${RESEARCH_EXPORT_MIN_CELL} athletes is printed as ` +
        `"${SUPPRESSED}" rather than as a value. This applies to every cell independently, so a ` +
        "group may report some measures and suppress others where fewer athletes had that " +
        "measurement on file.",
    );
    doc.moveDown(0.3);
    small(
      "A suppressed cell means the underlying group was too small to report, not that the value " +
        "was zero or missing. Treating suppression as zero will bias any analysis built on this " +
        "extract.",
    );

    // ---- Results ----
    heading("Group statistics");
    if (data.groups.length === 0) {
      body("No group in this cohort met the reporting threshold.");
    }
    for (const group of data.groups) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000").text(group.groupLabel);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#444444")
        .text(
          group.n < RESEARCH_EXPORT_MIN_CELL
            ? `n suppressed (fewer than ${RESEARCH_EXPORT_MIN_CELL})`
            : `n = ${group.n}`,
        );
      doc.moveDown(0.2);

      // Fixed-width columns rather than a table library: pdfkit has no table
      // primitive, and a metric name plus five numbers fits a letter page
      // comfortably at these widths.
      const cols = [170, 60, 60, 60, 60, 60];
      const headers = ["Measure", "n", "Mean", "P25", "P75", "Range"];
      let x = doc.page.margins.left;
      const headerY = doc.y;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000");
      headers.forEach((h, i) => {
        doc.text(h, x, headerY, { width: cols[i] });
        x += cols[i];
      });
      doc.moveDown(0.2);
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(right(), doc.y).strokeColor("#999999").stroke();
      doc.moveDown(0.3);

      for (const m of group.metrics) {
        const rowY = doc.y;
        let cx = doc.page.margins.left;
        const suppressed = m.n < RESEARCH_EXPORT_MIN_CELL;
        const values = [
          m.unit ? `${m.metric} (${m.unit})` : m.metric,
          suppressed ? SUPPRESSED : String(m.n),
          cell(m.mean, m.n),
          cell(m.p25, m.n),
          cell(m.p75, m.n),
          suppressed ? SUPPRESSED : `${cell(m.min, m.n)}-${cell(m.max, m.n)}`,
        ];
        doc.font("Helvetica").fontSize(9).fillColor(suppressed ? "#777777" : "#000000");
        values.forEach((v, i) => {
          doc.text(v, cx, rowY, { width: cols[i] });
          cx += cols[i];
        });
        doc.moveDown(0.15);
      }
    }

    // ---- Injuries ----
    if (data.injuries) {
      heading("Injury counts by region");
      body(
        "Counts of athletes with at least one recorded injury in each region during the " +
          "observation window, and the total number of recorded injuries. An athlete with two " +
          "injuries to the same region counts once in the first column and twice in the second.",
      );
      doc.moveDown(0.4);
      const cols = [220, 150, 130];
      const headerY = doc.y;
      let x = doc.page.margins.left;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000");
      ["Region", "Athletes affected", "Injuries recorded"].forEach((h, i) => {
        doc.text(h, x, headerY, { width: cols[i] });
        x += cols[i];
      });
      doc.moveDown(0.2);
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(right(), doc.y).strokeColor("#999999").stroke();
      doc.moveDown(0.3);

      for (const inj of data.injuries) {
        const suppressed = inj.athletesAffected < RESEARCH_EXPORT_MIN_CELL;
        const rowY = doc.y;
        let cx = doc.page.margins.left;
        const values = [
          injuryRegionLabel(inj.region),
          suppressed ? SUPPRESSED : String(inj.athletesAffected),
          suppressed ? SUPPRESSED : String(inj.injuryCount),
        ];
        doc.font("Helvetica").fontSize(9).fillColor(suppressed ? "#777777" : "#000000");
        values.forEach((v, i) => {
          doc.text(v, cx, rowY, { width: cols[i] });
          cx += cols[i];
        });
        doc.moveDown(0.15);
      }

      doc.moveDown(0.4);
      small(
        'Regions are normalised from the free text a coach or athlete typed. "Other / unspecified" ' +
          "holds injuries whose text could not be placed into a region; it is reported rather than " +
          "dropped so that the totals stay complete.",
      );
    }

    // ---- Methodology ----
    heading("Method and limitations");
    bullet(
      "Data is collected in the ordinary course of using Forge, on the athlete's own phone. It is " +
        "not a controlled study: training, testing and reporting conditions vary by athlete, coach " +
        "and facility.",
    );
    bullet(
      "Combine and strength figures are self-reported or coach-entered unless captured by the " +
        "camera pipeline. They are not laboratory measurements.",
    );
    bullet(
      "Camera-derived measures carry a trust score reflecting capture conditions. Thresholds for " +
        "that score are not yet calibrated against instrumented reference footage, so those " +
        "measures should be treated as relative rather than absolute.",
    );
    bullet(
      "Injuries are recorded when someone chose to record them. Absence of an injury record is not " +
        "evidence that no injury occurred.",
    );
    bullet(
      "Athletes may leave the platform. A cohort reflects athletes present during the window, " +
        "which is not a random sample of any wider population.",
    );
    for (const note of data.notes) bullet(note);

    doc.moveDown(0.8);
    small(
      "Forge makes no representation that this extract is sufficient for any particular research " +
        "purpose, and it is not a certification of compliance with any law or institutional policy. " +
        "The recipient is responsible for their own review.",
    );

    doc.end();
  });
}
