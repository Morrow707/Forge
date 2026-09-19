import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, desc } from "drizzle-orm";
import { db, resetDatabase } from "./test-support/fixtures";
import {
  startTestServer,
  makeLoginableUser,
  loginAs,
  TestClient,
  type TestServer,
} from "./test-support/http-app";
import { storage } from "./storage";
import { consentRecords, guardianLinks, users } from "@shared/schema";
import { testOutbox } from "./email";
import { notifyGuardiansOfTermsChange } from "./terms-change-notice";

/**
 * RE-ACCEPTANCE AFTER THE TERMS CHANGE.
 *
 * Counsel, 2026-09-19: an updated agreement binds an existing user only if they were given actual
 * notice and an opportunity to accept or reject it. Before this, agreedToTermsText was written
 * once at signup and nothing ever asked again -- so every later edit to the clickwrap, including
 * counsel's own rewrite, bound nobody who already had an account.
 *
 * Run through the real HTTP stack because the interesting failures are not in any one function:
 * a status route that reports staleness the accept route then refuses, a minor who can accept for
 * themselves, a guardian who can accept for somebody else's child, an append to the document that
 * reads as a new set of terms and asks the whole platform to agree again.
 */

let server: TestServer;

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
});

afterAll(async () => {
  await server?.close();
});

beforeEach(() => {
  testOutbox.length = 0;
});

/** The text most recently published by publishNewTerms(). Each call writes a DIFFERENT document
 * -- publishing the same one twice is not a change of terms, and a test that did it would pass
 * for the wrong reason. */
let NEW_TERMS = "";
let revision = 0;
const HEALTHCARE_NOTICE =
  "A note for physical therapists, physicians, and other licensed clinicians:\n\nForge is built for athletic training.";

/** The state every existing account is in the moment the agreement is rewritten: their snapshot
 * is the old text and the live document is the new one. Same move the seed makes. */
async function publishNewTerms(text?: string): Promise<string> {
  NEW_TERMS = text ?? `FORGE -- TERMS OF USE\n\nRevision ${++revision}, as counsel revised them.`;
  await storage.updateLegalAgreement(NEW_TERMS);
  return NEW_TERMS;
}

async function signedUpUnderCurrentTerms(overrides: Record<string, unknown> = {}) {
  const live = await storage.getLegalAgreement();
  return makeLoginableUser({
    agreedToTermsText: live,
    agreedToTermsAt: new Date(),
    ...overrides,
  } as any);
}

describe("an account that is already on the current terms", () => {
  it("is not asked again", async () => {
    await publishNewTerms("FORGE -- TERMS OF USE\n\nThe version everybody signed up under.");
    const user = await signedUpUnderCurrentTerms();
    const status = await storage.getTermsAcceptanceStatus(user.id);
    expect(status.needsAcceptance).toBe(false);
    expect(status.version).toHaveLength(12);

    const client = await loginAs(server.baseUrl, user);
    const me = await client.get("/api/auth/me");
    expect(me.body.needsTermsAcceptance).toBe(false);
    // The snapshot never rides along on the public user, and adding a flag must not change that.
    expect(me.body.agreedToTermsText).toBeUndefined();
  });

  it("does not read an appended healthcare notice as a change of terms", async () => {
    // Production's actual shape: the seed appends the clinician notice to whatever is live, so
    // the stored document is never the agreement on its own. Counting that append as a new set
    // of terms would ask every account on the platform to agree again for no reason.
    const base = "FORGE -- TERMS OF USE\n\nThe version everybody signed up under, unchanged.";
    await publishNewTerms(base);
    const user = await signedUpUnderCurrentTerms();
    await publishNewTerms(`${base}\n\n${HEALTHCARE_NOTICE}`);
    expect((await storage.getTermsAcceptanceStatus(user.id)).needsAcceptance).toBe(false);
  });

  it("asks an account that never recorded agreeing to anything", async () => {
    // An admin-created account, or one older than the column. There is nothing on file saying
    // they agreed to any version, which is not the same as being on the current one.
    const user = await makeLoginableUser({ agreedToTermsText: null } as any);
    expect((await storage.getTermsAcceptanceStatus(user.id)).needsAcceptance).toBe(true);
  });
});

describe("an adult whose terms went stale", () => {
  it("is told, accepts, and is not asked again", async () => {
    const user = await signedUpUnderCurrentTerms({ role: "athlete", dateOfBirth: "1990-04-02" });
    await publishNewTerms();
    const client = await loginAs(server.baseUrl, user);

    const before = await client.get("/api/auth/terms-status");
    expect(before.status).toBe(200);
    expect(before.body.needsAcceptance).toBe(true);
    expect(before.body.guardianDecides).toBe(false);
    // The text rides along so the client can render what it is asking somebody to accept.
    expect(before.body.text).toBe(NEW_TERMS);
    expect((await client.get("/api/auth/me")).body.needsTermsAcceptance).toBe(true);

    const accepted = await client.post("/api/auth/accept-terms", { agreed: true });
    expect(accepted.status).toBe(200);
    expect(typeof accepted.body.acceptedAt).toBe("string");

    const after = await client.get("/api/auth/terms-status");
    expect(after.body.needsAcceptance).toBe(false);
    expect((await client.get("/api/auth/me")).body.needsTermsAcceptance).toBe(false);

    // The snapshot is the live text, not a version string: the document IS the version.
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.agreedToTermsText).toBe(NEW_TERMS);
    expect(row.agreedToTermsAt).toBeInstanceOf(Date);

    // And the consent record, which is the evidence that the notice was answered.
    const [record] = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.userId, user.id))
      .orderBy(desc(consentRecords.id));
    expect(record.consentType).toBe("terms_of_service");
    expect(record.documentText).toBe(NEW_TERMS);
    expect(record.givenByUserId).toBe(user.id);
  });

  it("refuses anything other than an explicit yes", async () => {
    const user = await signedUpUnderCurrentTerms();
    await publishNewTerms();
    const client = await loginAs(server.baseUrl, user);
    expect((await client.post("/api/auth/accept-terms", { agreed: false })).status).toBe(400);
    expect((await client.post("/api/auth/accept-terms", {})).status).toBe(400);
    expect((await storage.getTermsAcceptanceStatus(user.id)).needsAcceptance).toBe(true);
  });

  it("answers 401 to somebody who is not signed in", async () => {
    const anon = new TestClient(server.baseUrl);
    expect((await anon.get("/api/auth/terms-status")).status).toBe(401);
    expect((await anon.post("/api/auth/accept-terms", { agreed: true })).status).toBe(401);
  });
});

describe("a minor, and the guardian who answers for them", () => {
  async function minorWithGuardian() {
    const guardian = await makeLoginableUser({ role: "coach", name: "Pat Guardian" } as any);
    const athlete = await signedUpUnderCurrentTerms({
      role: "athlete",
      name: "Sam Minor",
      dateOfBirth: "2012-05-05",
    });
    await db.insert(guardianLinks).values({ guardianId: guardian.id, athleteId: athlete.id });
    return { guardian, athlete };
  }

  it("reports the minor as needing acceptance but cannot let them give it", async () => {
    const { athlete } = await minorWithGuardian();
    await publishNewTerms();
    const status = await storage.getTermsAcceptanceStatus(athlete.id);
    expect(status.needsAcceptance).toBe(true);
    expect(status.guardianDecides).toBe(true);

    const client = await loginAs(server.baseUrl, athlete);
    const refused = await client.post("/api/auth/accept-terms", { agreed: true });
    expect(refused.status).toBe(403);
    expect(refused.body.guardianDecides).toBe(true);
    // Refused, and nothing written: a 403 that still moved the snapshot would be worse than
    // either outcome on its own.
    const [row] = await db.select().from(users).where(eq(users.id, athlete.id));
    expect(row.agreedToTermsText).not.toBe(NEW_TERMS);
  });

  it("lists the minor to their guardian and accepts on their behalf", async () => {
    const { guardian, athlete } = await minorWithGuardian();
    await publishNewTerms();
    const client = await loginAs(server.baseUrl, guardian);

    const list = await client.get("/api/guardian/terms-reacceptance");
    expect(list.status).toBe(200);
    expect(list.body).toEqual([
      { athleteId: athlete.id, athleteName: "Sam Minor", version: expect.any(String) },
    ]);

    const accepted = await client.post("/api/guardian/terms-reacceptance", {
      athleteId: athlete.id,
      agreed: true,
    });
    expect(accepted.status).toBe(200);

    const [row] = await db.select().from(users).where(eq(users.id, athlete.id));
    expect(row.agreedToTermsText).toBe(NEW_TERMS);
    expect((await storage.getTermsAcceptanceStatus(athlete.id)).needsAcceptance).toBe(false);
    expect((await client.get("/api/guardian/terms-reacceptance")).body).toEqual([]);

    // The record has to read as an adult's decision about a child, not the child's own.
    const [record] = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.userId, athlete.id))
      .orderBy(desc(consentRecords.id));
    expect(record.givenByUserId).toBe(guardian.id);
    expect(record.documentText).toContain("Accepted by guardian Pat Guardian on behalf of");
    expect(record.documentText).toContain(NEW_TERMS);
  });

  it("refuses a guardian reaching for an athlete who is not theirs", async () => {
    const { athlete } = await minorWithGuardian();
    const stranger = await makeLoginableUser({ role: "coach" } as any);
    await db.insert(guardianLinks).values({ guardianId: stranger.id, athleteId: (await makeLoginableUser({ role: "athlete" } as any)).id });
    await publishNewTerms();
    const client = await loginAs(server.baseUrl, stranger);
    const res = await client.post("/api/guardian/terms-reacceptance", {
      athleteId: athlete.id,
      agreed: true,
    });
    expect(res.status).toBe(404);
    const [row] = await db.select().from(users).where(eq(users.id, athlete.id));
    expect(row.agreedToTermsText).not.toBe(NEW_TERMS);
  });

  it("does not lock the minor out while the guardian has not answered", async () => {
    // Scott's call, and the reason the server only ever REPORTS: locking a child out of their
    // training because a parent has not opened an email punishes the wrong person.
    const { athlete } = await minorWithGuardian();
    await publishNewTerms();
    const client = await loginAs(server.baseUrl, athlete);
    expect((await client.get("/api/auth/me")).status).toBe(200);
    expect((await client.get("/api/auth/me")).body.needsTermsAcceptance).toBe(true);
  });
});

describe("the notice that goes to a guardian", () => {
  it("emails once per guardian and not again on the next deploy", async () => {
    const guardian = await makeLoginableUser({ role: "coach", name: "Alex Parent" } as any);
    const first = await signedUpUnderCurrentTerms({ role: "athlete", name: "Minor One", dateOfBirth: "2013-01-01" });
    const second = await signedUpUnderCurrentTerms({ role: "athlete", name: "Minor Two", dateOfBirth: "2014-01-01" });
    await db.insert(guardianLinks).values([
      { guardianId: guardian.id, athleteId: first.id },
      { guardianId: guardian.id, athleteId: second.id },
    ]);
    await publishNewTerms();

    // Counts are not asserted globally: other tests in this file have left their own stale
    // minors behind, and what matters here is what reached THIS guardian.
    await notifyGuardiansOfTermsChange();
    const mail = testOutbox.filter((m) => m.to === guardian.email);
    // ONE email naming both athletes, not one per athlete.
    expect(mail).toHaveLength(1);
    expect(mail[0].html).toContain("Minor One");
    expect(mail[0].html).toContain("Minor Two");

    // The seed runs on every deploy; the mark is what stops it re-sending.
    testOutbox.length = 0;
    await notifyGuardiansOfTermsChange();
    expect(testOutbox.filter((m) => m.to === guardian.email)).toHaveLength(0);

    // Accepting clears the mark, so the NEXT change asks again rather than staying silent.
    await storage.acceptTermsAsGuardian(guardian.id, { athleteId: first.id });
    const [row] = await db.select().from(users).where(eq(users.id, first.id));
    expect(row.termsReacceptNotifiedAt).toBeNull();
  });

  it("sends nothing to the guardian of an athlete already on the current terms", async () => {
    const guardian = await makeLoginableUser({ role: "coach" } as any);
    const athlete = await signedUpUnderCurrentTerms({ role: "athlete", dateOfBirth: "2013-02-02" });
    await db.insert(guardianLinks).values({ guardianId: guardian.id, athleteId: athlete.id });
    await notifyGuardiansOfTermsChange();
    expect(testOutbox.filter((m) => m.to === guardian.email)).toHaveLength(0);
  });
});
