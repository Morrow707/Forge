import { describe, it, expect } from "vitest";
import { legalDocumentTypeEnum } from "@shared/schema";
import {
  TERMS_OF_SERVICE_DRAFT,
  PRIVACY_POLICY_DRAFT,
  BIOMETRIC_WAIVER_DRAFT,
  PARENTAL_NOTICE_DRAFT,
  INSTITUTIONAL_AGREEMENT_DRAFT,
  EULA_DRAFT,
} from "./legal-documents-draft";

const DRAFT_FOR_TYPE: Record<string, string> = {
  terms_of_service: TERMS_OF_SERVICE_DRAFT,
  privacy_policy: PRIVACY_POLICY_DRAFT,
  biometric_waiver: BIOMETRIC_WAIVER_DRAFT,
  parental_notice: PARENTAL_NOTICE_DRAFT,
  institutional_agreement: INSTITUTIONAL_AGREEMENT_DRAFT,
  eula: EULA_DRAFT,
};

describe("legal document types", () => {
  it("has starting text for every type in the enum", () => {
    // Adding the EULA meant touching eight places -- the enum, a migration, two storage
    // signatures, the route validator, its title map, the seed, and the admin tab's label map.
    // A type present in the enum with no draft seeds an empty document that an admin finds blank
    // with no indication anything is missing, so the enum is the list and this is the check.
    for (const docType of legalDocumentTypeEnum.enumValues) {
      expect(DRAFT_FOR_TYPE[docType], `no draft text for "${docType}"`).toBeTruthy();
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

  it("keeps the EULA distinct from the terms of service", () => {
    // They answer different questions -- the software licence vs the service. Collapsing them is
    // the likeliest future "simplification", and it would drop the Apple clauses above with it.
    expect(EULA_DRAFT).toMatch(/governed separately by the Terms of Service/);
  });
});
