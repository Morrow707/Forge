import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

/* A RETRIED CHECKOUT GRANTED A TIER NOBODY WAS PAYING FOR, PERMANENTLY.
 *
 * Two facts about Stripe webhooks meet here. A delivery whose handler threw is retried with
 * backoff for up to three days; and Stripe promises no ordering BETWEEN event types. So a
 * `checkout.session.completed` can be re-delivered long after the subscription it created was
 * cancelled, or died in dunning -- and the `customer.subscription.deleted` for that same
 * subscription can be processed FIRST, match on an id this handler has not written yet, find
 * nothing, and do nothing.
 *
 * Either way the retry then grants the tier (or the band, or the add-on) with no live
 * subscription behind it, and nothing is left that can ever take it back: the revocation already
 * ran, and `wasStripeEventProcessed` refuses to run it twice. Free access, for good, out of one
 * transient 500.
 *
 * So the grant asks Stripe for the subscription's CURRENT status instead of trusting the
 * session's age. Found by the 2026-10-14 billing audit panel.
 */
const upsertSubscriptionByUserId = vi.fn();
const updateSubscriptionByUserId = vi.fn();
const upsertStripeCustomerId = vi.fn();
const updateSubscriptionByStripeId = vi.fn();
const getSubscriptionForUser = vi.fn();
const updateFreeAgentBilling = vi.fn();
const applyCoachSubscriptionBand = vi.fn();
const addFreeAgentAddOn = vi.fn();
const addCoachBillingAddOn = vi.fn();
const markLessonPurchased = vi.fn();
const logBillingEvent = vi.fn();
const wasStripeEventProcessed = vi.fn();
const clearCoachBand = vi.fn();
const endAddOnsForDeletedStripeSubscription = vi.fn();
const recordPaymentAsParentalVerification = vi.fn();
const getUser = vi.fn();

vi.mock("./storage", () => ({
  storage: {
    upsertSubscriptionByUserId,
    updateSubscriptionByUserId,
    upsertStripeCustomerId,
    updateSubscriptionByStripeId,
    getSubscriptionForUser,
    updateFreeAgentBilling,
    applyCoachSubscriptionBand,
    addFreeAgentAddOn,
    addCoachBillingAddOn,
    markLessonPurchased,
    logBillingEvent,
    wasStripeEventProcessed,
    clearCoachBand,
    endAddOnsForDeletedStripeSubscription,
    recordPaymentAsParentalVerification,
    getUser,
  },
}));

const retrieve = vi.fn();
const cancel = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    subscriptions = { cancel, retrieve, update: vi.fn() };
    checkout = { sessions: { create: vi.fn() } };
    refunds = { create: vi.fn() };
    invoices = { retrieve: vi.fn() };
    billingPortal = { sessions: { create: vi.fn() } };
    webhooks = { constructEvent: vi.fn() };
  },
}));

vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_for_this_file");
vi.stubEnv("BILLING_LIVE", "true");

const { handleStripeWebhookEvent } = await import("./billing");

function checkout(id: string, metadata: Record<string, string>, subscription: string | null = "sub_1") {
  return {
    id,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${id}`,
        client_reference_id: "42",
        subscription,
        customer: "cus_xyz",
        payment_status: "paid",
        amount_total: 1999,
        metadata,
      },
    },
  } as unknown as Stripe.Event;
}

const TIER = { kind: "free_agent_tier", tier: "ai_coach_video" };
const BAND = { kind: "coach_subscription", band: "band_1_5" };
const FREE_AGENT_ADD_ON = { kind: "free_agent_add_on", addOnId: "all_classes" };
const COACH_ADD_ON = { kind: "coach_add_on", addOnId: "coaches_corner" };

const grantedAnything = () =>
  updateFreeAgentBilling.mock.calls.length +
  applyCoachSubscriptionBand.mock.calls.length +
  addFreeAgentAddOn.mock.calls.length +
  addCoachBillingAddOn.mock.calls.length +
  upsertSubscriptionByUserId.mock.calls.length +
  updateSubscriptionByUserId.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  wasStripeEventProcessed.mockResolvedValue(false);
  getSubscriptionForUser.mockResolvedValue(null);
  cancel.mockResolvedValue({});
  retrieve.mockResolvedValue({ id: "sub_1", status: "active" });
  addFreeAgentAddOn.mockResolvedValue(null);
  addCoachBillingAddOn.mockResolvedValue(null);
  endAddOnsForDeletedStripeSubscription.mockResolvedValue({ userId: null, addOnIds: [] });
});

describe("a dead Stripe subscription grants nothing", () => {
  // Terminal only. `past_due` is dunning still trying and endStripeSubscription handles it if it
  // ends in `unpaid`; `trialing` is a live subscription that has not charged yet.
  for (const status of ["canceled", "unpaid", "incomplete_expired"]) {
    it(`refuses a tier whose subscription is already ${status}`, async () => {
      retrieve.mockResolvedValue({ id: "sub_1", status });
      await handleStripeWebhookEvent(checkout(`evt_${status}`, TIER));

      expect(grantedAnything()).toBe(0);
      expect(logBillingEvent).toHaveBeenCalledWith(
        42,
        "stripe.checkout_for_dead_subscription",
        expect.objectContaining({ subscriptionId: "sub_1", status }),
        `evt_${status}`,
      );
    });
  }

  it("claims the delivery id so Stripe stops retrying it", async () => {
    // There is nothing a later attempt could do differently, and a delivery retried for three
    // days is three days of 500s in somebody's Stripe dashboard. The id goes on this one row --
    // billing_audit_log.stripe_event_id is UNIQUE and is the idempotency check itself.
    retrieve.mockResolvedValue({ id: "sub_1", status: "canceled" });
    await handleStripeWebhookEvent(checkout("evt_claim", TIER));

    const withId = logBillingEvent.mock.calls.filter((c) => c[3] === "evt_claim");
    expect(withId).toHaveLength(1);
  });

  it("refuses a coach band the same way", async () => {
    retrieve.mockResolvedValue({ id: "sub_1", status: "canceled" });
    await handleStripeWebhookEvent(checkout("evt_band", BAND));
    expect(applyCoachSubscriptionBand).not.toHaveBeenCalled();
    expect(grantedAnything()).toBe(0);
  });

  for (const [name, metadata, granter] of [
    ["a Free Agent add-on", FREE_AGENT_ADD_ON, addFreeAgentAddOn],
    ["a coach add-on", COACH_ADD_ON, addCoachBillingAddOn],
  ] as const) {
    it(`refuses ${name}, which has its own Stripe subscription and the same two revocation paths`, async () => {
      // The add-on branches return before the tier branch, so a guard placed with the tier would
      // have missed them -- and an add-on's subscription id lives in users.addOnTerms, which
      // endAddOnsForDeletedStripeSubscription and revokeAddOnAfterRefund both match on, so they
      // find nothing on a delivery that has not landed yet. Same hole, one table over.
      retrieve.mockResolvedValue({ id: "sub_1", status: "canceled" });
      await handleStripeWebhookEvent(checkout(`evt_${metadata.addOnId}`, metadata));
      expect(granter).not.toHaveBeenCalled();
      expect(grantedAnything()).toBe(0);
    });
  }
});

describe("a live subscription grants exactly as before", () => {
  for (const status of ["active", "trialing", "past_due", "incomplete"]) {
    it(`grants on ${status}`, async () => {
      retrieve.mockResolvedValue({ id: "sub_1", status });
      await handleStripeWebhookEvent(checkout(`evt_live_${status}`, TIER));

      expect(updateFreeAgentBilling).toHaveBeenCalledWith(42, { freeAgentTier: "ai_coach_video" });
      expect(logBillingEvent).not.toHaveBeenCalledWith(
        42,
        "stripe.checkout_for_dead_subscription",
        expect.anything(),
        expect.anything(),
      );
    });
  }
});

describe("unknown fails OPEN, in the direction that costs Forge rather than the buyer", () => {
  it("grants when Stripe cannot be read", async () => {
    // The overwhelmingly common delivery is the first one, seconds after a successful checkout.
    // Refusing on an unreadable answer would let a Stripe API blip take away access somebody has
    // just paid for -- the same posture as the guardian-verification refund and the superseded
    // cancel, both of which record and carry on rather than undo a purchase that succeeded.
    retrieve.mockRejectedValue(new Error("stripe is having a day"));
    await handleStripeWebhookEvent(checkout("evt_blip", TIER));
    expect(updateFreeAgentBilling).toHaveBeenCalledWith(42, { freeAgentTier: "ai_coach_video" });
  });

  it("grants when there is no Stripe client at all", async () => {
    // A dev box, or a deploy before the key is set. getStripeClient returns null and the check
    // cannot be made; the purchase still happened.
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.resetModules();
    const fresh = await import("./billing");
    retrieve.mockResolvedValue({ id: "sub_1", status: "canceled" });
    await fresh.handleStripeWebhookEvent(checkout("evt_nokey", TIER));
    expect(updateFreeAgentBilling).toHaveBeenCalledWith(42, { freeAgentTier: "ai_coach_video" });
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_for_this_file");
  });
});

describe("the one-off purchases are not asked about at all", () => {
  it("lets a class lesson through, having no subscription to read", async () => {
    // `payment` mode: session.subscription is null, so the guard is skipped rather than having to
    // exempt these kinds by name.
    await handleStripeWebhookEvent(
      checkout("evt_lesson", { kind: "class_lesson", enrollmentId: "3", lessonId: "9" }, null),
    );
    expect(retrieve).not.toHaveBeenCalled();
    expect(markLessonPurchased).toHaveBeenCalledWith(3, 9);
  });

  it("lets a guardian verification through", async () => {
    await handleStripeWebhookEvent(
      checkout("evt_guardian", { kind: "guardian_verification", athleteId: "7" }, null),
    );
    expect(retrieve).not.toHaveBeenCalled();
    expect(recordPaymentAsParentalVerification).toHaveBeenCalled();
  });
});
