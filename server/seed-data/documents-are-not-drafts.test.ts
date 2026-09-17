import { describe, it, expect } from "vitest";
import {
  TERMS_OF_SERVICE_DRAFT,
  PRIVACY_POLICY_DRAFT,
  PARENTAL_NOTICE_DRAFT,
  EULA_DRAFT,
  INSTITUTIONAL_AGREEMENT_DRAFT,
} from "./legal-documents-draft";
import { SIGNUP_AGREEMENT } from "./signup-agreement";
import { BIOMETRIC_RELEASE, BIOMETRIC_WAIVER_DRAFT_SNAPSHOT_PREFIX } from "./biometric-release";
import { ASSUMPTION_OF_RISK_RELEASE } from "./assumption-of-risk";
import { AI_TERMS_OF_USE } from "./ai-terms-of-use-draft";

/** A DOCUMENT NOBODY CAN RELY ON IS NOT A SAFER DOCUMENT.
 *
 * These four each opened with "DRAFT -- not reviewed by a lawyer ... do not treat it as legally
 * sufficient", and three are served on PUBLIC pages -- /terms, /privacy, /eula, the last being the
 * licence URL App Store Connect points at. So Forge's own answer to "are these terms any good"
 * sat above the terms, in Forge's own words, for any reader or counterparty to quote back. The
 * disclaimer did not make an unreviewed document safer. It turned a document that would otherwise
 * be relied on into one its author had publicly disavowed.
 *
 * Still unreviewed -- that is true and it has not changed. It is recorded in
 * docs/legal-open-questions.md, where a reviewer reads it and a user does not.
 */
const SHOWN_TO_SOMEBODY: Array<[string, string]> = [
  ["terms of service", TERMS_OF_SERVICE_DRAFT],
  ["privacy policy", PRIVACY_POLICY_DRAFT],
  ["notice to parent or guardian", PARENTAL_NOTICE_DRAFT],
  ["eula", EULA_DRAFT],
  // The four that are accepted in the product rather than published for reading. They have never
  // carried draft language and are here so that can never start.
  ["signup agreement", SIGNUP_AGREEMENT],
  ["video and biometric consent", BIOMETRIC_RELEASE],
  ["assumption of risk", ASSUMPTION_OF_RISK_RELEASE],
  ["ai terms of use", AI_TERMS_OF_USE],
];

describe("a document Forge shows somebody", () => {
  it.each(SHOWN_TO_SOMEBODY)("%s does not disavow itself", (_name, text) => {
    expect(text).not.toMatch(/^DRAFT\b/);
    expect(text).not.toMatch(/not reviewed by a lawyer/i);
    expect(text).not.toMatch(/legally sufficient/i);
    expect(text).not.toMatch(/\(DRAFT\)/);
  });

  it.each(SHOWN_TO_SOMEBODY)("%s carries no note to counsel", (_name, text) => {
    // A "[Placeholder -- counsel should confirm...]" bracket inside a document a person accepts
    // is Forge asking its own lawyer, in front of the user, whether the clause above works.
    expect(text).not.toMatch(/\[Placeholder/);
  });
});

describe("the two that keep their warning, on purpose", () => {
  it("the institutional agreement still says it was never drafted", () => {
    // Different claim from the others, and a true one: this was assembled from patterns in the
    // consumer terms as an outline, not written. A school is asked to ACCEPT it, so stripping
    // the warning would dress an outline up as a contract for somebody to sign. It keeps the
    // warning until it is a real document -- which is a decision about the document, not about
    // its wording.
    expect(INSTITUTIONAL_AGREEMENT_DRAFT).toMatch(/NOT been drafted by a lawyer/);
    expect(INSTITUTIONAL_AGREEMENT_DRAFT).toMatch(
      /Do not send this to a real institutional customer/,
    );
  });

  it("the superseded biometric draft is gone, and its eraser is not", () => {
    // The draft text itself is deleted -- the document Forge uses is BIOMETRIC_RELEASE, and the
    // draft was carrying nothing but its own history. What remains is the prefix that RECOGNISES
    // that draft in an installation still storing it, which is how such an installation stops
    // storing it. That string still reads like a draft because it is quoting one.
    expect(BIOMETRIC_WAIVER_DRAFT_SNAPSHOT_PREFIX).toMatch(/^DRAFT --/);
    expect(BIOMETRIC_WAIVER_DRAFT_SNAPSHOT_PREFIX).toContain(
      "FORGE -- BIOMETRIC INFORMATION CONSENT AND RELEASE (DRAFT)",
    );
    // Short enough to be obviously a fingerprint rather than a document somebody could be shown.
    expect(BIOMETRIC_WAIVER_DRAFT_SNAPSHOT_PREFIX.length).toBeLessThan(400);
  });
});
