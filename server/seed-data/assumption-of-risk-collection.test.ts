import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { consentTypeEnum } from "@shared/schema";
import { claimGuardianInviteSchema } from "@shared/schema";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/** The release existed as a document before it was collected from anyone, which is a file rather
 * than a waiver. These pin the collection paths. */
describe("collecting the assumption-of-risk release", () => {
  it("has its own consent type", () => {
    // Not folded into terms_of_service: it is the one document asking somebody to give up a
    // right, and a record that cannot distinguish "accepted the terms" from "waived a claim"
    // cannot answer the only question anyone will ever ask of it.
    expect(consentTypeEnum.enumValues).toContain("assumption_of_risk");
  });

  it("has a migration, so an existing database gains the enum value", () => {
    expect(read("server/reconcile-schema.ts")).toContain(
      "ALTER TYPE \"consent_type\" ADD VALUE IF NOT EXISTS 'assumption_of_risk'",
    );
  });

  it("is mandatory for a guardian claiming a minor's account", () => {
    const base = {
      password: "correct horse",
      agreedToTerms: true as const,
      agreedToPrivacyPolicy: true as const,
      agreedToMinorMediaRelease: true as const,
    };
    // Missing entirely, and explicitly declined, both refuse the claim.
    expect(claimGuardianInviteSchema.safeParse(base).success).toBe(false);
    expect(
      claimGuardianInviteSchema.safeParse({ ...base, agreedToAssumptionOfRisk: false }).success,
    ).toBe(false);
    expect(
      claimGuardianInviteSchema.safeParse({ ...base, agreedToAssumptionOfRisk: true }).success,
    ).toBe(true);
  });

  it("records it for every minor at claim time, not only the under-13s", () => {
    // Same reasoning the biometric release already carries: a barbell is no safer at 17.
    const storage = read("server/storage.ts");
    expect(storage).toMatch(/if \(isMinor && risk\?\.content\)/);
    expect(storage).toMatch(/consentType: "assumption_of_risk"/);
  });

  it("snapshots the document rather than substituting the terms text", () => {
    // A consent record whose documentText is a stand-in for the real document is evidence of
    // nothing. Both collection paths skip rather than substitute.
    expect(read("server/auth.ts")).toMatch(/if \(risk\?\.content\) \{/);
  });

  it("is offered to an adult athlete at signup, and only to them", () => {
    const auth = read("server/auth.ts");
    expect(auth).toMatch(/agreedToAssumptionOfRisk === true &&\s*role === "athlete" &&\s*tier === "tier3_adult_18plus"/);
  });

  it("links the document from the guardian's checkbox", () => {
    // Four separate agreements now, four separate documents, four links. A mandatory checkbox
    // over text the person cannot reach is not a clickwrap.
    const claim = read("client/src/pages/guardian-claim.tsx");
    expect(claim).toContain('docType="assumption_of_risk"');
    expect(claim).toMatch(/nobody at\s+Forge\s+supervises my child's training/);
  });

  it("blocks the claim button until all four are ticked", () => {
    expect(read("client/src/pages/guardian-claim.tsx")).toMatch(
      /agreedToTerms && agreedToPrivacyPolicy && agreedToMinorMediaRelease && agreedToAssumptionOfRisk/,
    );
  });
});
