import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { consentRecords, guardianLinks, legalDocuments, users } from "@shared/schema";
import { storage } from "./storage";
import { resetDatabase } from "./test-support/fixtures";
import { startTestServer, TestClient, type TestServer } from "./test-support/http-app";

// THE CLAIM IS THE CONSENT VEHICLE, SO WHAT WAS AGREED HAS TO REACH THE SERVER.
//
// Claiming a guardian invite is the only thing that makes a minor's account usable -- the minor
// gate refuses everything until the link exists. That makes this the moment consent is given, and
// the record written here is the whole record of what a parent agreed to.
//
// It used to carry a password and nothing else. The claim page showed a mandatory terms checkbox,
// the checkbox never left the page, and the server wrote a consent record naming the terms text
// regardless -- so a scripted POST with a password alone produced a row asserting an agreement
// nobody had made.
const isoYearsAgo = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
};

let seq = 0;
async function inviteFor(ageYears: number) {
  const [athlete] = await db
    .insert(users)
    .values({
      email: `minor-${Date.now().toString(36)}-${seq++}@example.test`,
      passwordHash: "not-a-real-hash",
      name: "Test Minor",
      role: "athlete",
      dateOfBirth: isoYearsAgo(ageYears),
    })
    .returning();
  const invite = await storage.createGuardianInvite(
    athlete.id,
    `parent-${Date.now().toString(36)}-${seq++}@example.test`,
  );
  if ("error" in invite) throw new Error(`could not create invite: ${invite.error}`);
  return { athlete, token: invite.token };
}

const consentTypesFor = async (athleteId: number) =>
  (await db.query.consentRecords.findMany({ where: eq(consentRecords.userId, athleteId) })).map(
    (r) => r.consentType,
  );

describe("the guardian claim as the consent vehicle", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    await db.insert(legalDocuments).values([
      { docType: "privacy_policy", content: "PRIVACY POLICY v1" },
      { docType: "biometric_waiver", content: "VIDEO AND BIOMETRIC RELEASE v1" },
      { docType: "parental_notice", content: "PARENTAL NOTICE v1" },
    ]);
  });

  it("refuses a claim that agrees to nothing", async () => {
    const { token } = await inviteFor(14);
    const res = await new TestClient(server.baseUrl).post(
      `/api/guardian-invites/${token}/claim`,
      { password: "a-perfectly-fine-password" },
    );
    expect(res.status).toBe(400);
  });

  // The one that matters most on a camera platform. A parent may consent to the terms and the
  // privacy policy and still not have agreed to their child being filmed.
  it("refuses a claim that skips the video and biometric release", async () => {
    const { token } = await inviteFor(14);
    const res = await new TestClient(server.baseUrl).post(
      `/api/guardian-invites/${token}/claim`,
      {
        password: "a-perfectly-fine-password",
        agreedToTerms: true,
        agreedToPrivacyPolicy: true,
      },
    );
    expect(res.status).toBe(400);
    // And nothing was created on the way to refusing.
    expect(await db.query.guardianLinks.findMany()).toHaveLength(0);
  });

  it("records what a parent agreed to, with the document text as it stood", async () => {
    const { athlete, token } = await inviteFor(14);
    const res = await new TestClient(server.baseUrl).post(
      `/api/guardian-invites/${token}/claim`,
      {
        password: "a-perfectly-fine-password",
        agreedToTerms: true,
        agreedToPrivacyPolicy: true,
        agreedToMinorMediaRelease: true,
      },
    );
    expect(res.status).toBe(201);

    const rows = await db.query.consentRecords.findMany({
      where: eq(consentRecords.userId, athlete.id),
    });
    // Attributed to the guardian who gave it, against the athlete it authorises.
    const link = await db.query.guardianLinks.findFirst({
      where: eq(guardianLinks.athleteId, athlete.id),
    });
    expect(link).toBeTruthy();
    for (const row of rows) expect(row.givenByUserId).toBe(link!.guardianId);
    // A record naming a document by type alone is worthless once the document is edited, so the
    // text is snapshotted.
    expect(rows.map((r) => r.documentText)).toContain("VIDEO AND BIOMETRIC RELEASE v1");
    expect(rows.map((r) => r.documentText)).toContain("PRIVACY POLICY v1");
  });

  // EVERY MINOR, not only the under-13s. Being filmed and measured is the same act at 14 as at
  // 12, and the gate that makes this claim the price of using Forge covers everyone under 18.
  it("records the media release for a teenager, not just an under-13", async () => {
    const { athlete, token } = await inviteFor(15);
    await new TestClient(server.baseUrl).post(`/api/guardian-invites/${token}/claim`, {
      password: "a-perfectly-fine-password",
      agreedToTerms: true,
      agreedToPrivacyPolicy: true,
      agreedToMinorMediaRelease: true,
    });
    expect(await consentTypesFor(athlete.id)).toContain("biometric_waiver");
  });

  // The COPPA record stays specific to Tier 1 -- it is a different claim about a different legal
  // regime, and widening it would make the record say something it does not mean.
  it("keeps the COPPA record for an under-13 and withholds it from a teenager", async () => {
    const young = await inviteFor(9);
    await new TestClient(server.baseUrl).post(`/api/guardian-invites/${young.token}/claim`, {
      password: "a-perfectly-fine-password",
      agreedToTerms: true,
      agreedToPrivacyPolicy: true,
      agreedToMinorMediaRelease: true,
    });
    expect(await consentTypesFor(young.athlete.id)).toContain("guardian_coppa_consent");

    const teen = await inviteFor(16);
    await new TestClient(server.baseUrl).post(`/api/guardian-invites/${teen.token}/claim`, {
      password: "a-perfectly-fine-password",
      agreedToTerms: true,
      agreedToPrivacyPolicy: true,
      agreedToMinorMediaRelease: true,
    });
    expect(await consentTypesFor(teen.athlete.id)).not.toContain("guardian_coppa_consent");
  });

  // The whole point of the vehicle: consenting is what unlocks the child's account.
  it("clears the minor gate the moment the claim succeeds", async () => {
    const { athlete, token } = await inviteFor(14);
    expect(await storage.athleteGateStatus(athlete.id)).toBe("needs_guardian");
    await new TestClient(server.baseUrl).post(`/api/guardian-invites/${token}/claim`, {
      password: "a-perfectly-fine-password",
      agreedToTerms: true,
      agreedToPrivacyPolicy: true,
      agreedToMinorMediaRelease: true,
    });
    expect(await storage.athleteGateStatus(athlete.id)).toBe("ok");
  });
});
