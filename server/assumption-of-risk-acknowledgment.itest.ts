import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { consentRecords, legalDocuments, users } from "@shared/schema";
import { resetDatabase } from "./test-support/fixtures";
import { startTestServer, TestClient, type TestServer } from "./test-support/http-app";
import { storage } from "./storage";

// THE ATHLETE NEVER SAW THE RISK TERMS.
//
// They live in the terms and the EULA, and for a minor a guardian accepts both on a different
// screen. The legal instrument is fine; the person actually under the bar had read nothing. This
// is the acknowledgment that closes that, and the thing most likely to go wrong in it is the
// distinction it rests on: a guardian's consent and an athlete's acknowledgment are the same
// consent type for the same athlete, separated only by givenByUserId.
const isoYearsAgo = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
};

let seq = 0;
const signupBody = (over: Record<string, unknown> = {}) => ({
  email: `risk-${Date.now().toString(36)}-${seq++}@example.test`,
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

describe("the athlete's own acknowledgment of the risk terms", () => {
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
      .values({ docType: "assumption_of_risk", content: "RISK RELEASE v1" });
  });

  async function signUpAthlete(over: Record<string, unknown> = {}) {
    const body = signupBody(over);
    const client = new TestClient(server.baseUrl);
    const res = await client.post("/api/auth/signup", body);
    const row = await db.query.users.findFirst({ where: eq(users.email, body.email as string) });
    return { res, row: row!, client };
  }

  it("is required until the athlete answers, then not", async () => {
    const { res, client, row } = await signUpAthlete();
    expect(res.status).toBe(201);
    expect(res.body.assumptionOfRiskRequired).toBe(true);

    const ack = await client.post("/api/account/assumption-of-risk", {});
    expect(ack.status).toBe(200);
    expect(ack.body.assumptionOfRiskRequired).toBe(false);

    expect(await storage.hasAcknowledgedAssumptionOfRisk(row.id)).toBe(true);
  });

  it("snapshots the document text, not a stand-in", async () => {
    const { client, row } = await signUpAthlete();
    await client.post("/api/account/assumption-of-risk", {});
    const rows = await db.query.consentRecords.findMany({
      where: and(
        eq(consentRecords.userId, row.id),
        eq(consentRecords.consentType, "assumption_of_risk"),
      ),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].documentText).toBe("RISK RELEASE v1");
    // No givenByUserId: this is the athlete answering for themselves, which is the ONLY thing
    // that distinguishes it from a guardian's consent for the same athlete and type.
    expect(rows[0].givenByUserId).toBeNull();
  });

  it("refuses rather than recording a consent to a document that does not exist", async () => {
    await db.delete(legalDocuments).where(eq(legalDocuments.docType, "assumption_of_risk"));
    const { client, row } = await signUpAthlete();
    const ack = await client.post("/api/account/assumption-of-risk", {});
    expect(ack.status).toBe(503);
    expect(await storage.hasAcknowledgedAssumptionOfRisk(row.id)).toBe(false);
  });

  it("does NOT count a guardian's consent as the athlete having read it", async () => {
    // The distinction the whole feature rests on. A guardian agreeing at claim time writes a
    // record for this athlete with this consent type -- and the athlete still has not seen it.
    const { row } = await signUpAthlete();
    const guardian = await signUpAthlete();
    await storage.logConsentRecord({
      userId: row.id,
      givenByUserId: guardian.row.id,
      consentType: "assumption_of_risk",
      documentText: "RISK RELEASE v1",
    });
    expect(await storage.hasAcknowledgedAssumptionOfRisk(row.id)).toBe(false);
  });

  it("is only for athletes", async () => {
    // expectedAthletes because a coach signup picks its plan -- see server/plan-at-signup.itest.ts.
    const body = { ...signupBody(), role: "coach", expectedAthletes: 25 };
    const client = new TestClient(server.baseUrl);
    await client.post("/api/auth/signup", body);
    const ack = await client.post("/api/account/assumption-of-risk", {});
    expect(ack.status).toBe(400);
  });
});
