import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// Mocked before billing.ts is ever imported below -- storage.ts's own
// import chain pulls in server/db.ts, which throws at import time with no
// DATABASE_URL (not set in a plain test run). Mocking the module here means
// the real storage.ts/db.ts never actually load.
const updateSubscriptionByUserId = vi.fn();
const updateSubscriptionByStripeId = vi.fn();
const logBillingEvent = vi.fn();
const wasStripeEventProcessed = vi.fn();

vi.mock("./storage", () => ({
  storage: {
    updateSubscriptionByUserId,
    updateSubscriptionByStripeId,
    logBillingEvent,
    wasStripeEventProcessed,
  },
}));

const { handleStripeWebhookEvent } = await import("./billing");

// id is the Stripe *event* wrapper's own id ("evt_...") -- distinct from
// object.id, which is the id of whatever the event is ABOUT (a session,
// subscription, invoice). handleStripeWebhookEvent's idempotency check
// reads event.id specifically, so tests that care about it pass one
// explicitly; tests that don't get a default that's unique enough not to
// collide with anything else in the same run.
function fakeEvent<T>(id: string, type: string, object: T): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

beforeEach(() => {
  vi.clearAllMocks();
  wasStripeEventProcessed.mockResolvedValue(false);
});

describe("checkout.session.completed", () => {
  it("attaches the subscription by userId, not by the not-yet-set stripeSubscriptionId", async () => {
    const event = fakeEvent("evt_1", "checkout.session.completed", {
      id: "cs_123",
      client_reference_id: "42",
      subscription: "sub_abc",
      customer: "cus_xyz",
    });
    await handleStripeWebhookEvent(event);

    expect(updateSubscriptionByStripeId).not.toHaveBeenCalled();
    expect(updateSubscriptionByUserId).toHaveBeenCalledWith(42, {
      stripeCustomerId: "cus_xyz",
      stripeSubscriptionId: "sub_abc",
      status: "active",
    });
    expect(logBillingEvent).toHaveBeenCalledWith(42, "checkout.session.completed", { sessionId: "cs_123" }, "evt_1");
  });

  it("does nothing and never touches billingAuditLog when client_reference_id is missing", async () => {
    // Number(null) is 0, which passes a bare Number.isInteger check -- this
    // is the regression test for the userId-0 foreign-key-violation bug.
    const event = fakeEvent("evt_2", "checkout.session.completed", {
      id: "cs_456",
      client_reference_id: null,
      subscription: "sub_abc",
      customer: "cus_xyz",
    });
    await handleStripeWebhookEvent(event);

    expect(updateSubscriptionByUserId).not.toHaveBeenCalled();
    expect(logBillingEvent).not.toHaveBeenCalled();
  });

  it("does nothing when session.subscription isn't a string (not yet expanded/present)", async () => {
    const event = fakeEvent("evt_3", "checkout.session.completed", {
      id: "cs_789",
      client_reference_id: "42",
      subscription: null,
      customer: "cus_xyz",
    });
    await handleStripeWebhookEvent(event);

    expect(updateSubscriptionByUserId).not.toHaveBeenCalled();
    expect(logBillingEvent).not.toHaveBeenCalled();
  });
});

describe("customer.subscription.updated", () => {
  it("maps every real Stripe status onto this app's subscription_status enum", async () => {
    const cases: [Stripe.Subscription.Status, string | undefined][] = [
      ["trialing", "trialing"],
      ["active", "active"],
      ["past_due", "past_due"],
      ["unpaid", "past_due"],
      ["canceled", "canceled"],
      ["incomplete", undefined],
      ["incomplete_expired", undefined],
      ["paused", undefined],
    ];

    let i = 0;
    for (const [stripeStatus, expectedStatus] of cases) {
      updateSubscriptionByStripeId.mockClear();
      updateSubscriptionByStripeId.mockResolvedValue({ userId: 7 });
      const event = fakeEvent(`evt_status_${i++}`, "customer.subscription.updated", {
        id: "sub_abc",
        status: stripeStatus,
        cancel_at_period_end: false,
        items: { data: [{ current_period_end: 1_700_000_000 }] },
      });
      await handleStripeWebhookEvent(event);

      const patch = updateSubscriptionByStripeId.mock.calls[0][1];
      expect(patch.status).toBe(expectedStatus);
    }
  });

  it("a canceled status update actually persists, not just a separate deleted event", async () => {
    // Regression test: this used to be a two-way ternary that only wrote
    // "past_due" or "active" and dropped everything else, including
    // Stripe canceling a subscription via an *updated* event -- the local
    // row would stay stuck on whatever status it had before.
    updateSubscriptionByStripeId.mockResolvedValue({ userId: 7 });
    const event = fakeEvent("evt_4", "customer.subscription.updated", {
      id: "sub_abc",
      status: "canceled" as Stripe.Subscription.Status,
      cancel_at_period_end: true,
      items: { data: [{ current_period_end: 1_700_000_000 }] },
    });
    await handleStripeWebhookEvent(event);

    expect(updateSubscriptionByStripeId).toHaveBeenCalledWith(
      "sub_abc",
      expect.objectContaining({ status: "canceled" }),
    );
  });

  it("leaves currentPeriodEnd untouched instead of writing an invalid date when items.data is empty", async () => {
    updateSubscriptionByStripeId.mockResolvedValue({ userId: 7 });
    const event = fakeEvent("evt_5", "customer.subscription.updated", {
      id: "sub_abc",
      status: "active" as Stripe.Subscription.Status,
      cancel_at_period_end: false,
      items: { data: [] },
    });
    await handleStripeWebhookEvent(event);

    const patch = updateSubscriptionByStripeId.mock.calls[0][1];
    expect(patch.currentPeriodEnd).toBeUndefined();
  });

  it("skips the audit log when no subscription row matches", async () => {
    updateSubscriptionByStripeId.mockResolvedValue(null);
    const event = fakeEvent("evt_6", "customer.subscription.updated", {
      id: "sub_unknown",
      status: "active" as Stripe.Subscription.Status,
      cancel_at_period_end: false,
      items: { data: [{ current_period_end: 1_700_000_000 }] },
    });
    await handleStripeWebhookEvent(event);

    expect(logBillingEvent).not.toHaveBeenCalled();
  });
});

describe("customer.subscription.deleted", () => {
  it("marks the matched subscription canceled and logs it", async () => {
    updateSubscriptionByStripeId.mockResolvedValue({ userId: 9 });
    const event = fakeEvent("evt_7", "customer.subscription.deleted", { id: "sub_abc" });
    await handleStripeWebhookEvent(event);

    expect(updateSubscriptionByStripeId).toHaveBeenCalledWith("sub_abc", { status: "canceled" });
    expect(logBillingEvent).toHaveBeenCalledWith(
      9,
      "customer.subscription.deleted",
      { subscriptionId: "sub_abc" },
      "evt_7",
    );
  });
});

describe("invoice.payment_failed", () => {
  it("reads the subscription id off the modern parent.subscription_details shape", async () => {
    updateSubscriptionByStripeId.mockResolvedValue({ userId: 3 });
    const event = fakeEvent("evt_8", "invoice.payment_failed", {
      id: "in_123",
      parent: { subscription_details: { subscription: "sub_abc" } },
    });
    await handleStripeWebhookEvent(event);

    expect(updateSubscriptionByStripeId).toHaveBeenCalledWith("sub_abc", { status: "past_due" });
  });

  it("does nothing when the invoice has no subscription id at all", async () => {
    const event = fakeEvent("evt_9", "invoice.payment_failed", { id: "in_456", parent: null });
    await handleStripeWebhookEvent(event);

    expect(updateSubscriptionByStripeId).not.toHaveBeenCalled();
  });
});

describe("unrecognized event types", () => {
  it("is a silent no-op", async () => {
    const event = fakeEvent("evt_10", "customer.created", { id: "cus_xyz" });
    await expect(handleStripeWebhookEvent(event)).resolves.toBeUndefined();
    expect(updateSubscriptionByUserId).not.toHaveBeenCalled();
    expect(updateSubscriptionByStripeId).not.toHaveBeenCalled();
    expect(logBillingEvent).not.toHaveBeenCalled();
  });
});

describe("redelivered events (Stripe's at-least-once delivery guarantee)", () => {
  it("skips an event whose id was already processed, without touching any subscription", async () => {
    wasStripeEventProcessed.mockResolvedValue(true);
    const event = fakeEvent("evt_already_done", "checkout.session.completed", {
      id: "cs_999",
      client_reference_id: "42",
      subscription: "sub_abc",
      customer: "cus_xyz",
    });
    await handleStripeWebhookEvent(event);

    expect(wasStripeEventProcessed).toHaveBeenCalledWith("evt_already_done");
    expect(updateSubscriptionByUserId).not.toHaveBeenCalled();
    expect(logBillingEvent).not.toHaveBeenCalled();
  });

  it("processes a not-yet-seen event normally", async () => {
    wasStripeEventProcessed.mockResolvedValue(false);
    const event = fakeEvent("evt_new", "checkout.session.completed", {
      id: "cs_111",
      client_reference_id: "42",
      subscription: "sub_abc",
      customer: "cus_xyz",
    });
    await handleStripeWebhookEvent(event);

    expect(updateSubscriptionByUserId).toHaveBeenCalled();
    expect(logBillingEvent).toHaveBeenCalledWith(
      42,
      "checkout.session.completed",
      { sessionId: "cs_111" },
      "evt_new",
    );
  });
});
