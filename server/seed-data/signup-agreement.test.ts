import { describe, it, expect } from "vitest";
import {
  nextSignupAgreement,
  SIGNUP_AGREEMENT,
  PLACEHOLDER_AGREEMENT,
  UNCONFIGURED_FALLBACK,
} from "./signup-agreement";

/** The seed runs on every deploy (render.yaml's buildCommand), so the thing worth asserting is
 * not that it writes the terms once -- it is everything it must NOT overwrite on the next 200
 * runs. An admin's edit to the live clickwrap is the document real users are agreeing to; a
 * redeploy silently reverting it would replace what somebody consented to without anyone
 * noticing. */
describe("nextSignupAgreement", () => {
  it("seeds the real terms on a fresh install", () => {
    expect(nextSignupAgreement(UNCONFIGURED_FALLBACK)).toBe(SIGNUP_AGREEMENT);
  });

  it("agrees with storage.getLegalAgreement's fallback string", () => {
    // Duplicated across two files that must not import each other (see the constant's comment).
    // If storage's fallback is ever reworded, the fresh-install branch goes dead silently and a
    // new install would keep the placeholder forever -- so pin the exact text here.
    expect(UNCONFIGURED_FALLBACK).toBe("No agreement has been configured yet.");
  });

  it("replaces the placeholder", () => {
    expect(nextSignupAgreement(PLACEHOLDER_AGREEMENT)).toBe(SIGNUP_AGREEMENT);
  });

  it("keeps what was appended after the placeholder", () => {
    // Production's actual shape: the placeholder with the healthcare notice appended to it by a
    // later block in the same script. The notice has to survive, because the block that adds it
    // is keyed off a marker and treats its own presence as "already done".
    const notice = "A note for physical therapists, physicians, and other licensed clinicians:\n\nForge is built for...";
    const next = nextSignupAgreement(`${PLACEHOLDER_AGREEMENT}\n\n${notice}`);
    expect(next).toBe(`${SIGNUP_AGREEMENT}\n\n${notice}`);
    expect(next).not.toContain("PLACEHOLDER");
  });

  it("leaves an admin's own wording alone", () => {
    const edited = "FORGE -- TERMS\n\nSomething the operator wrote themselves.";
    expect(nextSignupAgreement(edited)).toBeNull();
  });

  it("leaves a hand-edited placeholder alone", () => {
    // Matching on an exact prefix rather than the word "PLACEHOLDER" is what makes this safe:
    // somebody who started from the placeholder and changed a sentence has made a decision, and
    // a redeploy must not overturn it.
    const tweaked = PLACEHOLDER_AGREEMENT.replace("informational aids", "guidance");
    expect(nextSignupAgreement(tweaked)).toBeNull();
  });

  it("is idempotent once the real terms are live", () => {
    expect(nextSignupAgreement(SIGNUP_AGREEMENT)).toBeNull();
    expect(nextSignupAgreement(`${SIGNUP_AGREEMENT}\n\nappended notice`)).toBeNull();
  });
});

describe("the terms themselves", () => {
  it("does not describe itself as a placeholder or a draft", () => {
    // The whole point of the replacement. Every terms consent record snapshots this text as the
    // thing the user agreed to, so a self-undermining banner in it undermines the records too.
    expect(SIGNUP_AGREEMENT).not.toMatch(/PLACEHOLDER|\bDRAFT\b/);
  });

  it("covers the disclosures that had no home before", () => {
    // Each of these was a gap named in docs/legal-clause-revisions.md Part 2. They are listed
    // here so that deleting one from the document is a deliberate act with a failing test
    // attached, not an edit nobody notices. Reworded in counsel's 2026-09-19 rewrite -- the
    // phrasing below is theirs; what is pinned is that each disclosure is still MADE.
    expect(SIGNUP_AGREEMENT).toContain("dietetic, medical, or nutritional advice"); // nutrition, incl. to minors
    expect(SIGNUP_AGREEMENT).toMatch(/still images from your submitted training video/); // images leave for AI form check
    expect(SIGNUP_AGREEMENT).toMatch(/IP-based geolocation service/); // undisclosed transfer
    expect(SIGNUP_AGREEMENT).toMatch(/constitute health-related information/); // health data category
    expect(SIGNUP_AGREEMENT).toMatch(/inherent risks of injury/); // assumption of risk, in front of the athlete
  });

  it("states the minor video retention windows it promises", () => {
    expect(SIGNUP_AGREEMENT).toContain("thirty (30) days");
    expect(SIGNUP_AGREEMENT).toContain("ninety (90) days");
  });

  it("does not quote the rolling cap's numbers, which move with billing", () => {
    // shared/video-retention.ts has three different sets of these (default, unlimited, paid
    // add-on). A number here would be wrong for two of the three.
    expect(SIGNUP_AGREEMENT).toMatch(/displays current retention limits/);
  });

  it("points biometric consent at the separate release rather than absorbing it", () => {
    expect(SIGNUP_AGREEMENT).toMatch(/separate Video and Biometric Consent/);
  });

  it("carries the five answers counsel's rewrite folded in", () => {
    // The document is the attorney's, verbatim, and these five are the edits that were asked for
    // on top of it. A later "tidy" that drops one is dropping a reviewed decision, so each is
    // pinned to the sentence that makes it.
    // 1. Section 3 no longer promises software enforcement Forge does not perform.
    expect(SIGNUP_AGREEMENT).not.toMatch(/enforced by the software/);
    // 2. A liability floor and a carve-out for gross negligence.
    expect(SIGNUP_AGREEMENT).toMatch(/\$50/);
    expect(SIGNUP_AGREEMENT).toMatch(/gross negligence/i);
    // 3. Notice and re-acceptance on a material change -- the promise server/storage.ts's
    //    getTermsAcceptanceStatus and the accept-terms routes exist to keep.
    expect(SIGNUP_AGREEMENT).toMatch(/ask you to review and accept the revised Terms/);
    // 4. These Terms govern over the publicly posted Terms of Service.
    expect(SIGNUP_AGREEMENT).toMatch(/these Terms of Use shall govern/);
    // 5. DMCA notice-and-takedown, naming the designated agent.
    expect(SIGNUP_AGREEMENT).toMatch(/Digital Millennium Copyright Act/);
    expect(SIGNUP_AGREEMENT).toMatch(/designated copyright agent/);
    // Plus severability and entire agreement.
    expect(SIGNUP_AGREEMENT).toMatch(/invalid or unenforceable/);
    expect(SIGNUP_AGREEMENT).toMatch(/constitute the entire agreement/);
  });

  it("gives one contact address", () => {
    // Which address, and that every other document agrees with it, is contact-address.test.ts.
    // Trailing sentence punctuation trimmed: counsel's contact line ends "...@outlook.com.",
    // and a full stop is not a second address.
    const addresses = new Set(
      (SIGNUP_AGREEMENT.match(/[\w.+-]+@[\w.-]+/g) ?? []).map((a) => a.replace(/\.+$/, "")),
    );
    expect(addresses.size).toBe(1);
  });
});
