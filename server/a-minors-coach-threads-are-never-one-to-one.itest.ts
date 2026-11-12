import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  guardianLinks,
  skillAssignments,
  skillDayComments,
  skillProgramDays,
  skillProgramWeeks,
  skillPrograms,
  workoutComments,
} from "@shared/schema";
import { db } from "./db";
import { makeAssignedProgram, makeExercise, resetDatabase } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/* A MINOR'S COACH THREADS ARE NEVER ONE-TO-ONE (Scott, 2026-11-12: "noone should be able to
 * contact anyone unless they belong to a team, and it should always be done publicly"). The
 * per-day comment threads between a coach and one athlete were Forge's only private channel; for
 * an athlete under 18 the linked guardian now reads every one of them, workout days and skill
 * days, through the real route. A guardian of somebody else's child reads nothing, and a guardian
 * link that outlived an 18th birthday reads nothing either. */

const OK = 200;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const MINOR_AGE = 15;
const ADULT_AGE = 19;
const THREE_COMMENTS = 3;
const ISO_DATE_LENGTH = 10;

const isoYearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, ISO_DATE_LENGTH);
};

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(async () => {
  await resetDatabase();
});

async function threadsFor(coachId: number, athleteId: number) {
  const exercise = await makeExercise(coachId);
  const { assignment, day } = await makeAssignedProgram({ coachId, athleteId, exerciseIds: [exercise.id] });
  await db.insert(workoutComments).values([
    { assignmentId: assignment.id, programDayId: day.id, authorId: coachId, body: "Keep the bar over midfoot." },
    { assignmentId: assignment.id, programDayId: day.id, authorId: athleteId, body: "Felt heavy on set 3." },
  ]);
  const [program] = await db.insert(skillPrograms).values({ coachId, name: "Sprint mechanics" }).returning();
  const [week] = await db.insert(skillProgramWeeks).values({ programId: program.id, weekNumber: 1 }).returning();
  const [skillDay] = await db.insert(skillProgramDays).values({ weekId: week.id, dayNumber: 1 }).returning();
  const [skill] = await db
    .insert(skillAssignments)
    .values({ skillProgramId: program.id, athleteId, coachId, startDate: "2026-01-05" })
    .returning();
  await db
    .insert(skillDayComments)
    .values({ skillAssignmentId: skill.id, skillProgramDayId: skillDay.id, authorId: coachId, body: "Drive the knee." });
}

describe("a guardian reads every coach thread of their under-18 athlete", () => {
  it("sees the workout and skill threads, both directions, newest first", async () => {
    const coach = await makeLoginableUser({ role: "coach", name: "Coach Rivera" });
    const kid = await makeLoginableUser({ role: "athlete", dateOfBirth: isoYearsAgo(MINOR_AGE) });
    const parent = await makeLoginableUser({ role: "guardian" });
    await db.insert(guardianLinks).values({ athleteId: kid.id, guardianId: parent.id });
    await addToRoster(coach.id, kid.id);
    await threadsFor(coach.id, kid.id);

    const client = await loginAs(server.baseUrl, parent);
    const res = await client.get(`/api/guardian/athletes/${kid.id}/coach-comments`);
    expect(res.status).toBe(OK);
    const bodies = res.body.map((c: { body: string }) => c.body);
    expect(bodies).toEqual(expect.arrayContaining(["Keep the bar over midfoot.", "Felt heavy on set 3.", "Drive the knee."]));
    expect(res.body).toHaveLength(THREE_COMMENTS);
    expect(res.body.map((c: { kind: string }) => c.kind)).toEqual(expect.arrayContaining(["workout", "skill"]));
    const times = res.body.map((c: { createdAt: string }) => new Date(c.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(res.body[0].author).not.toHaveProperty("email");
  });

  it("reads nothing about somebody else's child", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const kid = await makeLoginableUser({ role: "athlete", dateOfBirth: isoYearsAgo(MINOR_AGE) });
    const stranger = await makeLoginableUser({ role: "guardian" });
    // A guardian with a child of their own, so the refusal is about THIS child and not about
    // having no child at all (which requireGuardianAccess refuses earlier).
    const theirOwn = await makeLoginableUser({ role: "athlete", dateOfBirth: isoYearsAgo(MINOR_AGE) });
    await db.insert(guardianLinks).values({ athleteId: theirOwn.id, guardianId: stranger.id });
    await threadsFor(coach.id, kid.id);
    const client = await loginAs(server.baseUrl, stranger);
    const res = await client.get(`/api/guardian/athletes/${kid.id}/coach-comments`);
    expect(res.status).toBe(NOT_FOUND);
    expect(JSON.stringify(res.body)).not.toContain("midfoot");
  });

  it("an adult athlete's threads are their own, even with a guardian link left over", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const grown = await makeLoginableUser({ role: "athlete", dateOfBirth: isoYearsAgo(ADULT_AGE) });
    const parent = await makeLoginableUser({ role: "guardian" });
    await db.insert(guardianLinks).values({ athleteId: grown.id, guardianId: parent.id });
    await threadsFor(coach.id, grown.id);
    const client = await loginAs(server.baseUrl, parent);
    const res = await client.get(`/api/guardian/athletes/${grown.id}/coach-comments`);
    expect(res.status).toBe(FORBIDDEN);
    expect(res.body.message).toContain("18 or over");
    expect(JSON.stringify(res.body)).not.toContain("midfoot");
  });
});
