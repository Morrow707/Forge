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
const chargeRetrieve = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    invoices = { retrieve: invoiceRetrieve };
    charges = { retrieve: chargeRetrieve };
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

/* A CHARGEBACK IS A REFUND THE CUSTOMER FORCED, AND NOTHING HANDLED ONE (added 2026-10-14).
 *
 * There was no dispute branch anywhere in the server -- grep for "dispute" across server/ hit
 * nothing but legal document prose. So a person could charge back through their bank, get the
 * money, and keep the tier or the add-on indefinitely, because the only thing that revoked
 * anything was a refund Forge itself issued.
 *
 * The revocation is now ONE function shared with charge.refunded, deliberately: the refund path
 * was already the only caller of revokeAddOnsForStripeSubscription, and copying it for disputes
 * would have produced the fifth instance of this sweep's recurring defect -- a handler that
 * knows one of the two places a subscription id can live.
 */
describe("a chargeback revokes what a refund revokes", () => {
  function disputeOpened(id: string, subscriptionId: string) {
    chargeRetrieve.mockResolvedValue({ id: "ch_disputed", invoice: "in_d" })
    invoiceRetrieve.mockResolvedValue({ id: "in_d", subscription: subscriptionId })
    return {
      id,
      type: "charge.dispute.created",
      data: { object: { id: "dp_1", charge: "ch_disputed", reason: "fraudulent", status: "needs_response" } },
    } as unknown as Stripe.Event
  }

  it("takes the tier off a Free Agent who charged back", async () => {
    updateSubscriptionByStripeId.mockResolvedValue({ userId: 9, accountType: "free_agent" })
    await handleStripeWebhookEvent(disputeOpened("evt_dp1", "sub_tier"))
    expect(updateFreeAgentBilling).toHaveBeenCalledWith(9, { freeAgentTier: null })
  })

  it("takes the band off a coach who charged back", async () => {
    updateSubscriptionByStripeId.mockResolvedValue({ userId: 4, accountType: "coach" })
    await handleStripeWebhookEvent(disputeOpened("evt_dp2", "sub_band"))
    expect(clearCoachBand).toHaveBeenCalledWith(4)
  })

  it("revokes a disputed add-on too, through the same one function", async () => {
    revokeAddOnsForStripeSubscription.mockResolvedValue({ userId: 7, addOnIds: ["coaches_corner"] })
    await handleStripeWebhookEvent(disputeOpened("evt_dp3", "sub_addon"))
    expect(revokeAddOnsForStripeSubscription).toHaveBeenCalledWith("sub_addon")
  })

  it("records the dispute and its reason, not just that something was revoked", async () => {
    // An operator reconciling a chargeback needs the dispute id and why it was raised -- that is
    // the difference between a fraud claim and a billing complaint, and they are different
    // conversations.
    updateSubscriptionByStripeId.mockResolvedValue({ userId: 9, accountType: "free_agent" })
    await handleStripeWebhookEvent(disputeOpened("evt_dp4", "sub_tier"))
    expect(logBillingEvent).toHaveBeenCalledWith(
      9,
      "charge.dispute.created",
      expect.objectContaining({ disputeId: "dp_1", reason: "fraudulent" }),
      "evt_dp4",
    )
  })

  it("does nothing when the disputed charge resolves to no subscription", async () => {
    // A one-off charge: the guardian verification's 50c, or a paid class lesson. Neither has a
    // subscription behind it, and inventing one to revoke would be worse than doing nothing.
    chargeRetrieve.mockResolvedValue({ id: "ch_x", invoice: undefined })
    await handleStripeWebhookEvent({
      id: "evt_dp5",
      type: "charge.dispute.created",
      data: { object: { id: "dp_2", charge: "ch_x" } },
    } as unknown as Stripe.Event)
    expect(updateFreeAgentBilling).not.toHaveBeenCalled()
    expect(clearCoachBand).not.toHaveBeenCalled()
  })

  it("survives Stripe refusing the charge lookup", async () => {
    // The webhook must not 500: Stripe retries a failed delivery, and a handler that throws on a
    // lookup error would retry forever.
    chargeRetrieve.mockRejectedValue(new Error("No such charge"))
    await expect(
      handleStripeWebhookEvent({
        id: "evt_dp6",
        type: "charge.dispute.created",
        data: { object: { id: "dp_3", charge: "ch_gone" } },
      } as unknown as Stripe.Event),
    ).resolves.not.toThrow()
  })

  it("records a closed dispute and restores nothing", async () => {
    // A dispute Forge WINS does not hand the tier back automatically: the same event arrives for
    // one merely withdrawn, and the account has been revoked for weeks by then. An admin
    // re-grants. This exists so a won dispute is findable at all.
    await handleStripeWebhookEvent({
      id: "evt_dp7",
      type: "charge.dispute.closed",
      data: { object: { id: "dp_4", status: "won" } },
    } as unknown as Stripe.Event)
    expect(updateFreeAgentBilling).not.toHaveBeenCalled()
    expect(clearCoachBand).not.toHaveBeenCalled()
  })
})
