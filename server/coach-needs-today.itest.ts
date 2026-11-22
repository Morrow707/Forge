import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { coachAthletes, coachStaff, externalWaivers, programs, teamCoaches, teamMembers, teams, weightRoomSheetPrints, weightRoomSheetUploads } from "@shared/schema";
import { needsLines, NOTHING_WAITING, type NeedsYouToday } from "@shared/coach-needs-today";
import { db } from "./db";
import { makeAssignedProgram, makeExercise, resetDatabase } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestClient, type TestServer } from "./test-support/http-app";

/* "NEEDS YOU TODAY" ON REAL POSTGRES (2026-11-22). server/coach-needs-today.ts:
 *   - printed sheets with no logged upload for the same team, date and program day;
 *   - unread messages from athletes, in the coach's own threads;
 *   - athletes (not documents) missing a required document, held athletes out;
 *   - athletes whose return-to-training assignment starts this week, held athletes out;
 *   - a staff coach narrowed to one team counts only that team's athletes and sheets;
 *   - a coach with nothing waiting reads all zero, which draws the one quiet sentence. */

const OK = 200;
const CREATED = 201;
const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const TWO = 2;
const DAY_TWO = 2;
const DATE = "2026-11-18"; // a Wednesday
const THIS_FRIDAY = "2026-11-20";
const LAST_SATURDAY = "2026-11-15";
const NEXT_MONDAY = "2026-11-23";

let server: TestServer;
type U = Awaited<ReturnType<typeof makeLoginableUser>>;
let head: U;
let staff: U;
let lonely: U;
let onA: U; // team A, missing documents, returning this week, two unread to head
let onB: U; // team B (outside staff's scope), missing documents, returning this week
let held: U; // parked: missing documents and returning this week, never counted
let complete: U; // team A, documents done, return-to-training starts next week, one unread to staff
let headClient: TestClient;
let staffClient: TestClient;
let lonelyClient: TestClient;

const read = async (client: TestClient): Promise<NeedsYouToday> => {
  const res = await client.request("GET", `/api/coach/needs-you-today?date=${DATE}`);
  expect(res.status).toBe(OK);
  return res.body as NeedsYouToday;
};

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
  head = await makeLoginableUser({ role: "coach", name: "Head Coach" } as never);
  staff = await makeLoginableUser({ role: "coach", name: "Team A Coach" } as never);
  lonely = await makeLoginableUser({ role: "coach", name: "Quiet Coach" } as never);
  onA = await makeLoginableUser({ role: "athlete", name: "Avery On A" } as never);
  onB = await makeLoginableUser({ role: "athlete", name: "Blake On B" } as never);
  held = await makeLoginableUser({ role: "athlete", name: "Casey Held" } as never);
  complete = await makeLoginableUser({ role: "athlete", name: "Drew Complete" } as never);
  await db.insert(coachStaff).values({ primaryCoachId: head.id, staffCoachId: staff.id });
  await Promise.all([onA, onB, held, complete].map((a) => addToRoster(head.id, a.id)));
  await db.update(coachAthletes).set({ heldAt: new Date() }).where(eq(coachAthletes.athleteId, held.id));
  const [teamA] = await db.insert(teams).values({ coachId: head.id, name: "Team A" }).returning();
  const [teamB] = await db.insert(teams).values({ coachId: head.id, name: "Team B" }).returning();
  await db.insert(teamMembers).values([
    { teamId: teamA.id, athleteId: onA.id },
    { teamId: teamA.id, athleteId: complete.id },
    { teamId: teamA.id, athleteId: held.id },
    { teamId: teamB.id, athleteId: onB.id },
  ]);
  await db.insert(teamCoaches).values({ teamId: teamA.id, coachId: staff.id });

  // Documents: only `complete` has the participation waiver accepted.
  await db.insert(externalWaivers).values({
    athleteId: complete.id,
    uploadedByUserId: head.id,
    kind: "participation_waiver",
    fileUrl: "/uploads/waivers/needs-today-test.pdf",
    reviewStatus: "accepted",
  } as never);

  // Return to training: this week for onA, onB and held; next week for complete; an ordinary
  // program this week for complete, which is not a return-to-training plan.
  const squat = await makeExercise(head.id, { name: "Needs Today Squat" });
  const plan = (athleteId: number, startDate: string) => makeAssignedProgram({ coachId: head.id, athleteId, exerciseIds: [squat.id], startDate });
  const rtt = await Promise.all([plan(onA.id, THIS_FRIDAY), plan(onB.id, DATE), plan(held.id, DATE), plan(complete.id, NEXT_MONDAY)]);
  const lastWeek = await plan(onA.id, LAST_SATURDAY);
  await Promise.all(
    [...rtt, lastWeek].map((p) => db.update(programs).set({ purposes: ["return_to_training"] }).where(eq(programs.id, p.program.id))),
  );
  await plan(complete.id, DATE);

  // Sheets: team A day 1 printed and not logged; team B day 1 printed and logged; team B day 2
  // printed and not logged; a team A sheet from two weeks ago is outside the window.
  const lifts: never[] = [];
  await db.insert(weightRoomSheetPrints).values([
    { coachId: head.id, teamId: teamA.id, date: DATE, programDayId: 1, version: "a1", lifts },
    { coachId: head.id, teamId: teamB.id, date: DATE, programDayId: 1, version: "b1", lifts },
    { coachId: head.id, teamId: teamB.id, date: DATE, programDayId: DAY_TWO, version: "b2", lifts },
    { coachId: head.id, teamId: teamA.id, date: "2026-11-04", programDayId: 1, version: "old", lifts },
  ]);
  await db.insert(weightRoomSheetUploads).values({
    coachId: head.id,
    teamId: teamB.id,
    date: DATE,
    programDayId: 1,
    attendance: {},
    summary: {},
  });

  [headClient, staffClient, lonelyClient] = await Promise.all([head, staff, lonely].map((u) => loginAs(server.baseUrl, u)));
  const [onAClient, completeClient] = await Promise.all([onA, complete].map((u) => loginAs(server.baseUrl, u)));
  const sendToHead = (body: string) => onAClient.request("POST", `/api/athlete/messages/${head.id}`, { body: { body } });
  expect((await sendToHead("Can I lift today?")).status).toBe(CREATED);
  expect((await sendToHead("My knee feels fine.")).status).toBe(CREATED);
  const toStaff = await completeClient.request("POST", `/api/athlete/messages/${staff.id}`, { body: { body: "Running late." } });
  expect(toStaff.status).toBe(CREATED);
});

afterAll(async () => {
  await server.close();
});

describe("needs you today", () => {
  it("counts each line for the head coach, leaving the held athlete out", async () => {
    const n = await read(headClient);
    expect(n.sheetsWaiting.count).toBe(TWO);
    expect(n.unreadMessages).toEqual({ count: TWO, athleteIds: [onA.id] });
    expect(n.missingDocuments.count).toBe(TWO);
    expect(new Set(n.missingDocuments.athleteIds)).toEqual(new Set([onA.id, onB.id]));
    expect(n.returningFromInjury.athletes.map((a) => a.athleteId).sort()).toEqual([onA.id, onB.id].sort());
    expect(n.returningFromInjury.athletes.find((a) => a.athleteId === onA.id)?.startDate).toBe(THIS_FRIDAY);
  });

  it("a staff coach narrowed to team A counts only team A", async () => {
    const n = await read(staffClient);
    expect(n.sheetsWaiting.count).toBe(1);
    expect(n.unreadMessages).toEqual({ count: 1, athleteIds: [complete.id] });
    expect(n.missingDocuments).toEqual({ count: 1, athleteIds: [onA.id] });
    expect(n.returningFromInjury.athletes.map((a) => a.athleteId)).toEqual([onA.id]);
  });

  it("opening the thread clears the unread line", async () => {
    const opened = await headClient.request("GET", `/api/coach/messages/${onA.id}`);
    expect(opened.status).toBe(OK);
    const n = await read(headClient);
    expect(n.unreadMessages.count).toBe(0);
    expect(needsLines(n).map((l) => l.key)).toEqual(["sheets", "documents", "injury"]);
  });

  it("a coach with nothing waiting reads all zero, and the card says so in one line", async () => {
    const n = await read(lonelyClient);
    expect([n.sheetsWaiting.count, n.unreadMessages.count, n.missingDocuments.count, n.returningFromInjury.count]).toEqual([0, 0, 0, 0]);
    expect(needsLines(n)).toEqual([]);
    expect(NOTHING_WAITING).toBe("Nothing waiting on you.");
  });

  it("refuses an athlete and a malformed date", async () => {
    const athlete = await loginAs(server.baseUrl, onB);
    expect((await athlete.request("GET", "/api/coach/needs-you-today")).status).toBe(FORBIDDEN);
    expect((await headClient.request("GET", "/api/coach/needs-you-today?date=tomorrow")).status).toBe(BAD_REQUEST);
  });
});
