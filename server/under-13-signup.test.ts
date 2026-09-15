import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { derivePrivacyTier } from "@shared/privacy-tiers";
import { consentTypeEnum } from "@shared/schema";

const auth = readFileSync(join(__dirname, "auth.ts"), "utf8");
const storage = readFileSync(join(__dirname, "storage.ts"), "utf8");
const reconcile = readFileSync(join(__dirname, "reconcile-schema.ts"), "utf8");

// Under-13 athletes may sign themselves up (owner's decision, 2026-09-13),
// held to the same rule every other minor is: a guardian email at signup, no
// access until that guardian claims their own linked account. These pin the
// pieces that make "the same rule" true rather than just unblocked.
describe("under-13 self-signup", () => {
  it("no longer refuses the signup outright", () => {
    expect(auth).not.toContain("coach_provisioning_required");
    expect(auth).not.toContain("Athletes under 13 can't create their own account");
  });

  it("still requires a guardian email for every minor", () => {
    expect(auth).toContain('tier !== "tier3_adult_18plus" && !guardianEmail');
    expect(derivePrivacyTier("2016-01-01")).toBe("tier1_under13");
  });

  it("flags a guardian notice for every minor, not just 13-17", () => {
    expect(auth).toContain('requiresGuardianNotice: role === "athlete" && tier !== "tier3_adult_18plus"');
    expect(storage).toContain('requiresGuardianNotice: tier !== "tier3_adult_18plus"');
  });

  it("defaults camera-tracking collection off for a Tier 1 self-signup", () => {
    expect(auth).toContain('trackingOptOut: role === "athlete" && tier === "tier1_under13"');
  });

  it("records the guardian's own consent when they claim, attributed to them", () => {
    expect(storage).toContain('consentType: "guardian_coppa_consent"');
    expect(storage).toContain("logGuardianConsents");
    // The COPPA record stays specific to Tier 1 -- it is a claim about a particular legal regime,
    // and widening it to every minor would make the record say something it does not mean. The
    // video and biometric release is the one that widened; see logGuardianConsents.
    expect(storage).toContain('=== "tier1_under13"');
    expect(consentTypeEnum.enumValues).toContain("guardian_coppa_consent");
    expect(reconcile).toContain(`ADD VALUE IF NOT EXISTS 'guardian_coppa_consent'`);
  });
});
