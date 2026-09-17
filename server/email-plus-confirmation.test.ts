import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildGuardianConsentConfirmationEmail } from "./guardian-consent-confirmation-email";

const auth = readFileSync(join(__dirname, "auth.ts"), "utf8");

// EMAIL-PLUS: the consent, then a second separate message to the same address.
//
// The point of the "plus" is not politeness. A child who got hold of the invite email has to
// still hold the parent's inbox some time later, and a parent who did NOT consent has to find out
// that somebody did it in their name. Both of those fail if the confirmation is a receipt nobody
// can act on.
describe("the guardian consent confirmation", () => {
  const html = buildGuardianConsentConfirmationEmail(
    "Sam Rivera",
    "parent@example.test",
    new Date("2026-09-15T18:00:00Z"),
    "https://forge.test/guardian",
  );

  it("names what was agreed, rather than only that something was", () => {
    expect(html).toContain("terms of service");
    expect(html).toContain("privacy policy");
    // The one specific to putting a minor on a camera platform, and the reason this email exists
    // on this product rather than a generic welcome note.
    expect(html).toMatch(/video and biometric consent/i);
    expect(html).toMatch(/recorded on video/i);
  });

  it("says whose account it was and which address approved it", () => {
    expect(html).toContain("Sam Rivera");
    expect(html).toContain("parent@example.test");
  });

  // The half that makes this a verification step instead of a receipt.
  it("tells a parent who did not consent what to do about it", () => {
    expect(html).toMatch(/if this wasn't you/i);
    expect(html).toContain("https://forge.test/guardian");
    expect(html).toMatch(/withdraw/i);
  });

  it("is honest that the approval already took effect", () => {
    expect(html).toMatch(/not a request/i);
  });

  it("escapes a name rather than pasting it into the markup", () => {
    const hostile = buildGuardianConsentConfirmationEmail(
      '<script>alert(1)</script>',
      "parent@example.test",
      new Date(),
      "https://forge.test/guardian",
    );
    expect(hostile).not.toContain("<script>");
  });

  // Sent after the claim succeeds, and never in a way that can hold up the response that unlocks
  // a child's account -- but a failure is logged rather than swallowed, because an unsent
  // confirmation is a missing half of the verification and not a missing nicety.
  it("is sent on a successful claim, fire-and-forget, and logs a failure", () => {
    const claim = auth.slice(auth.indexOf('"/api/guardian-invites/:token/claim"'));
    const body = claim.slice(0, claim.indexOf("Shared tail for both"));
    expect(body).toContain("sendGuardianConsentConfirmation(req, user, result.athleteId)");
    expect(auth).toContain("guardian consent confirmation (email-plus) failed to send:");
  });
});
