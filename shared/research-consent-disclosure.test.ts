import { describe, it, expect } from "vitest";
import {
  RESEARCH_CONSENT_TEXT,
  DELETION_RETENTION_HEADING,
  PRIOR_DELETION_RETENTION_HEADINGS,
  researchConsentDisclosesDeletionRetention,
} from "./research-consent";

/** The gate that decides whether a deleted account's scrubbed record may be
 * kept. It reads the text the person actually agreed to, so the two have to
 * stay in step -- a heading edited in one place and not the other would answer
 * "no" for everybody, silently, and the retention would just stop happening. */
describe("the deletion-retention disclosure", () => {
  it("is actually in the consent text", () => {
    expect(RESEARCH_CONSENT_TEXT).toContain(DELETION_RETENTION_HEADING);
    expect(researchConsentDisclosesDeletionRetention(RESEARCH_CONSENT_TEXT)).toBe(true);
  });

  it("says what stays and what goes, not just that something stays", () => {
    const section = RESEARCH_CONSENT_TEXT.slice(
      RESEARCH_CONSENT_TEXT.indexOf(DELETION_RETENTION_HEADING),
    );
    // The three facts a person needs to decide: their identity goes, the group
    // numbers stay, and there is an order to follow if they want neither.
    expect(section).toContain("video files");
    expect(section).toContain("retained");
    expect(section).toMatch(/withdraw[\s\S]*prior to initiating the account deletion/);
  });

  it("answers no for the text as it read before the section existed", () => {
    const older = RESEARCH_CONSENT_TEXT.split(DELETION_RETENTION_HEADING)[0];
    expect(researchConsentDisclosesDeletionRetention(older)).toBe(false);
  });

  it("still answers yes for the 2026-09-17 wording people already agreed to", () => {
    for (const h of PRIOR_DELETION_RETENTION_HEADINGS) {
      expect(researchConsentDisclosesDeletionRetention(`Allowing your training data...\n\n${h}\nDeleting your account removes...`)).toBe(true);
    }
  });

  it("answers no for nothing at all, rather than throwing", () => {
    // A consent record that cannot be found must not be read as permission.
    expect(researchConsentDisclosesDeletionRetention(null)).toBe(false);
    expect(researchConsentDisclosesDeletionRetention(undefined)).toBe(false);
    expect(researchConsentDisclosesDeletionRetention("")).toBe(false);
  });

  it("still answers yes when a coach relayed a guardian's decision", () => {
    // That path prepends a line naming who it came from; the document is still
    // the document.
    const relayed = `Relayed by a coach on behalf of: A Parent\n\n${RESEARCH_CONSENT_TEXT}`;
    expect(researchConsentDisclosesDeletionRetention(relayed)).toBe(true);
  });
});
