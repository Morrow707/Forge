import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDatabase, db } from "./test-support/fixtures";
import { subscriptions, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { startTestServer, makeLoginableUser, loginAs, type TestClient, type TestServer } from "./test-support/http-app";
import { storage } from "./storage";
import { appleProductIdForFreeAgentTier, appleProductIdForFreeAgentAddOn } from "@shared/free-agent-tiers";

/**
 * WHAT A VERIFIED APPLE RECEIPT GRANTS, on a real database.
 *
 * The first sandbox purchase (2026-10-05, build 611, read off the debug console):
 *   server verify refused ...freeagent.basic_v2: 422 No subscription found for this account.
 * Apple had confirmed the purchase; Forge's updateSubscriptionByUserId updated a row the
 * athlete never had. Behind that sat a second gap nobody could reach: the Apple path wrote the
 * subscriptions row only, and the entitlements read users.freeAgentTier, so even a successful
 * verify would have granted nothing. Both are pinned here, through the storage call the verify
 * route makes and then through the route the phone asks.
 */
let server: TestServer;
let athlete: Awaited<ReturnType<typeof makeLoginableUser>>;
let asAthlete: TestClient;

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
  // Beta off and no trial: the only account whose entitlements the purchase decides.
  athlete = await makeLoginableUser({ role: "athlete", name: "Sandbox Buyer", isBetaAccount: false, trialExpiresAt: null });
  asAthlete = await loginAs(server.baseUrl, athlete);
});

afterAll(async () => {
  await server?.close();
});

const inAMonth = () => new Date(Date.now() + 30 * 24 * 3600 * 1000);

describe("a Free Agent with no subscriptions row buys a tier at Apple", () => {
  it("has no row to begin with", async () => {
    expect(await storage.getSubscriptionForUser(athlete.id)).toBeUndefined();
    expect((await storage.getFreeAgentBillingAccount(athlete.id))?.freeAgentTier ?? null).toBeNull();
  });

  it("is granted the tier: the row is created and the SKU the entitlements read is written", async () => {
    const result = await storage.applyAppleIapVerification(athlete.id, {
      originalTransactionId: "2000001246142047",
      productId: appleProductIdForFreeAgentTier("ai_coach_video"),
      expiresAt: inAMonth(),
      environment: "Sandbox",
    });
    expect(result).toEqual({ ok: true });

    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, athlete.id));
    expect(row.status).toBe("active");
    expect(row.accountType).toBe("free_agent");
    expect(row.appleOriginalTransactionId).toBe("2000001246142047");

    const [user] = await db.select({ tier: users.freeAgentTier }).from(users).where(eq(users.id, athlete.id));
    expect(user.tier).toBe("ai_coach_video");
    // The route the phone asks answers through the same column. (Camera access itself is
    // decided under BILLING_LIVE, which the harness leaves off, so the SKU is what is pinned.)
    const res = await asAthlete.get("/api/athlete/entitlements");
    expect(res.status).toBe(200);
  });

  it("a second receipt for another tier replaces the first (one row, the new SKU)", async () => {
    const result = await storage.applyAppleIapVerification(athlete.id, {
      originalTransactionId: "2000001246142047",
      productId: appleProductIdForFreeAgentTier("basic"),
      expiresAt: inAMonth(),
      environment: "Sandbox",
    });
    expect(result).toEqual({ ok: true });
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, athlete.id));
    expect(rows).toHaveLength(1);
    const [user] = await db.select({ tier: users.freeAgentTier }).from(users).where(eq(users.id, athlete.id));
    expect(user.tier).toBe("basic");
  });

  it("an add-on receipt appends to the add-ons and leaves the tier alone", async () => {
    const result = await storage.applyAppleIapVerification(athlete.id, {
      originalTransactionId: "2000001246142099",
      productId: appleProductIdForFreeAgentAddOn("all_classes"),
      expiresAt: inAMonth(),
      environment: "Sandbox",
    });
    expect(result).toEqual({ ok: true });
    const [user] = await db
      .select({ tier: users.freeAgentTier, addOns: users.freeAgentAddOns })
      .from(users)
      .where(eq(users.id, athlete.id));
    expect(user.tier).toBe("basic");
    expect(user.addOns).toContain("all_classes");
  });

  it("a renewal that carries a different product moves the SKU with it", async () => {
    const result = await storage.applyAppleServerNotification({
      kind: "renewed",
      notificationType: "DID_RENEW",
      transaction: {
        originalTransactionId: "2000001246142047",
        productId: appleProductIdForFreeAgentTier("ai_coach"),
        expiresAt: inAMonth(),
      },
    } as any);
    expect(result).toEqual({ ok: true });
    const [user] = await db.select({ tier: users.freeAgentTier }).from(users).where(eq(users.id, athlete.id));
    expect(user.tier).toBe("ai_coach");
  });
});
