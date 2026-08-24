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

// Optional white-label identity for the header band -- see
// buildMovementScreenSheetPdf's own comment for why only the band (not the
// body text below it) ever rebrands.
export interface MovementScreenSheetBranding {
  teamName?: string | null;
  logoBuffer?: Buffer | null;
  primaryColor?: string | null;
}

const ORANGE = "#F65B23";
const DARK = "#111111";
const GREY = "#666666";

// Simple luminance heuristic for picking readable band text -- same
// "weighted RGB average, not true WCAG relative luminance" tradeoff
// client/src/lib/color.ts's contrastForegroundHsl makes, kept independent
// (not imported from there) since this runs server-side against a raw hex,
// not the CSS-variable triplet shape that file's other exports assume.
function pickBandTextHex(bgHex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(bgHex.trim());
  if (!match) return "#ffffff";
  const r = parseInt(match[1].slice(0, 2), 16) / 255;
  const g = parseInt(match[1].slice(2, 4), 16) / 255;
  const b = parseInt(match[1].slice(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.6 ? "#111111" : "#ffffff";
}

/** A blank, printable score sheet for one battery -- filled out on paper,
 * then photographed back in through the analyze-photo/apply flow (same
 * pattern as testing-day/weigh-in sheets), or transcribed manually. Every
 * test gets one blank line (bilateral) or two (unilateral, L/R), plus its
 * instructions so whoever administers it doesn't need the app open.
 *
 * `branding` optionally re-skins the header band with a coach's own logo/
 * team name/primary color -- deliberately scoped to the band alone, not
 * the body text below it (DARK/GREY stay put): those are the document's
 * own ink colors, not brand accents, and forcing an arbitrary secondary
 * color onto body text risks landing on something unreadable on paper for
 * a color chosen to look good as a UI accent, not printed body copy. */
export function buildMovementScreenSheetPdf(
  batteryName: string,
  tests: MovementScreenSheetTest[],
  branding?: MovementScreenSheetBranding,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const bandColor = branding?.primaryColor || ORANGE;
    const bandText = pickBandTextHex(bandColor);
    doc.rect(0, 0, doc.page.width, 90).fill(bandColor);

    if (branding?.logoBuffer) {
      try {
        doc.image(branding.logoBuffer, 50, 20, { fit: [50, 50] });
        doc
          .fillColor(bandText)
          .fontSize(18)
          .font("Helvetica-Bold")
          .text(branding.teamName || "", 112, 28, { width: doc.page.width - 162 });
        doc.fontSize(10).font("Helvetica").text(batteryName, 112, 55, { width: doc.page.width - 162 });
      } catch {
        // A corrupt/unreadable logo file shouldn't break the export --
        // fall through to the text-only wordmark below.
        doc.fillColor(bandText).fontSize(24).font("Helvetica-Bold").text(branding.teamName || "FORGE", 50, 30);
        doc.fontSize(10).font("Helvetica").text(batteryName, 50, 60);
      }
    } else {
      doc.fillColor(bandText).fontSize(24).font("Helvetica-Bold").text(branding?.teamName || "FORGE", 50, 30);
      doc.fontSize(10).font("Helvetica").text(batteryName, 50, 60);
    }

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
