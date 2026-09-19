import { describe, it, expect } from "vitest";
import {
  sha256,
  isShippedVersion,
  shippedPrefixLength,
  SIGNUP_AGREEMENT_PRIOR_LENGTHS,
  SIGNUP_AGREEMENT_PRIOR_SHIPPED,
  BIOMETRIC_RELEASE_PRIOR_SHIPPED,
} from "./shipped-versions";
import { SIGNUP_AGREEMENT, PLACEHOLDER_AGREEMENT, nextSignupAgreement } from "./signup-agreement";
import { BIOMETRIC_RELEASE, nextBiometricRelease } from "./biometric-release";

/** Editing a live document is otherwise a change with no failing signal: tests pass, the seed runs
 * clean, new installations get the new text, and the installation that matters -- production,
 * carrying the PREVIOUS version -- keeps the old one forever. Nothing about the edit tells you.
 *
 * So the current text's hash is pinned here. Change the document and this fails, and the fix is
 * two steps rather than one: append the OLD hash below to that document's PRIOR_SHIPPED list, then
 * update the pin here to the new hash. Doing only the second step is the bug this exists to catch.
 */
describe("the pinned current versions", () => {
  it("signup agreement", () => {
    expect(sha256(SIGNUP_AGREEMENT)).toBe(
      "68cf3176429335312b49d38ad193a34806df3a33e316b49da5f7a4e323bd1c95",
    );
  });

  it("biometric release", () => {
    expect(sha256(BIOMETRIC_RELEASE)).toBe(
      "cefcad4207a9530a0690fab46b627369bdf7093a27c62b7999e9746c32263e7a",
    );
  });
});

describe("migrating a previously shipped version", () => {
  it("lists the version each document replaced", () => {
    expect(SIGNUP_AGREEMENT_PRIOR_SHIPPED.length).toBeGreaterThan(0);
    expect(BIOMETRIC_RELEASE_PRIOR_SHIPPED.length).toBeGreaterThan(0);
  });

  it("does not list the current text as something to migrate away from", () => {
    expect(SIGNUP_AGREEMENT_PRIOR_SHIPPED).not.toContain(sha256(SIGNUP_AGREEMENT));
    expect(BIOMETRIC_RELEASE_PRIOR_SHIPPED).not.toContain(sha256(BIOMETRIC_RELEASE));
  });

  it("knows counsel's rewrite from the version it replaced", () => {
    // The two halves of the edit, asserted separately: the new text must not list itself (or the
    // migration reads the live document as something to migrate away from), and the text it
    // REPLACED must be listed (or production, which is carrying it, never moves onto the
    // reviewed document at all -- the silent failure this whole file exists for).
    expect(SIGNUP_AGREEMENT_PRIOR_SHIPPED).not.toContain(sha256(SIGNUP_AGREEMENT));
    expect(SIGNUP_AGREEMENT_PRIOR_SHIPPED).toContain(
      "3ab92c73e1c270a98c3302241dba317464035cdc689633aea98234a6fb829e02",
    );
    expect(SIGNUP_AGREEMENT_PRIOR_LENGTHS).toContain(12114);
    // And the rewrite itself, as it shipped before the two Terms were merged into it.
    expect(SIGNUP_AGREEMENT_PRIOR_SHIPPED).toContain(
      "9394f4dcc0e4bbcfb81d23af9b8c3d814bd14fae4d6b73ea3d5102c7504e3276",
    );
    expect(SIGNUP_AGREEMENT_PRIOR_LENGTHS).toContain(19178);
  });

  it("is a no-op once the current text is live", () => {
    expect(nextSignupAgreement(SIGNUP_AGREEMENT)).toBeNull();
    expect(nextBiometricRelease(BIOMETRIC_RELEASE)).toBeNull();
  });

  it("does not treat an edited shipped version as shipped", () => {
    // One character's difference and it is somebody's own wording. This is what keeps the hash
    // list from becoming a licence to overwrite an admin's edit.
    const edited = `${SIGNUP_AGREEMENT} `;
    expect(isShippedVersion(edited, SIGNUP_AGREEMENT_PRIOR_SHIPPED)).toBe(false);
    expect(nextSignupAgreement(edited)).toBeNull();
    const editedRelease = BIOMETRIC_RELEASE.replace("Declining is a real choice", "Declining is fine");
    expect(nextBiometricRelease(editedRelease)).toBeNull();
  });
});

describe("the appended healthcare notice", () => {
  const NOTICE = "A note for physical therapists, physicians, and other licensed clinicians:\n\nForge is built for athletic training.";

  it("recorded lengths line up with the recorded hashes", () => {
    // A mismatched length just fails to match, leaving the document alone -- safe, but it means
    // the migration silently stops working, which is exactly the failure this whole file exists
    // to prevent. So the two lists have to stay the same shape.
    expect(SIGNUP_AGREEMENT_PRIOR_LENGTHS.length).toBe(SIGNUP_AGREEMENT_PRIOR_SHIPPED.length);
  });

  it("finds a shipped version sitting in front of an appended notice", () => {
    // Production's actual shape. seed.ts appends this notice to whatever is live, so the stored
    // document is never a shipped version on its own and a whole-document hash matches nothing.
    // This is the bug that got caught by running the real seed against a real database rather
    // than by any unit test here.
    for (let i = 0; i < SIGNUP_AGREEMENT_PRIOR_SHIPPED.length; i++) {
      const len = SIGNUP_AGREEMENT_PRIOR_LENGTHS[i];
      const stored = "x".repeat(len) + "\n\n" + NOTICE;
      // A wrong body of the right length must NOT match -- the hash is what identifies it.
      expect(shippedPrefixLength(stored, SIGNUP_AGREEMENT_PRIOR_SHIPPED, SIGNUP_AGREEMENT_PRIOR_LENGTHS)).toBe(-1);
    }
  });

  it("keeps the notice when it migrates", () => {
    const stored = `${SIGNUP_AGREEMENT}\n\n${NOTICE}`;
    // The current version with a notice appended is already current -- nothing to do.
    expect(nextSignupAgreement(stored)).toBeNull();
  });

  it("still migrates the placeholder with a notice appended", () => {
    const next = nextSignupAgreement(`${PLACEHOLDER_AGREEMENT}\n\n${NOTICE}`);
    expect(next).toBe(`${SIGNUP_AGREEMENT}\n\n${NOTICE}`);
  });
});
