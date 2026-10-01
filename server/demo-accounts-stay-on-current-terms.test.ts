import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DEMO_ACCOUNT_EMAILS } from "./device-trust-policy";

// An App Store reviewer signs in with the seeded demo accounts. A changed Terms of Use re-asks
// every real account once, which is right for a person and wrong for a reviewer whose first
// screen would be a non-dismissable legal dialog. The seed keeps exactly those three accounts
// on the live text, after the agreement is applied, and nobody else.
describe("the demo accounts never meet the terms dialog", () => {
  const seed = readFileSync("server/seed.ts", "utf8");

  it("the seed keeps the demo accounts on the current terms after applying a new agreement", () => {
    const applyAt = seed.indexOf("nextSignupAgreement(");
    const keepAt = seed.indexOf("await keepDemoAccountsOnCurrentTerms()");
    expect(applyAt).toBeGreaterThan(0);
    expect(keepAt).toBeGreaterThan(applyAt);
  });

  it("iterates the same three addresses the device-verification exemption uses, and no other list", () => {
    const fn = seed.slice(seed.indexOf("async function keepDemoAccountsOnCurrentTerms"), seed.indexOf("async function main("));
    expect(fn).toContain("for (const email of DEMO_ACCOUNT_EMAILS)");
    expect(fn).not.toMatch(/@example\.com|users\.role|where\(isNull/);
    expect(DEMO_ACCOUNT_EMAILS.length).toBe(3);
  });

  it("compares the core text, so the clinician note the seed appends is not a change", () => {
    const fn = seed.slice(seed.indexOf("async function keepDemoAccountsOnCurrentTerms"), seed.indexOf("async function main("));
    expect(fn).toContain("coreAgreementText(user.agreedToTermsText ?? \"\") === coreAgreementText(live)");
  });
});
