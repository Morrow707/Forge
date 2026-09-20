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
 * `/api/legal-documents/:type.pdf` serves, and is null for documents that have no PDF route --
 * the research consent lives in shared/research-consent.ts, the institutional agreement is a
 * signed PDF on the coach's own record.
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
  research_data_use: { label: "Research consent", page: "/research-consent", pdfType: null },
  parental_notice_ack: {
    label: "Notice to Parent or Guardian",
    page: null,
    pdfType: null,
  },
  coach_coppa_consent: { label: "Coach's attestation for an under-13 account", page: null, pdfType: null },
  guardian_coppa_consent: { label: "Guardian's consent for an under-13 account", page: null, pdfType: null },
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
