import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  CAMERA_DERIVED_SET_COLUMNS,
  coachAthletes,
  externalWaivers,
  teamMembers,
  teams,
  weightRoomDisplayTokens,
  weightRoomStationEntries,
  workoutLogEntries,
  workoutLogs,
  workoutSetEntries,
} from "@shared/schema";
import { db } from "./db";
import { makeAssignedProgram, makeExercise, resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, TestClient, type TestServer } from "./test-support/http-app";
import { clearTvCacheForTests } from "./weight-room";

/* WEIGHT ROOM MODE ON REAL POSTGRES (2026-11-21).
 *
 * THE STATION: a coach's session logs an athlete's own assigned sets for today, through the
 * athlete's own save path. Proven here: the sets land on the athlete's day; the day's other sets
 * (one typed on the phone, one FILMED) survive the whole-day save untouched; the revision rule
 * refuses a stale or claimless save; every save writes an audit row naming the coach; an athlete
 * off the team, off the roster or parked is refused and never listed; the document gate blocks
 * and says why; leaving the station needs the coach's password.
 *
 * THE TV: a display token works with no session, a revoked one 404s, another team's athletes
 * never appear, and no camera-derived column name is anywhere in the payload. */

const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const ISO_DATE_LENGTH = 10;
const FILMED_MEAN_MPS = 0.81;

let server: TestServer;
let coach: Awaited<ReturnType<typeof makeLoginableUser>>;
let otherCoach: Awaited<ReturnType<typeof makeLoginableUser>>;
let jordan: Awaited<ReturnType<typeof makeLoginableUser>>;
let blocked: Awaited<ReturnType<typeof makeLoginableUser>>;
let parked: Awaited<ReturnType<typeof makeLoginableUser>>;
let benchwarmer: Awaited<ReturnType<typeof makeLoginableUser>>;
let stranger: Awaited<ReturnType<typeof makeLoginableUser>>;
let coachClient: TestClient;
let otherClient: TestClient;
let teamA: number;
let teamB: number;
let squatId: number;
let today: string;

const waiver = (athleteId: number) => ({
  athleteId,
  uploadedByUserId: athleteId,
  kind: "participation_waiver" as const,
  fileUrl: `/uploads/waivers/w-${athleteId}.pdf`,
  mimeType: "application/pdf",
  sizeBytes: 1024,
  reviewStatus: "accepted" as const,
  signedOn: "2026-09-01",
});

async function dayFor(athleteId: number, coachId: number) {
  return makeAssignedProgram({ coachId, athleteId, exerciseIds: [squatId], startDate: today });
}

async function setsOnDay(athleteId: number) {
  return db
    .select({ setNumber: workoutSetEntries.setNumber, reps: workoutSetEntries.reps, weight: workoutSetEntries.weight, mean: workoutSetEntries.meanVelocityMps })
    .from(workoutSetEntries)
    .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
    .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
    .where(and(eq(workoutLogs.athleteId, athleteId), eq(workoutLogs.date, today)))
    .orderBy(workoutSetEntries.setNumber);
}

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
  today = new Date().toISOString().slice(0, ISO_DATE_LENGTH);
  coach = await makeLoginableUser({ role: "coach", name: "Station Coach" } as never);
  otherCoach = await makeLoginableUser({ role: "coach", name: "Other Program" } as never);
  jordan = await makeLoginableUser({ role: "athlete", name: "Jordan Reyes" } as never);
  blocked = await makeLoginableUser({ role: "athlete", name: "Blake Nopaper" } as never);
  parked = await makeLoginableUser({ role: "athlete", name: "Parker Offseason" } as never);
  benchwarmer = await makeLoginableUser({ role: "athlete", name: "Bailey Otherteam" } as never);
  stranger = await makeLoginableUser({ role: "athlete", name: "Sam Elsewhere" } as never);
  [coachClient, otherClient] = await Promise.all([coach, otherCoach].map((u) => loginAs(server.baseUrl, u)));

  await db.insert(coachAthletes).values([
    { coachId: coach.id, athleteId: jordan.id },
    { coachId: coach.id, athleteId: blocked.id },
    { coachId: coach.id, athleteId: parked.id, heldAt: new Date(), heldByCoachId: coach.id },
    { coachId: coach.id, athleteId: benchwarmer.id },
    { coachId: otherCoach.id, athleteId: stranger.id },
  ]);
  [{ id: teamA }, { id: teamB }] = await db
    .insert(teams)
    .values([
      { coachId: coach.id, name: "Varsity" },
      { coachId: coach.id, name: "JV" },
    ])
    .returning();
  const [{ id: strangerTeam }] = await db.insert(teams).values({ coachId: otherCoach.id, name: "Rivals" }).returning();
  await db.insert(teamMembers).values([
    { teamId: teamA, athleteId: jordan.id },
    { teamId: teamA, athleteId: blocked.id },
    { teamId: teamA, athleteId: parked.id },
    { teamId: teamB, athleteId: benchwarmer.id },
    { teamId: strangerTeam, athleteId: stranger.id },
  ]);
  // Everybody but `blocked` has the participation waiver on file (enforcement is on in this suite).
  await db.insert(externalWaivers).values([jordan, parked, benchwarmer, stranger].map((a) => waiver(a.id)));
  squatId = (await makeExercise(coach.id, { name: "Station Back Squat" })).id;
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => clearTvCacheForTests());

describe("the weight room station", () => {
  it("lists the team's in-season athletes by first name and last initial, and says who is blocked", async () => {
    await dayFor(jordan.id, coach.id);
    const res = await coachClient.get(`/api/coach/weight-room/station/${teamA}`);
    expect(res.status).toBe(OK);
    const names = res.body.athletes.map((a: { displayName: string }) => a.displayName);
    expect(names).toEqual(["Blake N.", "Jordan R."]);
    expect(names).not.toContain("Parker O.");
    const blake = res.body.athletes.find((a: { displayName: string }) => a.displayName === "Blake N.");
    expect(blake.blocked.missing.length).toBeGreaterThan(0);
    const jordanTile = res.body.athletes.find((a: { displayName: string }) => a.displayName === "Jordan R.");
    expect(jordanTile.blocked).toBeNull();
    expect(jordanTile.workoutsToday).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(res.body)).not.toContain("Reyes");
  });

  it("writes the station's sets onto the athlete's own day, keeps the phone's and the camera's, and records the coach", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", name: "Casey Merge" } as never);
    await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: athlete.id });
    await db.insert(teamMembers).values({ teamId: teamA, athleteId: athlete.id });
    await db.insert(externalWaivers).values(waiver(athlete.id));
    const { assignment, day, programExercises } = await dayFor(athlete.id, coach.id);
    // The athlete logged set 1 on their phone and FILMED set 2.
    const [log] = await db
      .insert(workoutLogs)
      .values({ assignmentId: assignment.id, programDayId: day.id, athleteId: athlete.id, date: today, revision: 3 })
      .returning();
    const [entry] = await db
      .insert(workoutLogEntries)
      .values({ workoutLogId: log.id, programExerciseId: programExercises[0].id, exerciseId: squatId })
      .returning();
    await db.insert(workoutSetEntries).values([
      { logEntryId: entry.id, setNumber: 1, reps: "5", weight: "185" },
      { logEntryId: entry.id, setNumber: 2, reps: "5", weight: "205", meanVelocityMps: FILMED_MEAN_MPS },
    ]);

    const tile = await coachClient.get(`/api/coach/weight-room/station/${teamA}/athletes/${athlete.id}`);
    expect(tile.status).toBe(OK);
    const workout = tile.body.workouts[0];
    expect(workout.revision).toBe(3);
    expect(workout.exercises[0].logged.map((s: { filmed: boolean }) => s.filmed)).toEqual([false, true]);
    expect(JSON.stringify(tile.body)).not.toContain(String(FILMED_MEAN_MPS));

    const save = await coachClient.post(`/api/coach/weight-room/station/${teamA}/athletes/${athlete.id}/log`, {
      assignmentId: assignment.id,
      programDayId: day.id,
      date: today,
      baseRevision: 3,
      sets: [
        { programExerciseId: programExercises[0].id, setNumber: 2, reps: "9", weight: "999", weightUnit: "lbs" },
        { programExerciseId: programExercises[0].id, setNumber: 3, reps: "5", weight: "225", weightUnit: "lbs" },
      ],
    });
    expect(save.status).toBe(OK);
    expect(save.body.revision).toBe(4);
    expect(save.body.skippedFilmed).toEqual([{ programExerciseId: programExercises[0].id, setNumber: 2 }]);

    const sets = await setsOnDay(athlete.id);
    expect(sets).toEqual([
      { setNumber: 1, reps: "5", weight: "185", mean: null },
      { setNumber: 2, reps: "5", weight: "205", mean: FILMED_MEAN_MPS },
      { setNumber: 3, reps: "5", weight: "225", mean: null },
    ]);
    const audit = await db.select().from(weightRoomStationEntries).where(eq(weightRoomStationEntries.athleteId, athlete.id));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ coachId: coach.id, teamId: teamA, date: today, revision: 4, setsWritten: 1 });
  });

  it("honours the revision rule: a stale claim and a missing claim are both refused once the day exists", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", name: "Riley Revision" } as never);
    await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: athlete.id });
    await db.insert(teamMembers).values({ teamId: teamA, athleteId: athlete.id });
    await db.insert(externalWaivers).values(waiver(athlete.id));
    const { assignment, day, programExercises } = await dayFor(athlete.id, coach.id);
    const body = (baseRevision?: number) => ({
      assignmentId: assignment.id,
      programDayId: day.id,
      date: today,
      ...(baseRevision !== undefined ? { baseRevision } : {}),
      sets: [{ programExerciseId: programExercises[0].id, setNumber: 1, reps: "5", weight: "135", weightUnit: "lbs" }],
    });
    const url = `/api/coach/weight-room/station/${teamA}/athletes/${athlete.id}/log`;
    const first = await coachClient.post(url, body());
    expect(first.status).toBe(OK);
    const stale = await coachClient.post(url, body(first.body.revision + 1));
    expect(stale.status).toBe(CONFLICT);
    expect(stale.body.currentRevision).toBe(first.body.revision);
    const claimless = await coachClient.post(url, body());
    expect(claimless.status).toBe(CONFLICT);
    const current = await coachClient.post(url, body(first.body.revision));
    expect(current.status).toBe(OK);
  });

  it("refuses an athlete outside the station's team, outside the coach's roster, or parked", async () => {
    const benchDay = await dayFor(benchwarmer.id, coach.id);
    const parkedDay = await dayFor(parked.id, coach.id);
    const strangerDay = await dayFor(stranger.id, otherCoach.id);
    const save = (athleteId: number, d: Awaited<ReturnType<typeof dayFor>>) =>
      coachClient.post(`/api/coach/weight-room/station/${teamA}/athletes/${athleteId}/log`, {
        assignmentId: d.assignment.id,
        programDayId: d.day.id,
        date: today,
        sets: [{ programExerciseId: d.programExercises[0].id, setNumber: 1, reps: "5", weight: "95", weightUnit: "lbs" }],
      });
    expect((await save(benchwarmer.id, benchDay)).status).toBe(NOT_FOUND);
    expect((await save(parked.id, parkedDay)).status).toBe(NOT_FOUND);
    expect((await save(stranger.id, strangerDay)).status).toBe(NOT_FOUND);
    expect((await coachClient.get(`/api/coach/weight-room/station/${teamA}/athletes/${stranger.id}`)).status).toBe(NOT_FOUND);
    // Another coach cannot open this coach's station at all.
    expect((await otherClient.get(`/api/coach/weight-room/station/${teamA}`)).status).toBe(NOT_FOUND);
    const written = await Promise.all([benchwarmer, parked, stranger].map((a) => setsOnDay(a.id)));
    expect(written).toEqual([[], [], []]);
  });

  it("blocks an athlete the document gate blocks, and names what is missing", async () => {
    const d = await dayFor(blocked.id, coach.id);
    const res = await coachClient.post(`/api/coach/weight-room/station/${teamA}/athletes/${blocked.id}/log`, {
      assignmentId: d.assignment.id,
      programDayId: d.day.id,
      date: today,
      sets: [{ programExerciseId: d.programExercises[0].id, setNumber: 1, reps: "5", weight: "95", weightUnit: "lbs" }],
    });
    expect(res.status).toBe(FORBIDDEN);
    expect(res.body.missing.length).toBeGreaterThan(0);
    expect(await setsOnDay(blocked.id)).toEqual([]);
  });

  it("leaves the station only on the coach's own password", async () => {
    expect((await coachClient.post("/api/coach/weight-room/unlock", { password: "not it" })).status).toBe(UNAUTHORIZED);
    expect((await coachClient.post("/api/coach/weight-room/unlock", { password: coach.plainPassword })).status).toBe(NO_CONTENT);
  });
});

describe("the TV display link", () => {
  it("serves the team's hand-logged boards with no session, names nobody off the team, and carries no camera column", async () => {
    // A JV athlete with a far heavier lift and a camera number on it: neither may reach Varsity's TV.
    const jv = await dayFor(benchwarmer.id, coach.id);
    const [jvLog] = await db
      .insert(workoutLogs)
      .values({ assignmentId: jv.assignment.id, programDayId: jv.day.id, athleteId: benchwarmer.id, date: today, completed: true })
      .returning();
    const [jvEntry] = await db
      .insert(workoutLogEntries)
      .values({ workoutLogId: jvLog.id, programExerciseId: jv.programExercises[0].id, exerciseId: squatId })
      .returning();
    await db.insert(workoutSetEntries).values({
      logEntryId: jvEntry.id, setNumber: 1, reps: "3", weight: "405", isPr: true, meanVelocityMps: FILMED_MEAN_MPS, peakVelocityMps: 1.4,
    });

    // And a Varsity PR this week, so the PR board has a row to project.
    const varsity = await dayFor(jordan.id, coach.id);
    const [vLog] = await db
      .insert(workoutLogs)
      .values({ assignmentId: varsity.assignment.id, programDayId: varsity.day.id, athleteId: jordan.id, date: today })
      .returning();
    const [vEntry] = await db
      .insert(workoutLogEntries)
      .values({ workoutLogId: vLog.id, programExerciseId: varsity.programExercises[0].id, exerciseId: squatId })
      .returning();
    await db.insert(workoutSetEntries).values({ logEntryId: vEntry.id, setNumber: 1, reps: "5", weight: "255", isPr: true });

    const made = await coachClient.post("/api/coach/weight-room/displays", { teamId: teamA, label: "Main room TV" });
    expect(made.status).toBe(CREATED);
    const tv = new TestClient(server.baseUrl);
    const res = await tv.get(`/api/public/weight-room-tv/${made.body.token}`);
    expect(res.status).toBe(OK);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(res.body.teamName).toBe("Varsity");
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("Bailey");
    expect(text).not.toContain("Reyes");
    expect(text).not.toContain("405");
    expect(CAMERA_DERIVED_SET_COLUMNS.filter((column) => text.includes(`"${column}"`))).toEqual([]);
    expect(["id", "athleteId", "heightIn", "bodyWeightLbs"].filter((key) => text.includes(`"${key}":`))).toEqual([]);
    const names = res.body.topLifts.flatMap((b: { rows: { name: string }[] }) => b.rows.map((r) => r.name));
    // Casey logged on the station in the first describe; Varsity's board names them, abbreviated.
    expect(names).toContain("Casey M.");
    expect(res.body.prsThisWeek.map((p: { name: string }) => p.name)).toEqual(["Jordan R."]);
    // The stored token is a hash; the raw token never sits in the table.
    const [row] = await db.select().from(weightRoomDisplayTokens).where(eq(weightRoomDisplayTokens.id, made.body.id));
    expect(row.tokenHash).not.toBe(made.body.token);
  });

  it("stops working the moment it is revoked, and only its own coach can make or revoke one", async () => {
    const made = await coachClient.post("/api/coach/weight-room/displays", { teamId: teamA });
    const tv = new TestClient(server.baseUrl);
    expect((await tv.get(`/api/public/weight-room-tv/${made.body.token}`)).status).toBe(OK);
    expect((await otherClient.post(`/api/coach/weight-room/displays/${made.body.id}/revoke`)).status).toBe(NOT_FOUND);
    expect((await otherClient.post("/api/coach/weight-room/displays", { teamId: teamA })).status).toBe(NOT_FOUND);
    expect((await coachClient.post(`/api/coach/weight-room/displays/${made.body.id}/revoke`)).status).toBe(NO_CONTENT);
    expect((await tv.get(`/api/public/weight-room-tv/${made.body.token}`)).status).toBe(NOT_FOUND);
    expect((await tv.get("/api/public/weight-room-tv/not-a-real-token")).status).toBe(NOT_FOUND);
  });
});
