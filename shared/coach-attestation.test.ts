import { describe, it, expect } from "vitest";
import {
  COACH_COPPA_ATTESTATION,
  COACH_COPPA_ATTESTATION_NOT_TAKEN,
  needsCoppaAttestation,
} from "./coach-attestation";

/** The one assertion a Tier 1 (under-13) account rests on. There is no verified-parent step in
 * the coach-provisioned flow, so this text IS the consent -- it is what gets produced when
 * somebody asks on what basis a ten-year-old had an account. */
describe("the coach's under-13 attestation", () => {
  it("says a parent gave permission, which is the whole point of it", () => {
    // The defect this replaced: the consent record stored Forge's TERMS OF USE, so the row read
    // as "a coach accepted some terms" and asserted nothing about a parent at all.
    expect(COACH_COPPA_ATTESTATION).toMatch(/parent or legal guardian .* has given permission/);
    expect(COACH_COPPA_ATTESTATION).toMatch(/relaying that permission as the program's agent/);
  });

  it("does not claim Forge verified anything", () => {
    // Same discipline as acknowledgeGuardianNotice: a record that overclaims is worse than none,
    // because it is the document produced when somebody asks and it has to survive being read.
    expect(COACH_COPPA_ATTESTATION).toMatch(/Forge itself has not verified this permission/);
    expect(COACH_COPPA_ATTESTATION).toMatch(/captured no signature/);
  });

  it("says what was disclosed and that the record sits against the coach", () => {
    expect(COACH_COPPA_ATTESTATION).toMatch(/what Forge collects/);
    expect(COACH_COPPA_ATTESTATION).toMatch(/recorded against my account/);
    // Camera tracking defaults off for Tier 1 until a guardian turns it on (storage.ts sets
    // trackingOptOut for exactly this reason). The attestation says so, because a coach agreeing
    // to it should know what they are and are not switching on.
    expect(COACH_COPPA_ATTESTATION).toMatch(/camera tracking stays off/);
  });
});

describe("who needs one", () => {
  it("is decided by age when the sheet gave one", () => {
    expect(needsCoppaAttestation({ age: 12 })).toBe(true);
    expect(needsCoppaAttestation({ age: 13 })).toBe(false);
    expect(needsCoppaAttestation({ age: 17 })).toBe(false);
  });

  it("falls back to a date of birth", () => {
    const yearsAgo = (n: number) => {
      const d = new Date();
      d.setUTCFullYear(d.getUTCFullYear() - n);
      return d.toISOString().slice(0, 10);
    };
    expect(needsCoppaAttestation({ dateOfBirth: yearsAgo(10) })).toBe(true);
    expect(needsCoppaAttestation({ dateOfBirth: yearsAgo(15) })).toBe(false);
  });

  it("does not treat a missing age as under 13", () => {
    // Deliberate, and the opposite of the guardian gate's rule. There an unknown date of birth
    // must fail CLOSED, because the question is whether to hand a child something. Here the
    // question is whether to make a coach attest to a parent's permission they may not have
    // been asked for, about an athlete who may well be an adult -- and an attestation demanded
    // for every row is one nobody reads by the third import.
    expect(needsCoppaAttestation({})).toBe(false);
    expect(needsCoppaAttestation({ age: null, dateOfBirth: null })).toBe(false);
    expect(needsCoppaAttestation({ dateOfBirth: "not-a-date" })).toBe(false);
  });
});

describe("the record written when no attestation was taken", () => {
  it("says so rather than citing one that never happened", () => {
    // The branch that makes the missing-age rule above safe. A sheet with no ages produces a
    // slot nobody attested for; if that athlete turns out to be under 13 at claim time, the
    // consent record has to say no attestation exists -- not quote the text of one.
    expect(COACH_COPPA_ATTESTATION_NOT_TAKEN).toMatch(/NO COACH ATTESTATION WAS TAKEN/);
    expect(COACH_COPPA_ATTESTATION_NOT_TAKEN).toMatch(/has not confirmed/);
    expect(COACH_COPPA_ATTESTATION_NOT_TAKEN).toMatch(/nothing here evidences one/);
  });

  it("is unmistakably not the attestation", () => {
    // Both land in the same column of the same table, read by the same compliance report. If one
    // could be skimmed as the other the distinction would be worth nothing.
    expect(COACH_COPPA_ATTESTATION_NOT_TAKEN).not.toContain("I confirm that:");
    expect(COACH_COPPA_ATTESTATION).not.toMatch(/NO COACH ATTESTATION/);
  });
});
