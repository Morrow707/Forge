import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import {
  makeAssignedProgram,
  makeCoach,
  makeExercise,
  makeLoggedSetWithVideo,
  makeUploadedFile,
  resetDatabase,
} from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/* AN ADMIN CAN LIFT THE VIDEO CAP THAT APPLIES TO IT.
 *
 * The 2026-10-22 pass widened the four retention paths from `role = 'athlete'` to
 * ROLES_THAT_FILM_THEIR_OWN_TRAINING, so the nightly sweep really does cap an ADMIN's own
 * training clips at ten unfavorited per exercise -- and CLAUDE.md states the remedy as a fact:
 * "ticking Beta account or Extra video storage for that account makes it unlimited again."
 *
 * It did not exist. AdminBillingAssignment is the only writer of either column anywhere in the
 * client, its prop was typed `"coach" | "athlete"` and its call site asked for exactly those
 * two, and both billing routes 404 any other role. So the cap applied to an account that no
 * screen and no endpoint could exempt, and the calibration account -- an admin filming the same
 * four lifts over and over -- is the one account likeliest to cross it.
 *
 * Driven through the REAL routes and the REAL sweep, because the thing worth proving is not
 * that a column can be written: it is that writing it changes what the sweep does. */

const CAPPED = { isBetaAccount: false, trialExpiresAt: null, hasVideoStorageAddOn: false };

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

/** One account filming its own training, over the ten-clip cap. */
async function filmsOverTheCap(account: { id: number }, count = 13) {
  const libraryOwner = await makeCoach();
  const lift = await makeExercise(libraryOwner.id, { name: "Back Squat" });
  const { day, programExercises, assignment } = await makeAssignedProgram({
    coachId: libraryOwner.id,
    athleteId: account.id,
    exerciseIds: [lift.id],
  });
  for (let i = 0; i < count; i++) {
    await makeLoggedSetWithVideo({
      athleteId: account.id,
      assignmentId: assignment.id,
      programDayId: day.id,
      programExerciseId: programExercises[0].id,
      exerciseId: lift.id,
      videoUrl: await makeUploadedFile(`admin-own-${account.id}-${i}.mp4`),
      date: `2026-10-${String(1 + i).padStart(2, "0")}`,
    });
  }
}

describe("the own-training billing route", () => {
  it("reads an admin's two switches, and nothing a plan would carry", async () => {
    const admin = await makeLoginableUser({ role: "admin", ...CAPPED });
    const c = await loginAs(server.baseUrl, admin);
    const res = await c.get(`/api/admin/accounts/${admin.id}/own-training-billing`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: admin.id,
      role: "admin",
      isBetaAccount: false,
      hasVideoStorageAddOn: false,
    });
    // The plan fields are inert for a role whose camera comes from the role, so they are not
    // offered here at all -- "inert today" is how a meaningless write becomes a meaningful one.
    const text = JSON.stringify(res.body);
    for (const field of ["freeAgentTier", "freeAgentAddOns", "unlockedSkillSports", "billingTier"]) {
      expect(text).not.toContain(field);
    }
  });

  it("writes them, and refuses a plan field sent alongside", async () => {
    const admin = await makeLoginableUser({ role: "admin", ...CAPPED });
    const c = await loginAs(server.baseUrl, admin);
    const saved = await c.patch(`/api/admin/accounts/${admin.id}/own-training-billing`, {
      hasVideoStorageAddOn: true,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.hasVideoStorageAddOn).toBe(true);
    const after = await c.get(`/api/admin/accounts/${admin.id}/own-training-billing`);
    expect(after.body.hasVideoStorageAddOn).toBe(true);

    // A tier is not assignable through this pair. z.object strips rather than rejecting an
    // unknown key, so the assertion is that the column did not move -- which is the behaviour
    // that matters either way.
    await c.patch(`/api/admin/accounts/${admin.id}/own-training-billing`, {
      isBetaAccount: false,
      freeAgentTier: "ai_coach_video",
    });
    const row = await storage.getUser(admin.id);
    expect(row?.freeAgentTier ?? null).toBeNull();
  });

  it("refuses the roles that have a plan panel of their own, and every other role", async () => {
    const admin = await makeLoginableUser({ role: "admin", ...CAPPED });
    const c = await loginAs(server.baseUrl, admin);
    // A coach and an athlete are NOT served here: their switches ride on their plan panel, and
    // two writers for one column is the billing sweep's whole lesson.
    const coach = await makeCoach(CAPPED);
    const athlete = await makeLoginableUser({ role: "athlete", ...CAPPED });
    const guardian = await makeCoach({ ...CAPPED, role: "guardian" });
    for (const other of [coach, athlete, guardian]) {
      expect((await c.get(`/api/admin/accounts/${other.id}/own-training-billing`)).status).toBe(404);
      expect(
        (await c.patch(`/api/admin/accounts/${other.id}/own-training-billing`, { isBetaAccount: true }))
          .status,
      ).toBe(404);
    }
  });

  it("is admin-only", async () => {
    const admin = await makeLoginableUser({ role: "admin", ...CAPPED });
    const athlete = await makeLoginableUser({ role: "athlete" });
    const asAthlete = await loginAs(server.baseUrl, athlete);
    expect((await asAthlete.get(`/api/admin/accounts/${admin.id}/own-training-billing`)).status).toBe(403);
    expect(
      (await asAthlete.patch(`/api/admin/accounts/${admin.id}/own-training-billing`, {
        isBetaAccount: true,
      })).status,
    ).toBe(403);
  });
});

describe("what the switch actually does", () => {
  it("the sweep warns an admin over the cap, and stops once the add-on is ticked", async () => {
    const admin = await makeLoginableUser({ role: "admin", ...CAPPED });
    await filmsOverTheCap(admin);

    // THE PREMISE FIRST: without this the case below would pass for an admin the sweep never
    // looked at, which is exactly the shape that made the athlete-only scoping invisible.
    const before = await storage.sweepVideoRetentionCap();
    expect(before.warned.filter((w) => w.athleteId === admin.id).length).toBeGreaterThan(0);

    const c = await loginAs(server.baseUrl, admin);
    const saved = await c.patch(`/api/admin/accounts/${admin.id}/own-training-billing`, {
      hasVideoStorageAddOn: true,
    });
    expect(saved.status).toBe(200);

    const after = await storage.sweepVideoRetentionCap();
    expect(after.warned.filter((w) => w.athleteId === admin.id)).toEqual([]);
  });

  it("the beta switch lifts it too, through the same route", async () => {
    const admin = await makeLoginableUser({ role: "admin", ...CAPPED });
    await filmsOverTheCap(admin);
    const before = await storage.sweepVideoRetentionCap();
    expect(before.warned.filter((w) => w.athleteId === admin.id).length).toBeGreaterThan(0);

    const c = await loginAs(server.baseUrl, admin);
    expect(
      (await c.patch(`/api/admin/accounts/${admin.id}/own-training-billing`, { isBetaAccount: true }))
        .status,
    ).toBe(200);

    const after = await storage.sweepVideoRetentionCap();
    expect(after.warned.filter((w) => w.athleteId === admin.id)).toEqual([]);
  });
});
