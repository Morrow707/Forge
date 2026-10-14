import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { billingAuditLog, users } from "@shared/schema";
import { addOnIsActive } from "@shared/add-on-terms";
import { db } from "./db";
import { storage } from "./storage";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/** THE REAL ADMIN PANEL, GRANTING AN ADD-ON A REFUND HAD SWITCHED OFF FOR GOOD.
 *
 * The unit ratchet beside this file explains the defect and pins the rule. This drives the
 * route, because the claim worth proving is not "the helper returns the right map" but "the
 * athlete's own entitlements route answers true afterwards" -- and that answer passes through
 * the PATCH, a zod parse, two json columns and the gate, none of which the helper can see.
 *
 * Every athlete here is isBetaAccount: false ON PURPOSE. A comped account has every add-on
 * whatever the columns say, so the beta default the fixtures use would have made all of this
 * pass against the broken code.
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

const ALL_CLASSES = "all_classes";

async function paidAthlete() {
  const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
  await storage.addFreeAgentAddOn(athlete.id, ALL_CLASSES, { stripeSubscriptionId: "sub_live_1" });
  return athlete;
}

async function termsOf(userId: number) {
  const [row] = await db
    .select({ owned: users.freeAgentAddOns, terms: users.addOnTerms })
    .from(users)
    .where(eq(users.id, userId));
  return row;
}

describe("an admin re-granting a refunded add-on", () => {
  it("turns it back on, where the array alone left it dead for good", async () => {
    const athlete = await paidAthlete();
    await storage.revokeAddOnAfterRefund(athlete.id, ALL_CLASSES);

    // The state the defect lived in: refunded, so off -- and nothing in the repo clears the
    // stamp. Ticking the box wrote the array and left this true.
    const refunded = await termsOf(athlete.id);
    expect(refunded.terms?.[ALL_CLASSES]?.refundedAt).toBeTruthy();

    const admin = await makeLoginableUser({ role: "admin" });
    const adminClient = await loginAs(server.baseUrl, admin);
    const res = await adminClient.patch(`/api/admin/athletes/${athlete.id}/billing`, {
      freeAgentAddOns: [ALL_CLASSES],
    });
    expect(res.status).toBe(200);

    const after = await termsOf(athlete.id);
    expect(after.owned).toContain(ALL_CLASSES);
    expect(after.terms?.[ALL_CLASSES]?.refundedAt).toBeUndefined();
    expect(addOnIsActive(after.owned, after.terms, ALL_CLASSES)).toBe(true);

    // THE CLAIM THAT MATTERS: the athlete's own entitlements route says yes.
    const athleteClient = await loginAs(server.baseUrl, athlete);
    const ents = await athleteClient.get("/api/athlete/entitlements");
    expect(ents.status).toBe(200);
    expect((ents.body as any).addOns[ALL_CLASSES]).toBe(true);
    expect((ents.body as any).ownedAddOns[ALL_CLASSES]).toBe(true);
  });

  it("keeps the purchase it was granted over, rather than claiming a new one", async () => {
    const athlete = await paidAthlete();
    const bought = (await termsOf(athlete.id)).terms?.[ALL_CLASSES]?.purchasedAt;
    await storage.revokeAddOnAfterRefund(athlete.id, ALL_CLASSES);

    const admin = await makeLoginableUser({ role: "admin" });
    const adminClient = await loginAs(server.baseUrl, admin);
    await adminClient.patch(`/api/admin/athletes/${athlete.id}/billing`, {
      freeAgentAddOns: [ALL_CLASSES],
    });

    const after = await termsOf(athlete.id);
    // Same purchase time, so the 72-hour refund window is not reopened on comped access, and
    // the Stripe handle is still on file for whoever has to reach that subscription.
    expect(after.terms?.[ALL_CLASSES]?.purchasedAt).toBe(bought);
    expect(after.terms?.[ALL_CLASSES]?.stripeSubscriptionId).toBe("sub_live_1");
  });
});

describe("an admin removing a store-bought add-on", () => {
  it("closes access and says which subscription is still billing", async () => {
    const athlete = await paidAthlete();
    const admin = await makeLoginableUser({ role: "admin" });
    const adminClient = await loginAs(server.baseUrl, admin);

    const res = await adminClient.patch(`/api/admin/athletes/${athlete.id}/billing`, {
      freeAgentAddOns: [],
    });
    expect(res.status).toBe(200);
    expect((res.body as any).addOnsStillBilling).toEqual([
      { addOnId: ALL_CLASSES, stripeSubscriptionId: "sub_live_1" },
    ]);

    const after = await termsOf(athlete.id);
    expect(addOnIsActive(after.owned, after.terms, ALL_CLASSES)).toBe(false);
    // Recorded, so the day somebody asks "why is this card still being charged" there is a row
    // naming the admin action and the subscription.
    const log = await db
      .select({ event: billingAuditLog.event })
      .from(billingAuditLog)
      .where(eq(billingAuditLog.userId, athlete.id));
    expect(log.map((e) => e.event)).toContain("add_on.removed_by_admin_still_billing");
  });

  it("says nothing about an add-on nobody was being charged for", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
    const admin = await makeLoginableUser({ role: "admin" });
    const adminClient = await loginAs(server.baseUrl, admin);

    // Granted by an admin in the first place: no provider, so nothing to go and stop.
    await adminClient.patch(`/api/admin/athletes/${athlete.id}/billing`, {
      freeAgentAddOns: [ALL_CLASSES],
    });
    const res = await adminClient.patch(`/api/admin/athletes/${athlete.id}/billing`, {
      freeAgentAddOns: [],
    });
    expect((res.body as any).addOnsStillBilling).toEqual([]);
  });
});

describe("the coach side goes through the same rule", () => {
  it("re-grants a refunded Coaches Corner and reports the live subscription on removal", async () => {
    const coach = await makeLoginableUser({ role: "coach", isBetaAccount: false });
    await storage.addCoachBillingAddOn(coach.id, "coaches_corner", {
      stripeSubscriptionId: "sub_live_2",
    });
    await storage.revokeAddOnAfterRefund(coach.id, "coaches_corner");

    const admin = await makeLoginableUser({ role: "admin" });
    const adminClient = await loginAs(server.baseUrl, admin);
    const granted = await adminClient.patch(`/api/admin/coaches/${coach.id}/billing`, {
      billingAddOns: ["coaches_corner"],
    });
    expect(granted.status).toBe(200);

    const [row] = await db
      .select({ owned: users.billingAddOns, terms: users.addOnTerms })
      .from(users)
      .where(eq(users.id, coach.id));
    expect(addOnIsActive(row.owned, row.terms, "coaches_corner")).toBe(true);

    const removed = await adminClient.patch(`/api/admin/coaches/${coach.id}/billing`, {
      billingAddOns: [],
    });
    expect((removed.body as any).addOnsStillBilling).toEqual([
      { addOnId: "coaches_corner", stripeSubscriptionId: "sub_live_2" },
    ]);
  });
});
