import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { consentRecords, legalDocuments, users } from "@shared/schema";
import { resetDatabase } from "./test-support/fixtures";
import { startTestServer, TestClient, type TestServer } from "./test-support/http-app";

// AN ADULT ATHLETE USED TO SIGN NOTHING ABOUT BIOMETRIC DATA.
//
// The biometric release existed as a document nobody was ever shown -- routes.ts said the whole
// legal-document set was "not wired into signup or any live consent-collection flow". The only
// live biometric consent anywhere was the one a guardian gives for a minor, while Forge extracted
// the same skeletal coordinates from an adult's video with nothing on file. Biometric statutes
// are not age-limited.
//
// Declining has to stay a real option. An agreement you cannot refuse is not an agreement, and
// these statutes are specifically about consent given freely and before collection. So the box is
// optional, and refusing costs camera tracking rather than the account.
const isoYearsAgo = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
};

let seq = 0;
const signupBody = (over: Record<string, unknown> = {}) => ({
  email: `adult-${Date.now().toString(36)}-${seq++}@example.test`,
  password: "correct-horse-battery-staple-9",
  name: "Sam Athlete",
  role: "athlete",
  dateOfBirth: isoYearsAgo(25),
  sport: "Track",
  position: "Sprint",
  heightIn: 70,
  bodyWeightLbs: 170,
  agreedToTerms: true,
  ...over,
});

const consentsFor = async (userId: number) =>
  (await db.query.consentRecords.findMany({ where: eq(consentRecords.userId, userId) })).map(
    (r) => r.consentType,
  );

describe("biometric consent at adult signup", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    await db
      .insert(legalDocuments)
      .values({ docType: "biometric_waiver", content: "BIOMETRIC RELEASE v1" });
  });

  async function signUp(over: Record<string, unknown> = {}) {
    const body = signupBody(over);
    const res = await new TestClient(server.baseUrl).post("/api/auth/signup", body);
    const row = await db.query.users.findFirst({ where: eq(users.email, body.email as string) });
    return { res, row };
  }

  it("records the release, with the document text, when an adult agrees", async () => {
    const { res, row } = await signUp({ agreedToBiometricRelease: true });
    expect(res.status).toBe(201);
    expect(await consentsFor(row!.id)).toContain("biometric_waiver");
    const stored = await db.query.consentRecords.findMany({
      where: eq(consentRecords.userId, row!.id),
    });
    expect(stored.map((r) => r.documentText)).toContain("BIOMETRIC RELEASE v1");
  });

  // Camera tracking is what derives skeletal coordinates. Deriving them from somebody who has not
  // agreed is exactly the collection these statutes are about.
  it("leaves tracking on for an adult who agreed", async () => {
    const { row } = await signUp({ agreedToBiometricRelease: true });
    expect(row!.trackingOptOut).toBe(false);
  });

  it("starts tracking OFF for an adult who declined, without refusing the account", async () => {
    const { res, row } = await signUp({ agreedToBiometricRelease: false });
    expect(res.status).toBe(201);
    expect(row!.trackingOptOut).toBe(true);
    expect(await consentsFor(row!.id)).not.toContain("biometric_waiver");
  });

  it("treats saying nothing as declining, rather than as agreeing", async () => {
    const { row } = await signUp();
    expect(row!.trackingOptOut).toBe(true);
    expect(await consentsFor(row!.id)).not.toContain("biometric_waiver");
  });

  // A minor cannot answer this for themselves. Their guardian gives it when claiming the linked
  // account, and a minor ticking the box in a crafted request must not be recorded as consent.
  it("ignores a minor ticking the box", async () => {
    const { row } = await signUp({
      dateOfBirth: isoYearsAgo(15),
      guardianEmail: `parent-${seq++}@example.test`,
      agreedToBiometricRelease: true,
    });
    expect(await consentsFor(row!.id)).not.toContain("biometric_waiver");
  });

  // A coach is not the one being filmed.
  it("does not record a release for a coach", async () => {
    const { row } = await signUp({
      role: "coach",
      sport: undefined,
      position: undefined,
      heightIn: undefined,
      bodyWeightLbs: undefined,
      agreedToBiometricRelease: true,
    });
    expect(await consentsFor(row!.id)).not.toContain("biometric_waiver");
  });
});
