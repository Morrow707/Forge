import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { coachAthletes, foodLogEntries, hardyQuestionEvents, workoutLogEntries, workoutLogs, workoutSetEntries } from "@shared/schema";
import { db } from "./db";
import { makeAssignedProgram, makeExercise, resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestClient, type TestServer } from "./test-support/http-app";

/* HARDY ON REAL POSTGRES (2026-11-11): search reaches the person's own logs (a coach: their roster)
 * and nobody else's; a coached athlete is not offered answers in a sentence; and what the admin
 * report records is the kind and Forge's words, never the question. */

const OK = 200;
const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const DAY = "2026-07-14";
const SQUAT_LB = "315";
const NOT_RECORDED = "Lincoln";
const OWN_DAY = "2026-11-12";
const WAIT_MS = 5_000;
const POLL_MS = 25;

/** Recording a question is fire-and-forget on purpose (a failed count must never fail an answer),
 * so a test reading it waits for it, bounded, and throws with what it saw rather than passing. */
async function eventsOnceWritten(count: number) {
  const until = Date.now() + WAIT_MS;
  const read = async () => (await db.select().from(hardyQuestionEvents)).filter((r) => r.day === OWN_DAY);
  let rows = await read();
  while (rows.length < count && Date.now() < until) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    rows = await read();
  }
  if (rows.length < count) throw new Error(`expected ${count} recorded question(s), saw ${rows.length}`);
  return rows;
}

let server: TestServer;
let coach: Awaited<ReturnType<typeof makeLoginableUser>>;
let coached: Awaited<ReturnType<typeof makeLoginableUser>>;
let stranger: Awaited<ReturnType<typeof makeLoginableUser>>;
let coachClient: TestClient;
let coachedClient: TestClient;
let strangerClient: TestClient;

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
  coach = await makeLoginableUser({ role: "coach", name: "Hardy Coach" } as never);
  coached = await makeLoginableUser({ role: "athlete", name: "Jordan Logs" } as never);
  stranger = await makeLoginableUser({ role: "athlete", name: "Casey Elsewhere" } as never);
  [coachClient, coachedClient, strangerClient] = await Promise.all([coach, coached, stranger].map((u) => loginAs(server.baseUrl, u)));
  await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: coached.id });
  const squat = await makeExercise(coach.id, { name: "Hardy Back Squat" });
  const { assignment, day, programExercises } = await makeAssignedProgram({ coachId: coach.id, athleteId: coached.id, exerciseIds: [squat.id] });
  const [log] = await db.insert(workoutLogs).values({ assignmentId: assignment.id, programDayId: day.id, athleteId: coached.id, date: DAY }).returning();
  const [entry] = await db.insert(workoutLogEntries).values({ workoutLogId: log.id, programExerciseId: programExercises[0].id, exerciseId: squat.id, notes: "knee felt tight" }).returning();
  await db.insert(workoutSetEntries).values({ logEntryId: entry.id, setNumber: 1, reps: "3", weight: SQUAT_LB });
  await db.insert(foodLogEntries).values({ athleteId: coached.id, date: DAY, description: "Oatmeal with berries", source: "manual" });
});

afterAll(async () => {
  await server.close();
});

describe("Hardy", () => {
  it("finds an athlete's own squat by lift name, with a link to that day", async () => {
    const res = await coachedClient.request("GET", `/api/hardy/search?q=${encodeURIComponent("squat")}&today=2026-11-11`);
    expect(res.status).toBe(OK);
    expect(res.body.hits).toHaveLength(1);
    expect(res.body.hits[0]).toMatchObject({ date: DAY, kind: "workout" });
    expect(res.body.hits[0].label).toContain(SQUAT_LB);
    // The athlete's own day page: "/athlete/day/4/7/2026-07-14" yes; "/coach/roster/4" no.
    // https://regex101.com/?regex=%5E%2Fathlete%2Fday%2F%5Cd%2B%2F%5Cd%2B%2F2026-07-14%24&testString=%2Fathlete%2Fday%2F4%2F7%2F2026-07-14
    expect(res.body.hits[0].href).toMatch(/^\/athlete\/day\/\d+\/\d+\/2026-07-14$/);
  });

  it("finds a day by date across training and food, and a word from a note", async () => {
    const byDate = await coachedClient.request("GET", `/api/hardy/search?q=${encodeURIComponent("July 14")}&today=2026-11-11`);
    expect(byDate.body.hits.map((h: { kind: string }) => h.kind).sort()).toEqual(["food", "workout"]);
    const byNote = await coachedClient.request("GET", `/api/hardy/search?q=knee&today=2026-11-11`);
    expect(byNote.body.hits).toHaveLength(1);
  });

  it("never reaches somebody else's logs", async () => {
    const res = await strangerClient.request("GET", `/api/hardy/search?q=squat&today=2026-11-11`);
    expect(res.body.hits).toEqual([]);
  });

  it("a coach searches their roster, linked to the athlete's page", async () => {
    const res = await coachClient.request("GET", `/api/hardy/search?q=${encodeURIComponent("Jordan squat")}&today=2026-11-11`);
    expect(res.body.hits).toHaveLength(1);
    expect(res.body.hits[0]).toMatchObject({ athleteId: coached.id, href: `/coach/roster/${coached.id}` });
  });

  it("a coached athlete is not offered answers in a sentence, and is told Search still works", async () => {
    const access = await coachedClient.request("GET", "/api/hardy/access");
    expect(access.body).toMatchObject({ search: true, ask: false });
    const ask = await coachedClient.request("POST", "/api/hardy/ask", { body: { question: "What day did I squat the heaviest?" } });
    expect(ask.status).toBe(FORBIDDEN);
    expect(ask.body.message).toContain("Search");
  });

  it("an empty search is refused rather than run", async () => {
    expect((await coachedClient.request("GET", "/api/hardy/search?q=")).status).toBe(BAD_REQUEST);
  });

  it("records the kind and Forge's words, never the question", async () => {
    // Its own day, so a count still landing from an earlier case (they are fire-and-forget too)
    // cannot be mistaken for this one.
    await coachedClient.request("GET", `/api/hardy/search?q=${encodeURIComponent(`squat at ${NOT_RECORDED} High`)}&today=${OWN_DAY}`);
    const rows = (await eventsOnceWritten(1)).filter((r) => r.day === OWN_DAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "Training", words: ["squat"], userGroup: "Coached athletes", day: OWN_DAY });
    expect(JSON.stringify(rows[0])).not.toContain(NOT_RECORDED);
    expect(rows[0].askerKey, "the key is a hash, not the account id").not.toBe(String(coached.id));
  });

  it("the admin report is admin-only", async () => {
    expect((await coachClient.request("GET", "/api/admin/hardy-usage")).status).toBe(FORBIDDEN);
  });
});
