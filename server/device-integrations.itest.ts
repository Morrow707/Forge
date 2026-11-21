/* eslint-disable ts-patterns/no-magic-numbers -- test fixtures are literal vendor payloads */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  coachAthletes,
  coachStaff,
  consentRecords,
  deviceAthleteLinks,
  deviceConnections,
  deviceReadings,
  teamMembers,
  teams,
  users,
  workoutLogEntries,
  workoutLogs,
  workoutSetEntries,
} from "@shared/schema";
import { db } from "./db";
import { makeAssignedProgram, makeExercise, resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestClient, type TestServer } from "./test-support/http-app";
import { setDeviceFetchForTests, syncConnection } from "./device-integrations";
import { isEncryptedField } from "./field-encryption";
import type { FetchLike } from "./device-adapters";

/* DEVICE INTEGRATIONS ON REAL POSTGRES (2026-11-21), through the real routes and the real
 * GymAware and Hawkin adapters, with a fake vendor behind the injected fetch:
 *   - the head coach connects GymAware; the key is stored encrypted; a sync stores readings for
 *     athletes matched by name, lists the one it cannot match, and a second sync stores nothing new;
 *   - linking the unmatched athlete pulls their readings on the next sync;
 *   - an athlete who turned tracking off, or has no biometric consent, gets nothing stored, and
 *     the coach is told which;
 *   - a CSV upload previews, imports, shows the rows it could not match, and a re-upload adds nothing;
 *   - an assistant cannot connect; a narrowed assistant cannot read an athlete outside their team,
 *     and a coach from another program cannot read at all;
 *   - the admin pairing export pairs a camera set with the GymAware set that measured it. */

const HTTP = { ok: 200, created: 201, badRequest: 400, forbidden: 403, notFound: 404 } as const;
const GA = "https://cloud.gymaware.com";
const NOW_S = Math.floor(Date.now() / 1000);

let server: TestServer;
let primary: Awaited<ReturnType<typeof makeLoginableUser>>;
let staff: Awaited<ReturnType<typeof makeLoginableUser>>;
let outsider: Awaited<ReturnType<typeof makeLoginableUser>>;
let admin: Awaited<ReturnType<typeof makeLoginableUser>>;
let jordan: Awaited<ReturnType<typeof makeLoginableUser>>;
let sam: Awaited<ReturnType<typeof makeLoginableUser>>;
let optedOut: Awaited<ReturnType<typeof makeLoginableUser>>;
let noConsent: Awaited<ReturnType<typeof makeLoginableUser>>;
let primaryClient: TestClient;
let staffClient: TestClient;
let outsiderClient: TestClient;
let adminClient: TestClient;

/** What the fake GymAware account holds. "g-sam" is listed under a name no Forge athlete has. */
let gaSets: Record<string, unknown>[] = [];
const gaAthletes = [
  { athleteReference: "g-jordan", firstName: "Jordan", lastName: "Reyes" },
  { athleteReference: "g-sam", displayName: "Sammy L" },
  { athleteReference: "g-opt", firstName: "Opted", lastName: "Out" },
  { athleteReference: "g-none", firstName: "No", lastName: "Consent" },
];

const gymawareSet = (reference: string, athleteReference: string, recordedS: number, meanVelocities: number[]) => ({
  reference,
  recorded: recordedS,
  modified: recordedS,
  athleteReference,
  exerciseName: "Back Squat",
  barWeight: 100,
  repCount: meanVelocities.length,
  reps: meanVelocities.map((v, i) => ({ REPNUM: i + 1, meanVelocity: v, peakVelocity: v + 0.4 })),
});

const fakeVendor: FetchLike = async (url, init) => {
  const lines = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join("\n");
  const auth = init?.headers?.Authorization ?? "";
  const good = auth === `Basic ${Buffer.from("ACC:good-token").toString("base64")}`;
  if (!good) return { ok: false, status: 401, text: async () => "" };
  if (url.startsWith(`${GA}/api/athletes`)) return { ok: true, status: 200, text: async () => lines(gaAthletes) };
  if (url.startsWith(`${GA}/api/reps`)) return { ok: true, status: 200, text: async () => lines(gaSets) };
  return { ok: false, status: 404, text: async () => "" };
};

async function giveBiometricConsent(userId: number) {
  await db.insert(consentRecords).values({
    userId,
    consentType: "biometric_waiver",
    documentText: "Video and Biometric Consent (test)",
    documentVersion: "test",
  });
}

beforeAll(async () => {
  await resetDatabase();
  setDeviceFetchForTests(fakeVendor);
  server = await startTestServer();
  primary = await makeLoginableUser({ role: "coach", name: "Head Coach" } as never);
  staff = await makeLoginableUser({ role: "coach", name: "Assistant" } as never);
  outsider = await makeLoginableUser({ role: "coach", name: "Other Program" } as never);
  admin = await makeLoginableUser({ role: "admin", name: "Admin" } as never);
  jordan = await makeLoginableUser({ role: "athlete", name: "Jordan Reyes" } as never);
  sam = await makeLoginableUser({ role: "athlete", name: "Sam Lee" } as never);
  optedOut = await makeLoginableUser({ role: "athlete", name: "Opted Out" } as never);
  noConsent = await makeLoginableUser({ role: "athlete", name: "No Consent" } as never);
  await db.insert(coachStaff).values({ primaryCoachId: primary.id, staffCoachId: staff.id });
  await db.insert(coachAthletes).values([jordan, sam, optedOut, noConsent].map((a) => ({ coachId: primary.id, athleteId: a.id })));
  await Promise.all([jordan, sam, optedOut].map((a) => giveBiometricConsent(a.id)));
  await db.update(users).set({ trackingOptOut: true }).where(eq(users.id, optedOut.id));
  await db.update(users).set({ trackingOptOut: false }).where(eq(users.id, noConsent.id));
  // The assistant is assigned to a team holding Sam only, so Jordan is outside their scope.
  const [team] = await db.insert(teams).values({ coachId: primary.id, name: "Sprinters", code: "DEVT01" }).returning();
  await db.insert(teamMembers).values({ teamId: team.id, athleteId: sam.id });
  [primaryClient, staffClient, outsiderClient, adminClient] = await Promise.all(
    [primary, staff, outsider, admin].map((u) => loginAs(server.baseUrl, u)),
  );
  const assign = await primaryClient.request("PUT", `/api/coach/teams/${team.id}/coaches`, { body: { coachIds: [staff.id] } });
  expect(assign.status).toBe(HTTP.ok);
});

afterAll(async () => {
  setDeviceFetchForTests(null);
  await server.close();
});

beforeEach(async () => {
  await db.delete(deviceReadings);
  await db.delete(deviceConnections);
  gaSets = [
    gymawareSet("set-j1", "g-jordan", NOW_S - 3600, [0.81, 0.79, 0.76]),
    gymawareSet("set-s1", "g-sam", NOW_S - 3500, [0.7, 0.68]),
    gymawareSet("set-o1", "g-opt", NOW_S - 3400, [0.6]),
    gymawareSet("set-n1", "g-none", NOW_S - 3300, [0.65]),
  ];
});

async function connectGymAware(client: TestClient = primaryClient) {
  return client.request("POST", "/api/coach/devices/connections", {
    body: { vendor: "gymaware", credentials: { accountId: "ACC", token: "good-token" } },
  });
}

const readingIds = async () => (await db.select({ id: deviceReadings.vendorReadingId }).from(deviceReadings)).map((r) => r.id).sort();

describe("device integrations", () => {
  it("connects GymAware with the key encrypted, stores matched athletes' sets, and lists the unmatched one", async () => {
    const res = await connectGymAware();
    expect(res.status).toBe(HTTP.created);
    expect(res.body.sync).toMatchObject({ status: "active", stored: 1, unmatchedReadings: 1 });
    const [conn] = await db.select().from(deviceConnections);
    expect(isEncryptedField(conn.credentials), "the token is stored encrypted").toBe(true);
    expect(conn.credentials).not.toContain("good-token");
    expect(await readingIds()).toEqual(["set-j1"]);

    const page = await primaryClient.request("GET", "/api/coach/devices");
    expect(page.status).toBe(HTTP.ok);
    expect(JSON.stringify(page.body)).not.toContain("good-token");
    expect(page.body.connections[0]).toMatchObject({ vendor: "gymaware", name: "GymAware", status: "active" });
    expect(page.body.unmatched.map((u: { vendorAthleteName: string }) => u.vendorAthleteName)).toEqual(["Sammy L"]);
  });

  it("a second sync of the same sets stores nothing new", async () => {
    await connectGymAware();
    const [conn] = await db.select().from(deviceConnections);
    await db.update(deviceConnections).set({ syncCursor: null }).where(eq(deviceConnections.id, conn.id));
    const again = await primaryClient.request("POST", `/api/coach/devices/connections/${conn.id}/sync`);
    expect(again.status).toBe(HTTP.ok);
    expect(again.body).toMatchObject({ stored: 0, alreadyHad: 1 });
    expect(await readingIds()).toEqual(["set-j1"]);
  });

  it("stores nothing for an athlete who turned tracking off or has no biometric consent, and says which", async () => {
    const res = await connectGymAware();
    const reasons = Object.fromEntries(
      res.body.sync.skippedForConsent.map((s: { athleteId: number; reason: string }) => [s.athleteId, s.reason]),
    );
    expect(reasons).toEqual({ [optedOut.id]: "tracking_off", [noConsent.id]: "no_biometric_consent" });
    expect(await readingIds()).not.toContain("set-o1");
    expect(await readingIds()).not.toContain("set-n1");
    const detail = await primaryClient.request("GET", `/api/coach/roster/${optedOut.id}/device-readings`);
    expect(detail.body.readings).toEqual([]);
    expect(detail.body.consentSentence).toContain("turned tracking off");
  });

  it("linking the unmatched athlete pulls their sets on the next sync", async () => {
    await connectGymAware();
    const page = await primaryClient.request("GET", "/api/coach/devices");
    const linkId = page.body.unmatched[0].linkId;
    const put = await primaryClient.request("PUT", `/api/coach/devices/links/${linkId}`, { body: { athleteId: sam.id } });
    expect(put.status).toBe(HTTP.ok);
    const [conn] = await db.select().from(deviceConnections);
    expect(conn.syncCursor, "a new link re-reads the lookback window").toBeNull();
    const sync = await syncConnection(conn.id);
    expect(sync.stored).toBe(1);
    expect(await readingIds()).toEqual(["set-j1", "set-s1"]);
    const [link] = await db.select().from(deviceAthleteLinks).where(eq(deviceAthleteLinks.id, linkId));
    expect(link.matchedBy).toBe("coach");
    await db.update(deviceAthleteLinks).set({ athleteId: null, matchedBy: null }).where(eq(deviceAthleteLinks.id, linkId));
  });

  it("shows the coach an athlete's readings with the device's numbers, derived on read", async () => {
    await connectGymAware();
    const res = await primaryClient.request("GET", `/api/coach/roster/${jordan.id}/device-readings`);
    expect(res.status).toBe(HTTP.ok);
    expect(res.body.consentSentence).toBeNull();
    expect(res.body.readings[0]).toMatchObject({ deviceName: "GymAware", exerciseName: "Back Squat", metricKind: "bar_velocity_set" });
    expect(res.body.readings[0].numbers.meanVelocityMps).toBeCloseTo((0.81 + 0.79 + 0.76) / 3, 6);
    expect(res.body.readings[0].numbers.loadKg).toBe(100);
  });

  it("a bad key is refused with the vendor's sentence and nothing is stored", async () => {
    const res = await primaryClient.request("POST", "/api/coach/devices/connections", {
      body: { vendor: "gymaware", credentials: { accountId: "ACC", token: "wrong" } },
    });
    expect(res.status).toBe(HTTP.badRequest);
    expect(res.body.message).toContain("refused the key");
    expect(await db.select().from(deviceConnections)).toHaveLength(0);
  });

  it("a vendor awaiting partner access is stored as such and never syncs", async () => {
    const res = await primaryClient.request("POST", "/api/coach/devices/connections", {
      body: { vendor: "vald", credentials: { clientId: "c", clientSecret: "s", organizationId: "o" } },
    });
    expect(res.status).toBe(HTTP.created);
    expect(res.body.sync).toMatchObject({ status: "awaiting_partner_access", stored: 0 });
    expect(res.body.sync.message).toContain("applied");
    expect(await db.select().from(deviceReadings)).toHaveLength(0);
  });

  it("only the head coach connects; an assistant is refused", async () => {
    expect((await connectGymAware(staffClient)).status).toBe(HTTP.forbidden);
    expect(await db.select().from(deviceConnections)).toHaveLength(0);
  });

  it("an assistant narrowed to a team cannot read an athlete outside it, and another program cannot read at all", async () => {
    await connectGymAware();
    expect((await staffClient.request("GET", `/api/coach/roster/${jordan.id}/device-readings`)).status).toBe(HTTP.notFound);
    expect((await staffClient.request("GET", `/api/coach/roster/${sam.id}/device-readings`)).status).toBe(HTTP.ok);
    expect((await outsiderClient.request("GET", `/api/coach/roster/${jordan.id}/device-readings`)).status).toBe(HTTP.notFound);
    const staffPage = await staffClient.request("GET", "/api/coach/devices");
    expect(staffPage.body.canManage).toBe(false);
    expect(staffPage.body.linked.map((l: { athleteId: number }) => l.athleteId)).not.toContain(jordan.id);
    const outsiderPage = await outsiderClient.request("GET", "/api/coach/devices");
    expect(outsiderPage.body.connections).toEqual([]);
  });

  it("imports a CSV, shows the rows it could not match, and a second upload adds nothing", async () => {
    const csv = [
      "Athlete,Date,Exercise,Load (lb),Mean Velocity,Peak Velocity",
      `Jordan Reyes,${new Date().toISOString()},Bench Press,185,0.55,0.9`,
      `Somebody Else,${new Date().toISOString()},Bench Press,135,0.6,1.0`,
      `Opted Out,${new Date().toISOString()},Bench Press,135,0.6,1.0`,
    ].join("\n");
    const preview = await primaryClient.request("POST", "/api/coach/devices/csv/preview", { body: { csv, deviceName: "OVR Velocity" } });
    expect(preview.status).toBe(HTTP.ok);
    expect(preview.body.totals).toMatchObject({ rows: 3, ready: 1, unmatched: 1, consent: 1 });
    expect(preview.body.unmatchedRows.map((r: { athleteName: string }) => r.athleteName)).toEqual(["Somebody Else"]);
    const body = { csv, deviceName: "OVR Velocity", mapping: preview.body.mapping };
    const imported = await primaryClient.request("POST", "/api/coach/devices/csv/import", { body });
    expect(imported.body.imported).toBe(1);
    expect(imported.body.notImported.map((r: { athleteName: string }) => r.athleteName).sort()).toEqual(["Opted Out", "Somebody Else"]);
    const again = await primaryClient.request("POST", "/api/coach/devices/csv/import", { body });
    expect(again.body).toMatchObject({ imported: 0, alreadyHad: 1 });
    const readings = await primaryClient.request("GET", `/api/coach/roster/${jordan.id}/device-readings`);
    expect(readings.body.readings[0]).toMatchObject({ deviceName: "OVR Velocity", vendor: "csv" });
    expect(readings.body.readings[0].numbers.meanVelocityMps).toBe(0.55);
  });

  it("a CSV row the coach assigns by hand imports for that athlete", async () => {
    const csv = ["Athlete,Date,Mean Velocity", `S. Lee,${new Date().toISOString()},0.7`].join("\n");
    const preview = await primaryClient.request("POST", "/api/coach/devices/csv/preview", { body: { csv } });
    const imported = await primaryClient.request("POST", "/api/coach/devices/csv/import", {
      body: { csv, mapping: preview.body.mapping, athleteForRow: { "2": sam.id } },
    });
    expect(imported.body.imported).toBe(1);
    const [row] = await db.select().from(deviceReadings);
    expect(row.athleteId).toBe(sam.id);
  });

  it("the admin export pairs a camera set with the GymAware set that measured it, and lists connection health", async () => {
    await connectGymAware();
    const exercise = await makeExercise(primary.id, { name: "Back Squat" });
    const { assignment, day, programExercises } = await makeAssignedProgram({ coachId: primary.id, athleteId: jordan.id, exerciseIds: [exercise.id] });
    const [log] = await db
      .insert(workoutLogs)
      .values({ assignmentId: assignment.id, programDayId: day.id, athleteId: jordan.id, date: new Date().toISOString().slice(0, 10) })
      .returning();
    const [entry] = await db.insert(workoutLogEntries).values({ workoutLogId: log.id, programExerciseId: programExercises[0].id, exerciseId: exercise.id }).returning();
    await db.insert(workoutSetEntries).values({
      logEntryId: entry.id,
      setNumber: 1,
      reps: "3",
      weight: "225",
      meanVelocityMps: 0.8,
      peakVelocityMps: 1.2,
      romCm: 70,
      videoUploadedAt: new Date((NOW_S - 3590) * 1000),
      repBreakdown: [
        { repNumber: 1, meanVelocityMps: 0.84, peakVelocityMps: 1.25, romCm: 70 },
        { repNumber: 2, meanVelocityMps: 0.79, peakVelocityMps: 1.19, romCm: 70 },
        { repNumber: 3, meanVelocityMps: 0.76, peakVelocityMps: 1.14, romCm: 70 },
      ],
    });
    expect((await primaryClient.request("GET", "/api/admin/device-calibration/pairs")).status).toBe(HTTP.forbidden);
    const res = await adminClient.request("GET", "/api/admin/device-calibration/pairs");
    expect(res.status).toBe(HTTP.ok);
    expect(res.body.pairs).toHaveLength(1);
    const pair = res.body.pairs[0];
    expect(pair).toMatchObject({ athlete: "Athlete 1", deviceName: "GymAware", exerciseNamesAgree: true, cameraRepCount: 3, sensorRepCount: 3 });
    expect(pair.athleteId, "no id that resolves to a person").toBeUndefined();
    expect(pair.reps[0].meanVelocity.errorPct).toBeCloseTo((0.84 / 0.81 - 1) * 100, 6);
    const health = await adminClient.request("GET", "/api/admin/device-connections");
    expect(health.body.connections[0]).toMatchObject({ vendor: "gymaware", status: "active", readings: 1, unmatched: 1 });
    expect(JSON.stringify(health.body)).not.toContain("credentials");
  });

  it("a vendor failure is recorded on the connection and never thrown out of the sync", async () => {
    await connectGymAware();
    const [conn] = await db.select().from(deviceConnections);
    setDeviceFetchForTests(async () => ({ ok: false, status: 503, text: async () => "" }));
    try {
      const out = await syncConnection(conn.id);
      expect(out.status).toBe("error");
      const [after] = await db.select().from(deviceConnections).where(eq(deviceConnections.id, conn.id));
      expect(after.status).toBe("error");
      expect(after.lastError).toContain("503");
    } finally {
      setDeviceFetchForTests(fakeVendor);
    }
  });
});
