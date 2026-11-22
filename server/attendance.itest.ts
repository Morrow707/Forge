import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { attendanceRecords, coachAthletes, teamMembers, teams, workoutLogs } from "@shared/schema";
import { ATTENDANCE_CSV_HEADER, attendanceWeekCsvRows, mondayOf, type AttendanceWeek } from "@shared/attendance";
import { db } from "./db";
import { makeAssignedProgram, makeExercise, resetDatabase } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestClient, type TestServer } from "./test-support/http-app";

/* "WHO TRAINED TODAY" AND ATTENDANCE ON REAL POSTGRES (2026-11-21). server/attendance.ts:
 *   - the Today read derives completed / started / not started from the workout log alone;
 *   - a coach from another program is refused (404) on the mark;
 *   - a parked (held) athlete is off Today, cannot be marked (409), and their earlier mark stays
 *     in the week view, flagged;
 *   - mark, change, clear, and "mark all present" never overwriting an absent mark;
 *   - an assistant coach reads the head coach's mark (one row per program);
 *   - the week read and its CSV rows. */

const OK = 200;
const NOT_FOUND = 404;
const CONFLICT = 409;
const DATE = "2026-11-18"; // a Wednesday
const MONDAY = "2026-11-16";
const DAYS_IN_WEEK = 7;
const WEDNESDAY_INDEX = 2;
const UNMARKED_ACTIVE = 3; // done, started, held -- idle already marked absent

let server: TestServer;
type U = Awaited<ReturnType<typeof makeLoginableUser>>;
let coach: U;
let assistant: U;
let outsider: U;
let done: U;
let started: U;
let idle: U;
let held: U;
let coachClient: TestClient;
let assistantClient: TestClient;
let outsiderClient: TestClient;
let teamId: number;

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
  coach = await makeLoginableUser({ role: "coach", name: "Head Coach" } as never);
  assistant = await makeLoginableUser({ role: "coach", name: "Assistant Coach" } as never);
  outsider = await makeLoginableUser({ role: "coach", name: "Other Program" } as never);
  done = await makeLoginableUser({ role: "athlete", name: "Avery Done" } as never);
  started = await makeLoginableUser({ role: "athlete", name: "Blake Started" } as never);
  idle = await makeLoginableUser({ role: "athlete", name: "Casey Idle" } as never);
  held = await makeLoginableUser({ role: "athlete", name: "Drew Held" } as never);
  const { coachStaff } = await import("@shared/schema");
  await db.insert(coachStaff).values({ primaryCoachId: coach.id, staffCoachId: assistant.id });
  await Promise.all([done, started, idle, held].map((a) => addToRoster(coach.id, a.id)));
  const [team] = await db.insert(teams).values({ coachId: coach.id, name: "Varsity" }).returning();
  teamId = team.id;
  await db.insert(teamMembers).values([done, started].map((a) => ({ teamId, athleteId: a.id })));
  const squat = await makeExercise(coach.id, { name: "Attendance Squat" });
  const plan = async (athleteId: number) => makeAssignedProgram({ coachId: coach.id, athleteId, exerciseIds: [squat.id], startDate: DATE });
  const [d, s] = await Promise.all([plan(done.id), plan(started.id), plan(idle.id), plan(held.id)]);
  await db.insert(workoutLogs).values([
    { assignmentId: d.assignment.id, programDayId: d.day.id, athleteId: done.id, date: DATE, completed: true, completedAt: new Date() },
    { assignmentId: s.assignment.id, programDayId: s.day.id, athleteId: started.id, date: DATE, completed: false },
  ]);
  [coachClient, assistantClient, outsiderClient] = await Promise.all([coach, assistant, outsider].map((u) => loginAs(server.baseUrl, u)));
});

afterAll(async () => {
  await server.close();
});

beforeEach(async () => {
  await db.delete(attendanceRecords);
  await db.update(coachAthletes).set({ heldAt: null }).where(eq(coachAthletes.athleteId, held.id));
});

const mark = (client: TestClient, athleteId: number, status: string | null) =>
  client.request("PUT", "/api/coach/attendance", { body: { date: DATE, athleteId, status } });

describe("who trained today", () => {
  it("reads completed, started and not started off the workout log", async () => {
    const res = await coachClient.request("GET", `/api/coach/attendance/today?date=${DATE}`);
    expect(res.status).toBe(OK);
    const byId = new Map(res.body.athletes.map((a: { athleteId: number }) => [a.athleteId, a]));
    expect((byId.get(done.id) as { status: string }).status).toBe("completed");
    expect((byId.get(started.id) as { status: string }).status).toBe("started");
    expect((byId.get(idle.id) as { status: string }).status).toBe("not_started");
    expect(res.body.counts).toMatchObject({ completed: 1, started: 1 });
  });

  it("narrows to one team, and refuses a team that is not the coach's", async () => {
    const res = await coachClient.request("GET", `/api/coach/attendance/today?date=${DATE}&teamId=${teamId}`);
    expect(res.body.athletes.map((a: { name: string }) => a.name)).toEqual(["Avery Done", "Blake Started"]);
    const other = await outsiderClient.request("GET", `/api/coach/attendance/today?date=${DATE}&teamId=${teamId}`);
    expect(other.status).toBe(NOT_FOUND);
  });

  it("a coach from another program cannot mark the athlete", async () => {
    expect((await mark(outsiderClient, done.id, "present")).status).toBe(NOT_FOUND);
    expect(await db.select().from(attendanceRecords)).toHaveLength(0);
  });

  it("marks, changes and clears, and the assistant reads the head coach's mark", async () => {
    expect((await mark(coachClient, done.id, "present")).status).toBe(OK);
    expect((await mark(assistantClient, done.id, "excused")).status).toBe(OK);
    const rows = await db.select().from(attendanceRecords);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ programCoachId: coach.id, status: "excused", markedByCoachId: assistant.id });
    const today = await coachClient.request("GET", `/api/coach/attendance/today?date=${DATE}`);
    expect(today.body.athletes.find((a: { athleteId: number }) => a.athleteId === done.id).attendance).toBe("excused");
    expect((await mark(coachClient, done.id, null)).status).toBe(OK);
    expect(await db.select().from(attendanceRecords)).toHaveLength(0);
  });

  it("mark all present never overwrites an absent mark", async () => {
    await mark(coachClient, idle.id, "absent");
    const res = await coachClient.request("POST", "/api/coach/attendance/mark-all-present", { body: { date: DATE } });
    expect(res.status).toBe(OK);
    expect(res.body.marked).toBe(UNMARKED_ACTIVE);
    const [idleRow] = await db.select().from(attendanceRecords).where(eq(attendanceRecords.athleteId, idle.id));
    expect(idleRow.status).toBe("absent");
  });

  it("a held athlete is off Today and cannot be marked, and their earlier mark stays in the week", async () => {
    await mark(coachClient, held.id, "present");
    await db.update(coachAthletes).set({ heldAt: new Date() }).where(eq(coachAthletes.athleteId, held.id));
    const today = await coachClient.request("GET", `/api/coach/attendance/today?date=${DATE}`);
    expect(today.body.athletes.map((a: { athleteId: number }) => a.athleteId)).not.toContain(held.id);
    const refused = await mark(coachClient, held.id, "absent");
    expect(refused.status).toBe(CONFLICT);
    expect(refused.body.message).toContain("Drew Held");
    const [kept] = await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.athleteId, held.id), eq(attendanceRecords.date, DATE)));
    expect(kept.status).toBe("present");
    const week = await coachClient.request("GET", `/api/coach/attendance/week?date=${DATE}`);
    const row = week.body.athletes.find((a: { athleteId: number }) => a.athleteId === held.id);
    expect(row).toMatchObject({ held: true });
    expect(row.days[WEDNESDAY_INDEX].attendance).toBe("present");
  });

  it("the week read runs Monday to Sunday beside completion, and its CSV is one row per athlete per day", async () => {
    await mark(coachClient, done.id, "present");
    const res = await coachClient.request("GET", `/api/coach/attendance/week?date=${DATE}`);
    expect(res.status).toBe(OK);
    const week = res.body as AttendanceWeek;
    expect(week.start).toBe(mondayOf(DATE));
    expect(week.start).toBe(MONDAY);
    expect(week.dates).toHaveLength(DAYS_IN_WEEK);
    const avery = week.athletes.find((a) => a.athleteId === done.id)!;
    expect(avery.days[WEDNESDAY_INDEX]).toMatchObject({ date: DATE, attendance: "present", assigned: 1, completed: 1 });
    const rows = attendanceWeekCsvRows(week);
    expect(rows).toHaveLength(week.athletes.length * DAYS_IN_WEEK);
    expect(rows.every((r) => r.length === ATTENDANCE_CSV_HEADER.length)).toBe(true);
    expect(rows).toContainEqual(["Avery Done", DATE, "Present", 1, 1, ""]);
  });
});
