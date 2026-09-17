import { z } from "zod";
import { askClaudeFileStructured, fastModel } from "./ai";
import { DOCUMENT_LABEL, type DocumentKind } from "@shared/required-documents";

/**
 * READS AN UPLOADED FORM AND DECIDES, IN THE MOMENT, WHETHER IT IS WHAT IT CLAIMS TO BE.
 *
 * The alternative was a human queue, and a human queue is the wrong shape for this twice over.
 * It is slow for the parent -- a red cross stays red for a day while somebody gets round to a
 * PDF -- and it means a member of staff opens a named child's signed medical form for no reason
 * beyond confirming a signature exists. The model answers exactly that question and the file is
 * then destroyed, so the total number of humans who ever see it is zero.
 *
 * WHAT IT IS ASKED, AND WHAT IT IS NOT. Three narrow, visual questions: is this the kind of
 * document the uploader said it was, is there a signature on it, and is it legible. It is not
 * asked whether the document is valid, enforceable, or sufficient -- no model can answer that
 * from a scan and Forge does not claim to. Anything it cannot answer confidently goes to a human
 * rather than through.
 *
 * THE CHEAP MODEL, deliberately. This is transcription plus three yes/no calls, once per upload,
 * and CLAUDE.md's standing rule is that mechanical per-item work does not run on the expensive
 * model. Same reasoning as page transcription in the knowledge library.
 */
const verdictSchema = z.object({
  documentKind: z.enum([
    "participation_waiver",
    "medical_clearance",
    "emergency_authorization",
    "photo_media_release",
    "institutional_agreement",
    "coaching_certification",
    "background_check",
    "cpr_first_aid",
    "liability_insurance",
    "other",
    "unreadable",
  ]),
  matchesDeclaredKind: z.boolean(),
  isSigned: z.boolean(),
  legible: z.boolean(),
  issuingOrganization: z.string().nullable().optional(),
  signedOn: z.string().nullable().optional(),
  expiresOn: z.string().nullable().optional(),
  athleteOrHolderName: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

export type WaiverVerdict = z.infer<typeof verdictSchema>;

export type WaiverReadResult =
  | { decision: "accepted"; verdict: WaiverVerdict }
  | { decision: "needs_human"; verdict: WaiverVerdict | null; reason: string };

/** Base64 of a 25MB upload is ~33MB, past the API's own request ceiling, and a scan that big is
 * usually a phone camera left on maximum rather than a longer document. Sent to a human rather
 * than silently skipped. */
const MAX_AI_BYTES = 8 * 1024 * 1024;

/** HEIC is accepted on upload because iPhones produce it by default, and the API does not read
 * it. Rather than reject the upload (which loses the document) or pretend to have read it, that
 * one format goes to a person. */
const IMAGE_MEDIA_TYPES: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

const SYSTEM = `You examine a scanned or photographed document that somebody has uploaded to an
athletic training app, and report what is physically on the page. You are a reader, not a lawyer.

Report only what you can see. Never infer that a document is signed because it has a signature
line, never infer an organisation from a logo you are not sure of, and never guess a date.

You are NOT judging whether the document is legally valid, enforceable, sufficient, or current.
You are answering three visual questions: what kind of document is this, is there a real
handwritten or electronic signature on it, and can it be read.

If the page is blurred, cropped, upside down, blank, or shows something that is not a document at
all, say so with documentKind "unreadable" and legible false. A wrong answer costs more here than
an unsure one: anything you are not confident about goes to a person instead.`;

export async function readUploadedWaiver(input: {
  declaredKind: DocumentKind;
  mimeType: string;
  bytes: Buffer;
}): Promise<WaiverReadResult> {
  if (input.bytes.length > MAX_AI_BYTES) {
    return { decision: "needs_human", verdict: null, reason: "File too large to read automatically." };
  }
  const mime = input.mimeType.split(";")[0].trim().toLowerCase();
  const file =
    mime === "application/pdf"
      ? ({ kind: "pdf", data: input.bytes.toString("base64") } as const)
      : IMAGE_MEDIA_TYPES[mime]
        ? ({ kind: "image", mediaType: IMAGE_MEDIA_TYPES[mime], data: input.bytes.toString("base64") } as const)
        : null;
  if (!file) {
    return { decision: "needs_human", verdict: null, reason: `Can't read ${mime} automatically.` };
  }

  const raw = await askClaudeFileStructured<unknown>(
    SYSTEM,
    `The person uploading this says it is: "${DOCUMENT_LABEL[input.declaredKind]}".\n\n` +
      `Report what is actually on the page, and whether it matches that.`,
    file,
    {
      name: "report_document",
      description: "Report what is physically on the uploaded page.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          documentKind: {
            type: "string",
            enum: [
              "participation_waiver",
              "medical_clearance",
              "emergency_authorization",
              "photo_media_release",
    "institutional_agreement",
              "coaching_certification",
              "background_check",
              "cpr_first_aid",
              "liability_insurance",
              "other",
              "unreadable",
            ],
            description: "What the page actually is, regardless of what the uploader called it.",
          },
          matchesDeclaredKind: { type: "boolean" },
          isSigned: {
            type: "boolean",
            description:
              "True only if an actual signature is present. A blank signature line is false.",
          },
          legible: { type: "boolean" },
          issuingOrganization: { type: ["string", "null"] },
          signedOn: { type: ["string", "null"], description: "YYYY-MM-DD if legibly printed." },
          expiresOn: { type: ["string", "null"], description: "YYYY-MM-DD if legibly printed." },
          athleteOrHolderName: { type: ["string", "null"] },
          confidence: { type: "number", description: "0 to 1." },
          reason: { type: "string", description: "One sentence, readable by the uploader." },
        },
        required: ["documentKind", "matchesDeclaredKind", "isSigned", "legible", "confidence", "reason"],
      },
    },
    // Mechanical, once per upload. See this file's header.
    { model: fastModel, maxTokens: 800, feature: "waiver_reader" },
  );

  if (raw == null) {
    // AI unconfigured, rate-limited, or refused. A document still arrived, so it goes to a
    // person -- never accepted on the strength of a call that did not happen.
    return { decision: "needs_human", verdict: null, reason: "Couldn't read it automatically." };
  }
  const parsed = verdictSchema.safeParse(raw);
  if (!parsed.success) {
    return { decision: "needs_human", verdict: null, reason: "Couldn't read it automatically." };
  }
  const v = parsed.data;

  // EVERY CONDITION HAS TO HOLD. Stated as one list rather than nested ifs so that what it takes
  // to be accepted without a human is readable in one go.
  const accept =
    v.legible &&
    v.matchesDeclaredKind &&
    v.documentKind === input.declaredKind &&
    v.isSigned &&
    v.confidence >= 0.8;

  if (accept) return { decision: "accepted", verdict: v };
  return {
    decision: "needs_human",
    verdict: v,
    reason: !v.legible
      ? "We couldn't read it clearly -- a person will check."
      : !v.isSigned
        ? "We couldn't find a signature on it -- a person will check."
        : v.documentKind !== input.declaredKind
          ? "It doesn't look like the document type you picked -- a person will check."
          : "A person will check this one.",
  };
}
