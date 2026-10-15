import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

/* SEVEN FROM THE 2026-10-15 SECURITY REVIEW, EACH ONE READ OFF THE CODE BEFORE ANYTHING MOVED.
 *
 * Scott: "great fix what you can." Three were confirmed in the code by hand, four more were
 * reported as plausible and confirmed the same way. None is reachable by an outsider; every
 * one is Forge's own money path doing the wrong thing with money somebody really paid:
 *
 *  1. A join through an ASSISTANT coach's code was never re-billed: the sync read the
 *     assistant's row, found no subscription, and stopped (rebillCoachBandAfterJoin).
 *  2. A full refund or a dispute revoked access and never cancelled the subscription at
 *     Stripe, so the card kept being charged for a product the account no longer had
 *     (revokeEverythingForSubscription).
 *  3. An assistant's in-app Coaches Corner receipt displaced the PROGRAM's card subscription
 *     -- cancelled it, with proration -- and left the program riding an App Store subscription
 *     on the assistant's personal Apple ID (addCoachBillingAddOn `boughtBy`).
 *  4. A subscription that died in dunning handed its add-ons the whole UNPAID month, because
 *     the period Stripe reports on an unpaid invoice is in the future (endStripeSubscription).
 *  5. The Apple holder check counted ENDED rows, so a family Apple ID resubscribing on a
 *     second account met the 409 and a paid subscription entitled nobody
 *     (accountsHoldingAppleTransaction, releaseAppleTransactionFromEndedRows).
 *  6. The self-serve cancel route read the term, called Stripe, then wrote the end date onto
 *     whatever term existed by then -- a purchase in between lost its paid month
 *     (scheduleAddOnRemoval `expected`).
 *  7. Cancelling an add-on bought before terms were recorded INVENTED a purchase time of now
 *     and opened a fresh 72-hour refund window on a months-old purchase (nextAddOnTerms).
 *
 * The storage halves are proven on real Postgres in the .itest.ts twin; this file holds the
 * billing.ts behaviour under mocks and the source scans that keep each rule where it is.
 */
const ROOT = join(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const storageSrc = read("server/storage.ts");
const routesSrc = read("server/routes.ts");
const billingSrc = read("server/billing.ts");
const methodBody = (name: string) => {
  const at = storageSrc.indexOf(`async ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  const fn = storageSrc.slice(at);
  return fn.slice(0, fn.indexOf("\n  },\n"));
};

const getPrimaryCoachId = vi.fn();
const getBilledAthleteCountForCoach = vi.fn();
const getSubscriptionForUser = vi.fn();
const applyCoachSubscriptionBand = vi.fn();
const logBillingEvent = vi.fn();
const wasStripeEventProcessed = vi.fn();
const revokeAddOnsForStripeSubscription = vi.fn();
const updateSubscriptionByStripeId = vi.fn();
const updateFreeAgentBilling = vi.fn();
const clearCoachBand = vi.fn();
const accountForStripeSubscription = vi.fn();
const endAddOnsForDeletedStripeSubscription = vi.fn();

vi.mock("./storage", () => ({
  storage: {
    getPrimaryCoachId,
    getBilledAthleteCountForCoach,
    getSubscriptionForUser,
    applyCoachSubscriptionBand,
    logBillingEvent,
    wasStripeEventProcessed,
    revokeAddOnsForStripeSubscription,
    updateSubscriptionByStripeId,
    updateFreeAgentBilling,
    clearCoachBand,
    accountForStripeSubscription,
    endAddOnsForDeletedStripeSubscription,
  },
}));

const subscriptionsRetrieve = vi.fn();
const subscriptionsCancel = vi.fn();
const subscriptionsUpdate = vi.fn();
const subscriptionItemsUpdate = vi.fn();
const invoicesRetrieve = vi.fn();
const chargesRetrieve = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    subscriptions = { cancel: subscriptionsCancel, retrieve: subscriptionsRetrieve, update: subscriptionsUpdate };
    subscriptionItems = { update: subscriptionItemsUpdate };
    checkout = { sessions: { create: vi.fn() } };
    refunds = { create: vi.fn() };
    invoices = { retrieve: invoicesRetrieve };
    charges = { retrieve: chargesRetrieve };
    billingPortal = { sessions: { create: vi.fn() } };
    webhooks = { constructEvent: vi.fn() };
  },
}));
vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_for_this_file");
vi.stubEnv("STRIPE_PRICE_COACH_PER_ATHLETE", "price_per_athlete");

const { handleStripeWebhookEvent, rebillCoachBandAfterJoin } = await import("./billing");

beforeEach(() => {
  // clearAllMocks keeps implementations, so each case's rejections are reset here by hand.
  vi.clearAllMocks();
  logBillingEvent.mockResolvedValue(undefined);
  subscriptionsCancel.mockResolvedValue({});
  getPrimaryCoachId.mockReset();
  wasStripeEventProcessed.mockResolvedValue(false);
  revokeAddOnsForStripeSubscription.mockResolvedValue({ userId: null, addOnIds: [] });
  endAddOnsForDeletedStripeSubscription.mockResolvedValue({ userId: null, addOnIds: [] });
  updateSubscriptionByStripeId.mockResolvedValue({ userId: 7, accountType: "free_agent" });
  invoicesRetrieve.mockResolvedValue({ subscription: "sub_1" });
  subscriptionsRetrieve.mockResolvedValue({ id: "sub_1", status: "active", items: { data: [] } });
});

function refundEvent(id = "evt_refund") {
  return {
    id,
    type: "charge.refunded",
    data: { object: { id: "ch_1", invoice: "in_1", refunded: true, amount: 1999, amount_refunded: 1999 } },
  } as unknown as Stripe.Event;
}

function disputeEvent(id = "evt_dispute") {
  chargesRetrieve.mockResolvedValue({ id: "ch_1", invoice: "in_1" });
  return {
    id,
    type: "charge.dispute.created",
    data: { object: { id: "dp_1", charge: "ch_1", reason: "fraudulent" } },
  } as unknown as Stripe.Event;
}

function updatedEvent(status: string, periodEndSec: number, id = "evt_updated") {
  return {
    id,
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_1",
        status,
        cancel_at_period_end: false,
        items: { data: [{ current_period_end: periodEndSec }] },
      },
    },
  } as unknown as Stripe.Event;
}

describe("1. a join through an assistant's code re-bills the PRIMARY's subscription", () => {
  it("resolves the primary before reading anything about the subscription", async () => {
    getPrimaryCoachId.mockResolvedValue(3);
    getBilledAthleteCountForCoach.mockResolvedValue(24);
    getSubscriptionForUser.mockResolvedValue({
      stripeSubscriptionId: "sub_program",
      accountType: "coach",
      status: "active",
    });
    subscriptionsRetrieve.mockResolvedValue({
      id: "sub_program",
      items: { data: [{ id: "si_1", price: { id: "price_per_athlete" }, quantity: 20 }] },
    });
    await rebillCoachBandAfterJoin(11); // the assistant whose code was typed
    expect(getPrimaryCoachId).toHaveBeenCalledWith(11);
    expect(getBilledAthleteCountForCoach).toHaveBeenCalledWith(3);
    // The sync reads the PRIMARY's row -- the one that has a subscription at all.
    expect(getSubscriptionForUser).toHaveBeenCalledWith(3);
    expect(getSubscriptionForUser).not.toHaveBeenCalledWith(11);
    expect(subscriptionItemsUpdate).toHaveBeenCalledWith("si_1", expect.objectContaining({ quantity: expect.any(Number) }));
    // And the audit row says the quantity moved on a join through somebody else's code.
    expect(logBillingEvent).toHaveBeenCalledWith(
      3,
      "coach.plan.rebilled_on_join",
      expect.objectContaining({ synced: true, joinedThroughCoachId: 11 }),
    );
  });

  it("a primary's own code is unchanged: no extra key on the audit row", async () => {
    getPrimaryCoachId.mockResolvedValue(3);
    getBilledAthleteCountForCoach.mockResolvedValue(24);
    getSubscriptionForUser.mockResolvedValue({ stripeSubscriptionId: "sub_program", accountType: "coach", status: "active" });
    subscriptionsRetrieve.mockResolvedValue({
      id: "sub_program",
      items: { data: [{ id: "si_1", price: { id: "price_per_athlete" }, quantity: 20 }] },
    });
    await rebillCoachBandAfterJoin(3);
    const row = logBillingEvent.mock.calls.find((c) => c[1] === "coach.plan.rebilled_on_join");
    expect(row).toBeDefined();
    expect(row![2]).not.toHaveProperty("joinedThroughCoachId");
  });

  it("still never fails the join", async () => {
    getPrimaryCoachId.mockRejectedValue(new Error("db down"));
    await expect(rebillCoachBandAfterJoin(11)).resolves.toBeUndefined();
    expect(logBillingEvent).toHaveBeenCalledWith(11, "coach.plan.rebill_on_join_failed", expect.anything());
  });
});

describe("2. a refund or a dispute cancels the subscription at Stripe", () => {
  it("cancels after revoking on charge.refunded, and records it", async () => {
    await handleStripeWebhookEvent(refundEvent());
    expect(updateFreeAgentBilling).toHaveBeenCalledWith(7, { freeAgentTier: null });
    expect(subscriptionsCancel).toHaveBeenCalledWith("sub_1");
    expect(logBillingEvent).toHaveBeenCalledWith(
      7,
      "stripe.subscription.cancelled_after_revocation",
      expect.objectContaining({ subscriptionId: "sub_1", because: "charge.refunded" }),
    );
    // Revocation FIRST: the thing that must land lands before the best-effort provider call.
    const revokeOrder = updateFreeAgentBilling.mock.invocationCallOrder[0];
    const cancelOrder = subscriptionsCancel.mock.invocationCallOrder[0];
    expect(revokeOrder).toBeLessThan(cancelOrder);
  });

  it("cancels on charge.dispute.created too", async () => {
    await handleStripeWebhookEvent(disputeEvent());
    expect(subscriptionsCancel).toHaveBeenCalledWith("sub_1");
  });

  it("does not cancel what is already cancelled, and says so", async () => {
    subscriptionsRetrieve.mockResolvedValue({ id: "sub_1", status: "canceled" });
    await handleStripeWebhookEvent(refundEvent());
    expect(subscriptionsCancel).not.toHaveBeenCalled();
    expect(logBillingEvent).toHaveBeenCalledWith(
      7,
      "stripe.subscription.already_cancelled_at_provider",
      expect.objectContaining({ subscriptionId: "sub_1" }),
    );
  });

  it("a Stripe failure is an audit row, never a thrown webhook", async () => {
    subscriptionsCancel.mockRejectedValue(new Error("stripe down"));
    await expect(handleStripeWebhookEvent(refundEvent())).resolves.toBeUndefined();
    expect(updateFreeAgentBilling).toHaveBeenCalledWith(7, { freeAgentTier: null });
    expect(logBillingEvent).toHaveBeenCalledWith(
      7,
      "stripe.subscription.cancel_after_revocation_failed",
      expect.objectContaining({ subscriptionId: "sub_1", error: "stripe down" }),
    );
  });

  it("reaches an ADD-ON's subscription, which has no subscriptions row to find", async () => {
    updateSubscriptionByStripeId.mockResolvedValue(null);
    revokeAddOnsForStripeSubscription.mockResolvedValue({ userId: 9, addOnIds: ["coaches_corner"] });
    await handleStripeWebhookEvent(refundEvent());
    expect(subscriptionsCancel).toHaveBeenCalledWith("sub_1");
    expect(logBillingEvent).toHaveBeenCalledWith(9, "stripe.subscription.cancelled_after_revocation", expect.anything());
  });

  it("carries the cross-rail guard the cancellation path has: a legacy row keeps its SKU", async () => {
    updateSubscriptionByStripeId.mockResolvedValue({
      userId: 7,
      accountType: "free_agent",
      appleOriginalTransactionId: "2000000001",
    });
    await handleStripeWebhookEvent(refundEvent());
    expect(updateFreeAgentBilling).not.toHaveBeenCalled();
    expect(logBillingEvent).toHaveBeenCalledWith(
      7,
      "subscription.other_rail_still_on_file",
      expect.objectContaining({ endedRail: "stripe", appleOriginalTransactionId: "2000000001" }),
    );
  });
});

describe("4. an unpaid period is not a paid month", () => {
  const nextMonth = Math.floor(Date.now() / 1000) + 20 * 24 * 60 * 60;

  it("ends the add-ons NOW when dunning finishes in `unpaid`, whatever period Stripe reports", async () => {
    await handleStripeWebhookEvent(updatedEvent("unpaid", nextMonth));
    expect(endAddOnsForDeletedStripeSubscription).toHaveBeenCalledTimes(1);
    const accessUntil = endAddOnsForDeletedStripeSubscription.mock.calls[0][1] as Date;
    expect(accessUntil.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("the CONTROL: a cancellation still honours the paid month", async () => {
    await handleStripeWebhookEvent(updatedEvent("canceled", nextMonth));
    const accessUntil = endAddOnsForDeletedStripeSubscription.mock.calls[0][1] as Date;
    expect(accessUntil.getTime()).toBe(nextMonth * 1000);
  });
});

describe("3. an assistant's receipt never displaces what the program already pays for", () => {
  it("addCoachBillingAddOn takes the buyer and decides under the lock", () => {
    const body = methodBody("addCoachBillingAddOn");
    expect(body).toContain("opts?: { boughtBy?: number }");
    // Decided INSIDE mutateAddOnsAtomically's callback, not from a read made before it.
    const lockAt = body.indexOf("mutateAddOnsAtomically(");
    const ruleAt = body.indexOf("opts.boughtBy !== userId");
    expect(ruleAt).toBeGreaterThan(lockAt);
    expect(body).toContain("programAlreadyPays");
    // Live FROM A PROVIDER: an admin grant (no handle) is still taken over.
    expect(body).toMatch(/addOnIsActive\(current\.billingAddOns, current\.addOnTerms, addOnId\)/);
    expect(body).toMatch(/prior\?\.stripeSubscriptionId \|\| prior\?\.appleOriginalTransactionId/);
    // And when it declines, nothing is handed up to cancel.
    expect(body).toContain("if (row.programAlreadyPays) return { ...row };");
  });

  it("the Apple verify path passes the buyer and records the declined grant, never refuses it", () => {
    const body = methodBody("applyAppleIapVerification");
    const coach = body.slice(body.indexOf('if (scope === "coach")'));
    expect(coach).toContain("{ boughtBy: userId }");
    expect(coach).toContain("apple_iap.program_already_pays");
    expect(coach).toContain("alsoCancelInAppStore: true");
    // The declined grant returns ok with NO superseded id, and before the supersede handling.
    const declined = coach.indexOf("grantedCoachAddOn?.programAlreadyPays");
    const supersede = coach.indexOf("grantedCoachAddOn?.supersededAppleOriginalTransactionId");
    expect(declined).toBeGreaterThan(-1);
    expect(declined).toBeLessThan(supersede);
    const declinedBlock = coach.slice(declined, supersede);
    expect(declinedBlock).toContain("return { ok: true };");
    expect(declinedBlock).not.toContain("ok: false");
  });

  it("the route no longer claims only the Free Agent scope cancels a superseded subscription", () => {
    const route = routesSrc.slice(routesSrc.indexOf('app.post("/api/account/apple-iap/verify"'));
    const body = route.slice(0, route.indexOf("\n  });"));
    expect(body).not.toContain("only ever reached by the Free Agent scope");
    expect(body).toContain("cancelSupersededStripeSubscription(user.id, result.supersededStripeSubscriptionId)");
  });
});

describe("5. a holder is an account the Apple subscription still entitles", () => {
  it("ignores canceled tier rows and matches the add-on handle exactly, on an active term", () => {
    const body = methodBody("accountsHoldingAppleTransaction");
    expect(body).toMatch(/ne\(subscriptions\.status, "canceled"\)/);
    expect(body).toMatch(/term\?\.appleOriginalTransactionId === originalTransactionId/);
    expect(body).toMatch(/addOnIsActive\(owned, r\.addOnTerms, addOnId\)/);
    // The excluded account is still excluded, by the spelling the older test pins.
    expect(body).toMatch(/!==\s*exceptUserId/);
  });

  it("ended rows let go of the handle when another account takes the transaction", () => {
    const body = methodBody("releaseAppleTransactionFromEndedRows");
    expect(body).toMatch(/eq\(subscriptions\.status, "canceled"\)/);
    expect(body).toMatch(/ne\(subscriptions\.userId, nowHeldBy\)/);
    expect(body).toContain("appleOriginalTransactionId: null");
    const apply = methodBody("applyAppleIapVerification");
    const release = apply.indexOf("releaseAppleTransactionFromEndedRows(verified.originalTransactionId, userId)");
    expect(release).toBeGreaterThan(apply.indexOf("alreadyBoundElsewhere: true"));
    expect(release).toBeLessThan(apply.indexOf('if (scope === "coach")'));
  });
});

describe("6. the cancel route writes the end date onto the term it read, or not at all", () => {
  it("passes the handles it decided on and answers 409 when they no longer match", () => {
    const route = routesSrc.slice(routesSrc.indexOf('app.delete("/api/billing/add-on/:addOnId"'));
    const body = route.slice(0, route.indexOf("\n  });"));
    expect(body).toMatch(/scheduleAddOnRemoval\(owner, addOnId, accessUntil, \{\s*stripeSubscriptionId: term\?\.stripeSubscriptionId \?\? null,\s*appleOriginalTransactionId: term\?\.appleOriginalTransactionId \?\? null,\s*\}\)/);
    expect(body).toContain("if (scheduled?.stale)");
    expect(body).toContain("res.status(409)");
  });

  it("scheduleAddOnRemoval compares under the lock and writes nothing on a mismatch", () => {
    const body = methodBody("scheduleAddOnRemoval");
    const lockAt = body.indexOf("mutateAddOnsAtomically(");
    const compareAt = body.indexOf("expected.stripeSubscriptionId ?? null");
    expect(compareAt).toBeGreaterThan(lockAt);
    expect(body).toMatch(/set: \{\}, result: \{ id: current\.id, addOnTerms: current\.addOnTerms, stale: true/);
  });

  it("the webhook caller passes no expectation, so an id Stripe itself ended still ends", () => {
    const body = methodBody("endAddOnsForDeletedStripeSubscription");
    expect(body).toMatch(/scheduleAddOnRemoval\(row\.id, addOnId, accessUntil\);/);
  });
});

describe("the revocation path's own shape is kept", () => {
  it("one row per delivery still claims the Stripe event id", () => {
    const fn = billingSrc.slice(billingSrc.indexOf("async function revokeEverythingForSubscription("));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    // The new audit rows travel WITHOUT the unique event id: the two rows that claim it are the
    // revocation rows, and a third claimant would throw on the unique index (CLAUDE.md, the
    // 10-14 sweep).
    const after = body.slice(body.indexOf("const owner = sub?.userId ?? revoked.userId;"));
    expect(after).not.toMatch(/claimEventId\(\)/);
    expect(after).toMatch(/stripeEventId: eventId/);
  });
});
