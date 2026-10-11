import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeCoach, resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/* AN ADMIN ASSIGNS A FREE AGENT TIER WITHOUT EVER SEEING THE ATHLETE'S EMAIL.
 *
 * Found 2026-10-11, the first time an admin tried to put the App Review athlete on AI Coach +
 * Video after launch: the billing panel on More -> Users looked the account up by email, the
 * Users page withholds every athlete's email from admins on purpose, so the lookup was sent ""
 * and the panel rendered nothing. The read is by id now, the same id the page used to draw the
 * row; it returns the billing fields and nothing a person could be recognised by. */

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

describe("the admin billing read by id", () => {
  it("returns the billing fields for an athlete and no identity", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false, freeAgentTier: "basic" });
    const c = await loginAs(server.baseUrl, admin);
    const res = await c.get(`/api/admin/athletes/${athlete.id}/billing`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: athlete.id,
      freeAgentTier: "basic",
      freeAgentAddOns: [],
      isBetaAccount: false,
      hasVideoStorageAddOn: false,
      unlockedSkillSports: [],
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(athlete.email);
    expect(text).not.toContain(athlete.name);
  });

  it("then the assignment the panel makes lands on the account", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
    const c = await loginAs(server.baseUrl, admin);
    const saved = await c.patch(`/api/admin/athletes/${athlete.id}/billing`, {
      freeAgentTier: "ai_coach_video",
      freeAgentAddOns: [],
      isBetaAccount: false,
      hasVideoStorageAddOn: false,
      unlockedSkillSports: [],
    });
    expect(saved.status).toBe(200);
    const after = await c.get(`/api/admin/athletes/${athlete.id}/billing`);
    expect(after.body.freeAgentTier).toBe("ai_coach_video");
  });

  it("is 404 for a coach's id and 401 without an admin", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const coach = await makeCoach();
    const c = await loginAs(server.baseUrl, admin);
    expect((await c.get(`/api/admin/athletes/${coach.id}/billing`)).status).toBe(404);
    const athlete = await makeLoginableUser({ role: "athlete" });
    const asAthlete = await loginAs(server.baseUrl, athlete);
    expect((await asAthlete.get(`/api/admin/athletes/${athlete.id}/billing`)).status).toBe(403);
  });

  it("is what the panel reads, so the panel can never again be handed an empty email", () => {
    const src = readFileSync(resolve(__dirname, "../client/src/components/admin-billing-assignment.tsx"), "utf-8");
    const athleteForm = src.slice(src.indexOf("function AthleteBillingForm"));
    expect(athleteForm).toContain("/api/admin/athletes/${userId}/billing");
    expect(athleteForm).not.toContain("/api/admin/athletes/lookup");
  });
});
