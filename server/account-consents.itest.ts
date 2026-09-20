import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { coachAthletes, guardianLinks, users } from "@shared/schema";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, TestClient, type TestServer } from "./test-support/http-app";
import { storage } from "./storage";

/** "WHAT YOU'VE AGREED TO" -- the consent ledger read back to the person it is about.
 *
 * Through the real routes: the athlete's own list, the guardian's view of a child, the coach's
 * view of a rostered athlete. The rules under test live in storage.listConsentsForUser and are
 * exactly the ones a screen would get wrong on its own: who answered is a role word, the coach
 * never sees it, a withdrawal shows as withdrawn rather than vanishing, and "stale" is the same
 * answer the terms gate gives -- so when the live terms change, the row flips.
 */

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});

const isoYearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
};

const TERMS_V1 = "Forge Terms of Use, version one. You agree to train.";
const TERMS_V2 = "Forge Terms of Use, version two. You agree to train and to stretch.";

describe("GET /api/account/consents", () => {
  beforeEach(async () => {
    await resetDatabase();
    await storage.updateLegalAgreement(TERMS_V1);
  });

  it("shows the terms accepted at signup, given by you, current, with links", async () => {
    const email = `signup-${Date.now()}@example.test`;
    const signup = await new TestClient(server.baseUrl).post("/api/auth/signup", {
      email,
      password: "correct-horse-battery-staple-9",
      name: "Signed Up",
      role: "athlete",
      dateOfBirth: isoYearsAgo(21),
      sport: "Track",
      position: "Sprint",
      heightIn: 70,
      bodyWeightLbs: 170,
      agreedToTerms: true,
    });
    expect(signup.status).toBe(201);
    const [row] = await db.select().from(users).where(eq(users.email, email));
    expect(row).toBeTruthy();
    // The signup itself is not under test here; the account is made loginable directly.
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, row.id));

    const client = await loginAs(server.baseUrl, row);
    const res = await client.get("/api/account/consents");
    expect(res.status).toBe(200);
    const terms = res.body.find((r: any) => r.type === "terms_of_service");
    expect(terms).toMatchObject({
      label: "Terms of Use",
      page: "/terms",
      pdfUrl: "/api/legal-documents/terms_of_service.pdf",
      state: "agreed",
      stale: false,
      givenBy: "you",
    });
    expect(typeof terms.createdAt).toBe("string");
    expect(terms.documentVersion).toHaveLength(12);
  });

  it("flips the terms row to stale when the live terms change, and back when re-accepted", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", dateOfBirth: isoYearsAgo(25) });
    await storage.acceptCurrentTerms({ userId: athlete.id });
    const client = await loginAs(server.baseUrl, athlete);

    const before = await client.get("/api/account/consents");
    expect(before.body.find((r: any) => r.type === "terms_of_service").stale).toBe(false);

    await storage.updateLegalAgreement(TERMS_V2);
    const after = await client.get("/api/account/consents");
    expect(after.body.find((r: any) => r.type === "terms_of_service").stale).toBe(true);

    await storage.acceptCurrentTerms({ userId: athlete.id });
    const again = await client.get("/api/account/consents");
    const row = again.body.find((r: any) => r.type === "terms_of_service");
    expect(row.stale).toBe(false);
    // One row per type: the latest acceptance, not both.
    expect(again.body.filter((r: any) => r.type === "terms_of_service")).toHaveLength(1);
  });

  it("keeps a withdrawn research consent on the list as withdrawn", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", dateOfBirth: isoYearsAgo(25) });
    await storage.setResearchDataConsent({ athleteId: athlete.id, granted: true, grantedByUserId: athlete.id });
    await storage.setResearchDataConsent({ athleteId: athlete.id, granted: false, grantedByUserId: athlete.id });
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.get("/api/account/consents");
    const research = res.body.find((r: any) => r.type === "research_data_use");
    expect(research).toMatchObject({
      label: "Research consent",
      page: "/research-consent",
      pdfUrl: null,
      state: "withdrawn",
      stale: false,
      givenBy: "you",
    });
  });
});

describe("the guardian's and the coach's views", () => {
  beforeEach(async () => {
    await resetDatabase();
    await storage.updateLegalAgreement(TERMS_V1);
  });

  async function family() {
    const minor = await makeLoginableUser({ role: "athlete", name: "Kid", dateOfBirth: isoYearsAgo(15) });
    const guardian = await makeLoginableUser({ role: "guardian", name: "Parent" });
    await db.insert(guardianLinks).values({ athleteId: minor.id, guardianId: guardian.id });
    const accepted = await storage.acceptTermsAsGuardian(guardian.id, { athleteId: minor.id });
    expect(accepted.ok).toBe(true);
    return { minor, guardian };
  }

  it("a guardian-given acceptance reads 'your guardian' on the child's list, and on the guardian route", async () => {
    const { minor, guardian } = await family();

    const kid = await loginAs(server.baseUrl, minor);
    const own = await kid.get("/api/account/consents");
    expect(own.status).toBe(200);
    expect(own.body.find((r: any) => r.type === "terms_of_service").givenBy).toBe("your guardian");
    // Never the guardian's name.
    expect(JSON.stringify(own.body)).not.toContain("Parent");

    const parent = await loginAs(server.baseUrl, guardian);
    const viaGuardian = await parent.get(`/api/guardian/athletes/${minor.id}/consents`);
    expect(viaGuardian.status).toBe(200);
    expect(viaGuardian.body.find((r: any) => r.type === "terms_of_service")).toMatchObject({
      givenBy: "your guardian",
      stale: false,
      state: "agreed",
    });

    // A guardian cannot read a child they are not linked to.
    const other = await makeLoginableUser({ role: "athlete", dateOfBirth: isoYearsAgo(14) });
    const notLinked = await parent.get(`/api/guardian/athletes/${other.id}/consents`);
    expect(notLinked.status).toBe(404);
  });

  it("a coach sees type, date and stale for a roster athlete only, and never who answered", async () => {
    const { minor } = await family();
    const coach = await makeLoginableUser({ role: "coach" });
    const otherCoach = await makeLoginableUser({ role: "coach" });
    await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: minor.id });

    const mine = await loginAs(server.baseUrl, coach);
    const res = await mine.get(`/api/coach/roster/${minor.id}/consents`);
    expect(res.status).toBe(200);
    const terms = res.body.find((r: any) => r.type === "terms_of_service");
    expect(terms).toMatchObject({ type: "terms_of_service", state: "agreed", stale: false });
    expect(terms).not.toHaveProperty("givenBy");

    await storage.updateLegalAgreement(TERMS_V2);
    const stale = await mine.get(`/api/coach/roster/${minor.id}/consents`);
    expect(stale.body.find((r: any) => r.type === "terms_of_service").stale).toBe(true);

    const theirs = await loginAs(server.baseUrl, otherCoach);
    const refused = await theirs.get(`/api/coach/roster/${minor.id}/consents`);
    expect(refused.status).toBe(404);
  });
});
