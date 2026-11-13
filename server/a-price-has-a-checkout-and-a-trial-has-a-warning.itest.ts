/**
 * 2026-11-13, the second half of the plan work, on real Postgres.
 *
 *  - Extra video storage and Full Personalization had a price and no checkout. Both are for sale:
 *    a purchase raises the video limits exactly as the admin's tick does, and the coach checkout
 *    accepts the two new ids.
 *  - An account whose trial is about to end is written to once per end date, and only if the plan
 *    wall would actually stop it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { subscriptions, users } from "@shared/schema";
import { BILLING_TIER_ORDER, COACH_PURCHASABLE_ADD_ON_ORDER } from "@shared/billing-tiers";
import { VIDEO_RETENTION, VIDEO_STORAGE_ADD_ON } from "@shared/video-retention";
import { getVideoRetentionLimits } from "./billing";
import { testOutbox } from "./email";
import { storage } from "./storage";
import { runTrialEndingNotices } from "./trial-ending-job";
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
  testOutbox.length = 0;
});

const DAY = 24 * 60 * 60 * 1000;
const adult = { dateOfBirth: "1990-01-01" };
async function limitsFor(userId: number) {
  const row = (await storage.getUser(userId))!;
  return getVideoRetentionLimits({
    hasVideoStorageAddOn: row.hasVideoStorageAddOn,
    freeAgentAddOns: row.freeAgentAddOns,
    billingAddOns: row.billingAddOns,
    addOnTerms: row.addOnTerms as never,
    isBetaAccount: row.isBetaAccount,
    trialExpiresAt: row.trialExpiresAt,
    dateOfBirth: row.dateOfBirth,
  });
}
async function trialEndingIn(userId: number, accountType: "free_agent" | "coach", days: number) {
  await storage.createTrialSubscription(userId, accountType);
  const endsAt = new Date(Date.now() + days * DAY);
  await db.update(subscriptions).set({ trialEndsAt: endsAt }).where(eq(subscriptions.userId, userId));
  return endsAt;
}
const mailTo = (email: string) => testOutbox.filter((m) => m.to === email);

describe("extra video storage can be bought", () => {
  it("a Free Agent's purchase raises the limits, and the app is told", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false, ...adult });
    await storage.updateFreeAgentBilling(athlete.id, { freeAgentTier: "ai_coach_video" });
    expect((await limitsFor(athlete.id)).totalCap).toBe(VIDEO_RETENTION.totalCap);
    const client = await loginAs(server.baseUrl, athlete);
    expect((await client.get("/api/athlete/entitlements")).body.extraVideoStorage).toBe(false);

    await storage.addFreeAgentAddOn(athlete.id, "video_storage", { stripeSubscriptionId: "sub_storage" });
    expect(await limitsFor(athlete.id)).toEqual(VIDEO_STORAGE_ADD_ON);
    const after = (await client.get("/api/athlete/entitlements")).body;
    expect(after.extraVideoStorage).toBe(true);
    expect(after.ownedAddOns.video_storage).toBe(true);
  });

  it("a refund ends what was bought and leaves an admin's tick alone", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false, ...adult });
    await storage.addFreeAgentAddOn(athlete.id, "video_storage", { stripeSubscriptionId: "sub_storage" });
    await storage.revokeAddOnAfterRefund(athlete.id, "video_storage");
    expect((await limitsFor(athlete.id)).totalCap).toBe(VIDEO_RETENTION.totalCap);
    await db.update(users).set({ hasVideoStorageAddOn: true }).where(eq(users.id, athlete.id));
    expect(await limitsFor(athlete.id)).toEqual(VIDEO_STORAGE_ADD_ON);
  });

  it("a coach's purchase covers the coach's own clips, under its own id", async () => {
    const coach = await makeLoginableUser({ role: "coach", isBetaAccount: false, ...adult });
    await storage.addCoachBillingAddOn(coach.id, "coach_video_storage", { stripeSubscriptionId: "sub_cs" });
    expect(await limitsFor(coach.id)).toEqual(VIDEO_STORAGE_ADD_ON);
  });
});

describe("the coach add-ons with a price are all for sale", () => {
  it("lists Full Personalization, Coaches Corner and storage, each with whether it is owned", async () => {
    const coach = await makeLoginableUser({ role: "coach", isBetaAccount: false, ...adult });
    await db.update(users).set({ billingTier: BILLING_TIER_ORDER[0] }).where(eq(users.id, coach.id));
    const client = await loginAs(server.baseUrl, coach);
    const before = (await client.get("/api/coach/entitlements")).body.purchasableAddOns;
    expect(before.map((a: { id: string }) => a.id)).toEqual(COACH_PURCHASABLE_ADD_ON_ORDER);
    for (const addOn of before) expect(addOn, addOn.id).toMatchObject({ unlocked: false, owned: false });

    await storage.addCoachBillingAddOn(coach.id, "full_bundle", { stripeSubscriptionId: "sub_fp" });
    const after = (await client.get("/api/coach/entitlements")).body.purchasableAddOns;
    expect(after.find((a: { id: string }) => a.id === "full_bundle")).toMatchObject({ unlocked: true, owned: true });
    expect(after.find((a: { id: string }) => a.id === "coaches_corner")).toMatchObject({ unlocked: false, owned: false });
  });

  it.each(["full_bundle", "coach_video_storage"])("the web checkout knows %s (it is no longer refused as not for sale)", async (addOnId) => {
    const coach = await makeLoginableUser({ role: "coach", isBetaAccount: false, ...adult });
    const client = await loginAs(server.baseUrl, coach);
    const res = await client.post("/api/billing/checkout/coach-add-on", { addOnId });
    // No Stripe in the test environment, so the furthest this can get is "billing is not set up".
    // What it must NOT be is the 400 an id outside the purchasable list gets.
    expect(res.status, JSON.stringify(res.body)).not.toBe(400);
    const stray = await client.post("/api/billing/checkout/coach-add-on", { addOnId: "custom_colors" });
    expect(stray.status).toBe(400);
  });
});

describe("the trial-ending email", () => {
  it("goes once to a Free Agent the wall would stop, with no link and no website in it", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false, ...adult });
    await trialEndingIn(athlete.id, "free_agent", 2);
    expect((await runTrialEndingNotices()).sent).toBe(1);
    const [mail] = mailTo(athlete.email);
    expect(mail.subject).toBe("Your Forge trial ends in a few days");
    expect(mail.html).toContain("pick a plan before then");
    expect(mail.html).not.toMatch(/href=|https?:\/\/|\.com/i);
    expect((await runTrialEndingNotices()).sent).toBe(0);
    expect(mailTo(athlete.email)).toHaveLength(1);
  });

  it("goes again when a code moves the end date, ahead of the new one", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false, ...adult });
    await trialEndingIn(athlete.id, "free_agent", 2);
    await runTrialEndingNotices();
    await db.update(subscriptions).set({ trialEndsAt: new Date(Date.now() + 30 * DAY) }).where(eq(subscriptions.userId, athlete.id));
    expect((await runTrialEndingNotices()).sent).toBe(0);
    expect((await runTrialEndingNotices(new Date(Date.now() + 28 * DAY))).sent).toBe(1);
    expect(mailTo(athlete.email)).toHaveLength(2);
  });

  it("is not sent early, to a comped account, to a plan holder, or to an athlete on a roster", async () => {
    const early = await makeLoginableUser({ role: "athlete", isBetaAccount: false, ...adult });
    await trialEndingIn(early.id, "free_agent", 9);
    const comped = await makeLoginableUser({ role: "athlete", isBetaAccount: true, ...adult });
    await trialEndingIn(comped.id, "free_agent", 2);
    const paying = await makeLoginableUser({ role: "athlete", isBetaAccount: false, ...adult });
    await storage.updateFreeAgentBilling(paying.id, { freeAgentTier: "basic" });
    await trialEndingIn(paying.id, "free_agent", 2);
    const coach = await makeLoginableUser({ role: "coach", isBetaAccount: true, ...adult });
    const coached = await makeLoginableUser({ role: "athlete", isBetaAccount: false, ...adult });
    await addToRoster(coach.id, coached.id);
    await trialEndingIn(coached.id, "free_agent", 2);
    expect((await runTrialEndingNotices()).sent).toBe(0);
    expect(testOutbox).toHaveLength(0);
  });

  it("tells a head coach with no plan, and not one who is paying", async () => {
    const unpaid = await makeLoginableUser({ role: "coach", isBetaAccount: false, ...adult });
    await trialEndingIn(unpaid.id, "coach", 1);
    const paid = await makeLoginableUser({ role: "coach", isBetaAccount: false, ...adult });
    await db.update(users).set({ billingTier: BILLING_TIER_ORDER[0] }).where(eq(users.id, paid.id));
    await trialEndingIn(paid.id, "coach", 1);
    expect((await runTrialEndingNotices()).sent).toBe(1);
    expect(mailTo(unpaid.email)[0].html).toContain("your program needs a plan before then");
    expect(mailTo(paid.email)).toHaveLength(0);
  });
});
