import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { consentRecords, legalDocuments, users } from "@shared/schema";
import { storage } from "./storage";
import {
  makeAssignedProgram,
  makeAthlete,
  makeCoach,
  makeExercise,
  resetDatabase,
} from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

// CONSENT BEFORE COLLECTION, FOR THE ATHLETES WHO WERE ALREADY HERE.
//
// Wiring the biometric release into signup covers new accounts and nobody else. Every athlete who
// joined before it has nothing on file and cannot be asked at a signup they already passed, and
// biometric-privacy statutes care about the collection, not about when the form was written.
//
// So the gate is at the point of storage. captureField is the single place skeleton frames and
// the bar/arm path traces -- the actual skeletal coordinates -- pass through on the way into the
// database, and it refuses them for an athlete with no release on file.
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

describe("the capture-time biometric gate", () => {
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
      .values({ docType: "biometric_waiver", content: "VIDEO AND BIOMETRIC CONSENT v1" });
  });

  async function setup(ageYears = 25) {
    const coach = await makeCoach();
    const athlete = await makeAthlete({ dateOfBirth: isoYearsAgo(ageYears) });
    const squat = await makeExercise(coach.id, { name: "Back Squat" });
    const assigned = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [squat.id],
    });
    return { athlete, assigned, pe: assigned.programExercises[0] };
  }

  const payload = (ctx: Awaited<ReturnType<typeof setup>>, trace: unknown) => ({
    assignmentId: ctx.assigned.assignment.id,
    programDayId: ctx.assigned.day.id,
    date: "2026-09-21",
    completed: true,
    entries: [
      {
        programExerciseId: ctx.pe.id,
        weightMode: "numeric" as const,
        sets: [{ setNumber: 1, reps: "5", weight: "135", barPathTrace: trace }],
      },
    ],
  });

  const storedTrace = async (athleteId: number) => {
    const rows = await db.query.workoutSetEntries.findMany();
    return rows[0]?.barPathTrace ?? null;
  };

  it("refuses to store a trace for an athlete with no release on file", async () => {
    const ctx = await setup();
    await storage.submitWorkoutLog(ctx.athlete.id, payload(ctx, TRACE) as never);
    expect(await storedTrace(ctx.athlete.id)).toBeNull();
  });

  // The set itself still saves. Withholding consent costs the biometric data, not the training.
  it("still saves the set, the reps and the weight", async () => {
    const ctx = await setup();
    await storage.submitWorkoutLog(ctx.athlete.id, payload(ctx, TRACE) as never);
    const rows = await db.query.workoutSetEntries.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].reps).toBe("5");
    expect(rows[0].weight).toBe("135");
  });

  it("stores the trace once the athlete agrees", async () => {
    const ctx = await setup();
    expect((await storage.recordBiometricRelease(ctx.athlete.id)).ok).toBe(true);
    await storage.submitWorkoutLog(ctx.athlete.id, payload(ctx, TRACE) as never);
    expect(await storedTrace(ctx.athlete.id)).not.toBeNull();
  });

  // THE DESTRUCTIVE FAILURE THIS GATE MUST NOT HAVE, and the exact state every existing athlete
  // is in: capture data already stored, no release on file. If the gate nulled instead of
  // carrying forward, the first time one of them edited a weight on an old day their whole
  // capture history would go with it -- data destroyed as a side effect of an unrelated save,
  // which is not what withholding consent should do. It stops new collection; it deletes nothing.
  it("never wipes capture data already stored for an athlete with no release", async () => {
    const ctx = await setup();
    await storage.recordBiometricRelease(ctx.athlete.id);
    await storage.submitWorkoutLog(ctx.athlete.id, payload(ctx, TRACE) as never);
    expect(await storedTrace(ctx.athlete.id)).not.toBeNull();

    // Now the athlete looks like a pre-existing one: real capture data, nothing on file.
    await db.delete(consentRecords).where(eq(consentRecords.userId, ctx.athlete.id));
    expect(await storage.hasBiometricConsent(ctx.athlete.id)).toBe(false);

    // A debounced weight edit, which omits the trace entirely.
    const edit = payload(ctx, undefined);
    delete (edit.entries[0].sets[0] as Record<string, unknown>).barPathTrace;
    (edit.entries[0].sets[0] as Record<string, unknown>).weight = "145";
    await storage.submitWorkoutLog(ctx.athlete.id, edit as never);

    expect(await storedTrace(ctx.athlete.id)).not.toBeNull();
    const rows = await db.query.workoutSetEntries.findMany();
    expect(rows[0].weight).toBe("145");
  });

  // And a NEW capture from that same athlete is still refused -- carrying the old value forward
  // must not become a way to smuggle a fresh one in beside it.
  it("still refuses a new capture from an athlete whose old data it kept", async () => {
    const ctx = await setup();
    await storage.recordBiometricRelease(ctx.athlete.id);
    await storage.submitWorkoutLog(ctx.athlete.id, payload(ctx, TRACE) as never);
    await db.delete(consentRecords).where(eq(consentRecords.userId, ctx.athlete.id));

    const fresh = [
      { t: 0, x: 5, y: 5 },
      { t: 33, x: 5, y: -95 },
      { t: 66, x: 5, y: 5 },
    ];
    await storage.submitWorkoutLog(ctx.athlete.id, payload(ctx, fresh) as never);
    // The stored trace is still the original, not the one just sent.
    expect(JSON.stringify(await storedTrace(ctx.athlete.id))).toBe(JSON.stringify(TRACE));
  });

  it("will not let a minor give this for themselves", async () => {
    const ctx = await setup(15);
    const result = await storage.recordBiometricRelease(ctx.athlete.id);
    expect(result.ok).toBe(false);
  });

  it("clears the tracking opt-out that declining set", async () => {
    const ctx = await setup();
    await db.update(users).set({ trackingOptOut: true }).where(eq(users.id, ctx.athlete.id));
    await storage.recordBiometricRelease(ctx.athlete.id);
    const row = await db.query.users.findFirst({ where: eq(users.id, ctx.athlete.id) });
    expect(row?.trackingOptOut).toBe(false);
  });

  it("tells an adult client to ask, and stops once they have agreed", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", dateOfBirth: isoYearsAgo(30) });
    const client = await loginAs(server.baseUrl, athlete);
    expect((await client.get("/api/auth/me")).body?.biometricReleaseRequired).toBe(true);

    const granted = await client.post("/api/account/biometric-release", {});
    expect(granted.status).toBe(200);
    expect((await client.get("/api/auth/me")).body?.biometricReleaseRequired).toBe(false);
  });
});
