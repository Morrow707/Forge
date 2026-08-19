import PDFDocument from "pdfkit";
import { resolveMovementScreenUnitLabel, type MovementScreenScoreType } from "@shared/movement-screen";

export interface MovementScreenSheetTest {
  label: string;
  category: string;
  scoreType: MovementScreenScoreType;
  unitLabel: string | null;
  side: "bilateral" | "unilateral";
  instructions: string | null;
}

const ORANGE = "#F65B23";
const DARK = "#111111";
const GREY = "#666666";

/** A blank, printable score sheet for one battery -- filled out on paper,
 * then photographed back in through the analyze-photo/apply flow (same
 * pattern as testing-day/weigh-in sheets), or transcribed manually. Every
 * test gets one blank line (bilateral) or two (unilateral, L/R), plus its
 * instructions so whoever administers it doesn't need the app open. */
export function buildMovementScreenSheetPdf(batteryName: string, tests: MovementScreenSheetTest[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.rect(0, 0, doc.page.width, 90).fill(ORANGE);
    doc.fillColor("#ffffff").fontSize(24).font("Helvetica-Bold").text("FORGE", 50, 30);
    doc.fontSize(10).font("Helvetica").text(batteryName, 50, 60);

    doc.moveDown(3);
    doc.fillColor(DARK).fontSize(11).font("Helvetica-Bold").text("Athlete: ", { continued: true });
    doc.font("Helvetica").text("_______________________________     Date: ______________");
    doc.moveDown(1.2);

    for (const test of tests) {
      if (doc.y > doc.page.height - 140) doc.addPage();
      doc.fillColor(DARK).fontSize(12).font("Helvetica-Bold").text(test.label);
      doc.fillColor(GREY).fontSize(8.5).font("Helvetica").text(
        `${test.category} · scored in ${resolveMovementScreenUnitLabel(test.scoreType, test.unitLabel)}`,
      );
      if (test.instructions) {
        doc.fillColor(GREY).fontSize(9).font("Helvetica").text(test.instructions, { width: 500 });
      }
      doc.moveDown(0.3);
      if (test.side === "unilateral") {
        doc.fillColor(DARK).fontSize(10).font("Helvetica").text(`Left:  ______________     Right:  ______________`);
      } else {
        doc.fillColor(DARK).fontSize(10).font("Helvetica").text(`Score:  ______________`);
      }
      doc.moveDown(0.9);
    }

    doc.end();
  });
}
