/**
 * A PROGRAM'S RECRUITING FLYER (2026-11-19): one printable page in the program's colors with its
 * logo, name and motto, and a QR code that opens Forge's sign-up with the coach's join code
 * already typed. Built from the same narrowed branding every other surface reads, so a program
 * without Full Personalization gets a Forge-orange flyer with its code, never a locked one.
 */
import PDFDocument from "pdfkit";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { pickReadableTextHex } from "@shared/color-contrast";

export type FlyerInput = {
  teamName: string | null;
  motto: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  logoBuffer: Buffer | null;
  joinUrl: string;
  code: string;
};

/** Forge orange, as pdf-brand.ts draws it; not imported from there, which reads storage. */
const FORGE_PDF_ORANGE = "#F65B23";
const LETTER = "LETTER";
const MARGIN = 54;
const HALF = 2;
const STRIPE_HEIGHT = 8;
const LOGO_GAP = 16;
const LINE_GAP = 6;
const HEADING_GAP = 30;
const QR_GAP = 20;
const BAND_HEIGHT = 300;
const LOGO_SIZE = 120;
const LOGO_TOP = 48;
const QR_SIZE = 220;
const QR_TOP = 360;
const INK = "#1F2937";
const MUTED = "#6B7280";
/** Type sizes in points. */
const NAME_SIZE = 40;
const MOTTO_SIZE = 15;
const HEADING_SIZE = 22;
const BODY_SIZE = 12;
const CODE_SIZE = 28;
const SMALL_SIZE = 9;

// The square the QR is drawn in: 'viewBox="0 0 33 33"' matches and gives 33; 'viewBox="1 1 3 3"' does not.
// https://regex101.com/?regex=viewBox%3D%220%200%20(%5Cd%2B)%20%5Cd%2B%22
const VIEWBOX = /viewBox="0 0 (\d+) \d+"/;
// The dark modules: 'fill="#000000" d="M0 0h7v1H0z"' matches and gives that d; 'fill="#FFFFFF" d="M0,0 h33v33H0z"' does not.
// https://regex101.com/?regex=fill%3D%22%23000000%22%20d%3D%22(%5B%5E%22%5D%2B)%22
const DARK_PATH = /fill="#000000" d="([^"]+)"/;

export function qrPath(value: string): { size: number; d: string } {
  const svg = renderToStaticMarkup(createElement(QRCodeSVG, { value, marginSize: 0, level: "M" }));
  const size = Number(VIEWBOX.exec(svg)?.[1]);
  const d = DARK_PATH.exec(svg)?.[1];
  if (!size || !d) throw new Error("QR code could not be drawn");
  return { size, d };
}

export function buildRecruitingFlyerPdf(input: FlyerInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: LETTER, margin: MARGIN });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const band = input.primaryColor || FORGE_PDF_ORANGE;
  const ink = pickReadableTextHex(band);
  const width = doc.page.width - MARGIN * 2;
  doc.rect(0, 0, doc.page.width, BAND_HEIGHT).fill(band);
  if (input.secondaryColor) doc.rect(0, BAND_HEIGHT, doc.page.width, STRIPE_HEIGHT).fill(input.secondaryColor);

  let y = LOGO_TOP;
  if (input.logoBuffer) {
    try {
      doc.image(input.logoBuffer, (doc.page.width - LOGO_SIZE) / HALF, y, { fit: [LOGO_SIZE, LOGO_SIZE], align: "center" });
      y += LOGO_SIZE + LOGO_GAP;
    } catch {
      // An unreadable logo leaves the name to carry the band.
    }
  }
  doc.fillColor(ink).font("Helvetica-Bold").fontSize(NAME_SIZE).text((input.teamName || "Forge").toUpperCase(), MARGIN, y, { width, align: "center" });
  if (input.motto) {
    doc.font("Helvetica-Oblique").fontSize(MOTTO_SIZE).text(input.motto, MARGIN, doc.y + LINE_GAP, { width, align: "center" });
  }

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(HEADING_SIZE).text("Train with us", MARGIN, BAND_HEIGHT + HEADING_GAP, { width, align: "center" });

  const qr = qrPath(input.joinUrl);
  const qrLeft = (doc.page.width - QR_SIZE) / HALF;
  doc.save();
  doc.translate(qrLeft, QR_TOP).scale(QR_SIZE / qr.size);
  doc.path(qr.d).fill("#000000");
  doc.restore();

  const afterQr = QR_TOP + QR_SIZE + QR_GAP;
  doc.fillColor(MUTED).font("Helvetica").fontSize(BODY_SIZE).text("Scan to sign up, or enter this code at sign-up", MARGIN, afterQr, { width, align: "center" });
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(CODE_SIZE).text(input.code, MARGIN, doc.y + LINE_GAP, { width, align: "center" });
  doc.fillColor(MUTED).font("Helvetica").fontSize(BODY_SIZE).text(input.joinUrl, MARGIN, doc.y + LINE_GAP, { width, align: "center" });
  // The footer sits inside the bottom margin, which pdfkit would otherwise answer with a second page.
  doc.page.margins.bottom = 0;
  doc.fontSize(SMALL_SIZE).text("Powered by Forge", MARGIN, doc.page.height - MARGIN, { width, align: "center", lineBreak: false });
  doc.end();
  return done;
}
