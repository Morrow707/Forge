import type { Express, Request } from "express";
import fs from "fs/promises";
import path from "path";
import { createHash, randomUUID } from "crypto";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { requireRole } from "./auth";
import { storage } from "./storage";
import { UPLOADS_ROOT, readUploadedFile } from "./uploaded-files";
import { isEmailConfigured, sendEmail, escapeHtml } from "./email";
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
 * what counts as "on file" changes: generating a copy is not signing one, and the download route
 * writes no record at all.
 *
 * SIGNING IT IN THE APP (the /sign route below) makes that paper loop optional rather than
 * replacing it. It produces the same accepted `external_waivers` row an uploaded scan would, plus
 * the evidence a clickwrap has to carry to be worth anything -- see
 * institutionalAgreementSignatures in shared/schema.ts.
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

/** How the signature block is rendered. A blank-lines copy is something to print and sign; an
 * `executed` copy is the record of a signature that has already happened, and the difference is
 * entirely in the last block -- the agreement text above it is identical, which is what lets the
 * hash in institutional_agreement_signatures mean anything. */
type SignatureBlock =
  | { kind: "blank" }
  | { kind: "executed"; signedDate: string; ipAddress: string; typedSignature: string };

function buildAgreementPdf(
  institution: InstitutionalAgreementForm,
  forge: InstitutionalAgreementForgeSide,
  signature: SignatureBlock = { kind: "blank" },
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
    if (signature.kind === "executed") {
      doc
        .font("Helvetica")
        .text(
          `Accepted by Forge Performance Systems LLC, ${forge.signerName}, ${forge.signerTitle}, on ${signature.signedDate}`,
          { width: doc.page.width - 100 },
        );
    } else {
      doc.font("Helvetica").text("By: ______________________________");
      doc.text(`Name: ${forge.signerName}`);
      doc.text(`Title: ${forge.signerTitle}`);
      doc.text(`Date: ${forge.effectiveDate}`);
    }
    doc.moveDown(1.2);

    doc.font("Helvetica-Bold").text("THE INSTITUTION");
    doc.font("Helvetica").text(institution.institutionName);
    doc.moveDown(0.4);
    if (signature.kind === "executed") {
      // The whole evidentiary claim, in one sentence a reader can check: who, what title, when,
      // and from where. The same four facts are in institutional_agreement_signatures; this is
      // them on the face of the document, so the PDF stands on its own if it is ever produced
      // away from the database.
      doc.text(
        `Electronically signed by ${institution.signerName}, ${institution.signerTitle}, on ${signature.signedDate} from IP ${signature.ipAddress}`,
        { width: doc.page.width - 100 },
      );
      doc.text(`Signature typed: ${signature.typedSignature}`);
    } else {
      doc.text("By: ______________________________");
      doc.text(`Name: ${institution.signerName}`);
      doc.text(`Title: ${institution.signerTitle}`);
      doc.text("Date: ______________________________");
    }

    doc.moveDown(1.5);
    doc
      .fillColor(GREY)
      .fontSize(8)
      .text(
        signature.kind === "executed"
          ? "This agreement was signed electronically in Forge. The person signing represented that they are authorized to bind the Institution. No paper copy is required."
          : "Sign this copy and upload it in the Documents section of Forge. Your agreement is not on file until the signed copy has been uploaded and reviewed.",
        { width: doc.page.width - 100 },
      );

    doc.end();
  });
}


/** WHAT THE COACH ADDS TO THE FORM TO MAKE IT A SIGNATURE.
 *
 * `authorizedToBind` is not decoration: section 2.1 of the agreement is a representation that the
 * signer may bind the institution, and a signature flow that never asks is asserting it on their
 * behalf. Both booleans are `literal(true)` -- an unticked box is a missing agreement, not a
 * false one, and the message says which box.
 */
const signBodySchema = institutionalAgreementFormSchema.extend({
  typedSignature: z
    .string({ required_error: "Type your name to sign." })
    .trim()
    .min(2, "Type your name to sign.")
    .max(120, "That signature is too long -- type the name as it appears above."),
  authorizedToBind: z.literal(true, {
    errorMap: () => ({
      message: "Confirm that you are authorized to sign this agreement for your institution.",
    }),
  }),
  agreed: z.literal(true, {
    errorMap: () => ({ message: "Tick the box to agree to the terms above." }),
  }),
});

/** Where a signed agreement's bytes live: the same gated `waivers` directory every other signed
 * legal document for a person goes into, so nothing new has to be taught how to serve, back up or
 * retain it. */
const WAIVERS_DIR = path.join(UPLOADS_ROOT, "waivers");

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return (first || req.ip || req.socket.remoteAddress || "unknown").trim();
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

  /** SIGNING IT IN THE APP, so the paper loop is optional.
   *
   * The download/print/sign/scan/upload/review loop still works and is still the fallback -- a
   * district whose procurement rules want a wet signature is not being told no. What this removes
   * is the case where that loop is the ONLY way: a school that is ready to start today waited on a
   * scanner and an admin reading a scan of a document Forge itself generated.
   *
   * The evidence is the point. A clickwrap that records only "a button was pressed" is what the
   * PREVIOUS institutional clickwrap did, and it is why it was thrown out. This one records who
   * signed, their title, that they said they were authorized to bind the institution, the sha256
   * of the exact text rendered for them, when, and from where -- and files the executed PDF as the
   * same accepted `external_waivers` row an uploaded paper copy would have produced, so
   * everything downstream (the banner, the checklist, `onFile`) sees one fact and not two.
   */
  app.post(
    "/api/coach/institutional-agreement/sign",
    requireRole("coach"),
    async (req, res, next) => {
      try {
        const user = currentUser(req);

        // Asked of the server, exactly as the download route asks it. A coach with no
        // organisational plan has no institution to bind.
        const status = await storage.getInstitutionalAgreementStatus(user.id);
        if (!status.required) {
          return res.status(403).json({
            message:
              "The Institutional Service Agreement applies to organisational plans. Your account is not on one, so there is nothing to sign.",
          });
        }
        if (status.onFile) {
          // Not an error to hide: signing twice is a reasonable thing to try after a slow
          // response, and the honest answer is that it is already done.
          return res.status(409).json({
            message: "Your Institutional Service Agreement is already on file.",
            signedAt: status.signedAt,
          });
        }

        const parsed = signBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({
            message: "Check the details below and try again.",
            fieldErrors: parsed.error.flatten().fieldErrors,
          });
        }
        const { typedSignature, authorizedToBind: _bind, agreed: _agreed, ...institution } = parsed.data;

        // The typed name IS the signature, so it has to be the name on the document. Case and
        // surrounding space are not what anybody means by a mismatch; a different person's name
        // is.
        if (typedSignature.toLowerCase() !== institution.signerName.trim().toLowerCase()) {
          return res.status(400).json({
            message: "Check the details below and try again.",
            fieldErrors: {
              typedSignature: ["Type your name exactly as it appears above"],
            },
          });
        }

        const now = new Date();
        const forge = forgeSide(now);
        const agreementText = renderInstitutionalAgreementText(institution, forge);
        const agreementHash = createHash("sha256").update(agreementText).digest("hex");
        const ipAddress = clientIp(req);
        const userAgent =
          typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;

        const pdf = await buildAgreementPdf(institution, forge, {
          kind: "executed",
          signedDate: forge.effectiveDate,
          ipAddress,
          typedSignature,
        });

        await fs.mkdir(WAIVERS_DIR, { recursive: true });
        const filename = `${randomUUID()}.pdf`;
        await fs.writeFile(path.join(WAIVERS_DIR, filename), pdf);

        // ORDER MATTERS, and this is the order. The file, then the waiver row (which is what
        // `onFile` reads), then the evidence row. There is no transaction across the disk write
        // anyway, so the writes are ordered so that a failure cannot leave `onFile` true with
        // nothing behind it -- and if the evidence insert fails, the waiver row is removed again
        // rather than left claiming an agreement nobody can produce a signer for.
        const waiver = await storage.createExternalWaiver({
          athleteId: user.id,
          uploadedByUserId: user.id,
          kind: "institutional_agreement",
          fileUrl: `/uploads/waivers/${filename}`,
          issuingOrganization: institution.institutionName,
          originalFilename: "institutional-service-agreement-signed.pdf",
          mimeType: "application/pdf",
          sizeBytes: pdf.length,
          signedOn: now.toISOString().slice(0, 10),
          // Accepted on arrival, with no reviewer. There is nothing for a person to read off this
          // page: Forge rendered the text, Forge built the PDF, and the signature happened in this
          // request. reviewedByUserId stays null for exactly that reason -- naming an admin who
          // never looked would be the false part.
          reviewStatus: "accepted",
          reviewedAt: now,
          reviewedByUserId: null,
          reviewSource: "in_app_signature",
          reviewNote: "Signed electronically in the app",
        });

        try {
          await storage.recordInstitutionalAgreementSignature({
            coachUserId: user.id,
            waiverId: waiver.id,
            ...institution,
            typedSignature,
            agreementHash,
            forgeSignerName: forge.signerName,
            forgeSignerTitle: forge.signerTitle,
            ipAddress,
            userAgent,
          });
        } catch (err) {
          await storage.deleteExternalWaiverRow(waiver.id);
          throw err;
        }

        // The consent record is the second, independent copy of what was agreed: the whole text,
        // not a hash of it, in the same insert-only table every other acceptance in the app lands
        // in. Written after the signature row so a failure here cannot invent an agreement.
        await storage.logConsentRecord({
          userId: user.id,
          consentType: "institutional_agreement",
          documentText:
            `${agreementText}\n\n` +
            `SIGNED ELECTRONICALLY IN FORGE\n` +
            `Institution: ${institution.institutionName}\n` +
            `Signed by: ${institution.signerName}, ${institution.signerTitle}\n` +
            `Typed signature: ${typedSignature}\n` +
            `Date: ${forge.effectiveDate}\n` +
            `IP address: ${ipAddress}\n` +
            `The signer confirmed they are authorized to bind the Institution.`,
          ipAddress,
          userAgent: userAgent ?? undefined,
        });

        // A copy to the notice address, best-effort. sendEmail carries HTML and no attachments,
        // so this links to where the PDF lives rather than pretending to attach one. Never
        // awaited into the response's success: a mail provider outage must not undo a signature
        // that is already filed.
        void emailSignedCopy({
          noticeEmail: institution.noticeEmail,
          institutionName: institution.institutionName,
          signerName: institution.signerName,
          signedDate: forge.effectiveDate,
        });

        return res.status(201).json({
          signedAt: now.toISOString(),
          signerName: institution.signerName,
          institutionName: institution.institutionName,
          pdfUrl: "/api/coach/institutional-agreement/signed.pdf",
        });
      } catch (err) {
        next(err);
      }
    },
  );

  /** The executed copy, back. Any coach on the staff may read it -- it is the staff's own
   * contract, not a document about a person, and a school whose assistant coach cannot produce
   * the agreement has to go back through the primary coach for a file they are already party to.
   * Resolved through getEffectiveCoachIds so the primary's row is what everyone reads. */
  app.get(
    "/api/coach/institutional-agreement/signed.pdf",
    requireRole("coach"),
    async (req, res, next) => {
      try {
        const user = currentUser(req);
        const waiver = await storage.getAcceptedInstitutionalAgreementWaiver(user.id);
        const bytes = waiver ? await readUploadedFile(waiver.fileUrl) : null;
        if (!waiver || !bytes) {
          return res
            .status(404)
            .json({ message: "There is no signed Institutional Service Agreement on file." });
        }
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${agreementFilename(waiver.issuingOrganization || "institution")}"`,
        );
        res.setHeader("Content-Length", String(bytes.length));
        res.end(bytes);
      } catch (err) {
        next(err);
      }
    },
  );
}

/** Best-effort confirmation to the notice address named in the agreement. Never throws and never
 * blocks the response: the signature is already filed by the time this runs, and a school whose
 * mail provider bounced still has a signed agreement. */
async function emailSignedCopy(input: {
  noticeEmail: string;
  institutionName: string;
  signerName: string;
  signedDate: string;
}): Promise<void> {
  try {
    if (!isEmailConfigured()) return;
    await sendEmail({
      to: input.noticeEmail,
      subject: "Your signed Forge Institutional Service Agreement",
      html:
        `<p>${escapeHtml(input.signerName)} signed the Forge Institutional Service Agreement for ` +
        `${escapeHtml(input.institutionName)} on ${escapeHtml(input.signedDate)}.</p>` +
        `<p>Your signed copy is available in the app: open Documents and download the ` +
        `Institutional Service Agreement. No paper copy is needed.</p>`,
    });
  } catch (err) {
    console.error("Institutional agreement confirmation email failed:", err);
  }
}
