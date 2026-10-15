import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { db } from "./db";
import { coachStaff, subscriptions, users } from "@shared/schema";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

/**
 * THE STORAGE HALVES OF THE 2026-10-15 SECURITY REVIEW FIXES, ON REAL POSTGRES.
 *
 * The unit twin (the-security-review-fixes-2026-10-15.test.ts) holds the billing.ts behaviour
 * under mocks and the source scans. These three rules live inside mutateAddOnsAtomically's lock
 * and in SQL predicates, which a scan can name and only a database can prove:
 *
 *  3. An assistant coach's App Store receipt never displaces a subscription the program is
 *     already paying for (addCoachBillingAddOn `boughtBy`).
 *  5. The Apple holder check counts only accounts the subscription still entitles, and ended
 *     rows let go of the handle when another account takes it over.
 *  6. scheduleAddOnRemoval writes the end date only onto the term the caller decided on.
 */

const FUTURE = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);

const rowFor = async (id: number) => {
  const [row] = await db
    .select({ terms: users.addOnTerms, coach: users.billingAddOns })
    .from(users)
    .where(eq(users.id, id));
  return row;
};

async function makeStaffFor(primaryId: number) {
  const staff = await makeCoach();
  await db.insert(coachStaff).values({ primaryCoachId: primaryId, staffCoachId: staff.id });
  return staff;
}

describe("3. an assistant's receipt and a program that already pays", () => {
  beforeEach(resetDatabase);

  it("leaves the program's Stripe subscription exactly where it is, and hands nothing up to cancel", async () => {
    const primary = await makeCoach();
    const staff = await makeStaffFor(primary.id);
    await storage.addCoachBillingAddOn(primary.id, "coaches_corner", { stripeSubscriptionId: "sub_program" });

    const granted = await storage.addCoachBillingAddOn(
      primary.id,
      "coaches_corner",
      { appleOriginalTransactionId: "2000000001" },
      { boughtBy: staff.id },
    );
    expect(granted?.programAlreadyPays).toBe(true);
    expect(granted).not.toHaveProperty("supersededStripeSubscriptionId");
    expect(granted).not.toHaveProperty("supersededAppleOriginalTransactionId");

    const row = await rowFor(primary.id);
    // The program's own handle is intact: it is the only thing that can ever cancel or refund
    // that subscription, and the assistant's Apple id was not written over it.
    expect(row.terms?.coaches_corner?.stripeSubscriptionId).toBe("sub_program");
    expect(row.terms?.coaches_corner?.appleOriginalTransactionId).toBeUndefined();
    expect(row.coach).toEqual(["coaches_corner"]);
  });

  it("the primary's OWN in-app purchase still takes the row from the web, as the one-rail rule says", async () => {
    // THE CONTROL: the rule is about a different buyer, not about Apple purchases.
    const primary = await makeCoach();
    await storage.addCoachBillingAddOn(primary.id, "coaches_corner", { stripeSubscriptionId: "sub_program" });
    const granted = await storage.addCoachBillingAddOn(
      primary.id,
      "coaches_corner",
      { appleOriginalTransactionId: "2000000001" },
      { boughtBy: primary.id },
    );
    expect(granted?.programAlreadyPays).toBe(false);
    expect(granted?.supersededStripeSubscriptionId).toBe("sub_program");
    const row = await rowFor(primary.id);
    expect(row.terms?.coaches_corner?.appleOriginalTransactionId).toBe("2000000001");
    expect(row.terms?.coaches_corner?.stripeSubscriptionId).toBeUndefined();
  });

  it("an admin grant is not 'already paying', so the assistant's purchase is still recorded on the program", async () => {
    const primary = await makeCoach();
    const staff = await makeStaffFor(primary.id);
    await storage.addCoachBillingAddOn(primary.id, "coaches_corner"); // no provider: comped
    const granted = await storage.addCoachBillingAddOn(
      primary.id,
      "coaches_corner",
      { appleOriginalTransactionId: "2000000002" },
      { boughtBy: staff.id },
    );
    expect(granted?.programAlreadyPays).toBe(false);
    expect(granted).not.toHaveProperty("supersededStripeSubscriptionId");
    const row = await rowFor(primary.id);
    expect(row.terms?.coaches_corner?.appleOriginalTransactionId).toBe("2000000002");
  });

  it("a lapsed term is not 'already paying' either", async () => {
    const primary = await makeCoach();
    const staff = await makeStaffFor(primary.id);
    await storage.addCoachBillingAddOn(primary.id, "coaches_corner", { stripeSubscriptionId: "sub_old" });
    await storage.scheduleAddOnRemoval(primary.id, "coaches_corner", PAST);
    const granted = await storage.addCoachBillingAddOn(
      primary.id,
      "coaches_corner",
      { appleOriginalTransactionId: "2000000003" },
      { boughtBy: staff.id },
    );
    expect(granted?.programAlreadyPays).toBe(false);
    const row = await rowFor(primary.id);
    expect(row.terms?.coaches_corner?.appleOriginalTransactionId).toBe("2000000003");
    expect(row.terms?.coaches_corner?.accessUntil).toBeUndefined();
  });
});

describe("5. a holder is an account the Apple subscription still entitles", () => {
  beforeEach(resetDatabase);

  it("a canceled tier row on another account is not a holder, and lets go of the handle on the grant", async () => {
    const first = await makeAthlete();
    const second = await makeAthlete();
    await storage.upsertSubscriptionByUserId(first.id, {
      accountType: "free_agent",
      tier: "base",
      status: "canceled",
      appleOriginalTransactionId: "3000000001",
    });
    expect(await storage.accountsHoldingAppleTransaction("3000000001", second.id)).toEqual([]);

    const released = await storage.releaseAppleTransactionFromEndedRows("3000000001", second.id);
    expect(released).toEqual([first.id]);
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, first.id));
    expect(row.appleOriginalTransactionId).toBeNull();
    expect(row.status).toBe("canceled");
  });

  it("an ACTIVE tier row on another account is still a holder, and is never released", async () => {
    const first = await makeAthlete();
    const second = await makeAthlete();
    await storage.upsertSubscriptionByUserId(first.id, {
      accountType: "free_agent",
      tier: "base",
      status: "active",
      appleOriginalTransactionId: "3000000002",
    });
    expect(await storage.accountsHoldingAppleTransaction("3000000002", second.id)).toEqual([first.id]);
    expect(await storage.releaseAppleTransactionFromEndedRows("3000000002", second.id)).toEqual([]);
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, first.id));
    expect(row.appleOriginalTransactionId).toBe("3000000002");
  });

  it("the account being granted is never released from its own row", async () => {
    const athlete = await makeAthlete();
    await storage.upsertSubscriptionByUserId(athlete.id, {
      accountType: "free_agent",
      tier: "base",
      status: "canceled",
      appleOriginalTransactionId: "3000000003",
    });
    expect(await storage.releaseAppleTransactionFromEndedRows("3000000003", athlete.id)).toEqual([]);
  });

  it("a refunded add-on term is not a holder; a live one is; a prefix of the id never is", async () => {
    const refunded = await makeAthlete();
    const live = await makeAthlete();
    const other = await makeAthlete();
    const claimant = await makeAthlete();
    await storage.addFreeAgentAddOn(refunded.id, "all_classes", { appleOriginalTransactionId: "4000000001" });
    await storage.revokeAddOnAfterRefund(refunded.id, "all_classes");
    await storage.addFreeAgentAddOn(live.id, "all_classes", { appleOriginalTransactionId: "4000000001" });
    // A longer id that CONTAINS the one being checked: the text prefilter matches it and the
    // exact comparison has to throw it out.
    await storage.addFreeAgentAddOn(other.id, "all_classes", { appleOriginalTransactionId: "40000000011" });
    expect(await storage.accountsHoldingAppleTransaction("4000000001", claimant.id)).toEqual([live.id]);
  });

  it("a cancelled add-on term still counts until its paid month runs out", async () => {
    const holder = await makeAthlete();
    const claimant = await makeAthlete();
    await storage.addFreeAgentAddOn(holder.id, "all_classes", { appleOriginalTransactionId: "4000000002" });
    await storage.scheduleAddOnRemoval(holder.id, "all_classes", FUTURE);
    expect(await storage.accountsHoldingAppleTransaction("4000000002", claimant.id)).toEqual([holder.id]);
    await storage.scheduleAddOnRemoval(holder.id, "all_classes", PAST);
    expect(await storage.accountsHoldingAppleTransaction("4000000002", claimant.id)).toEqual([]);
  });
});

describe("6. the end date lands on the term the caller decided on, or nowhere", () => {
  beforeEach(resetDatabase);

  it("writes when the handles match", async () => {
    const athlete = await makeAthlete();
    await storage.addFreeAgentAddOn(athlete.id, "all_classes", { stripeSubscriptionId: "sub_a" });
    const result = await storage.scheduleAddOnRemoval(athlete.id, "all_classes", FUTURE, {
      stripeSubscriptionId: "sub_a",
      appleOriginalTransactionId: null,
    });
    expect(result?.stale).toBe(false);
    const row = await rowFor(athlete.id);
    expect(row.terms?.all_classes?.accessUntil).toBe(FUTURE.toISOString());
  });

  it("writes nothing when a purchase replaced the term in between", async () => {
    const athlete = await makeAthlete();
    await storage.addFreeAgentAddOn(athlete.id, "all_classes", { stripeSubscriptionId: "sub_a" });
    // The route read sub_a; a re-purchase lands before it writes.
    await storage.addFreeAgentAddOn(athlete.id, "all_classes", { stripeSubscriptionId: "sub_b" });
    const result = await storage.scheduleAddOnRemoval(athlete.id, "all_classes", FUTURE, {
      stripeSubscriptionId: "sub_a",
      appleOriginalTransactionId: null,
    });
    expect(result?.stale).toBe(true);
    const row = await rowFor(athlete.id);
    // The month just paid for on sub_b is untouched.
    expect(row.terms?.all_classes?.accessUntil).toBeUndefined();
    expect(row.terms?.all_classes?.stripeSubscriptionId).toBe("sub_b");
  });

  it("an in-app purchase replacing a web one is a mismatch too", async () => {
    const athlete = await makeAthlete();
    await storage.addFreeAgentAddOn(athlete.id, "all_classes", { stripeSubscriptionId: "sub_a" });
    await storage.addFreeAgentAddOn(athlete.id, "all_classes", { appleOriginalTransactionId: "5000000001" });
    const result = await storage.scheduleAddOnRemoval(athlete.id, "all_classes", FUTURE, {
      stripeSubscriptionId: "sub_a",
      appleOriginalTransactionId: null,
    });
    expect(result?.stale).toBe(true);
  });

  it("no expectation means the webhook's own match is trusted, as before", async () => {
    const athlete = await makeAthlete();
    await storage.addFreeAgentAddOn(athlete.id, "all_classes", { stripeSubscriptionId: "sub_a" });
    const result = await storage.scheduleAddOnRemoval(athlete.id, "all_classes", FUTURE);
    expect(result?.stale).toBe(false);
    const row = await rowFor(athlete.id);
    expect(row.terms?.all_classes?.accessUntil).toBe(FUTURE.toISOString());
  });
});
