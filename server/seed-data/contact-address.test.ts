import { describe, it, expect } from "vitest";
import { FORGE_CONTACT_EMAIL } from "@shared/contact";
import { SIGNUP_AGREEMENT, patchContactPlaceholders } from "./signup-agreement";
import {
  TERMS_OF_SERVICE_DRAFT,
  PRIVACY_POLICY_DRAFT,
  BIOMETRIC_WAIVER_DRAFT,
  PARENTAL_NOTICE_DRAFT,
  INSTITUTIONAL_AGREEMENT_DRAFT,
} from "./legal-documents-draft";

/** Three documents once gave three different contact addresses, one of them on a domain that
 * doesn't match the registered application identity. The failure mode is quiet: somebody
 * exercising a right under a privacy statute writes to an address nobody reads, and Forge looks
 * like it ignored them. So the rule is asserted rather than remembered. */
const DOCUMENTS: Array<[string, string]> = [
  ["signup agreement (live)", SIGNUP_AGREEMENT],
  ["terms of service", TERMS_OF_SERVICE_DRAFT],
  ["privacy policy", PRIVACY_POLICY_DRAFT],
  ["biometric waiver", BIOMETRIC_WAIVER_DRAFT],
  ["parental notice", PARENTAL_NOTICE_DRAFT],
  ["institutional agreement", INSTITUTIONAL_AGREEMENT_DRAFT],
];

describe("contact address across the published documents", () => {
  it.each(DOCUMENTS)("%s carries no address other than the one constant", (_name, text) => {
    const found = new Set(text.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? []);
    for (const address of found) expect(address).toBe(FORGE_CONTACT_EMAIL);
  });

  it.each(
    DOCUMENTS.filter(([name]) => name !== "institutional agreement"),
  )("%s tells the reader where to write", (_name, text) => {
    // Every document a user or guardian is shown has to answer "who do I contact". The
    // institutional agreement is exempt: it is a contract between Forge and a school, where the
    // signature block rather than a support line carries that.
    expect(text).toContain(FORGE_CONTACT_EMAIL);
  });

  it("has no unfilled contact placeholder left", () => {
    // The counsel-question placeholders in these drafts are deliberate and stay. A placeholder
    // standing in for an ADDRESS is different -- it is a document that cannot be acted on.
    for (const [name, text] of DOCUMENTS) {
      expect(text, name).not.toMatch(/\[Placeholder[^\]]*email[^\]]*\]/i);
    }
  });

  it("uses the domain that matches the registered application identity", () => {
    // com.foreperformancesystems.forge -- "fore", not "forge". The EULA's
    // legal@forgeperformance.com matched neither that nor the other documents.
    expect(FORGE_CONTACT_EMAIL).not.toContain("forgeperformance.com");
  });
});

describe("patching the stored documents", () => {
  it("fills a placeholder an installation already seeded", () => {
    const stored = "18. CONTACT\n[Placeholder -- add a real support/contact email once one exists.]";
    const patched = patchContactPlaceholders(stored);
    expect(patched).toContain(FORGE_CONTACT_EMAIL);
    expect(patched).not.toContain("[Placeholder");
  });

  it("adds the address to the waiver's rights section without dropping its counsel question", () => {
    const stored = BIOMETRIC_WAIVER_DRAFT.replace(
      `Either request can be made at ${FORGE_CONTACT_EMAIL}. `,
      "",
    );
    const patched = patchContactPlaceholders(stored);
    expect(patched).toContain(FORGE_CONTACT_EMAIL);
    // The counsel questions are the point of these drafts being drafts. Only the address moves.
    expect(patched).toContain("confirm this matches what BIPA");
  });

  it("is a no-op on a document that has already been patched", () => {
    for (const [name, text] of DOCUMENTS) {
      expect(patchContactPlaceholders(text), name).toBeNull();
    }
  });

  it("leaves the counsel-question placeholders alone", () => {
    const stored = "Some clause. [Placeholder -- confirm with counsel whether this is enforceable.]";
    expect(patchContactPlaceholders(stored)).toBeNull();
  });
});
