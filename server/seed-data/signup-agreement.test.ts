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
    // attached, not an edit nobody notices.
    expect(SIGNUP_AGREEMENT).toContain("dietetic or medical advice"); // nutrition, incl. to minors
    expect(SIGNUP_AGREEMENT).toMatch(/still images taken from the training video/); // images leave for AI form check
    expect(SIGNUP_AGREEMENT).toMatch(/geolocation lookup on the IP address of a sign-in/); // undisclosed transfer
    expect(SIGNUP_AGREEMENT).toMatch(/health information about you/); // health data category
    expect(SIGNUP_AGREEMENT).toMatch(/can cause injury/); // assumption of risk, in front of the athlete
  });

  it("states the minor video retention windows it promises", () => {
    expect(SIGNUP_AGREEMENT).toContain("30 days");
    expect(SIGNUP_AGREEMENT).toContain("90 days");
  });

  it("does not quote the rolling cap's numbers, which move with billing", () => {
    // shared/video-retention.ts has three different sets of these (default, unlimited, paid
    // add-on). A number here would be wrong for two of the three.
    expect(SIGNUP_AGREEMENT).toMatch(/limits are shown in the app/);
  });

  it("points biometric consent at the separate release rather than absorbing it", () => {
    expect(SIGNUP_AGREEMENT).toMatch(/separate video and biometric consent and release/);
  });

  it("gives one contact address, matching the other documents", () => {
    const addresses = SIGNUP_AGREEMENT.match(/[\w.+-]+@[\w.-]+/g) ?? [];
    expect(new Set(addresses)).toEqual(new Set(["forgeperformancesystems@outlook.com"]));
  });
});
