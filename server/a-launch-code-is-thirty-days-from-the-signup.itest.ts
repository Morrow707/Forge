import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { redeemCodeRedemptions, subscriptions, users } from "@shared/schema";
import { promoTrialEndFromSignup } from "@shared/promo-trial";
import { storage } from "./storage";
import { redeemPromoCode } from "./promo-codes";
import { resetDatabase } from "./test-support/fixtures";
import {
  addToRoster,
  loginAs,
  makeLoginableUser,
  startTestServer,
  TestClient,
  type TestServer,
} from "./test-support/http-app";

/** THE LAUNCH CODE: THIRTY DAYS FREE, COUNTED FROM THE DAY THE ACCOUNT WAS CREATED (2026-10-15).
 *
 * Scott: "I want 30 days free so new users whenever they sign up get 30 days from their original
 * signup date, if they sign up October 17th they have until November 17th, if they sign up the
 * 23rd they have until November 23rd and so on." Driven through the real signup and redeem
 * routes against real Postgres; the arithmetic itself is pinned in shared/promo-trial.test.ts.
 *
 * Two different rows carry the trial and both are asserted: a head coach's is users.trialExpiresAt
 * (what getEntitlements reads, so /api/coach/entitlements is the proof), a Free Agent's is the
 * subscriptions row's trialing end (what hasAthletePaidForAiAccess reads under BILLING_LIVE,
 * which the integration config does not set -- so that half is proved on the row).
 */
function coachSignupBody(over: Record<string, unknown> = {}) {
  return {
    email: `coach-${Math.random().toString(36).slice(2)}@example.test`,
    password: "correct-horse-battery-staple-9",
    name: "Head Coach",
    role: "coach",
    dateOfBirth: "1985-04-02",
    agreedToTerms: true,
    expectedAthletes: 34,
    ...over,
  };
}

function athleteSignupBody(over: Record<string, unknown> = {}) {
  return {
    email: `athlete-${Math.random().toString(36).slice(2)}@example.test`,
    password: "correct-horse-battery-staple-9",
    name: "Adult Athlete",
    role: "athlete",
    dateOfBirth: "1995-06-15",
    sport: "Football",
    position: "WR",
    heightIn: 72,
    bodyWeightLbs: 190,
    agreedToTerms: true,
    ...over,
  };
}

async function userByEmail(email: string) {
  return db.query.users.findFirst({ where: eq(users.email, email) });
}

async function subscriptionFor(userId: number) {
  return db.query.subscriptions.findFirst({ where: eq(subscriptions.userId, userId) });
}

const DAY = 24 * 60 * 60 * 1000;

describe("a launch code is thirty days from the signup", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    await storage.createRedeemCode({ code: "LAUNCH30", trialDays: 30 });
  });

  it("a Free Agent who types the code at signup is on a trial that ends a calendar month after the account was made", async () => {
    const body = athleteSignupBody({ promoCode: "launch30" });
    const res = await new TestClient(server.baseUrl).post("/api/auth/signup", body);
    expect(res.status).toBe(201);
    const user = await userByEmail(body.email);
    expect(user).toBeDefined();
    const expected = promoTrialEndFromSignup(user!.createdAt, 30);
    expect(res.body.promoTrialEndsAt).toBe(expected.toISOString());
    expect(res.body.promoCodeMessage).toContain("free through");

    const sub = await subscriptionFor(user!.id);
    expect(sub?.accountType).toBe("free_agent");
    expect(sub?.status).toBe("trialing");
    expect(sub?.trialEndsAt?.toISOString()).toBe(expected.toISOString());
    // A calendar month, not the 14-day signup trial and not 30 x 24h: at least 28 days out.
    expect(sub!.trialEndsAt!.getTime() - user!.createdAt.getTime()).toBeGreaterThanOrEqual(28 * DAY);
    expect(await db.query.redeemCodeRedemptions.findFirst({
      where: eq(redeemCodeRedemptions.coachId, user!.id),
    })).toBeDefined();
  });

  it("a head coach who types the code at signup has the program's trial through the same date, and the entitlements read it", async () => {
    const body = coachSignupBody({ promoCode: "LAUNCH30" });
    const client = new TestClient(server.baseUrl);
    const res = await client.post("/api/auth/signup", body);
    expect(res.status).toBe(201);
    const user = await userByEmail(body.email);
    const expected = promoTrialEndFromSignup(user!.createdAt, 30);
    expect(user!.trialExpiresAt?.toISOString()).toBe(expected.toISOString());
    expect(res.body.promoTrialEndsAt).toBe(expected.toISOString());

    // Enforcement is on in this suite and the coach has no tier, so these are the trial's doing.
    const ent = await client.get("/api/coach/entitlements");
    expect(ent.status).toBe(200);
    expect(ent.body.hasMultiTeam).toBe(true);
    expect(ent.body.hasCoachesCorner).toBe(true);
  });

  it("a coach who signs up WITHOUT the code has no such access, which is what the code buys", async () => {
    const client = new TestClient(server.baseUrl);
    const res = await client.post("/api/auth/signup", coachSignupBody());
    expect(res.status).toBe(201);
    expect(res.body.promoTrialEndsAt).toBeUndefined();
    const ent = await client.get("/api/coach/entitlements");
    expect(ent.body.hasMultiTeam).toBe(false);
  });

  it("the window is anchored to the signup: typed a week later, the trial ends on the same date as typed at signup", async () => {
    const athlete = await makeLoginableUser({
      role: "athlete",
      isBetaAccount: false,
      createdAt: new Date(Date.now() - 7 * DAY),
    });
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.post("/api/athlete/redeem-code", { code: "launch30" });
    expect(res.status).toBe(200);
    const expected = promoTrialEndFromSignup(athlete.createdAt, 30);
    expect(res.body.trialExpiresAt).toBe(expected.toISOString());
    const sub = await subscriptionFor(athlete.id);
    expect(sub?.status).toBe("trialing");
    expect(sub?.trialEndsAt?.toISOString()).toBe(expected.toISOString());
    // And the page can show it.
    const ent = await client.get("/api/athlete/entitlements");
    expect(ent.body.trialEndsAt).toBe(expected.toISOString());
  });

  it("a code typed after the window has closed unlocks nothing and says why", async () => {
    const athlete = await makeLoginableUser({
      role: "athlete",
      isBetaAccount: false,
      createdAt: new Date(Date.now() - 45 * DAY),
    });
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.post("/api/athlete/redeem-code", { code: "LAUNCH30" });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("30 days from the day you signed up");
    expect(await subscriptionFor(athlete.id)).toBeUndefined();
    expect(await db.query.redeemCodeRedemptions.findFirst({
      where: eq(redeemCodeRedemptions.coachId, athlete.id),
    })).toBeUndefined();
  });

  it("a mistyped code at signup is a 400 and NO account is created", async () => {
    const body = athleteSignupBody({ promoCode: "NOPE30" });
    const res = await new TestClient(server.baseUrl).post("/api/auth/signup", body);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("That code isn't valid");
    expect(await userByEmail(body.email)).toBeUndefined();
  });

  it("a code is refused at signup once its redemptions are spent, before any account exists", async () => {
    await storage.createRedeemCode({ code: "ONEONLY", trialDays: 30, maxRedemptions: 1 });
    const first = await new TestClient(server.baseUrl).post(
      "/api/auth/signup",
      athleteSignupBody({ promoCode: "ONEONLY" }),
    );
    expect(first.status).toBe(201);
    const body = athleteSignupBody({ promoCode: "ONEONLY" });
    const second = await new TestClient(server.baseUrl).post("/api/auth/signup", body);
    expect(second.status).toBe(400);
    expect(second.body.message).toBe("That code has reached its redemption limit");
    expect(await userByEmail(body.email)).toBeUndefined();
  });

  it("an athlete joining under a coach's code is refused the promo at signup: the program is their plan", async () => {
    const coach = await makeLoginableUser({ role: "coach", coachCode: "HEADC1" });
    const body = athleteSignupBody({ promoCode: "LAUNCH30", coachCode: coach.coachCode! });
    const res = await new TestClient(server.baseUrl).post("/api/auth/signup", body);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Your coach's program covers your plan");
    expect(await userByEmail(body.email)).toBeUndefined();
  });

  it("a coached athlete cannot redeem later either, and a staff coach is pointed at the head coach", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
    await addToRoster(coach.id, athlete.id);
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.post("/api/athlete/redeem-code", { code: "LAUNCH30" });
    // requireFreeAgent answers before the code is ever read.
    expect([400, 403]).toContain(res.status);
    expect(await subscriptionFor(athlete.id)).toBeUndefined();

    const staff = await makeLoginableUser({ role: "coach", isBetaAccount: false });
    const verdict = await redeemPromoCode(staff.id, "LAUNCH30");
    // Not on anybody's staff, so primary of their own program: redeemable. The staff refusal
    // itself is the route's requirePrimaryCoach, exercised by plan-at-signup.itest.ts.
    expect(verdict.ok).toBe(true);
  });

  it("the same code cannot be redeemed twice by one account, and a second code cannot push the end past what the signup date gives", async () => {
    await storage.createRedeemCode({ code: "ALSO30", trialDays: 30 });
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
    const client = await loginAs(server.baseUrl, athlete);
    expect((await client.post("/api/athlete/redeem-code", { code: "LAUNCH30" })).status).toBe(200);
    const again = await client.post("/api/athlete/redeem-code", { code: "LAUNCH30" });
    expect(again.status).toBe(400);
    expect(again.body.message).toBe("You've already redeemed this code");
    const other = await client.post("/api/athlete/redeem-code", { code: "ALSO30" });
    expect(other.status).toBe(200);
    expect(other.body.trialExpiresAt).toBe(promoTrialEndFromSignup(athlete.createdAt, 30).toISOString());
  });

  it("a Free Agent paying by card is never flipped onto a trial: the free month is a coupon on the card plan, or nothing", async () => {
    // With no Stripe configured in this suite the code has no coupon, so the honest answer is
    // that the card plan cannot be discounted yet -- never a trialing row over a live plan, and
    // never a spent redemption. The coupon branch itself is driven in promo-codes.test.ts.
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false, freeAgentTier: "basic" });
    await storage.upsertSubscriptionByUserId(athlete.id, {
      accountType: "free_agent",
      tier: "base",
      status: "active",
      stripeSubscriptionId: "sub_live_123",
    });
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.post("/api/athlete/redeem-code", { code: "LAUNCH30" });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("card billing");
    expect((await subscriptionFor(athlete.id))?.status).toBe("active");
    expect(await db.query.redeemCodeRedemptions.findFirst({ where: eq(redeemCodeRedemptions.coachId, athlete.id) })).toBeUndefined();
  });

  it("an EVERYONE free-time code counts from the redemption, so an old account gets its month too", async () => {
    await storage.createRedeemCode({ code: "XMAS30", trialDays: 30, audience: "everyone" });
    const athlete = await makeLoginableUser({
      role: "athlete",
      isBetaAccount: false,
      createdAt: new Date(Date.now() - 400 * DAY),
    });
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.post("/api/athlete/redeem-code", { code: "xmas30" });
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe("trial");
    const end = new Date(res.body.trialExpiresAt);
    // A calendar month from now, not from a signup four hundred days ago.
    expect(end.getTime() - Date.now()).toBeGreaterThan(27 * DAY);
    expect(end.getTime() - Date.now()).toBeLessThan(32 * DAY);
    expect((await subscriptionFor(athlete.id))?.trialEndsAt?.toISOString()).toBe(end.toISOString());
    expect(res.body.message).toContain("free through");
  });

  it("an EVERYONE free-time code on a head coach moves the program's trial from today", async () => {
    await storage.createRedeemCode({ code: "XMAS30", trialDays: 30, audience: "everyone" });
    const coach = await makeLoginableUser({
      role: "coach",
      isBetaAccount: false,
      createdAt: new Date(Date.now() - 200 * DAY),
    });
    const client = await loginAs(server.baseUrl, coach);
    const res = await client.post("/api/coach/redeem-code", { code: "XMAS30" });
    expect(res.status).toBe(200);
    const row = await db.query.users.findFirst({ where: eq(users.id, coach.id) });
    expect(row!.trialExpiresAt!.getTime() - Date.now()).toBeGreaterThan(27 * DAY);
    const ent = await client.get("/api/coach/entitlements");
    expect(ent.body.hasMultiTeam).toBe(true);
  });

  it("a percent-off code on an account with no card plan says to type it at checkout, and spends nothing", async () => {
    await storage.createRedeemCode({ code: "JULY50", kind: "percent_off", percentOff: 50, discountMonths: 1, audience: "everyone", maxRedemptions: 1 });
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.post("/api/athlete/redeem-code", { code: "JULY50" });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("50% off");
    expect(res.body.message).toContain("checkout");
    expect(await db.query.redeemCodeRedemptions.findFirst({ where: eq(redeemCodeRedemptions.coachId, athlete.id) })).toBeUndefined();
    // Not spent: the one redemption is still available.
    const again = await storage.findRedeemableCode("JULY50");
    expect(again.ok).toBe(true);
  });

  it("a new-accounts percent-off code is refused on an account past its first thirty days", async () => {
    await storage.createRedeemCode({ code: "NEW50", kind: "percent_off", percentOff: 50, audience: "new_accounts" });
    const athlete = await makeLoginableUser({
      role: "athlete",
      isBetaAccount: false,
      createdAt: new Date(Date.now() - 45 * DAY),
    });
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.post("/api/athlete/redeem-code", { code: "NEW50" });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("first 30 days");
  });

  it("any code on a plan billed through the App Store says to use the App Store sheet, and spends nothing", async () => {
    await storage.createRedeemCode({ code: "XMAS30", trialDays: 30, audience: "everyone" });
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false, freeAgentTier: "basic" });
    await storage.upsertSubscriptionByUserId(athlete.id, {
      accountType: "free_agent",
      tier: "base",
      status: "active",
      appleOriginalTransactionId: "2000000123",
    });
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.post("/api/athlete/redeem-code", { code: "XMAS30" });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("App Store");
    expect(await db.query.redeemCodeRedemptions.findFirst({ where: eq(redeemCodeRedemptions.coachId, athlete.id) })).toBeUndefined();
  });

  it("the admin's list says what each code gives and to whom", async () => {
    await storage.createRedeemCode({ code: "JULY50", kind: "percent_off", percentOff: 50, discountMonths: 2, audience: "everyone" });
    const rows = await storage.listRedeemCodes();
    const july = rows.find((r) => r.code === "JULY50")!;
    expect(july.kind).toBe("percent_off");
    expect(july.audience).toBe("everyone");
    expect(july.percentOff).toBe(50);
    expect(july.discountMonths).toBe(2);
    expect(july.trialDays).toBe(0);
    const launch = rows.find((r) => r.code === "LAUNCH30")!;
    expect(launch.kind).toBe("free_time");
    expect(launch.audience).toBe("new_accounts");
  });
});
