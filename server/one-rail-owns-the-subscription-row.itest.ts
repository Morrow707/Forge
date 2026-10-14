import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { billingAuditLog, subscriptions, users } from "@shared/schema";
import { appleProductIdForFreeAgentTier } from "@shared/free-agent-tiers";
import { db } from "./db";
import { storage } from "./storage";
import { handleStripeWebhookEvent } from "./billing";
import { resetDatabase } from "./test-support/fixtures";
import { makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/** THE CROSS-RAIL ROW, AGAINST REAL POSTGRES.
 *
 * The unit ratchet beside this file explains the defect and pins the Stripe webhook's half. This
 * drives the Apple half, which is two functions in storage.ts talking to the one row -- and the
 * claim worth proving is what the COLUMNS hold afterwards, which no mock can show.
 *
 * The server is started because resetDatabase and the schema reconciliation come with it; no
 * route is called here.
 */
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

const APPLE_BASIC = appleProductIdForFreeAgentTier("basic");
const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000);

async function rowOf(userId: number) {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  return row;
}
async function skuOf(userId: number) {
  const [row] = await db.select({ tier: users.freeAgentTier }).from(users).where(eq(users.id, userId));
  return row.tier;
}

/** A Free Agent paying Stripe for AI Coach + Video, which is the state the defect needed. */
async function stripePayingAthlete() {
  const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
  await storage.upsertSubscriptionByUserId(athlete.id, {
    accountType: "free_agent",
    tier: "pro",
    status: "active",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_old",
    currentPeriodEnd: inAnHour(),
  });
  await storage.updateFreeAgentBilling(athlete.id, { freeAgentTier: "ai_coach_video" });
  return athlete;
}

describe("an in-app purchase takes the row from Stripe", () => {
  it("clears the Stripe handle and hands its id back to be cancelled", async () => {
    const athlete = await stripePayingAthlete();
    const result = await storage.applyAppleIapVerification(athlete.id, {
      originalTransactionId: "2000000111",
      productId: APPLE_BASIC,
      expiresAt: inAnHour(),
      environment: "Sandbox",
    });
    expect(result.ok).toBe(true);
    expect((result as any).supersededStripeSubscriptionId).toBe("sub_old");

    const row = await rowOf(athlete.id);
    expect(row.appleOriginalTransactionId).toBe("2000000111");
    // The handle is gone, so the Apple expiry below cannot be read as ending a Stripe tier --
    // and the customer id STAYS, because it is how the billing portal is opened and it is not a
    // subscription.
    expect(row.stripeSubscriptionId).toBeNull();
    expect(row.stripeCustomerId).toBe("cus_1");
    expect(await skuOf(athlete.id)).toBe("basic");
  });

  it("hands nothing back when there was no Stripe subscription to supersede", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
    const result = await storage.applyAppleIapVerification(athlete.id, {
      originalTransactionId: "2000000222",
      productId: APPLE_BASIC,
      expiresAt: inAnHour(),
      environment: "Sandbox",
    });
    expect((result as any).supersededStripeSubscriptionId).toBeUndefined();
    expect((await rowOf(athlete.id)).stripeSubscriptionId).toBeNull();
  });
});

describe("an Apple expiry only ends what Apple was paying for", () => {
  const expiry = (originalTransactionId: string) =>
    ({
      kind: "revoked",
      notificationType: "EXPIRED",
      transaction: {
        originalTransactionId,
        productId: APPLE_BASIC,
        expiresAt: new Date(Date.now() - 1000),
        environment: "Sandbox",
      },
    }) as const;

  it("takes the SKU off an Apple-only account", async () => {
    // THE CONTROL. Without it, the case below passes against a branch that never clears.
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
    await storage.applyAppleIapVerification(athlete.id, {
      originalTransactionId: "2000000333",
      productId: APPLE_BASIC,
      expiresAt: inAnHour(),
      environment: "Sandbox",
    });
    expect(await skuOf(athlete.id)).toBe("basic");

    const res = await storage.applyAppleServerNotification(expiry("2000000333"));
    expect(res.ok).toBe(true);
    expect(await skuOf(athlete.id)).toBeNull();
  });

  it("leaves the SKU alone on a row that still carries a Stripe subscription", async () => {
    // The legacy cross-rail row: both handles on one row, which is what every account that
    // bought on both rails carried before the takeover rule above. The athlete is paying Stripe
    // for AI Coach + Video, and the expiry of their old App Store Basic must not touch it.
    const athlete = await stripePayingAthlete();
    await db
      .update(subscriptions)
      .set({ appleOriginalTransactionId: "2000000444" })
      .where(eq(subscriptions.userId, athlete.id));

    const res = await storage.applyAppleServerNotification(expiry("2000000444"));
    expect(res.ok).toBe(true);
    expect(await skuOf(athlete.id)).toBe("ai_coach_video");
  });
});

/** THE WEBHOOK AGAINST REAL POSTGRES, WHICH IS THE ONLY PLACE THE UNIQUE INDEX EXISTS.
 *
 * billing_audit_log.stripe_event_id is UNIQUE -- it is the idempotency check
 * handleStripeWebhookEvent makes before processing a delivery at all -- so a handler that writes
 * TWO rows carrying one delivery's id throws on the second insert, 500s the webhook and leaves
 * Stripe retrying a delivery that has already done half its work. Every unit test of this
 * handler mocks storage, where there is no constraint to violate, so that class of bug is
 * invisible to all of them. It was written and caught here, before it shipped, and
 * revokeEverythingForSubscription turned out to have been carrying the same latent violation
 * since it was written.
 */
describe("one delivery, one audit row with the event id", () => {
  it("records a cross-rail purchase without violating the unique event id", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
    await storage.upsertSubscriptionByUserId(athlete.id, {
      accountType: "free_agent",
      tier: "base",
      status: "active",
      appleOriginalTransactionId: "2000000999",
      currentPeriodEnd: inAnHour(),
    });

    const event = {
      id: "evt_cross_rail_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_cross_rail",
          client_reference_id: String(athlete.id),
          subscription: "sub_web_1",
          customer: "cus_cross",
          metadata: { kind: "free_agent_tier", tier: "ai_coach_video" },
        },
      },
    };
    // No STRIPE_SECRET_KEY in the integration env, so getStripeClient() is null and the
    // superseding cancel call is a no-op. The DB writes are what this is about.
    await handleStripeWebhookEvent(event as any);

    const row = await rowOf(athlete.id);
    expect(row.stripeSubscriptionId).toBe("sub_web_1");
    expect(row.appleOriginalTransactionId).toBeNull();
    expect(await skuOf(athlete.id)).toBe("ai_coach_video");

    const claimed = await db
      .select({ event: billingAuditLog.event })
      .from(billingAuditLog)
      .where(eq(billingAuditLog.stripeEventId, "evt_cross_rail_1"));
    expect(claimed).toHaveLength(1);
    // And the supplementary row is still there, findable by its own name.
    const all = await db
      .select({ event: billingAuditLog.event })
      .from(billingAuditLog)
      .where(eq(billingAuditLog.userId, athlete.id));
    expect(all.map((r) => r.event)).toContain("subscription.rail_changed");
  });
});

/** ONE APP STORE SUBSCRIPTION, SEVERAL FORGE ACCOUNTS -- AND THE REFUND REACHED ONE OF THEM.
 *
 * subscriptions.appleOriginalTransactionId carries no unique constraint (only userId does), and
 * a shared Apple ID or a restore onto a second account puts one transaction on two rows. That
 * state is detected and warned about rather than refused (accountsHoldingAppleTransaction, since
 * Apple has taken the money by the time the server is asked). But the notification handler took
 * `[row]` off an UPDATE ... RETURNING that cancelled every row, so a refund cleared the SKU on
 * whichever row Postgres returned first and the other account kept a free tier for good. The
 * renewal branch had the same shape in the other direction.
 */
describe("an Apple notification reaches every account holding the transaction", () => {
  async function twoAccountsSharing(transactionId: string) {
    const first = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
    const second = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
    for (const athlete of [first, second]) {
      await storage.upsertSubscriptionByUserId(athlete.id, {
        accountType: "free_agent",
        tier: "base",
        status: "active",
        appleOriginalTransactionId: transactionId,
        currentPeriodEnd: inAnHour(),
      });
      await storage.updateFreeAgentBilling(athlete.id, { freeAgentTier: "basic" });
    }
    return { first, second };
  }

  it("a refund clears the SKU on both, not just the first", async () => {
    const { first, second } = await twoAccountsSharing("2000000555");
    const res = await storage.applyAppleServerNotification({
      kind: "revoked",
      notificationType: "REFUND",
      transaction: {
        originalTransactionId: "2000000555",
        productId: APPLE_BASIC,
        expiresAt: new Date(Date.now() - 1000),
        environment: "Sandbox",
      },
    });
    expect(res.ok).toBe(true);
    expect(await skuOf(first.id)).toBeNull();
    expect(await skuOf(second.id)).toBeNull();
  });

  it("a renewal writes the SKU on both", async () => {
    const { first, second } = await twoAccountsSharing("2000000666");
    await storage.updateFreeAgentBilling(first.id, { freeAgentTier: null });
    await storage.updateFreeAgentBilling(second.id, { freeAgentTier: null });
    const res = await storage.applyAppleServerNotification({
      kind: "renewed",
      notificationType: "DID_RENEW",
      transaction: {
        originalTransactionId: "2000000666",
        productId: APPLE_BASIC,
        expiresAt: inAnHour(),
        environment: "Sandbox",
      },
    });
    expect(res.ok).toBe(true);
    expect(await skuOf(first.id)).toBe("basic");
    expect(await skuOf(second.id)).toBe("basic");
  });

  it("still refuses a transaction no account holds", async () => {
    // The control: held.length === 0 is the error the branch has always returned, and an
    // add-on-only transaction relies on it (its add-on is revoked before this point).
    const res = await storage.applyAppleServerNotification({
      kind: "revoked",
      notificationType: "EXPIRED",
      transaction: {
        originalTransactionId: "2000000777",
        productId: APPLE_BASIC,
        expiresAt: new Date(Date.now() - 1000),
        environment: "Sandbox",
      },
    });
    expect(res.ok).toBe(false);
  });
});
