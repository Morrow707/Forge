import { consentTypeEnum } from "./schema";

export type ConsentType = (typeof consentTypeEnum.enumValues)[number];

/** WHAT EACH CONSENT TYPE IS CALLED, AND WHERE A PERSON CAN READ IT AGAIN.
 *
 * Keyed by the enum rather than a hand-typed list, so adding a consent type to the schema is a
 * type error here until it is given a name and a place to read it. That is the point: a row in
 * "What you've agreed to" with no link is a claim the reader cannot check.
 *
 * `page` is the public page in the app (null when there is nothing to open: a payment
 * verification is an observation, not a document anyone signs). `pdfType` is the type
 * `/api/legal-documents/:type.pdf` serves, and is null only where that route serves no copy --
 * the institutional agreement is a per-coach signed PDF on that coach's own record, not a public
 * document type.
 *
 * THE RESEARCH CONSENT IS SERVED THERE AND THIS ENTRY SAID IT WAS NOT, from the commit that
 * built the route (2b495e44, "research consent page and PDF") until 2026-10-08. Its text is a
 * code constant (shared/research-consent.ts) and it is deliberately absent from LEGAL_DOC_TYPES,
 * so the route carries it on an explicit branch AHEAD of the enum lookup -- and "not in the enum"
 * was read here as "has no PDF route". It is not the same thing. The one list of what a person
 * agreed to therefore offered no durable copy of the only consent whose record outlives the
 * account (see retainSubjectAfterDeletion). Check the route, not the enum, before nulling one.
 */
export type ConsentCatalogEntry = {
  label: string;
  page: string | null;
  pdfType: string | null;
};

export const CONSENT_CATALOG: Record<ConsentType, ConsentCatalogEntry> = {
  terms_of_service: { label: "Terms of Use", page: "/terms", pdfType: "terms_of_service" },
  privacy_policy: { label: "Privacy Policy", page: "/privacy", pdfType: "privacy_policy" },
  biometric_waiver: {
    label: "Video and Biometric Consent",
    page: "/biometric-release",
    pdfType: "biometric_waiver",
  },
  assumption_of_risk: {
    label: "Assumption of Risk and Release",
    page: "/assumption-of-risk",
    pdfType: "assumption_of_risk",
  },
  research_data_use: {
    label: "Research consent",
    page: "/research-consent",
    pdfType: "research_consent",
  },
  /* Both were null until 2026-10-08, because the notice had no public page and no PDF -- so a
   * guardian reading "What you've agreed to" saw the label of the one document addressed to
   * THEM and no way to reread it. It has both now. */
  parental_notice_ack: {
    label: "Notice to Parent or Guardian",
    page: "/parent-notice",
    pdfType: "parental_notice",
  },
  /* The coach's attestation is a code constant (shared/coach-attestation.ts) shown to the coach
   * as they provision the slot, not a published document -- it has no page and no PDF to point
   * at, which is why this one stays null while the guardian's row below does not. */
  coach_coppa_consent: { label: "Coach's attestation for an under-13 account", page: null, pdfType: null },
  /* THE NOTICE IS THE DOCUMENT BEHIND THIS ROW, and this entry said there was none until
   * 2026-10-08. storage.claimGuardianInvite writes it as `documentText: notice?.content`, the
   * parental_notice row (seed.ts says so in as many words: "for an athlete under 13 it is what
   * guardian_coppa_consent records as the thing agreed to"). So the same document the row above
   * resolves to, for the same reason -- and a guardian comparing the two rows got two different
   * answers about one document while this one was null. The guardian of an under-13 is the one
   * reader in the system with no account history of their own to fall back on.
   *
   * The write has a `?? agreedToTermsText` fallback for a missing notice row, which the seed
   * makes unreachable: nextParentalNotice(null) returns the draft, so every deploy creates the
   * row before any claim can reach it. A record written under that fallback would still be
   * matched by its own documentVersion, which the row carries separately. */
  guardian_coppa_consent: {
    label: "Guardian's consent for an under-13 account",
    page: "/parent-notice",
    pdfType: "parental_notice",
  },
  guardian_payment_verification: {
    label: "Payment verification of parental consent",
    page: null,
    pdfType: null,
  },
  institutional_agreement: {
    label: "Institutional Service Agreement",
    page: "/documents",
    pdfType: null,
  },
};

/** One row of the "What you've agreed to" checklist, as every consents route returns it. The
 * coach variant leaves `givenBy` out: the coach needs to know the paperwork is current, not who
 * in the family answered. */
export type ConsentSummaryRow = {
  type: ConsentType;
  label: string;
  page: string | null;
  pdfUrl: string | null;
  /** "agreed" is the latest row for the type; "withdrawn" means the latest row is a withdrawal. */
  state: "agreed" | "withdrawn";
  createdAt: string;
  documentVersion: string;
  /** Agreed under text that no longer matches the live document, so it needs answering again. */
  stale: boolean;
  /** A role word, never a name -- see listConsentsForUser. */
  givenBy?: "you" | "your guardian" | "your coach" | "Forge";
};

/** WHAT A MINOR IS TOLD AT THE CAMERA WHEN NO VIDEO AND BIOMETRIC CONSENT IS ON FILE.
 *
 * One string, read by the server (recordBiometricRelease's refusal of a minor) and by the client
 * (the athlete's own workout screen before the tracker opens), so both say the same thing and both
 * name the one place the consent can actually be given. A guardian gives it at claim time; when
 * that did not happen -- a claim that predates the consent, a guardian who declined, a withdrawal
 * -- the guardian dashboard is where it is given afterwards, and a refusal that does not say so is
 * a dead end for the person reading it.
 */
export const GUARDIAN_GIVES_BIOMETRIC_CONSENT =
  "A parent or guardian gives the video and biometric consent for an athlete under 18. " +
  "They can give it for you from their Forge guardian dashboard, under your name.";
