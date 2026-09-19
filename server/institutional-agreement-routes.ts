import type { Express, Request } from "express";
import PDFDocument from "pdfkit";
import { requireRole } from "./auth";
import { storage } from "./storage";
import {
  INSTITUTIONAL_AGREEMENT_PREAMBLE,
  INSTITUTIONAL_AGREEMENT_SECTIONS,
  INSTITUTIONAL_AGREEMENT_TITLE,
  institutionalAgreementFormSchema,
  institutionalAgreementHeaderFields,
  renderInstitutionalAgreementText,
  type InstitutionalAgreementForgeSide,
  type InstitutionalAgreementForm,
} from "@shared/institutional-service-agreement";

/** A SCHOOL GETS ITS OWN AGREEMENT OUT OF THE APP.
 *
 * Until now the only copy of this contract was `docs/institutional-service-agreement.md`, which
 * meant every school's agreement began with Scott opening that file, deleting the review marks,
 * typing the school's name into six places and emailing a PDF. That is a person in the middle of
 * a signup flow, and it is the reason a school's paperwork waited on Scott's inbox.
 *
 * The coach fills in their own side, downloads a complete PDF, signs it, and uploads the signed
 * copy through the upload control already on /documents -- the same `externalWaivers` kind
 * `institutional_agreement` row `getInstitutionalAgreementStatus` already reads. Nothing about
 * what counts as "on file" changes: generating a copy is not signing one, and this route writes
 * no record at all.
 */

const ORANGE = "#F65B23";
const DARK = "#111111";
const GREY = "#666666";

/** Same shape as routes.ts's own `currentUser` -- passport puts the row on the request and every
 * route in this repo narrows it the same way. Duplicated rather than exported across files
 * because it is four lines of type narrowing, not behaviour. */
function currentUser(req: Request) {
  return req.user as {
    id: number;
    role: "coach" | "athlete" | "admin" | "guardian";
    name: string;
    email: string;
  };
}

/** Forge's side of the header and signature blocks.
 *
 * The signer is environment-configured rather than hardcoded because the person who signs for
 * Forge is an operational fact, not a property of the contract -- and a founder's name baked into
 * a shared constant is a code change the day anyone else signs. The default is today's answer.
 */
function forgeSide(now: Date): InstitutionalAgreementForgeSide {
  return {
    signerName: process.env.INSTITUTIONAL_AGREEMENT_SIGNER_NAME || "Scott Morrow",
    signerTitle: process.env.INSTITUTIONAL_AGREEMENT_SIGNER_TITLE || "Founder",
    // The Effective Date is the date the copy is generated, which is what the header line and the
    // Forge signature date both carry.
    effectiveDate: now.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "America/Phoenix",
    }),
  };
}

/** A filename a school can find again in their downloads folder six weeks later. */
function agreementFilename(institutionName: string): string {
  const slug = institutionName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `forge-service-agreement-${slug || "institution"}.pdf`;
}

function buildAgreementPdf(
  institution: InstitutionalAgreementForm,
  forge: InstitutionalAgreementForgeSide,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // compress: false so the page streams stay readable as text. It costs a little size on a
    // document this small, and it keeps a copy of a real contract inspectable without a library --
    // worth having for the one document Forge sends out that somebody signs.
    const doc = new PDFDocument({ size: "LETTER", margin: 50, compress: false });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.rect(0, 0, doc.page.width, 70).fill(ORANGE);
    doc.fillColor("#FFFFFF").fontSize(20).font("Helvetica-Bold").text("FORGE", 50, 24);
    doc.fontSize(10).font("Helvetica").text("Institutional Service Agreement", 50, 48);

    doc.moveDown(4);
    doc.fillColor(DARK).fontSize(13).font("Helvetica-Bold").text(INSTITUTIONAL_AGREEMENT_TITLE, 50, 100, {
      width: doc.page.width - 100,
    });
    doc.moveDown(0.8);
    doc.fontSize(9).font("Helvetica").text(INSTITUTIONAL_AGREEMENT_PREAMBLE, {
      width: doc.page.width - 100,
      align: "justify",
    });
    doc.moveDown(0.8);

    for (const field of institutionalAgreementHeaderFields(institution, forge)) {
      doc.fontSize(9).font("Helvetica-Bold").text(`${field.label}: `, { continued: true });
      doc.font("Helvetica").text(field.value);
    }

    for (const section of INSTITUTIONAL_AGREEMENT_SECTIONS) {
      doc.moveDown(0.8);
      doc.fillColor(DARK).fontSize(10).font("Helvetica-Bold").text(section.heading);
      doc.moveDown(0.2);
      for (const paragraph of section.paragraphs) {
        doc.fontSize(9).font("Helvetica").text(paragraph, {
          width: doc.page.width - 100,
          align: "justify",
        });
        doc.moveDown(0.3);
      }
    }

    // The signature block never straddles a page break -- half a signature block on the bottom of
    // a page is the one part of this document somebody has to physically write on.
    if (doc.y > doc.page.height - 260) doc.addPage();
    doc.moveDown(1.2);
    doc.fontSize(11).font("Helvetica-Bold").text("SIGNED");
    doc.moveDown(0.8);

    doc.fontSize(9).font("Helvetica-Bold").text("FORGE PERFORMANCE SYSTEMS LLC");
    doc.font("Helvetica").text("By: ______________________________");
    doc.text(`Name: ${forge.signerName}`);
    doc.text(`Title: ${forge.signerTitle}`);
    doc.text(`Date: ${forge.effectiveDate}`);
    doc.moveDown(1.2);

    doc.font("Helvetica-Bold").text("THE INSTITUTION");
    doc.font("Helvetica").text(institution.institutionName);
    doc.moveDown(0.4);
    doc.text("By: ______________________________");
    doc.text(`Name: ${institution.signerName}`);
    doc.text(`Title: ${institution.signerTitle}`);
    doc.text("Date: ______________________________");

    doc.moveDown(1.5);
    doc
      .fillColor(GREY)
      .fontSize(8)
      .text(
        "Sign this copy and upload it in the Documents section of Forge. Your agreement is not on file until the signed copy has been uploaded and reviewed.",
        { width: doc.page.width - 100 },
      );

    doc.end();
  });
}

export function registerInstitutionalAgreementRoutes(app: Express): void {
  /** What the coach is about to sign, as text, so the page can show it before they download a
   * PDF they then have to open. Cheap: the same renderer the PDF lays out, no file written. */
  app.get(
    "/api/coach/institutional-agreement/preview",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);
      const status = await storage.getInstitutionalAgreementStatus(user.id);
      if (!status.required) {
        return res.status(403).json({
          message:
            "The Institutional Service Agreement applies to organisational plans. Your account is not on one.",
        });
      }
      const forge = forgeSide(new Date());
      res.json({
        text: renderInstitutionalAgreementText(
          {
            institutionName: "[your institution]",
            address: "[your mailing address]",
            signerName: "[who will sign]",
            signerTitle: "[their title]",
            noticeEmail: "[notice email]",
          },
          forge,
        ),
        forgeSignerName: forge.signerName,
        forgeSignerTitle: forge.signerTitle,
        effectiveDate: forge.effectiveDate,
      });
    },
  );

  app.post(
    "/api/coach/institutional-agreement/download",
    requireRole("coach"),
    async (req, res) => {
      const user = currentUser(req);

      // Asked of the server, not inferred from the form being on screen. A coach with no
      // organisational plan has no institution to sign for, and handing them a contract naming
      // one would be worse than refusing.
      const status = await storage.getInstitutionalAgreementStatus(user.id);
      if (!status.required) {
        return res.status(403).json({
          message:
            "The Institutional Service Agreement applies to organisational plans. Your account is not on one, so there is nothing to sign.",
        });
      }

      const parsed = institutionalAgreementFormSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        // fieldErrors, not a single sentence: five fields and one message means the coach gets to
        // guess which one. The form shows each message under its own input.
        return res.status(400).json({
          message: "Check the details below and try again.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        });
      }

      const forge = forgeSide(new Date());
      const pdf = await buildAgreementPdf(parsed.data, forge);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${agreementFilename(parsed.data.institutionName)}"`,
      );
      res.setHeader("Content-Length", String(pdf.length));
      res.end(pdf);
    },
  );
}
