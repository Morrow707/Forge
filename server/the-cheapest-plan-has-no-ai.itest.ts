import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import type { FreeAgentTierId } from "@shared/free-agent-tiers";
import { resetDatabase, makeCoach } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

// BASIC IS SOLD AS "NO AI COACH", AND THREE AI FEATURES WERE OPEN ON IT (cost audit, 2026-11-12):
// the meal photo, the daily readiness note and the weekly summary. The last two fire on a page
// load with nobody pressing anything, once a day and once a week per account, forever.
//
// Driven through the real routes on real Postgres, because the gate is a middleware chain and a
// tier on a row, and neither is visible to a scan. The model itself is never reached here (no
// key in the test environment), which is the point: a refusal has to come BEFORE the model is
// asked, so it is observable without one.

const PAYMENT_REQUIRED = 402;
const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

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

async function freeAgentHolding(tier: FreeAgentTierId | null) {
  const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
  if (tier) await storage.updateFreeAgentBilling(athlete.id, { freeAgentTier: tier });
  return { athlete, client: await loginAs(server.baseUrl, athlete) };
}

const photo = { images: [{ mediaType: "image/png", data: ONE_PIXEL_PNG }] };

describe("the AI features that were open on the cheapest plan", () => {
  it.each([null, "basic"] as const)("a Free Agent holding %s is refused the meal photo, with the upgrade named", async (tier) => {
    const { client } = await freeAgentHolding(tier);
    const res = await client.post("/api/athlete/food/analyze-photo", photo);
    expect(res.status, JSON.stringify(res.body)).toBe(PAYMENT_REQUIRED);
    expect(res.body.freeAgentPaywall).toBe(true);
  });

  it.each(["ai_coach", "ai_coach_video"] as const)("%s gets past the plan gate on the meal photo", async (tier) => {
    const { client } = await freeAgentHolding(tier);
    const res = await client.post("/api/athlete/food/analyze-photo", photo);
    // Whatever the handler answers with no model configured, it is not the paywall.
    expect(res.status, JSON.stringify(res.body)).not.toBe(PAYMENT_REQUIRED);
    expect(res.body?.freeAgentPaywall).toBeUndefined();
  });

  it("tells the app which it is, so the button is drawn only where the route will answer", async () => {
    const basic = await freeAgentHolding("basic");
    const paid = await freeAgentHolding("ai_coach");
    expect((await basic.client.get("/api/athlete/entitlements")).body.aiCoach).toBe(false);
    expect((await paid.client.get("/api/athlete/entitlements")).body.aiCoach).toBe(true);
  });

  it("a coached athlete reads false too: their program is their plan, and they get no AI", async () => {
    const coach = await makeCoach();
    const { athlete, client } = await freeAgentHolding("ai_coach");
    await addToRoster(coach.id, athlete.id);
    expect((await client.get("/api/athlete/entitlements")).body.aiCoach).toBe(false);
  });

  // No model is configured here, so "nothing" is what every plan would read: this case holds
  // only that the gate answers an ordinary empty 200 and not a paywall error on a page the
  // athlete did not ask anything of. That the gate sits ahead of the model is held by the scan
  // in the-cost-audit-fixes-2026-11-13.test.ts.
  it("the readiness note and the weekly summary answer an empty 200 for Basic, never an error", async () => {
    const { athlete, client } = await freeAgentHolding("basic");
    const today = new Date().toISOString().slice(0, "YYYY-MM-DD".length);
    await storage.upsertWellnessCheckin(athlete.id, today, {
      sleepHours: 8, sleepQuality: 3, soreness: 3, stress: 3, energy: 3,
    } as never);
    const readiness = await client.get(`/api/athlete/readiness?date=${today}`);
    const digest = await client.get("/api/athlete/digest");
    expect(readiness.status).toBe(200);
    expect(readiness.body).toBeNull();
    expect(digest.status).toBe(200);
    expect(digest.body).toBeNull();
  });
});
