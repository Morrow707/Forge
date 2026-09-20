import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { consentRecords, guardianLinks, legalDocuments, users } from "@shared/schema";
import { GUARDIAN_GIVES_BIOMETRIC_CONSENT } from "@shared/consent-catalog";
import { storage } from "./storage";
import {
  makeAssignedProgram,
  makeCoach,
  makeExercise,
  resetDatabase,
} from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

// THE GUARDIAN GIVES THE VIDEO AND BIOMETRIC CONSENT AFTER THE CLAIM.
//
// logGuardianConsents wrote this consent at claim time and nothing else ever did. A minor whose
// claim predates the consent, whose guardian declined then, or whose consent text has changed
// since, met the capture gate with a refusal naming the guardian -- and the guardian had no
// surface to answer it. This is that surface, tested end to end: the route, the record, the gate
// it opens, the row the child sees, and the withdrawal that closes it again.
const isoYearsAgo = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
};

const TRACE = [
  { t: 0, x: 0, y: 0 },
  { t: 33, x: 0, y: -20 },
  { t: 66, x: 0, y: 0 },
];

const RELEASE_V1 = "VIDEO AND BIOMETRIC CONSENT v1";

describe("a guardian giving the biometric consent from the dashboard", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    await db.insert(legalDocuments).values({ docType: "biometric_waiver", content: RELEASE_V1 });
  });

  async function family(ageYears = 15) {
    const coach = await makeCoach();
    const athlete = await makeLoginableUser({
      role: "athlete",
      name: "Riley Minor",
      dateOfBirth: isoYearsAgo(ageYears),
    });
    const guardian = await makeLoginableUser({ role: "guardian", name: "Pat Guardian" });
    await db.insert(guardianLinks).values({ athleteId: athlete.id, guardianId: guardian.id });
    const squat = await makeExercise(coach.id, { name: "Back Squat" });
    const assigned = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [squat.id],
    });
    return { athlete, guardian, assigned, pe: assigned.programExercises[0] };
  }

  const payload = (ctx: Awaited<ReturnType<typeof family>>) => ({
    assignmentId: ctx.assigned.assignment.id,
    programDayId: ctx.assigned.day.id,
    date: "2026-09-21",
    completed: true,
    entries: [
      {
        programExerciseId: ctx.pe.id,
        weightMode: "numeric" as const,
        sets: [{ setNumber: 1, reps: "5", weight: "135", barPathTrace: TRACE }],
      },
    ],
  });

  const storedTrace = async () => {
    const rows = await db.query.workoutSetEntries.findMany();
    return rows[0]?.barPathTrace ?? null;
  };

  it("opens the minor's capture gate, and the child sees who gave it", async () => {
    const ctx = await family();
    const guardian = await loginAs(server.baseUrl, ctx.guardian);

    // Before: nothing on file, the gate drops the trace, the child is told who can fix it.
    const before = await guardian.get(`/api/guardian/athletes/${ctx.athlete.id}/biometric-consent`);
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ given: false, stale: false, guardianDecides: true });
    await storage.submitWorkoutLog(ctx.athlete.id, payload(ctx) as never);
    expect(await storedTrace()).toBeNull();

    const athlete = await loginAs(server.baseUrl, ctx.athlete);
    const me = await athlete.get("/api/auth/me");
    expect(me.body.biometricReleaseRequired).toBe(false);
    expect(me.body.biometricReleaseAwaitingGuardian).toBe(true);
    const selfServe = await athlete.post("/api/account/biometric-release", {});
    expect(selfServe.status).toBe(400);
    expect(selfServe.body.message).toBe(GUARDIAN_GIVES_BIOMETRIC_CONSENT);
    expect(selfServe.body.message).toMatch(/guardian dashboard/i);

    // The guardian gives it.
    const given = await guardian.post(`/api/guardian/athletes/${ctx.athlete.id}/biometric-consent`, {
      agreed: true,
    });
    expect(given.status).toBe(200);
    expect(new Date(given.body.givenAt).getTime()).toBeGreaterThan(0);

    const after = await guardian.get(`/api/guardian/athletes/${ctx.athlete.id}/biometric-consent`);
    expect(after.body).toMatchObject({ given: true, givenByGuardian: true, stale: false });

    // The gate is open: a fresh save stores the trace.
    await storage.submitWorkoutLog(ctx.athlete.id, payload(ctx) as never);
    expect(await storedTrace()).not.toBeNull();
    expect((await athlete.get("/api/auth/me")).body.biometricReleaseAwaitingGuardian).toBe(false);

    // The child's own "What you've agreed to" names the guardian, and the record carries the text.
    const consents = await athlete.get("/api/account/consents");
    const row = consents.body.find((r: any) => r.type === "biometric_waiver");
    expect(row).toMatchObject({ state: "agreed", stale: false, givenBy: "your guardian" });
    const records = await db.query.consentRecords.findMany({
      where: eq(consentRecords.userId, ctx.athlete.id),
    });
    expect(records.map((r) => r.documentText)).toContain(RELEASE_V1);
    expect(records.find((r) => r.consentType === "biometric_waiver")?.givenByUserId).toBe(
      ctx.guardian.id,
    );
  });

  it("records nothing for a request that does not say agreed", async () => {
    const ctx = await family();
    const guardian = await loginAs(server.baseUrl, ctx.guardian);
    for (const body of [{}, { agreed: false }, { agreed: "yes" }]) {
      const res = await guardian.post(
        `/api/guardian/athletes/${ctx.athlete.id}/biometric-consent`,
        body,
      );
      expect(res.status).toBe(400);
    }
    expect(await storage.hasBiometricConsent(ctx.athlete.id)).toBe(false);
  });

  it("reads as not found for a guardian who is not linked to that athlete", async () => {
    const ctx = await family();
    const other = await family();
    const stranger = await loginAs(server.baseUrl, other.guardian);
    const read = await stranger.get(`/api/guardian/athletes/${ctx.athlete.id}/biometric-consent`);
    expect(read.status).toBe(404);
    const write = await stranger.post(
      `/api/guardian/athletes/${ctx.athlete.id}/biometric-consent`,
      { agreed: true },
    );
    expect(write.status).toBe(404);
    expect(await storage.hasBiometricConsent(ctx.athlete.id)).toBe(false);
  });

  it("refuses to answer for an adult, who answers for themselves", async () => {
    // A link to an adult cannot be claimed, but a linked athlete turns 18. The consent is theirs.
    const ctx = await family(17);
    await db.update(users).set({ dateOfBirth: isoYearsAgo(19) }).where(eq(users.id, ctx.athlete.id));
    const guardian = await loginAs(server.baseUrl, ctx.guardian);
    const status = await guardian.get(`/api/guardian/athletes/${ctx.athlete.id}/biometric-consent`);
    expect(status.body.guardianDecides).toBe(false);
    const res = await guardian.post(`/api/guardian/athletes/${ctx.athlete.id}/biometric-consent`, {
      agreed: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/adult/i);
  });

  it("goes stale when the text changes, and re-accepting clears it", async () => {
    const ctx = await family();
    const guardian = await loginAs(server.baseUrl, ctx.guardian);
    expect(
      (
        await guardian.post(`/api/guardian/athletes/${ctx.athlete.id}/biometric-consent`, {
          agreed: true,
        })
      ).status,
    ).toBe(200);

    await storage.updateLegalDocument("biometric_waiver", "VIDEO AND BIOMETRIC CONSENT v2");
    const stale = await guardian.get(`/api/guardian/athletes/${ctx.athlete.id}/biometric-consent`);
    expect(stale.body).toMatchObject({ given: true, stale: true });
    // Stale does not close the gate -- a consent under older wording stands until withdrawn --
    // but the child's row says it needs answering again, from the same function.
    expect(await storage.hasBiometricConsent(ctx.athlete.id)).toBe(true);
    const rows = await storage.listConsentsForUser(ctx.athlete.id, { includeGivenBy: true });
    expect(rows.find((r) => r.type === "biometric_waiver")).toMatchObject({ stale: true });

    expect(
      (
        await guardian.post(`/api/guardian/athletes/${ctx.athlete.id}/biometric-consent`, {
          agreed: true,
        })
      ).status,
    ).toBe(200);
    const fresh = await guardian.get(`/api/guardian/athletes/${ctx.athlete.id}/biometric-consent`);
    expect(fresh.body).toMatchObject({ given: true, stale: false });
    const records = await db.query.consentRecords.findMany({
      where: eq(consentRecords.userId, ctx.athlete.id),
    });
    expect(records.map((r) => r.documentText)).toContain("VIDEO AND BIOMETRIC CONSENT v2");
  });

  it("is closed again by the guardian withdrawing consent", async () => {
    const ctx = await family();
    const guardian = await loginAs(server.baseUrl, ctx.guardian);
    expect(
      (
        await guardian.post(`/api/guardian/athletes/${ctx.athlete.id}/biometric-consent`, {
          agreed: true,
        })
      ).status,
    ).toBe(200);
    expect(await storage.hasBiometricConsent(ctx.athlete.id)).toBe(true);

    // The existing withdrawal is the only withdrawal: the reviewed consent text (section 7) says
    // a guardian withdraws from the dashboard and that doing so purges the videos and suspends
    // the account, so a lighter biometric-only withdrawal would describe software the document
    // does not. It quotes back every consent this guardian gave, this one included.
    const withdrawn = await guardian.post(
      `/api/guardian/athletes/${ctx.athlete.id}/withdraw-consent`,
      { confirmAthleteName: "Riley Minor" },
    );
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.consentRecordsWritten).toBeGreaterThanOrEqual(1);
    expect(await storage.hasBiometricConsent(ctx.athlete.id)).toBe(false);
    await storage.submitWorkoutLog(ctx.athlete.id, payload(ctx) as never);
    expect(await storedTrace()).toBeNull();
    const status = await storage.getBiometricConsentStatus(ctx.athlete.id);
    expect(status.given).toBe(false);
    expect(status.withdrawnAt).not.toBeNull();
  });
});

