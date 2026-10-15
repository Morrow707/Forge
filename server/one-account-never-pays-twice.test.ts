import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

/* TWO LIVE STRIPE SUBSCRIPTIONS ON ONE ACCOUNT, AND NOTHING EVER CANCELLED THE FIRST.
 *
 * Found 2026-10-11 by reading the web checkout path against the Apple one. `subscriptions.userId`
 * is UNIQUE, so one account has at most one row and that row holds the TIER's Stripe subscription
 * id -- an add-on's lives in users.addOnTerms. `checkout.session.completed` overwrote that id with
 * whatever had just been bought and nothing touched the subscription it replaced, so a Free Agent
 * who upgraded Basic -> AI Coach + Video on the web was billed $4.99 AND $19.99 a month, forever,
 * with nothing left in Forge that could find the older one.
 *
 * APPLE CANNOT DO THIS TO US, and that is the comparison that makes it a bug rather than a
 * choice: all three tiers share ONE App Store subscription group precisely so a swap replaces
 * instead of stacking. The two AI tiers were RECREATED as _v3 on 2026-10-05 for exactly this
 * reason -- created each in a group of their own, the sandbox held Basic and AI Coach + Video at
 * once, and a subscription cannot change group. The web rail had no equivalent.
 *
 * AND THE SAME HANDLER COULD NOT RECORD THE SUBSCRIPTION ID AT ALL for an account with no
 * subscriptions row. updateSubscriptionByUserId is a plain UPDATE; the row is created at signup
 * by createTrialSubscription, which a COACHED athlete never meets, so an athlete who later lost
 * their coach is a Free Agent without one. The tier was still granted (updateFreeAgentBilling
 * writes users.freeAgentTier, which is what every gate reads), so the purchase looked fine --
 * and stripeSubscriptionId, the handle every later event matches on, was never written. So
 * customer.subscription.deleted found nothing, the SKU was never cleared, and a cancelled or
 * refunded tier went on working forever: the bug found on the first live cancellation, in the one
 * case where the fix for it cannot fire. The Apple half of this was fixed on 2026-10-05
 * (upsertSubscriptionByUserId) and this half was left standing for six days.
 */
const upsertSubscriptionByUserId = vi.fn();
const updateSubscriptionByUserId = vi.fn();
const upsertStripeCustomerId = vi.fn();
const updateSubscriptionByStripeId = vi.fn();
const getSubscriptionForUser = vi.fn();
const updateFreeAgentBilling = vi.fn();
const applyCoachSubscriptionBand = vi.fn();
const logBillingEvent = vi.fn();
const wasStripeEventProcessed = vi.fn();
const clearCoachBand = vi.fn();
const revokeAddOnsForStripeSubscription = vi.fn();
const addFreeAgentAddOn = vi.fn();
const recordPaymentAsParentalVerification = vi.fn();
const endAddOnsForDeletedStripeSubscription = vi.fn();
const clearCoachBandFn = vi.fn();

vi.mock("./storage", () => ({
  storage: {
    upsertSubscriptionByUserId,
    updateSubscriptionByUserId,
    upsertStripeCustomerId,
    updateSubscriptionByStripeId,
    getSubscriptionForUser,
    updateFreeAgentBilling,
    applyCoachSubscriptionBand,
    logBillingEvent,
    wasStripeEventProcessed,
    clearCoachBand,
    revokeAddOnsForStripeSubscription,
    addFreeAgentAddOn,
    recordPaymentAsParentalVerification,
    endAddOnsForDeletedStripeSubscription,
  },
}));

// The Stripe client billing.ts builds lazily off STRIPE_SECRET_KEY. Faked at the module level so
// the cancel call can be observed: nothing here talks to Stripe.
const cancel = vi.fn();
// `subscriptions.retrieve` resolves ACTIVE: every checkout.session.completed now asks Stripe
// whether the subscription it is granting for is still alive (see
// a-grant-needs-a-live-subscription.test.ts). A bare vi.fn() resolves undefined, which the guard
// catches and fails OPEN on, so these cases would still pass -- but on an error path, logging a
// read failure that did not happen. Stating it keeps them on the ordinary path.
const subscriptionRetrieve = vi.fn().mockResolvedValue({ id: "sub_live", status: "active" });
vi.mock("stripe", () => ({
  default: class {
    subscriptions = { cancel, retrieve: subscriptionRetrieve, update: vi.fn() };
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

function tierPurchase(id: string, subscriptionId: string, tier: string) {
  return {
    id,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${id}`,
        client_reference_id: "42",
        subscription: subscriptionId,
        customer: "cus_xyz",
        metadata: { kind: "free_agent_tier", tier },
      },
    },
  } as unknown as Stripe.Event;
}

beforeEach(() => {
  vi.clearAllMocks();
  wasStripeEventProcessed.mockResolvedValue(false);
  getSubscriptionForUser.mockResolvedValue(null);
  cancel.mockResolvedValue({})
  endAddOnsForDeletedStripeSubscription.mockResolvedValue({ userId: null, addOnIds: [] });
});

describe("a tier purchase replaces the subscription it supersedes", () => {
  it("cancels the previous Stripe subscription, crediting the unused remainder", async () => {
    getSubscriptionForUser.mockResolvedValue({ stripeSubscriptionId: "sub_basic" });
    await handleStripeWebhookEvent(tierPurchase("evt_up", "sub_video", "ai_coach_video"));

    expect(cancel).toHaveBeenCalledWith("sub_basic", { prorate: true, invoice_now: true });
    // The new id is what the row carries afterwards, so the cancellation of the old one is the
    // only moment it can ever be acted on.
    expect(upsertSubscriptionByUserId).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ stripeSubscriptionId: "sub_video" }),
    );
  });

  it("leaves the one it just bought alone", async () => {
    // A redelivered event, or a webhook arriving after the row already carries this id. Cancelling
    // here would cancel the purchase that just succeeded.
    getSubscriptionForUser.mockResolvedValue({ stripeSubscriptionId: "sub_video" });
    await handleStripeWebhookEvent(tierPurchase("evt_same", "sub_video", "ai_coach_video"));

    expect(cancel).not.toHaveBeenCalled();
  });

  it("cancels nothing for a first purchase", async () => {
    getSubscriptionForUser.mockResolvedValue({ stripeSubscriptionId: null });
    await handleStripeWebhookEvent(tierPurchase("evt_first", "sub_basic", "basic"));

    expect(cancel).not.toHaveBeenCalled();
  });

  it("never touches an add-on's subscription, which lives in addOnTerms and not on the row", async () => {
    // An add-on checkout breaks out of the handler long before the tier branch, so the row's id
    // is neither read nor overwritten and the add-on's own subscription cannot be cancelled by
    // this path. That separation is what makes the cancel safe to do at all.
    getSubscriptionForUser.mockResolvedValue({ stripeSubscriptionId: "sub_tier" });
    await handleStripeWebhookEvent({
      id: "evt_addon",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_addon",
          client_reference_id: "42",
          subscription: "sub_addon",
          customer: "cus_xyz",
          metadata: { kind: "free_agent_add_on", addOnId: "all_classes" },
        },
      },
    } as unknown as Stripe.Event);

    expect(cancel).not.toHaveBeenCalled();
    expect(addFreeAgentAddOn).toHaveBeenCalled();
  });

  it("records an audit row an operator can finish by hand when Stripe refuses the cancel", async () => {
    // The purchase has already succeeded and the entitlement is already written. Throwing here
    // would roll back access somebody paid for, to fix a billing duplicate -- so it is logged,
    // named, and left for a person. Same posture as the guardian-verification refund.
    getSubscriptionForUser.mockResolvedValue({ stripeSubscriptionId: "sub_basic" });
    cancel.mockRejectedValue(new Error("No such subscription"));
    await handleStripeWebhookEvent(tierPurchase("evt_fail", "sub_video", "ai_coach_video"));

    expect(logBillingEvent).toHaveBeenCalledWith(
      42,
      "stripe.subscription.supersede_failed",
      expect.objectContaining({ subscriptionId: "sub_basic" }),
    );
    // And the purchase still landed.
    expect(updateFreeAgentBilling).toHaveBeenCalledWith(42, { freeAgentTier: "ai_coach_video" });
  });
});

describe("a Free Agent with no subscriptions row still gets their purchase recorded", () => {
  it("upserts rather than updating, so stripeSubscriptionId is written either way", async () => {
    getSubscriptionForUser.mockResolvedValue(null);
    await handleStripeWebhookEvent(tierPurchase("evt_rowless", "sub_new", "ai_coach"));

    // The whole finding in one assertion: an UPDATE on a row that does not exist writes nothing,
    // and the id it fails to write is the handle every cancellation and refund matches on.
    expect(upsertSubscriptionByUserId).toHaveBeenCalledWith(42, {
      accountType: "free_agent",
      tier: expect.any(String),
      status: "active",
      stripeCustomerId: "cus_xyz",
      stripeSubscriptionId: "sub_new",
      cancelAtPeriodEnd: false,
    });
    expect(updateSubscriptionByUserId).not.toHaveBeenCalled();
  });

  it("clears a cancel-at-period-end left over from the subscription it replaced", async () => {
    getSubscriptionForUser.mockResolvedValue({ stripeSubscriptionId: "sub_old" });
    await handleStripeWebhookEvent(tierPurchase("evt_return", "sub_again", "basic"));

    expect(upsertSubscriptionByUserId).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ cancelAtPeriodEnd: false }),
    );
  });

  it("still writes the SKU every gate reads", async () => {
    await handleStripeWebhookEvent(tierPurchase("evt_sku", "sub_new", "ai_coach_video"));
    expect(updateFreeAgentBilling).toHaveBeenCalledWith(42, { freeAgentTier: "ai_coach_video" });
  });

  it("upserts a coach's band too, because a PROMOTED coach has no row either", async () => {
    // The same hole through a different door. A coach gets a trial row from every SIGNUP path,
    // but storage.setUserRole -- an admin's "Change role" on More -> Users -- promotes an
    // athlete to coach and creates none, and a coached athlete never had one. The band itself
    // would still have been written (applyCoachSubscriptionBand writes users.billingTier
    // directly, which is why it would have looked like it worked), leaving
    // syncCoachSubscriptionBand answering "no_stripe_subscription" forever and the cancellation
    // unable to clear the band.
    await handleStripeWebhookEvent({
      id: "evt_band",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_band",
          client_reference_id: "7",
          subscription: "sub_band",
          customer: "cus_school",
          metadata: { kind: "coach_subscription", band: "21-40" },
        },
      },
    } as unknown as Stripe.Event);

    expect(upsertSubscriptionByUserId).toHaveBeenCalledWith(7, {
      accountType: "coach",
      // What createTrialSubscription writes, and inert: nothing reads subscriptions.tier on the
      // coach side since the Coaches Corner gate moved onto the entitlements object.
      tier: "base",
      status: "active",
      stripeCustomerId: "cus_school",
      stripeSubscriptionId: "sub_band",
      cancelAtPeriodEnd: false,
    });
    // And the band is still recorded, which is the thing actually bought.
    expect(applyCoachSubscriptionBand).toHaveBeenCalled();
  });

  it("falls back to a plain patch for a subscription it cannot build a row from", async () => {
    // A subscription-mode session with no kind this handler knows. accountType and tier are
    // both NOT NULL with no default, so guessing either would write a row whose meaning nobody
    // chose -- a patch that matches nothing is the honest outcome there.
    await handleStripeWebhookEvent({
      id: "evt_unknown",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_unknown",
          client_reference_id: "9",
          subscription: "sub_mystery",
          customer: "cus_mystery",
          metadata: {},
        },
      },
    } as unknown as Stripe.Event);

    expect(updateSubscriptionByUserId).toHaveBeenCalledWith(9, {
      stripeCustomerId: "cus_mystery",
      stripeSubscriptionId: "sub_mystery",
      status: "active",
    });
    expect(upsertSubscriptionByUserId).not.toHaveBeenCalled();
  });
});

/* AND THE ADD-ON NOBODY COULD CANCEL (added 2026-10-14).
 *
 * customer.subscription.deleted matched the `subscriptions` table only, and an add-on's
 * subscription id is not there -- it is in users.addOnTerms, because subscriptions.userId is
 * UNIQUE and that row holds the TIER. So the handler did nothing at all for an add-on, and a
 * coach who cancelled Coaches Corner in the Stripe billing portal (the portal Forge opens for
 * them) kept it forever after the billing stopped.
 *
 * revokeAddOnsForStripeSubscription existed and had exactly ONE caller, charge.refunded -- which
 * is how a whole family of lifecycle events ended up blind to half the places an id can live.
 */
describe("a deleted Stripe subscription ends the add-on it was paying for", () => {
  function deleted(id: string, subscriptionId: string, periodEnd: number | undefined) {
    return {
      id,
      type: "customer.subscription.deleted",
      data: { object: { id: subscriptionId, current_period_end: periodEnd } },
    } as unknown as Stripe.Event
  }

  it("ends the add-on even though the subscriptions table knows nothing about it", async () => {
    updateSubscriptionByStripeId.mockResolvedValue(null)   // not the tier's subscription
    endAddOnsForDeletedStripeSubscription.mockResolvedValue({ userId: 4, addOnIds: ["coaches_corner"] })
    await handleStripeWebhookEvent(deleted("evt_d1", "sub_corner", 1800000000))

    expect(endAddOnsForDeletedStripeSubscription).toHaveBeenCalledWith("sub_corner", new Date(1800000000 * 1000))
    expect(logBillingEvent).toHaveBeenCalledWith(
      4,
      "customer.subscription.deleted",
      expect.objectContaining({ addOnIds: ["coaches_corner"] }),
      "evt_d1",
    )
  })

  it("honours the month already paid for, rather than cutting it off", async () => {
    // A cancellation is not a refund: shared/add-on-terms.ts gives a cancelled add-on until the
    // end of the month that was bought. Stripe reports that period on the subscription it is
    // deleting, so it is passed down rather than invented here.
    updateSubscriptionByStripeId.mockResolvedValue(null)
    const future = Math.floor(Date.now() / 1000) + 10 * 24 * 60 * 60
    await handleStripeWebhookEvent(deleted("evt_d2", "sub_corner", future))

    const [, accessUntil] = endAddOnsForDeletedStripeSubscription.mock.calls[0]
    expect(accessUntil.getTime()).toBeGreaterThan(Date.now())
  })

  it("falls back to now when Stripe reports no period", async () => {
    updateSubscriptionByStripeId.mockResolvedValue(null)
    await handleStripeWebhookEvent(deleted("evt_d3", "sub_corner", undefined))

    const [, accessUntil] = endAddOnsForDeletedStripeSubscription.mock.calls[0]
    expect(accessUntil.getTime()).toBeLessThanOrEqual(Date.now() + 1000)
  })

  it("still clears a Free Agent tier, which is what this handler always did", async () => {
    updateSubscriptionByStripeId.mockResolvedValue({ userId: 9, accountType: "free_agent" })
    await handleStripeWebhookEvent(deleted("evt_d4", "sub_tier", 1800000000))

    expect(updateFreeAgentBilling).toHaveBeenCalledWith(9, { freeAgentTier: null })
    // And the add-on lookup runs regardless -- a tier subscription simply matches no add-on.
    expect(endAddOnsForDeletedStripeSubscription).toHaveBeenCalled()
  })

  it("logs nothing extra when the subscription paid for no add-on", async () => {
    updateSubscriptionByStripeId.mockResolvedValue({ userId: 9, accountType: "free_agent" })
    endAddOnsForDeletedStripeSubscription.mockResolvedValue({ userId: null, addOnIds: [] })
    await handleStripeWebhookEvent(deleted("evt_d5", "sub_tier", 1800000000))

    const addOnLogs = logBillingEvent.mock.calls.filter((c) => c[2] && "addOnIds" in c[2])
    expect(addOnLogs).toEqual([])
  })
})
