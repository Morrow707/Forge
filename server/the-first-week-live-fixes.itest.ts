/**
 * 2026-11-13, the week 1.0 went live. Two of Scott's five first-week fixes, on real Postgres
 * through the real routes:
 *
 *   - "I need a way as an admin to post and unpost workouts so only the admin can see."
 *   - "show them the receipt ... if they do have a coupon code the checkout receipt should
 *      change to reflect that it will in fact be $0."
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { programs, users } from "@shared/schema";
import { storage } from "./storage";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

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

const EMPTY_PROGRAM = { name: "Lower body camera", description: null, blocks: [], weeks: [] };

describe("an admin posts and unposts their own programs", () => {
  it("a new admin program is the admin's alone until posted, then everyone's, then theirs again", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const coach = await makeLoginableUser({ role: "coach" });
    const freeAgent = await makeLoginableUser({ role: "athlete", dateOfBirth: "1990-01-01" });
    const adminClient = await loginAs(server.baseUrl, admin);
    const coachClient = await loginAs(server.baseUrl, coach);
    const faClient = await loginAs(server.baseUrl, freeAgent);

    const created = await adminClient.post("/api/admin/programs", EMPTY_PROGRAM);
    expect(created.status).toBe(201);
    const id = created.body.id as number;

    const names = async (client: typeof coachClient, path: string) =>
      ((await client.get(path)).body as { id: number }[]).map((p) => p.id);

    // Unposted: the admin sees it, nobody else can list it, open it or use it.
    expect(await names(adminClient, "/api/admin/programs")).toContain(id);
    expect(await names(coachClient, "/api/coach/programs")).not.toContain(id);
    expect(await names(faClient, "/api/athlete/programs")).not.toContain(id);
    expect((await coachClient.get(`/api/coach/programs/${id}`)).status).toBe(404);
    expect((await faClient.get(`/api/athlete/programs/${id}`)).status).toBe(404);
    expect((await coachClient.get(`/api/coach/programs/${id}/day-groups`)).status).toBe(404);

    // Posted: everybody sees it as a Forge program.
    const posted = await adminClient.post(`/api/admin/programs/${id}/published`, { published: true });
    expect(posted.body).toEqual({ id, isPublished: true });
    expect(await names(coachClient, "/api/coach/programs")).toContain(id);
    expect(await names(faClient, "/api/athlete/programs")).toContain(id);
    expect((await faClient.get(`/api/athlete/programs/${id}`)).status).toBe(200);

    // Unposted again.
    await adminClient.post(`/api/admin/programs/${id}/published`, { published: false });
    expect(await names(faClient, "/api/athlete/programs")).not.toContain(id);
    expect((await faClient.get(`/api/athlete/programs/${id}`)).status).toBe(404);
    expect((await adminClient.get("/api/admin/programs")).body.find((p: { id: number }) => p.id === id).isPublished).toBe(false);
  });

  it("only an admin, and only the program's own author, can post it", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const coach = await makeLoginableUser({ role: "coach" });
    const [own] = await db.insert(programs).values({ coachId: coach.id, name: "Coach's own" }).returning();
    const [adminsProgram] = await db.insert(programs).values({ coachId: admin.id, name: "Kim's workout", isPublished: false }).returning();
    const coachClient = await loginAs(server.baseUrl, coach);
    expect((await coachClient.post(`/api/admin/programs/${adminsProgram.id}/published`, { published: true })).status).toBe(403);
    const adminClient = await loginAs(server.baseUrl, admin);
    expect((await adminClient.post(`/api/admin/programs/${own.id}/published`, { published: true })).status).toBe(404);
    const [row] = await db.select().from(programs).where(eq(programs.id, adminsProgram.id));
    expect(row.isPublished).toBe(false);
  });

  it("a coach's own program is never hidden from the coach by the flag", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const [own] = await db.insert(programs).values({ coachId: coach.id, name: "Mine", isPublished: false }).returning();
    const client = await loginAs(server.baseUrl, coach);
    expect(((await client.get("/api/coach/programs")).body as { id: number }[]).map((p) => p.id)).toContain(own.id);
  });
});

describe("the receipt before checkout", () => {
  async function freeAgentClient(overrides: Record<string, unknown> = {}) {
    const fa = await makeLoginableUser({ role: "athlete", dateOfBirth: "1990-01-01", ...overrides });
    return { fa, client: await loginAs(server.baseUrl, fa) };
  }

  it("reads as normal with no code", async () => {
    const { client } = await freeAgentClient();
    const res = await client.post("/api/billing/checkout/free-agent-tier/preview", { tier: "basic" });
    expect(res.status).toBe(200);
    expect(res.body.codeAccepted).toBe(false);
    expect(res.body.receipt.dueTodayCents).toBe(res.body.receipt.monthlyPriceCents);
    expect(res.body.receipt.monthlyPriceCents).toBeGreaterThan(0);
  });

  it("a 30-day code makes today's total $0; 90 days is three free bills; half off is half", async () => {
    await storage.createRedeemCode({ code: "FREE30", trialDays: 30 }, { couponId: "coupon_30", promotionCodeId: null });
    await storage.createRedeemCode({ code: "FREE90", trialDays: 90 }, { couponId: "coupon_90", promotionCodeId: null });
    await storage.createRedeemCode(
      { code: "HALF3", kind: "percent_off", percentOff: 50, discountMonths: 3, audience: "everyone" },
      { couponId: "coupon_half", promotionCodeId: null },
    );
    const { client } = await freeAgentClient();
    const p = (promoCode: string) => client.post("/api/billing/checkout/free-agent-tier/preview", { tier: "ai_coach_video", promoCode });

    const thirty = (await p("free30")).body;
    expect(thirty.codeAccepted).toBe(true);
    expect(thirty.receipt.dueTodayCents).toBe(0);
    expect(thirty.receipt.fullPriceStartsAfterMonths).toBe(1);

    const ninety = (await p("FREE90")).body;
    expect(ninety.receipt.dueTodayCents).toBe(0);
    expect(ninety.receipt.fullPriceStartsAfterMonths).toBe(3);

    const half = (await p("HALF3")).body;
    expect(half.receipt.dueTodayCents).toBe(half.receipt.monthlyPriceCents - Math.round(half.receipt.monthlyPriceCents / 2));
    expect(half.receipt.fullPriceStartsAfterMonths).toBe(3);
  });

  it("a code that cannot be used leaves the receipt at full price and says why", async () => {
    await storage.createRedeemCode({ code: "NOSTRIPE", trialDays: 30 });
    await storage.createRedeemCode({ code: "USED", trialDays: 30 }, { couponId: "c", promotionCodeId: null });
    const { fa, client } = await freeAgentClient();
    const used = await storage.findRedeemableCode("USED");
    if (used.ok) await storage.recordCodeRedemption(fa.id, used.record.id);
    for (const [code, words] of [
      ["TYPO", /isn't valid/],
      ["NOSTRIPE", /isn't set up for card checkout/],
      ["USED", /already used/],
    ] as const) {
      const body = (await client.post("/api/billing/checkout/free-agent-tier/preview", { tier: "basic", promoCode: code })).body;
      expect(body.codeAccepted).toBe(false);
      expect(body.codeMessage).toMatch(words);
      expect(body.receipt.dueTodayCents).toBe(body.receipt.monthlyPriceCents);
    }
    // And the checkout itself refuses a bad code rather than charging full price silently.
    const checkout = await client.post("/api/billing/checkout/free-agent-tier", { tier: "basic", promoCode: "TYPO" });
    expect(checkout.status).toBe(400);
  });

  it("a new-account code is refused on an account past its window", async () => {
    await storage.createRedeemCode({ code: "NEW30", trialDays: 30 }, { couponId: "c", promotionCodeId: null });
    const { fa, client } = await freeAgentClient();
    await db.update(users).set({ createdAt: new Date(Date.now() - 45 * 86400000) }).where(eq(users.id, fa.id));
    const body = (await client.post("/api/billing/checkout/free-agent-tier/preview", { tier: "basic", promoCode: "NEW30" })).body;
    expect(body.codeAccepted).toBe(false);
    expect(body.codeMessage).toMatch(/first 30 days/);
  });

  it("a code locked to a plan works on that plan and is refused on the others, with the plan named", async () => {
    await storage.createRedeemCode({ code: "BASICONLY", trialDays: 30, appliesTo: "basic" }, { couponId: "c_basic", promotionCodeId: null });
    await storage.createRedeemCode({ code: "COACHONLY", trialDays: 90, appliesTo: "coach" }, { couponId: "c_coach", promotionCodeId: null });
    await storage.createRedeemCode({ code: "ANYPLAN", trialDays: 30 }, { couponId: "c_any", promotionCodeId: null });
    const { client } = await freeAgentClient();
    const p = (tier: string, promoCode: string) =>
      client.post("/api/billing/checkout/free-agent-tier/preview", { tier, promoCode });

    const right = (await p("basic", "BASICONLY")).body;
    expect(right.codeAccepted).toBe(true);
    expect(right.receipt.dueTodayCents).toBe(0);

    for (const tier of ["ai_coach", "ai_coach_video"]) {
      const wrong = (await p(tier, "BASICONLY")).body;
      expect(wrong.codeAccepted).toBe(false);
      expect(wrong.codeMessage).toMatch(/Basic plan/);
      expect(wrong.receipt.dueTodayCents).toBe(wrong.receipt.monthlyPriceCents);
      // The charge route refuses it too: the preview is a picture, this is the money.
      expect((await client.post("/api/billing/checkout/free-agent-tier", { tier, promoCode: "BASICONLY" })).status).toBe(400);
    }

    // A coach code gives a Free Agent nothing on any plan.
    for (const tier of ["basic", "ai_coach", "ai_coach_video"]) {
      const coachCode = (await p(tier, "COACHONLY")).body;
      expect(coachCode.codeAccepted).toBe(false);
      expect(coachCode.codeMessage).toMatch(/coach accounts/);
    }

    // An unlocked code still works everywhere.
    for (const tier of ["basic", "ai_coach", "ai_coach_video"]) {
      expect((await p(tier, "ANYPLAN")).body.codeAccepted).toBe(true);
    }
  });

  it("a plan-locked code is never turned into free time with no plan behind it, and a coach code is the coach's alone", async () => {
    await storage.createRedeemCode({ code: "BASICONLY", trialDays: 30, appliesTo: "basic" }, { couponId: "c_basic", promotionCodeId: null });
    await storage.createRedeemCode({ code: "COACHONLY", trialDays: 90, appliesTo: "coach" });
    const { fa, client } = await freeAgentClient();

    const locked = await client.post("/api/athlete/redeem-code", { code: "BASICONLY" });
    expect(locked.status).toBeGreaterThanOrEqual(400);
    expect(locked.body.message).toMatch(/Basic plan/);
    const coachs = await client.post("/api/athlete/redeem-code", { code: "COACHONLY" });
    expect(coachs.body.message).toMatch(/coach accounts/);
    // Nothing was spent by either refusal.
    const basic = await storage.findRedeemableCode("BASICONLY");
    if (basic.ok) expect(await storage.hasRedeemedCode(fa.id, basic.record.id)).toBe(false);

    // The coach it is for gets its three months.
    const { redeemPromoCode } = await import("./promo-codes");
    const coach = await makeLoginableUser({ role: "coach", isBetaAccount: false });
    const given = await redeemPromoCode(coach.id, "COACHONLY");
    expect(given.ok).toBe(true);
    // And a coach cannot take an athlete plan's code.
    const taken = await redeemPromoCode(coach.id, "BASICONLY");
    expect(taken.ok).toBe(false);
  });

  it("the admin form's plan must be a real one", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const adminClient = await loginAs(server.baseUrl, admin);
    const bad = await adminClient.post("/api/admin/redeem-codes", { code: "NOPE30", trialDays: 30, appliesTo: "platinum" });
    expect(bad.status).toBe(400);
    const good = await adminClient.post("/api/admin/redeem-codes", { code: "AIONLY30", trialDays: 30, appliesTo: "ai_coach" });
    expect(good.status).toBe(201);
    expect(good.body.appliesTo).toBe("ai_coach");
    const listed = (await adminClient.get("/api/admin/redeem-codes")).body.find((c: { code: string }) => c.code === "AIONLY30");
    expect(listed.appliesTo).toBe("ai_coach");

    // AN ADMIN ENDS A CODE (in this case so the file stays inside the login limiter's budget):
    // nobody new can use it, the row stays listed, and ending it twice changes nothing.
    const live = await storage.createRedeemCode({ code: "ENDME30", trialDays: 30 }, { couponId: "coupon_end", promotionCodeId: null });
    const { checkoutCodeFor } = await import("./promo-codes");
    const fa = await makeLoginableUser({ role: "athlete", dateOfBirth: "1990-01-01" });
    expect((await checkoutCodeFor(fa.id, "ENDME30", "basic", new Date())).ok).toBe(true);
    const ended = await adminClient.post(`/api/admin/redeem-codes/${live.id}/end`, {});
    expect(ended.status).toBe(200);
    expect(new Date(ended.body.expiresAt).getTime()).toBeLessThanOrEqual(Date.now());
    const refused = await checkoutCodeFor(fa.id, "ENDME30", "basic", new Date());
    expect(refused.ok).toBe(false);
    expect(JSON.stringify(refused)).toMatch(/expired/i);
    const again = await adminClient.post(`/api/admin/redeem-codes/${live.id}/end`, {});
    expect(again.body.expiresAt).toBe(ended.body.expiresAt);
    expect((await adminClient.get("/api/admin/redeem-codes")).body.some((c: { code: string }) => c.code === "ENDME30")).toBe(true);
    expect((await adminClient.post("/api/admin/redeem-codes/999999/end", {})).status).toBe(404);
  });

  it("a coached athlete has no receipt: their plan is the program's", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const { fa, client } = await freeAgentClient();
    await storage.linkAthleteToCoach(coach.id, fa.id);
    expect((await client.post("/api/billing/checkout/free-agent-tier/preview", { tier: "basic" })).status).not.toBe(200);
  });
});
