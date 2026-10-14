import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

/* A REFUNDED TIER KEPT FULL ACCESS, AND A REFUNDED BAND KEPT ITS ENTITLEMENTS.
 *
 * Found 2026-10-14 by the ten-dimension billing sweep -- six of the ten dimensions reported it
 * independently, which is what a real one looks like. `charge.refunded` called exactly one thing,
 * `revokeAddOnsForStripeSubscription`, and that searches `users.addOnTerms` and nothing else. So
 * a refunded ADD-ON was revoked correctly and a refunded TIER (users.freeAgentTier) or COACH BAND
 * (users.billingTier) was not touched at all: the money went back to the card and the access
 * stayed on, forever.
 *
 * It is the same shape as the handler it sits beside, three days older: written for one of the
 * TWO places a Stripe subscription id can live. An add-on's id is in users.addOnTerms; the tier's
 * and the band's is on the subscriptions row, because subscriptions.userId is UNIQUE and that one
 * row belongs to the tier. A handler that knows only one of those two is half a handler.
 *
 * Scott's rule, in his words: "if something is refunded then they don't have access obviously."
 * So a refund does what a cancellation does -- it is the more terminal of the two events, not the
 * gentler one.
 */
const revokeAddOnsForStripeSubscription = vi.fn();
const updateSubscriptionByStripeId = vi.fn();
const updateFreeAgentBilling = vi.fn();
const clearCoachBand = vi.fn();
const logBillingEvent = vi.fn();
const wasStripeEventProcessed = vi.fn();
const getSubscriptionForUser = vi.fn();

vi.mock("./storage", () => ({
  storage: {
    revokeAddOnsForStripeSubscription,
    updateSubscriptionByStripeId,
    updateFreeAgentBilling,
    clearCoachBand,
    logBillingEvent,
    wasStripeEventProcessed,
    getSubscriptionForUser,
    updateSubscriptionByUserId: vi.fn(),
    upsertSubscriptionByUserId: vi.fn(),
    applyCoachSubscriptionBand: vi.fn(),
  },
}));

// The invoice -> subscription lookup needs a Stripe client; faked so nothing leaves the process.
const invoiceRetrieve = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    invoices = { retrieve: invoiceRetrieve };
    subscriptions = { cancel: vi.fn(), retrieve: vi.fn(), update: vi.fn() };
    checkout = { sessions: { create: vi.fn() } };
    refunds = { create: vi.fn() };
    billingPortal = { sessions: { create: vi.fn() } };
    webhooks = { constructEvent: vi.fn() };
  },
}));

vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_for_this_file");
vi.stubEnv("BILLING_LIVE", "true");

const { handleStripeWebhookEvent } = await import("./billing");

function refund(id: string, subscriptionId: string) {
  invoiceRetrieve.mockResolvedValue({ id: "in_1", subscription: subscriptionId });
  return {
    id,
    type: "charge.refunded",
    data: { object: { id: "ch_1", invoice: "in_1" } },
  } as unknown as Stripe.Event;
}

beforeEach(() => {
  vi.clearAllMocks();
  wasStripeEventProcessed.mockResolvedValue(false);
  revokeAddOnsForStripeSubscription.mockResolvedValue({ userId: null, addOnIds: [] });
  updateSubscriptionByStripeId.mockResolvedValue(null);
});

describe("a Stripe refund reaches every entitlement that subscription paid for", () => {
  it("takes the SKU off a Free Agent whose tier was refunded", async () => {
    updateSubscriptionByStripeId.mockResolvedValue({ userId: 9, accountType: "free_agent" });
    await handleStripeWebhookEvent(refund("evt_r1", "sub_tier"));

    expect(updateFreeAgentBilling).toHaveBeenCalledWith(9, { freeAgentTier: null });
    // And the row is marked, so no later event reads it as live.
    expect(updateSubscriptionByStripeId).toHaveBeenCalledWith("sub_tier", { status: "canceled" });
  });

  it("takes the band off a coach whose subscription was refunded", async () => {
    updateSubscriptionByStripeId.mockResolvedValue({ userId: 4, accountType: "coach" });
    await handleStripeWebhookEvent(refund("evt_r2", "sub_band"));

    expect(clearCoachBand).toHaveBeenCalledWith(4);
    expect(updateFreeAgentBilling).not.toHaveBeenCalled();
  });

  it("never clears a coach band on a Free Agent's refund, or a SKU on a coach's", async () => {
    updateSubscriptionByStripeId.mockResolvedValue({ userId: 9, accountType: "free_agent" });
    await handleStripeWebhookEvent(refund("evt_r3", "sub_tier"));
    expect(clearCoachBand).not.toHaveBeenCalled();
  });

  it("still revokes a refunded add-on, which is all it ever did before", async () => {
    revokeAddOnsForStripeSubscription.mockResolvedValue({ userId: 7, addOnIds: ["all_classes"] });
    await handleStripeWebhookEvent(refund("evt_r4", "sub_addon"));

    expect(revokeAddOnsForStripeSubscription).toHaveBeenCalledWith("sub_addon");
    expect(logBillingEvent).toHaveBeenCalledWith(
      7,
      "charge.refunded",
      expect.objectContaining({ addOnIds: ["all_classes"] }),
      "evt_r4",
    );
  });

  it("writes nothing when the refund matches neither an add-on nor a subscription row", async () => {
    // A one-off charge: the guardian verification's 50c, or a paid class lesson. Neither has a
    // tier or a band behind it, so there is nothing to revoke and inventing one would be worse.
    await handleStripeWebhookEvent(refund("evt_r5", "sub_unknown"));
    expect(updateFreeAgentBilling).not.toHaveBeenCalled();
    expect(clearCoachBand).not.toHaveBeenCalled();
  });

  it("logs the revocation against the account, naming which kind it was", async () => {
    // An operator reconciling a refund needs to see WHAT was taken away, not just that the
    // event arrived -- a band and a tier are different conversations with the customer.
    updateSubscriptionByStripeId.mockResolvedValue({ userId: 4, accountType: "coach" });
    await handleStripeWebhookEvent(refund("evt_r6", "sub_band"));

    expect(logBillingEvent).toHaveBeenCalledWith(
      4,
      "charge.refunded",
      expect.objectContaining({ subscriptionId: "sub_band", revoked: "band" }),
      "evt_r6",
    );
  });
});
