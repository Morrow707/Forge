import PDFDocument from "pdfkit";

/** Plain, unbranded printout of a legal document draft -- same "no fluff"
 * treatment as compliance-report.ts, for the same reason: this is meant to
 * leave the codebase (printed, emailed, handed to a lawyer), not to look
 * like a marketing page. */
export function buildLegalDocumentPdf(title: string, content: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 54 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(16).fillColor("#000000").text(title);
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(9).fillColor("#444444").text(`Generated ${new Date().toISOString()}`);
    doc.moveDown(1);
    doc.font("Helvetica").fontSize(10).fillColor("#000000").text(content, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      lineGap: 3,
    });

    doc.end();
  });
}
