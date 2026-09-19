import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { coachAthletes, coachStaff, teams, teamMembers } from "@shared/schema";
import { resetDatabase } from "./test-support/fixtures";
import {
  loginAs,
  makeLoginableUser,
  startTestServer,
  type TestServer,
} from "./test-support/http-app";

// Per-team coach assignment (teamCoaches in shared/schema.ts). Every
// assertion here goes through the real HTTP stack because the scoping is
// only worth anything if the ROUTES are narrowed -- getTeamsForCoach backs
// assertOwnsTeam, and getRosterAthleteForCoach is what every per-athlete
// coach route 404s through.

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});

async function buildStaff() {
  const primary = await makeLoginableUser({ role: "coach", name: "Primary" });
  const staffA = await makeLoginableUser({ role: "coach", name: "Staff A" });
  const staffB = await makeLoginableUser({ role: "coach", name: "Staff B" });
  await db.insert(coachStaff).values([
    { primaryCoachId: primary.id, staffCoachId: staffA.id },
    { primaryCoachId: primary.id, staffCoachId: staffB.id },
  ]);

  const varsityAthlete = await makeLoginableUser({ role: "athlete", name: "Varsity Athlete" });
  const jvAthlete = await makeLoginableUser({ role: "athlete", name: "JV Athlete" });
  await db.insert(coachAthletes).values([
    { coachId: primary.id, athleteId: varsityAthlete.id },
    { coachId: primary.id, athleteId: jvAthlete.id },
  ]);

  const [varsity] = await db
    .insert(teams)
    .values({ coachId: primary.id, name: "Varsity", code: "VARS01" })
    .returning();
  const [jv] = await db
    .insert(teams)
    .values({ coachId: primary.id, name: "JV", code: "JVJV01" })
    .returning();
  await db.insert(teamMembers).values([
    { teamId: varsity.id, athleteId: varsityAthlete.id },
    { teamId: jv.id, athleteId: jvAthlete.id },
  ]);

  return { primary, staffA, staffB, varsity, jv, varsityAthlete, jvAthlete };
}

describe("per-team coach assignment", () => {
  beforeEach(resetDatabase);

  it("changes nothing for a staff with no assignments anywhere", async () => {
    const f = await buildStaff();
    const client = await loginAs(server.baseUrl, f.staffA);

    const teamsRes = await client.get("/api/coach/teams");
    expect(teamsRes.status).toBe(200);
    expect(teamsRes.body.map((t: any) => t.name).sort()).toEqual(["JV", "Varsity"]);

    const roster = await client.get("/api/coach/roster");
    expect(roster.body.length).toBe(2);
  });

  it("narrows an assigned coach to their team, its members, and 404s the rest", async () => {
    const f = await buildStaff();
    const primaryClient = await loginAs(server.baseUrl, f.primary);
    const assign = await primaryClient.put(`/api/coach/teams/${f.varsity.id}/coaches`, {
      coachIds: [f.staffA.id],
    });
    expect(assign.status).toBe(200);

    const client = await loginAs(server.baseUrl, f.staffA);

    const teamsRes = await client.get("/api/coach/teams");
    expect(teamsRes.body.map((t: any) => t.name)).toEqual(["Varsity"]);
    expect(teamsRes.body[0].coaches.map((c: any) => c.id)).toEqual([f.staffA.id]);

    const roster = await client.get("/api/coach/roster");
    expect(roster.body.map((a: any) => a.id)).toEqual([f.varsityAthlete.id]);

    // Every per-athlete coach route resolves through
    // getRosterAthleteForCoach, so the JV athlete has to be invisible here
    // too -- scoping the list view alone is not scoping.
    const theirs = await client.get(`/api/coach/roster/${f.varsityAthlete.id}`);
    expect(theirs.status).toBe(200);
    const others = await client.get(`/api/coach/roster/${f.jvAthlete.id}`);
    expect(others.status).toBe(404);

    // assertOwnsTeam derives from getTeamsForCoach, so the team routes are
    // scoped by that alone.
    const otherTeam = await client.post(`/api/coach/teams/${f.jv.id}/members`, {
      athleteId: f.jvAthlete.id,
    });
    expect(otherTeam.status).toBe(404);
  });

  it("leaves an unassigned colleague on the same staff seeing everything", async () => {
    const f = await buildStaff();
    const primaryClient = await loginAs(server.baseUrl, f.primary);
    await primaryClient.put(`/api/coach/teams/${f.varsity.id}/coaches`, {
      coachIds: [f.staffA.id],
    });

    const client = await loginAs(server.baseUrl, f.staffB);
    const teamsRes = await client.get("/api/coach/teams");
    expect(teamsRes.body.map((t: any) => t.name).sort()).toEqual(["JV", "Varsity"]);
    const roster = await client.get("/api/coach/roster");
    expect(roster.body.length).toBe(2);
  });

  it("keeps the primary coach seeing everything even when assigned nothing", async () => {
    const f = await buildStaff();
    const client = await loginAs(server.baseUrl, f.primary);
    await client.put(`/api/coach/teams/${f.varsity.id}/coaches`, { coachIds: [f.staffA.id] });

    const teamsRes = await client.get("/api/coach/teams");
    expect(teamsRes.body.map((t: any) => t.name).sort()).toEqual(["JV", "Varsity"]);
    const roster = await client.get("/api/coach/roster");
    expect(roster.body.length).toBe(2);
    const others = await client.get(`/api/coach/roster/${f.jvAthlete.id}`);
    expect(others.status).toBe(200);
  });

  it("refuses a non-primary coach's attempt to assign", async () => {
    const f = await buildStaff();
    const client = await loginAs(server.baseUrl, f.staffA);
    const res = await client.put(`/api/coach/teams/${f.varsity.id}/coaches`, {
      coachIds: [f.staffA.id],
    });
    expect(res.status).toBe(403);
  });

  it("refuses a coach who is not on the staff", async () => {
    const f = await buildStaff();
    const outsider = await makeLoginableUser({ role: "coach", name: "Outsider" });
    const client = await loginAs(server.baseUrl, f.primary);
    const res = await client.put(`/api/coach/teams/${f.varsity.id}/coaches`, {
      coachIds: [outsider.id],
    });
    expect(res.status).toBe(400);
  });

  it("unassigning everyone puts the staff coach back to seeing everything", async () => {
    const f = await buildStaff();
    const primaryClient = await loginAs(server.baseUrl, f.primary);
    await primaryClient.put(`/api/coach/teams/${f.varsity.id}/coaches`, {
      coachIds: [f.staffA.id],
    });
    await primaryClient.put(`/api/coach/teams/${f.varsity.id}/coaches`, { coachIds: [] });

    const client = await loginAs(server.baseUrl, f.staffA);
    const teamsRes = await client.get("/api/coach/teams");
    expect(teamsRes.body.map((t: any) => t.name).sort()).toEqual(["JV", "Varsity"]);
  });
});
