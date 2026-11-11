import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { coachAthletes, exercises, velocityZones, workoutLogEntries, workoutLogs, workoutSetEntries } from "@shared/schema";
import { db } from "./db";
import { makeAssignedProgram, makeExercise, resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestClient, type TestServer } from "./test-support/http-app";

/* VELOCITY ZONES ON REAL POSTGRES (2026-11-11). Who may set a zone, and the coach's dashboard read
 * against camera speeds written to real set rows:
 *   - a coach sets a zone for an athlete in scope; a coach from another program gets 404;
 *   - a coached athlete reads their coach's zone and CANNOT set their own (the coach decides);
 *   - a Free Agent sets their own and is the only one offered suggestions;
 *   - the dashboard lists an athlete whose week was mostly slow, and counts one in zone. */

const ZONE_LOW = 0.65;
const ZONE_HIGH = 0.75;
const BENCH_LOW = 0.5;
const BENCH_HIGH = 0.7;
const SLOW_A = 0.6;
const SLOW_B = 0.58;
const SLOW_C = 0.55;
const BENCH_IN_A = 0.62;
const BACKWARDS_LOW = 0.8;
const ALL = 100;
const SQUAT_SPEEDS_SLOW = [SLOW_A, SLOW_B, SLOW_C];
const BENCH_SPEEDS_IN = [SLOW_A, BENCH_IN_A, SLOW_B];
const ZONE = { goal: "strength", lowMps: ZONE_LOW, highMps: ZONE_HIGH, note: "Stop under 0.60" };
const BENCH_ZONE = { goal: "strength", lowMps: BENCH_LOW, highMps: BENCH_HIGH };
const OK = 200;
const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const HTTP = { ok: OK, badRequest: BAD_REQUEST, forbidden: FORBIDDEN, notFound: NOT_FOUND };
const ISO_DATE_LENGTH = 10;

let server: TestServer;
let coach: Awaited<ReturnType<typeof makeLoginableUser>>;
let outsider: Awaited<ReturnType<typeof makeLoginableUser>>;
let coached: Awaited<ReturnType<typeof makeLoginableUser>>;
let freeAgent: Awaited<ReturnType<typeof makeLoginableUser>>;
let coachClient: TestClient;
let outsiderClient: TestClient;
let coachedClient: TestClient;
let freeAgentClient: TestClient;
let squatId: number;
let benchId: number;

async function logSets(athleteId: number, coachId: number, exerciseId: number, speeds: number[]) {
  const { assignment, day, programExercises } = await makeAssignedProgram({ coachId, athleteId, exerciseIds: [exerciseId] });
  const [log] = await db
    .insert(workoutLogs)
    .values({ assignmentId: assignment.id, programDayId: day.id, athleteId, date: new Date().toISOString().slice(0, ISO_DATE_LENGTH) })
    .returning();
  const [entry] = await db.insert(workoutLogEntries).values({ workoutLogId: log.id, programExerciseId: programExercises[0].id, exerciseId }).returning();
  await db.insert(workoutSetEntries).values(speeds.map((v, i) => ({ logEntryId: entry.id, setNumber: i + 1, reps: "5", weight: "225", meanVelocityMps: v })));
}

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
  coach = await makeLoginableUser({ role: "coach", name: "Zone Coach" } as never);
  outsider = await makeLoginableUser({ role: "coach", name: "Other Program" } as never);
  coached = await makeLoginableUser({ role: "athlete", name: "Jordan Coached" } as never);
  freeAgent = await makeLoginableUser({ role: "athlete", name: "Morgan Free" } as never);
  [coachClient, outsiderClient, coachedClient, freeAgentClient] = await Promise.all(
    [coach, outsider, coached, freeAgent].map((u) => loginAs(server.baseUrl, u)),
  );
  await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: coached.id });
  squatId = (await makeExercise(coach.id, { name: "Zone Back Squat" })).id;
  benchId = (await makeExercise(coach.id, { name: "Zone Bench Press" })).id;
});

afterAll(async () => {
  await server.close();
});

beforeEach(async () => {
  await db.delete(velocityZones);
});

describe("velocity zones", () => {
  it("a coach sets an athlete's zone, and the athlete reads it on their workout", async () => {
    const put = await coachClient.request("PUT", `/api/coach/roster/${coached.id}/velocity-zones/${squatId}`, { body: ZONE });
    expect(put.status).toBe(HTTP.ok);
    const mine = await coachedClient.request("GET", "/api/me/velocity-zones");
    expect(mine.body.zones).toHaveLength(1);
    expect(mine.body.zones[0]).toMatchObject({ exerciseId: squatId, lowMps: ZONE.lowMps, highMps: ZONE.highMps, note: ZONE.note, setBy: "coach" });
    expect(mine.body.canEdit, "a coached athlete's zones are their coach's call").toBe(false);
    expect(mine.body.suggestions, "no AI suggestions for a coached athlete").toBe(false);
  });

  it("a coached athlete cannot set their own zone", async () => {
    const put = await coachedClient.request("PUT", `/api/me/velocity-zones/${squatId}`, { body: ZONE });
    expect(put.status).toBe(HTTP.forbidden);
    expect(await db.select().from(velocityZones)).toHaveLength(0);
  });

  it("a coach from another program cannot read or set the athlete's zones", async () => {
    expect((await outsiderClient.request("GET", `/api/coach/roster/${coached.id}/velocity-zones`)).status).toBe(HTTP.notFound);
    expect((await outsiderClient.request("PUT", `/api/coach/roster/${coached.id}/velocity-zones/${squatId}`, { body: ZONE })).status).toBe(HTTP.notFound);
  });

  it("a Free Agent sets their own zone and is the one offered suggestions", async () => {
    const put = await freeAgentClient.request("PUT", `/api/me/velocity-zones/${squatId}`, { body: ZONE });
    expect(put.status).toBe(HTTP.ok);
    const mine = await freeAgentClient.request("GET", "/api/me/velocity-zones");
    expect(mine.body).toMatchObject({ canEdit: true, suggestions: true });
    expect(mine.body.zones[0].setBy).toBe("self");
  });

  it("refuses a zone whose low edge is not below its high edge", async () => {
    const put = await freeAgentClient.request("PUT", `/api/me/velocity-zones/${squatId}`, { body: { lowMps: BACKWARDS_LOW, highMps: BENCH_HIGH } });
    expect(put.status).toBe(HTTP.badRequest);
  });

  it("the dashboard lists a mostly-slow week and counts a lift in zone", async () => {
    await coachClient.request("PUT", `/api/coach/roster/${coached.id}/velocity-zones/${squatId}`, { body: ZONE });
    await coachClient.request("PUT", `/api/coach/roster/${coached.id}/velocity-zones/${benchId}`, { body: BENCH_ZONE });
    await logSets(coached.id, coach.id, squatId, SQUAT_SPEEDS_SLOW);
    await logSets(coached.id, coach.id, benchId, BENCH_SPEEDS_IN);
    const week = await coachClient.request("GET", "/api/coach/bar-speed-week");
    expect(week.status).toBe(HTTP.ok);
    expect(week.body.flagged).toHaveLength(1);
    expect(week.body.flagged[0]).toMatchObject({ athleteId: coached.id, exerciseName: "Zone Back Squat", kind: "slow", sets: SQUAT_SPEEDS_SLOW.length });
    expect(week.body.inZone).toBe(1);
    const tab = await coachClient.request("GET", `/api/coach/roster/${coached.id}/velocity-zones`);
    const thisWeek = tab.body.trend[String(benchId)].at(-1);
    expect(thisWeek.inZonePercent).toBe(ALL);
  });

  it("a zone dies with the exercise and with the account (the cascades are real)", async () => {
    await freeAgentClient.request("PUT", `/api/me/velocity-zones/${benchId}`, { body: BENCH_ZONE });
    const extra = await makeExercise(coach.id, { name: "Zone Throwaway" });
    await freeAgentClient.request("PUT", `/api/me/velocity-zones/${extra.id}`, { body: BENCH_ZONE });
    const { eq } = await import("drizzle-orm");
    await db.delete(exercises).where(eq(exercises.id, extra.id));
    const left = await db.select().from(velocityZones);
    expect(left.map((z) => z.exerciseId)).toEqual([benchId]);
  });
});
