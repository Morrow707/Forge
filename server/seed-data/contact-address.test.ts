import { describe, it, expect } from "vitest";
import { FORGE_CONTACT_EMAIL } from "@shared/contact";
import { SIGNUP_AGREEMENT, patchLiveDocuments } from "./signup-agreement";
import {
  PRIVACY_POLICY_DRAFT,
  PARENTAL_NOTICE_DRAFT,
  EULA_DRAFT,
} from "./legal-documents-draft";
import { ASSUMPTION_OF_RISK_RELEASE } from "./assumption-of-risk";
import { BIOMETRIC_RELEASE } from "./biometric-release";
import { AI_TERMS_OF_USE } from "./ai-terms-of-use-draft";

/** Three documents once gave three different contact addresses, one of them on a domain that
 * doesn't match the registered application identity. The failure mode is quiet: somebody
 * exercising a right under a privacy statute writes to an address nobody reads, and Forge looks
 * like it ignored them. So the rule is asserted rather than remembered. */
const DOCUMENTS: Array<[string, string]> = [
  ["signup agreement (live)", SIGNUP_AGREEMENT],
  ["privacy policy", PRIVACY_POLICY_DRAFT],
  ["video and biometric consent", BIOMETRIC_RELEASE],
  ["parental notice", PARENTAL_NOTICE_DRAFT],
  ["eula", EULA_DRAFT],
  ["assumption of risk", ASSUMPTION_OF_RISK_RELEASE],
  // Not published yet, but it carries an address and a postal address, so it is covered by the
  // one-address rule from the start rather than the day somebody wires it up.
  ["ai terms of use", AI_TERMS_OF_USE],
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
    const patched = patchLiveDocuments(stored);
    expect(patched).toContain(FORGE_CONTACT_EMAIL);
    expect(patched).not.toContain("[Placeholder");
  });

  it("adds the address to the waiver's rights section without dropping its counsel question", () => {
    // A stored fragment rather than the whole superseded draft, which has been deleted -- the
    // patch matches on this sentence, so the sentence is what the test needs.
    const stored =
      "You may ask Forge to delete the biometric data it holds for you, and to delete the video it was taken from, unless a specific request for further deletion is made. [Placeholder -- confirm this matches what BIPA and comparable laws require.]";
    const patched = patchLiveDocuments(stored);
    expect(patched).toContain(FORGE_CONTACT_EMAIL);
    // The counsel questions are the point of these drafts being drafts. Only the address moves.
    expect(patched).toContain("confirm this matches what BIPA");
  });

  it("is a no-op on a document that has already been patched", () => {
    for (const [name, text] of DOCUMENTS) {
      expect(patchLiveDocuments(text), name).toBeNull();
    }
  });

  it("leaves the counsel-question placeholders alone", () => {
    const stored = "Some clause. [Placeholder -- confirm with counsel whether this is enforceable.]";
    expect(patchLiveDocuments(stored)).toBeNull();
  });
});

describe("patching an already-seeded installation twice", () => {
  it("does not stack the address up once per deploy", () => {
    // The address patches PREPEND to a contact sentence they match on, so the sentence survives
    // the replacement and a naive re-run matches it again. The seed runs on every deploy, so
    // "applies twice" means "applies two hundred times" on a long-lived installation.
    const seeded = `18. CONTACT\n\nQuestions about these Terms, or about your account: ${FORGE_CONTACT_EMAIL}`;
    const once = patchLiveDocuments(seeded);
    expect(once).not.toBeNull();
    expect(once).toContain("5145 North 7th Street");
    expect(patchLiveDocuments(once!)).toBeNull();
    expect((once!.match(/5145 North 7th Street/g) ?? []).length).toBe(1);
  });

  it("fills the EULA's governing-law placeholder once", () => {
    const seeded =
      "13. GOVERNING LAW\n[Placeholder -- counsel to specify the governing law and venue, and to confirm they are consistent with the Terms of Service's dispute-resolution section, including that section's carve-out for athletes under 18.]";
    const once = patchLiveDocuments(seeded);
    expect(once).toContain("Maricopa County");
    expect(once).not.toContain("[Placeholder -- counsel to specify the governing law");
    expect(patchLiveDocuments(once!)).toBeNull();
  });
});
