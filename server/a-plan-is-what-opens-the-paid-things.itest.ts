/**
 * THE THREE PLAN FIXES OF 2026-11-13, driven through the real routes on real Postgres.
 *
 * 1. A Free Agent past their trial with no plan cannot write new training (Basic used to unlock
 *    nothing an unpaid account did not already have).
 * 2. A coach account with no live plan does not get the camera, skill recording or the coach AI
 *    tools (it used to be a free AI Coach + Video).
 * 3. An athlete on a roster films on the PROGRAM's plan, so the program has to have one.
 *
 * Every refusal asserts its premise beside it: the same account passes the moment the thing a
 * plan is made of (a tier, a band, a trial, a comp) is on file.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { coachAthletes, users } from "@shared/schema";
import { BILLING_TIER_ORDER } from "@shared/billing-tiers";
import { storage } from "./storage";
import { resetDatabase } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

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

const PLAN_NEEDED = 402;
const PROGRAM_NOT_PAID = 403;
const today = () => new Date().toISOString().slice(0, "YYYY-MM-DD".length);

async function unpaid(role: "athlete" | "coach") {
  const user = await makeLoginableUser({ role, isBetaAccount: false });
  return { user, client: await loginAs(server.baseUrl, user) };
}
/** A coach nobody signs in as: the login limiter's budget is per file, and these only need a row. */
const unpaidCoachRow = async () => ({ user: await makeLoginableUser({ role: "coach", isBetaAccount: false }) });
const payFor = (coachId: number) =>
  db.update(users).set({ billingTier: BILLING_TIER_ORDER[0] }).where(eq(users.id, coachId));
const logWater = (client: Awaited<ReturnType<typeof loginAs>>) =>
  client.post("/api/athlete/water-log", { date: today(), ounces: 8 });

describe("fix 1: a Free Agent needs a plan to keep training", () => {
  it("with no plan and no trial, a training write is refused and the account is flagged", async () => {
    const { client } = await unpaid("athlete");
    const res = await logWater(client);
    expect(res.status, JSON.stringify(res.body)).toBe(PLAN_NEEDED);
    expect(res.body.planRequired).toBe(true);
    expect((await client.get("/api/auth/me")).body.planRequired).toBe(true);
  });

  it("reads stay open and so do the ways out: the plans answer, a code, a coach", async () => {
    const { client } = await unpaid("athlete");
    expect((await client.get("/api/athlete/entitlements")).status).toBe(200);
    const code = await client.post("/api/athlete/redeem-code", { code: "NOT-A-CODE" });
    expect(code.body?.planRequired, JSON.stringify(code.body)).toBeUndefined();
    const optOut = await client.post("/api/athlete/tracking-opt-out", {});
    expect(optOut.body?.planRequired, JSON.stringify(optOut.body)).toBeUndefined();
  });

  it.each(["basic", "ai_coach", "ai_coach_video"] as const)("holding %s, the same write is not walled", async (tier) => {
    const { user, client } = await unpaid("athlete");
    await storage.updateFreeAgentBilling(user.id, { freeAgentTier: tier });
    const res = await logWater(client);
    expect(res.body?.planRequired, JSON.stringify(res.body)).toBeUndefined();
    expect(res.status).not.toBe(PLAN_NEEDED);
    expect((await client.get("/api/auth/me")).body.planRequired).toBe(false);
  });

  it("the 14-day sign-up trial is not walled", async () => {
    const { user, client } = await unpaid("athlete");
    await storage.createTrialSubscription(user.id, "free_agent");
    expect((await logWater(client)).status).not.toBe(PLAN_NEEDED);
  });

  it("a comped account is not walled", async () => {
    const user = await makeLoginableUser({ role: "athlete", isBetaAccount: true });
    const client = await loginAs(server.baseUrl, user);
    expect((await logWater(client)).status).not.toBe(PLAN_NEEDED);
  });

  it("an athlete on a roster is never asked, parked for the off season or not", async () => {
    const coach = await unpaidCoachRow();
    const { user, client } = await unpaid("athlete");
    await addToRoster(coach.user.id, user.id);
    expect((await logWater(client)).status).not.toBe(PLAN_NEEDED);
    await db
      .update(coachAthletes)
      .set({ heldAt: new Date() })
      .where(and(eq(coachAthletes.coachId, coach.user.id), eq(coachAthletes.athleteId, user.id)));
    expect((await logWater(client)).status).not.toBe(PLAN_NEEDED);
    expect((await client.get("/api/auth/me")).body.planRequired).toBe(false);
  });
});

describe("fix 2: a coach account is not a free AI Coach + Video", () => {
  it("with no plan: no camera, no skill recording, no AI program draft, and the app is told", async () => {
    const { client } = await unpaid("coach");
    expect((await client.get("/api/athlete/camera-access")).body).toEqual({ allowed: false, reason: "coach_plan_inactive" });
    const skills = (await client.get("/api/athlete/skills-access")).body;
    expect(skills.canRecord).toBe(false);
    expect(skills.reason).toBe("coach_plan_inactive");
    const draft = await client.post("/api/coach/programs/ai-draft", { prompt: "three day strength" });
    expect(draft.status, JSON.stringify(draft.body)).toBe(PROGRAM_NOT_PAID);
    expect(draft.body.coachPlanInactive).toBe(true);
    expect(draft.body.freeAgentPaywall).toBeUndefined();
    expect((await client.get("/api/coach/entitlements")).body.planActive).toBe(false);
    const digest = await client.get("/api/coach/digest");
    expect(digest.status).toBe(200);
    expect(digest.body).toBeNull();
  });

  it("with a paid band, the same coach has all of it", async () => {
    const { user, client } = await unpaid("coach");
    await payFor(user.id);
    expect((await client.get("/api/athlete/camera-access")).body.allowed).toBe(true);
    expect((await client.get("/api/athlete/skills-access")).body.canRecord).toBe(true);
    const draft = await client.post("/api/coach/programs/ai-draft", { prompt: "three day strength" });
    expect(draft.status, JSON.stringify(draft.body)).not.toBe(PROGRAM_NOT_PAID);
    expect((await client.get("/api/coach/entitlements")).body.planActive).toBe(true);
  });

  it("a new coach's 14-day trial counts as a plan", async () => {
    const { user, client } = await unpaid("coach");
    await storage.createTrialSubscription(user.id, "coach");
    expect((await client.get("/api/athlete/camera-access")).body.allowed).toBe(true);
  });
});

describe("fix 3: a coached athlete films on the program's plan", () => {
  it("on an unpaid program the camera and skill recording are paused, with history still open", async () => {
    const coach = await unpaidCoachRow();
    const { user, client } = await unpaid("athlete");
    await addToRoster(coach.user.id, user.id);
    expect((await client.get("/api/athlete/camera-access")).body).toEqual({ allowed: false, reason: "coach_plan_inactive" });
    expect((await client.get("/api/athlete/skills-access")).body).toEqual({
      allowed: true,
      canRecord: false,
      reason: "coach_plan_inactive",
    });
  });

  it("the moment the program is paid for, the same athlete has both", async () => {
    const coach = await unpaidCoachRow();
    const { user, client } = await unpaid("athlete");
    await addToRoster(coach.user.id, user.id);
    await payFor(coach.user.id);
    expect((await client.get("/api/athlete/camera-access")).body).toEqual({ allowed: true, reason: "coached_athlete" });
    expect((await client.get("/api/athlete/skills-access")).body.canRecord).toBe(true);
  });

  it("a plan the athlete holds themselves is still honoured on an unpaid program", async () => {
    const coach = await unpaidCoachRow();
    const { user, client } = await unpaid("athlete");
    await storage.updateFreeAgentBilling(user.id, { freeAgentTier: "ai_coach_video" });
    await addToRoster(coach.user.id, user.id);
    expect((await client.get("/api/athlete/camera-access")).body).toEqual({ allowed: true, reason: "entitled" });
    expect((await client.get("/api/athlete/skills-access")).body.canRecord).toBe(true);
  });
});
