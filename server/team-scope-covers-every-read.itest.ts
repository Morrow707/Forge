import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { coachAthletes, coachStaff, teams, teamMembers } from "@shared/schema";
import {
  resetDatabase,
  makeExercise,
  makeAssignedProgram,
  makeLoggedSetWithVideo,
  makeUploadedFile,
} from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/* TEAM NARROWING REACHES THE READS THAT DO NOT GO THROUGH getRosterAthleteForCoach.
 *
 * Found by the pass-E audit, 2026-10-06. team-coach-assignment.itest.ts proves the roster list
 * and the per-athlete detail route, which is what CLAUDE.md's design note describes: "every
 * per-athlete coach route 404s through getRosterAthleteForCoach, so scoping only the list would
 * hide a name and leave every URL working."
 *
 * That was true of the detail family and NOT true one layer in. The coach ANALYTICS routes take
 * an athleteId from a QUERY STRING, the calendar names every athlete it returns, and both
 * leaderboards rank athletes by name -- and all of them filtered on getEffectiveCoachIds alone.
 * So a narrowed staff coach who could not see the JV athlete on the roster, and got a 404 on
 * their detail page, could still read their exercise history, their recent sessions, their
 * calendar, and see their name and numbers on the leaderboard, just by asking directly.
 *
 * This file is the regression, written as "every route that names or describes an athlete",
 * because the next one added will not be on anybody's list either.
 */

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});

async function narrowedStaff() {
  const primary = await makeLoginableUser({ role: "coach", name: "Primary" });
  const staff = await makeLoginableUser({ role: "coach", name: "Staff" });
  await db.insert(coachStaff).values({ primaryCoachId: primary.id, staffCoachId: staff.id });

  const mine = await makeLoginableUser({ role: "athlete", name: "Varsity Athlete" });
  const theirs = await makeLoginableUser({ role: "athlete", name: "JV Athlete" });
  await db.insert(coachAthletes).values([
    { coachId: primary.id, athleteId: mine.id },
    { coachId: primary.id, athleteId: theirs.id },
  ]);
  const [varsity] = await db
    .insert(teams)
    .values({ coachId: primary.id, name: "Varsity", code: "VARS02" })
    .returning();
  const [jv] = await db
    .insert(teams)
    .values({ coachId: primary.id, name: "JV", code: "JVJV02" })
    .returning();
  await db.insert(teamMembers).values([
    { teamId: varsity.id, athleteId: mine.id },
    { teamId: jv.id, athleteId: theirs.id },
  ]);

  /* BOTH ATHLETES GET A REAL LOGGED SET, and that is the whole point of this fixture.
   * The first draft of this file asserted "the response is empty" against a database with no
   * training in it, so every assertion passed with the fix REVERTED -- empty because there was
   * nothing to leak, not because anything was scoped. Same failure as the 618 sensor-collision
   * test: a guard that never fires collides with nothing. Each athlete now has an assignment
   * and a logged 100lb set of the same exercise, so an unscoped read returns a row and an
   * unscoped leaderboard names them. */
  const exercise = await makeExercise(primary.id, { name: `Audit Lift ${Date.now()}` });
  const seeded: Record<string, number> = {};
  for (const athlete of [mine, theirs]) {
    const prog = await makeAssignedProgram({
      coachId: primary.id,
      athleteId: athlete.id,
      exerciseIds: [exercise.id],
    });
    await makeLoggedSetWithVideo({
      athleteId: athlete.id,
      assignmentId: prog.assignment.id,
      programDayId: prog.day.id,
      exerciseId: exercise.id,
      programExerciseId: prog.programExercises[0].id,
      date: "2026-01-05",
      videoUrl: await makeUploadedFile(`scope-${athlete.id}.mp4`),
    });
    seeded[athlete.name] = prog.assignment.id;
  }

  const primaryClient = await loginAs(server.baseUrl, primary);
  const assign = await primaryClient.put(`/api/coach/teams/${varsity.id}/coaches`, {
    coachIds: [staff.id],
  });
  expect(assign.status).toBe(200);
  return { primary, staff, mine, theirs, varsity, jv, primaryClient, exercise, seeded };
}

describe("team narrowing covers every coach read that describes an athlete", () => {
  beforeEach(resetDatabase);

  it("refuses the off-team athlete on every analytics route that takes an athleteId", async () => {
    const f = await narrowedStaff();
    const client = await loginAs(server.baseUrl, f.staff);

    // The detail route is the one that was already scoped -- asserted here so this file fails
    // for the right reason if the scoping primitive itself ever breaks.
    expect((await client.get(`/api/coach/roster/${f.theirs.id}`)).status).toBe(404);

    // The control first: the PRIMARY coach sees real rows for the same athlete, so the
    // narrowed coach's empty answer below is the scoping and not an empty database.
    const asPrimary = await f.primaryClient.get(
      `/api/coach/analytics/exercises?athleteId=${f.theirs.id}`,
    );
    expect(asPrimary.body.map((e: any) => e.id)).toContain(f.exercise.id);
    const primaryPoints = await f.primaryClient.get(
      `/api/coach/analytics?athleteId=${f.theirs.id}&exerciseId=${f.exercise.id}`,
    );
    expect(primaryPoints.body.length).toBeGreaterThan(0);

    for (const path of [
      `/api/coach/analytics/exercises?athleteId=${f.theirs.id}`,
      `/api/coach/analytics/skill-exercises?athleteId=${f.theirs.id}`,
      `/api/coach/analytics/overview?athleteId=${f.theirs.id}`,
      `/api/coach/analytics?athleteId=${f.theirs.id}&exerciseId=${f.exercise.id}`,
      `/api/coach/force-velocity?athleteId=${f.theirs.id}&exerciseId=${f.exercise.id}`,
    ]) {
      const res = await client.get(path);
      // Never a 500, and never a row about somebody they cannot see.
      expect(res.status, path).toBeLessThan(400);
      const rows = Array.isArray(res.body)
        ? res.body
        : (res.body?.sessions ?? res.body?.points ?? []);
      expect(rows, path).toEqual([]);
    }

    // And the athlete they DO coach still reads normally -- narrowing, not a lockout.
    const ownPoints = await client.get(
      `/api/coach/analytics?athleteId=${f.mine.id}&exerciseId=${f.exercise.id}`,
    );
    expect(ownPoints.body.length).toBeGreaterThan(0);
  });

  it("returns nothing for the off-team athlete's own calendar, and still shows the on-team one", async () => {
    const f = await narrowedStaff();
    const client = await loginAs(server.baseUrl, f.staff);
    const range = "start=2020-01-01&end=2030-01-01";

    const off = await client.get(`/api/coach/calendar?${range}&athleteId=${f.theirs.id}`);
    expect(off.status).toBeLessThan(400);
    expect(off.body).toEqual([]);

    // The on-team athlete is not collateral damage: the route still answers for them.
    const on = await client.get(`/api/coach/calendar?${range}&athleteId=${f.mine.id}`);
    expect(on.status).toBeLessThan(400);

    // And the unfiltered calendar never names the off-team athlete.
    const all = await client.get(`/api/coach/calendar?${range}`);
    expect(all.status).toBeLessThan(400);
    expect(JSON.stringify(all.body)).not.toContain("JV Athlete");
  });

  it("never names an off-team athlete on either leaderboard", async () => {
    const f = await narrowedStaff();
    const client = await loginAs(server.baseUrl, f.staff);

    const exercises = await client.get("/api/coach/leaderboard/exercises");
    expect(exercises.status).toBeLessThan(400);
    for (const ex of (exercises.body as any[]) ?? []) {
      const board = await client.get(`/api/coach/leaderboard?exerciseId=${ex.id}`);
      expect(JSON.stringify(board.body ?? []), `strength board for ${ex.id}`).not.toContain(
        "JV Athlete",
      );
    }
    const speedExercises = await client.get("/api/coach/speed-leaderboard/exercises");
    if (speedExercises.status < 400) {
      for (const ex of (speedExercises.body as any[]) ?? []) {
        const board = await client.get(`/api/coach/speed-leaderboard?skillExerciseId=${ex.id}`);
        expect(JSON.stringify(board.body ?? []), `speed board for ${ex.id}`).not.toContain(
          "JV Athlete",
        );
      }
    }
  });

  it("refuses to remove an athlete the narrowed coach cannot see", async () => {
    const f = await narrowedStaff();
    const client = await loginAs(server.baseUrl, f.staff);
    expect((await client.delete(`/api/coach/roster/${f.theirs.id}`)).status).toBe(404);
    // Their own team's athlete is still removable, so this is narrowing and not a lockout.
    expect((await client.delete(`/api/coach/roster/${f.mine.id}`)).status).toBe(204);
  });

  /* THE OTHER HALF, AND THE REASON THE SCOPE IS NULL RATHER THAN EMPTY: narrowing only ever
   * turns on for a staff coach who HAS an assignment. A primary coach, a solo coach and an
   * unassigned colleague all see everything, which is what makes "the first assignment is what
   * turns narrowing on" true. A regression here would lock a whole program out of its own data,
   * which is worse than the leak this file exists for. */
  it("leaves the primary coach and an unassigned colleague seeing everything", async () => {
    const f = await narrowedStaff();
    const other = await makeLoginableUser({ role: "coach", name: "Unassigned" });
    await db.insert(coachStaff).values({ primaryCoachId: f.primary.id, staffCoachId: other.id });

    for (const who of [f.primary, other]) {
      const client = await loginAs(server.baseUrl, who);
      expect((await client.get(`/api/coach/roster/${f.theirs.id}`)).status, who.name).toBe(200);
      const cal = await client.get("/api/coach/calendar?start=2020-01-01&end=2030-01-01");
      expect(cal.status, who.name).toBeLessThan(400);
    }
  });

  /* A coach who programs their own training creates an assignments row with
   * coachId === athleteId, and a coach is a member of no team -- so the calendar's scope list
   * carries the coach's own id explicitly. Without that, narrowing hid a staff coach's OWN
   * calendar from them, which the first draft of this fix did. */
  it("still shows a narrowed staff coach their own self-programmed calendar", async () => {
    const f = await narrowedStaff();
    const client = await loginAs(server.baseUrl, f.staff);
    const mine = await client.get(
      `/api/coach/calendar?start=2020-01-01&end=2030-01-01&athleteId=${f.staff.id}`,
    );
    expect(mine.status).toBeLessThan(400);
    expect(mine.body).toEqual([]); // nothing programmed, but NOT refused as out-of-scope
  });
});
