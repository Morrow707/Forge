import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  attendanceRecords,
  coachAthletes,
  guardianLinks,
  guardianWeeklySummaryOptOuts,
  guardianWeeklySummarySends,
  workoutLogEntries,
  workoutLogs,
  workoutSetEntries,
} from "@shared/schema";
import { db } from "./db";
import { testOutbox } from "./email";
import { runParentWeeklySummaries } from "./parent-weekly-summary";
import { makeAssignedProgram, makeExercise, resetDatabase } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestClient, type TestServer } from "./test-support/http-app";

/* THE WEEKLY PARENT SUMMARY ON REAL POSTGRES (2026-11-21), driven through the job's own run with a
 * fixed clock (a Monday) and the routes the guardian dashboard calls:
 *   - a minor's linked guardian gets one email, with sessions, attendance and a hand-logged PR and
 *     no camera number;
 *   - an adult athlete's guardian link gets nothing;
 *   - the guardian's switch is respected, and switching back on restores it;
 *   - a second run the same week sends nothing more (the claim row);
 *   - a guardian of an unrelated child gets nothing about this one, and nothing at all when their
 *     own child had nothing assigned;
 *   - a HELD athlete (every seat parked for the off season) gets no summary -- decided: this is the
 *     program's report and the program has paused the season;
 *   - a guardian cannot read or flip the switch for a child they are not linked to;
 *   - outside the Monday-to-Wednesday window nothing is sent. */

const OK = 200;
const NOT_FOUND = 404;
const MONDAY_RUN = new Date("2026-11-23T15:00:00Z");
const THURSDAY_RUN = new Date("2026-11-26T15:00:00Z");
const TUESDAY = "2026-11-17";
const WEEK_START = "2026-11-16";
const MINOR_DOB = "2011-04-02";
const ADULT_DOB = "2001-04-02";
const PEAK_SPEED = 1.37;

let server: TestServer;
type U = Awaited<ReturnType<typeof makeLoginableUser>>;
let coach: U;
let minor: U;
let adult: U;
let heldMinor: U;
let idleMinor: U;
let guardian: U;
let adultsGuardian: U;
let heldGuardian: U;
let otherGuardian: U;
let guardianClient: TestClient;
let otherGuardianClient: TestClient;

// By SUBJECT, never by count: the guardians' own sign-in ("New login") email is fire-and-forget and
// branded, so it can land in the outbox after the beforeEach clear (CLAUDE.md, "brandForUserId MAKES A
// FIRE-AND-FORGET SEND LAND AFTER THE RESPONSE"). The summary itself is awaited by the job.
const SUMMARY_SUBJECT = "training week";
const summaries = () => testOutbox.filter((m) => m.subject.includes(SUMMARY_SUBJECT));
const sentTo = (who: U) => summaries().filter((m) => m.to === who.email);

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
  coach = await makeLoginableUser({ role: "coach", name: "Summary Coach" } as never);
  minor = await makeLoginableUser({ role: "athlete", name: "Riley Minor", dateOfBirth: MINOR_DOB } as never);
  adult = await makeLoginableUser({ role: "athlete", name: "Alex Adult", dateOfBirth: ADULT_DOB } as never);
  heldMinor = await makeLoginableUser({ role: "athlete", name: "Harper Held", dateOfBirth: MINOR_DOB } as never);
  idleMinor = await makeLoginableUser({ role: "athlete", name: "Ira Idle", dateOfBirth: MINOR_DOB } as never);
  [guardian, adultsGuardian, heldGuardian, otherGuardian] = await Promise.all(
    ["Parent One", "Parent Two", "Parent Three", "Parent Four"].map((name) => makeLoginableUser({ role: "guardian", name } as never)),
  );
  await Promise.all([minor, adult, heldMinor, idleMinor].map((a) => addToRoster(coach.id, a.id)));
  await db.insert(guardianLinks).values([
    { guardianId: guardian.id, athleteId: minor.id },
    { guardianId: adultsGuardian.id, athleteId: adult.id },
    { guardianId: heldGuardian.id, athleteId: heldMinor.id },
    { guardianId: otherGuardian.id, athleteId: idleMinor.id },
  ]);
  await db.update(coachAthletes).set({ heldAt: new Date() }).where(eq(coachAthletes.athleteId, heldMinor.id));
  const squat = await makeExercise(coach.id, { name: "Summary Back Squat" });
  const plan = (athleteId: number) => makeAssignedProgram({ coachId: coach.id, athleteId, exerciseIds: [squat.id], startDate: TUESDAY });
  const [m] = await Promise.all([plan(minor.id), plan(adult.id), plan(heldMinor.id)]);
  const [log] = await db
    .insert(workoutLogs)
    .values({ assignmentId: m.assignment.id, programDayId: m.day.id, athleteId: minor.id, date: TUESDAY, completed: true, completedAt: new Date() })
    .returning();
  const [entry] = await db.insert(workoutLogEntries).values({ workoutLogId: log.id, programExerciseId: m.programExercises[0].id, exerciseId: squat.id }).returning();
  await db.insert(workoutSetEntries).values({
    logEntryId: entry.id,
    setNumber: 1,
    reps: "5",
    weight: "185",
    weightUnit: "lbs",
    isPr: true,
    peakVelocityMps: PEAK_SPEED,
  });
  await db.insert(attendanceRecords).values({ programCoachId: coach.id, athleteId: minor.id, date: TUESDAY, status: "present" });
  [guardianClient, otherGuardianClient] = await Promise.all([guardian, otherGuardian].map((u) => loginAs(server.baseUrl, u)));
});

afterAll(async () => {
  await server.close();
});

beforeEach(async () => {
  testOutbox.length = 0;
  await db.delete(guardianWeeklySummarySends);
  await db.delete(guardianWeeklySummaryOptOuts);
});

describe("the weekly parent summary", () => {
  it("a minor's linked guardian gets one email with the week, and no camera number", async () => {
    const tally = await runParentWeeklySummaries(MONDAY_RUN);
    expect(tally.sent).toBe(1);
    const mail = sentTo(guardian);
    expect(mail).toHaveLength(1);
    expect(mail[0].subject).toContain("Riley Minor");
    expect(mail[0].html).toContain("1 of 1 assigned session completed");
    expect(mail[0].html).toContain("present 1 day");
    expect(mail[0].html).toContain("Summary Back Squat 185 lbs x 5");
    expect(mail[0].html).toContain("Weekly summary email");
    expect(mail[0].html, "a camera number never reaches this email").not.toContain(String(PEAK_SPEED));
    expect(mail[0].html).not.toContain("m/s");
    const [row] = await db.select().from(guardianWeeklySummarySends);
    expect(row).toMatchObject({ guardianId: guardian.id, athleteId: minor.id, weekStart: WEEK_START });
  });

  it("an adult athlete's guardian link gets nothing", async () => {
    const tally = await runParentWeeklySummaries(MONDAY_RUN);
    expect(sentTo(adultsGuardian)).toHaveLength(0);
    expect(tally.not_a_known_minor).toBe(1);
  });

  it("a second run the same week sends nothing more", async () => {
    await runParentWeeklySummaries(MONDAY_RUN);
    const again = await runParentWeeklySummaries(new Date("2026-11-24T15:00:00Z"));
    expect(again.sent ?? 0).toBe(0);
    expect(again.already_sent).toBe(1);
    expect(sentTo(guardian)).toHaveLength(1);
  });

  it("the guardian's switch is respected, and turning it back on restores the email", async () => {
    const off = await guardianClient.request("PUT", `/api/guardian/athletes/${minor.id}/weekly-summary`, { body: { enabled: false } });
    expect(off.status).toBe(OK);
    const read = await guardianClient.request("GET", `/api/guardian/athletes/${minor.id}/weekly-summary`);
    expect(read.body).toMatchObject({ enabled: false, status: "eligible" });
    await runParentWeeklySummaries(MONDAY_RUN);
    expect(sentTo(guardian)).toHaveLength(0);
    await guardianClient.request("PUT", `/api/guardian/athletes/${minor.id}/weekly-summary`, { body: { enabled: true } });
    await runParentWeeklySummaries(MONDAY_RUN);
    expect(sentTo(guardian)).toHaveLength(1);
  });

  it("an unrelated guardian gets nothing, and a guardian whose child had nothing assigned gets nothing", async () => {
    const tally = await runParentWeeklySummaries(MONDAY_RUN);
    expect(sentTo(otherGuardian)).toHaveLength(0);
    expect(tally.nothing_assigned).toBe(1);
    expect(summaries().every((m) => m.to === guardian.email)).toBe(true);
  });

  it("a held (parked) athlete gets no summary", async () => {
    const tally = await runParentWeeklySummaries(MONDAY_RUN);
    expect(sentTo(heldGuardian)).toHaveLength(0);
    expect(tally.no_active_coach).toBe(1);
  });

  it("a guardian cannot read or flip the switch for a child they are not linked to", async () => {
    expect((await otherGuardianClient.request("GET", `/api/guardian/athletes/${minor.id}/weekly-summary`)).status).toBe(NOT_FOUND);
    expect((await otherGuardianClient.request("PUT", `/api/guardian/athletes/${minor.id}/weekly-summary`, { body: { enabled: false } })).status).toBe(NOT_FOUND);
    expect(await db.select().from(guardianWeeklySummaryOptOuts)).toHaveLength(0);
  });

  it("nothing is sent outside the Monday-to-Wednesday window", async () => {
    const tally = await runParentWeeklySummaries(THURSDAY_RUN);
    expect(tally).toEqual({ outside_window: 1 });
    expect(summaries()).toHaveLength(0);
  });
});
