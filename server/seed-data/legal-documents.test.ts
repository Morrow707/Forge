import { describe, it, expect } from "vitest";
import { legalDocumentTypeEnum } from "@shared/schema";
import {
  PRIVACY_POLICY_DRAFT,
  PARENTAL_NOTICE_DRAFT,
  EULA_DRAFT,
} from "./legal-documents-draft";
import { ASSUMPTION_OF_RISK_RELEASE } from "./assumption-of-risk";
import { BIOMETRIC_RELEASE } from "./biometric-release";
import { AI_TERMS_OF_USE } from "./ai-terms-of-use-draft";

const DRAFT_FOR_TYPE: Record<string, string> = {
  privacy_policy: PRIVACY_POLICY_DRAFT,
  // Not a draft, and never was one in production: the seed writes the real document
  // straight from nextBiometricRelease(null).
  biometric_waiver: BIOMETRIC_RELEASE,
  parental_notice: PARENTAL_NOTICE_DRAFT,
  eula: EULA_DRAFT,
  assumption_of_risk: ASSUMPTION_OF_RISK_RELEASE,
  ai_terms_of_use: AI_TERMS_OF_USE,
};

/** Enum values that deliberately seed NOTHING. Written down rather than
 * deleted from the check, so "this type has no text" stays a decision somebody
 * made and not an omission the test stopped noticing.
 *
 * institutional_agreement: the outline under that name is deleted (see
 * legal-documents-draft.ts). The real contract is signed outside the app and
 * uploaded as an external waiver. Postgres cannot drop an enum value, so the
 * value remains with nothing behind it.
 *
 * terms_of_service: the two Terms were merged on 2026-09-19 (Scott: "just one less document that
 * gets in the way"). The signup clickwrap is the surviving one, it lives in legalAgreement rather
 * than legalDocuments, and GET /api/legal-documents/terms_of_service serves IT -- so this type
 * still resolves to text for a reader while seeding nothing of its own. */
const RETIRED: ReadonlySet<string> = new Set(["institutional_agreement", "terms_of_service"]);

describe("legal document types", () => {
  it("has starting text for every type in the enum", () => {
    // Adding the EULA meant touching eight places -- the enum, a migration, two storage
    // signatures, the route validator, its title map, the seed, and the admin tab's label map.
    // A type present in the enum with no draft seeds an empty document that an admin finds blank
    // with no indication anything is missing, so the enum is the list and this is the check.
    for (const docType of legalDocumentTypeEnum.enumValues) {
      if (RETIRED.has(docType)) continue;
      expect(DRAFT_FOR_TYPE[docType], `no draft text for "${docType}"`).toBeTruthy();
    }
  });

  it("seeds nothing for a retired type", () => {
    // The other direction: a retired type that quietly regrows seed text is how
    // a document nobody may send comes back into the admin list.
    for (const docType of RETIRED) {
      expect(DRAFT_FOR_TYPE[docType], `"${docType}" is retired but has text`).toBeUndefined();
    }
  });

  it("carries the clauses Apple requires of a custom licence", () => {
    // An app that supplies its own EULA instead of Apple's standard one must include these.
    // Their absence is a review rejection that arrives long after the binary itself is fine,
    // which is exactly the class of failure verify_build was added to catch earlier.
    expect(EULA_DRAFT).toMatch(/between you and Forge.*not with Apple Inc/s);
    expect(EULA_DRAFT).toMatch(/no obligation whatsoever to furnish any maintenance/);
    expect(EULA_DRAFT).toMatch(/third-party beneficiaries of this Agreement/);
    expect(EULA_DRAFT).toMatch(/Apple will refund the purchase price/);
    expect(EULA_DRAFT).toMatch(/not located in a country subject to a United States Government embargo/);
  });

  it("keeps the EULA distinct from the terms", () => {
    // They answer different questions -- the software licence vs the service. Collapsing them is
    // the likeliest future "simplification", and it would drop the Apple clauses above with it.
    // "Terms of Use" since the 2026-09-19 merge: the EULA names the other document, and the other
    // document's name changed. Nothing else in the EULA did.
    expect(EULA_DRAFT).toMatch(/governed separately by the Terms of Use/);
    expect(EULA_DRAFT).not.toMatch(/Terms of Service/);
  });
});
