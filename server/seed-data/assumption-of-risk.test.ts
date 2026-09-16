import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ASSUMPTION_OF_RISK_RELEASE } from "./assumption-of-risk";
import { GOVERNING_LAW_CLAUSE } from "@shared/contact";

/** The template this replaced scoped its assumption of risk AND its indemnification to "use of or
 * presence upon the facilities of Forge Performance Systems LLC". There are no facilities and
 * nobody is ever present upon them, so the release covered an event that never happens while the
 * real risk -- training alone, following a program this software generated -- was absent from it.
 * These tests pin the shape that fixes it. */
describe("the assumption of risk release", () => {
  it("is not scoped to a facility", () => {
    // The template's release and indemnification both covered "use of or presence upon the
    // facilities". Denying that facilities exist is fine and section 2 does exactly that -- what
    // must not come back is a release whose SCOPE is a place.
    expect(ASSUMPTION_OF_RISK_RELEASE).not.toMatch(/presence upon/i);
    expect(ASSUMPTION_OF_RISK_RELEASE).not.toMatch(/use of or presence/i);
    for (const word of [/posted rules/i, /oral instructions/i, /damage to the facilities/i]) {
      expect(ASSUMPTION_OF_RISK_RELEASE).not.toMatch(word);
    }
    // And the release clause names the activity instead.
    expect(ASSUMPTION_OF_RISK_RELEASE).toMatch(/arising out of your athletic training/);
  });

  it("leads with the fact that nobody supervises", () => {
    // The reason the release exists. Every other document mentions it in passing.
    expect(ASSUMPTION_OF_RISK_RELEASE).toMatch(/No one at Forge supervises your training/);
    expect(ASSUMPTION_OF_RISK_RELEASE).toMatch(/Nobody watches you lift/);
  });

  it("says camera measurements are not safety equipment", () => {
    // Ties the release to what the tracker actually is: estimates from a phone, condition-
    // dependent, and withheld outright when the trace is too coarse. A coach reading "good rep"
    // is reading software output, not a safety check.
    expect(ASSUMPTION_OF_RISK_RELEASE).toMatch(/They are not safety equipment/);
  });

  it("names what it does NOT release", () => {
    expect(ASSUMPTION_OF_RISK_RELEASE).toMatch(/gross negligence, recklessness, or intentional or wilful misconduct/);
    expect(ASSUMPTION_OF_RISK_RELEASE).toMatch(/cannot lawfully be released or limited/);
    // Data claims belong to the privacy documents, not here -- otherwise this release would
    // quietly cover the biometric handling that has its own instrument and its own withdrawal.
    expect(ASSUMPTION_OF_RISK_RELEASE).toMatch(/Video and Biometric Consent and Release/);
  });

  it("tells a guardian what they cannot give up", () => {
    // The honest part, and the one a template gets wrong by omission: in many states a parent
    // cannot release a minor's own future claim. A document that appears to take a child's
    // rights away while not actually doing so misleads the person agreeing to it.
    expect(ASSUMPTION_OF_RISK_RELEASE).toMatch(/limits or prevents a parent from releasing a minor's OWN right/);
    expect(ASSUMPTION_OF_RISK_RELEASE).toMatch(/the athlete's own claim is unaffected/);
  });

  it("carries the shared governing-law clause rather than a fourth answer", () => {
    // The template proposed mediation, which would have been the third dispute path across
    // Forge's documents after the live terms' courts and the terms draft's arbitration proposal.
    expect(ASSUMPTION_OF_RISK_RELEASE).toContain(GOVERNING_LAW_CLAUSE);
    expect(ASSUMPTION_OF_RISK_RELEASE).not.toMatch(/mediation/i);
  });

  it("describes clickwrap, not a signature", () => {
    expect(ASSUMPTION_OF_RISK_RELEASE).toMatch(/there is no separate signature page/);
    expect(ASSUMPTION_OF_RISK_RELEASE).not.toMatch(/\bBy signing\b/i);
  });

  it("does not collect an emergency contact", () => {
    // The template asked for one. Forge is not present when anyone trains and cannot call
    // anybody, so it would imply a duty of care Forge cannot perform while collecting more
    // personal data about a minor for a purpose that does not exist.
    expect(ASSUMPTION_OF_RISK_RELEASE).not.toMatch(/emergency contact/i);
  });

  it("promises no refund it has not agreed to make", () => {
    // The template's no-duress clause offered to refund fees to anyone who declined to sign.
    expect(ASSUMPTION_OF_RISK_RELEASE).not.toMatch(/refund/i);
  });

  it("has no unfilled blanks", () => {
    expect(ASSUMPTION_OF_RISK_RELEASE).not.toMatch(/_{3,}/);
    expect(ASSUMPTION_OF_RISK_RELEASE).not.toContain("[Placeholder");
  });

  it("is reachable at a public URL", () => {
    const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
    expect(read("server/routes.ts")).toMatch(/PUBLIC_LEGAL_DOC_TYPES = \[[\s\S]{0,200}"assumption_of_risk"/);
    expect(read("client/src/App.tsx")).toContain('path="/assumption-of-risk"');
  });
});
