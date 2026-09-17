import { describe, it, expect } from "vitest";
import { GOVERNING_LAW_CLAUSE } from "@shared/contact";
import {
  SIGNUP_AGREEMENT,
  LIVE_DOCUMENT_PATCHES,
  patchLiveDocuments,
} from "./signup-agreement";
import {
  TERMS_OF_SERVICE_DRAFT,
  PRIVACY_POLICY_DRAFT,
  PARENTAL_NOTICE_DRAFT,
  INSTITUTIONAL_AGREEMENT_DRAFT,
  EULA_DRAFT,
} from "./legal-documents-draft";
import { ASSUMPTION_OF_RISK_RELEASE } from "./assumption-of-risk";
import { AI_TERMS_OF_USE } from "./ai-terms-of-use-draft";

/** Forge's documents describe ONE dispute path: talk first, then the courts in Maricopa County.
 *
 * The terms draft used to propose a second one -- binding arbitration and a class-action waiver --
 * on the reasoning that it was only a proposal, in a document nobody had been shown. Then /terms
 * shipped as a public page serving exactly that document, and a reader was told arbitration while
 * the agreement they actually accept at signup said courts. Two live documents disagreeing is not
 * a drafting untidiness; it is an ambiguity a counterparty gets to resolve in their own favour.
 *
 * Adopting arbitration is counsel's decision -- on a platform with minors on it, especially -- so
 * it comes back into BOTH documents at once or into neither. This test is the "or neither" half. */
const PUBLISHED: Array<[string, string]> = [
  ["signup agreement (live)", SIGNUP_AGREEMENT],
  ["terms of service", TERMS_OF_SERVICE_DRAFT],
  ["privacy policy", PRIVACY_POLICY_DRAFT],
  ["parental notice", PARENTAL_NOTICE_DRAFT],
  ["institutional agreement", INSTITUTIONAL_AGREEMENT_DRAFT],
  ["eula", EULA_DRAFT],
  ["assumption of risk", ASSUMPTION_OF_RISK_RELEASE],
  ["ai terms of use", AI_TERMS_OF_USE],
];

describe("one dispute path across the documents", () => {
  it.each(PUBLISHED)("%s does not send a dispute to arbitration", (_name, text) => {
    expect(text).not.toMatch(/binding arbitration/i);
    expect(text).not.toMatch(/class[- ]action waiver/i);
  });

  it.each(PUBLISHED)("%s names one venue, or none", (_name, text) => {
    // Not every document states governing law -- the privacy policy, the parental notice and the
    // parental notice defer to the terms rather than restating them, which is fine. What is not
    // fine is a document naming a DIFFERENT forum, so the assertion is on the documents that do
    // name one: whichever they are, they agree.
    if (!/governing law/i.test(text)) return;
    expect(text).toMatch(/Maricopa County, Arizona/);
  });

  it("the documents that carry the shared clause carry it verbatim", () => {
    // Spelled once in shared/contact.ts so two documents cannot quietly disagree about the forum.
    for (const [name, text] of PUBLISHED) {
      if (!text.includes("Maricopa County, Arizona, and both sides consent")) continue;
      expect(text, name).toContain(GOVERNING_LAW_CLAUSE);
    }
  });

  it("leaves no reference to a section number the terms no longer have", () => {
    for (const [name, text] of PUBLISHED) {
      expect(text, name).not.toMatch(/Section 1[5-9]/);
    }
  });
});

describe("migrating an installation that took the arbitration text", () => {
  // The removal patch's own `from` IS the previously shipped text, so the migration is tested
  // against the real thing rather than a paraphrase of it: production is carrying this exact
  // string today, and nothing else in the repo still holds a copy to test against.
  const removals = LIVE_DOCUMENT_PATCHES.filter(([from]) =>
    /binding arbitration/i.test(from),
  );

  it("has a patch for each document that carried it", () => {
    expect(removals.length).toBe(2);
  });

  it.each(removals)("removes it from a stored document", (from, to) => {
    const stored = `Some earlier section.\n\n${from}\nThe rest of the document.`;
    const patched = patchLiveDocuments(stored);
    expect(patched).not.toBeNull();
    expect(patched!).not.toMatch(/binding arbitration/i);
    expect(patched!).toContain(to);
    expect(patched!).toContain("The rest of the document.");
  });

  it("is a no-op on a document that has already been migrated", () => {
    // The guard that makes this true is the one in patchLiveDocuments: a removal patch is
    // self-guarding because its `from` is gone afterwards. Worth asserting, because the OTHER
    // guard there -- skip when the result is already present -- would skip these patches on the
    // first run and never apply them at all.
    for (const [, to] of removals) {
      expect(patchLiveDocuments(`Some earlier section.\n\n${to}\nThe rest.`)).toBeNull();
    }
  });

  it("renumbers the section that followed it", () => {
    const [from] = removals[0]!;
    const stored = `${from}\nWe may update these Terms.\n\n18. CONTACT\nForge is operated by X.`;
    const patched = patchLiveDocuments(stored)!;
    expect(patched).toContain("15. GOVERNING LAW");
    expect(patched).toContain("16. CHANGES TO THESE TERMS");
    expect(patched).toContain("17. CONTACT");
    expect(patched).not.toContain("18. CONTACT");
  });
});
