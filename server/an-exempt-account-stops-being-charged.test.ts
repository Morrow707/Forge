import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// Scott, 2026-11-21: "if they signup first, put their card in and pay, when i add them to the
// exempt list ... can we auto push a refund?" / "most recent payment only, build it out."
// stopBillingForExemptAccount cancels every card subscription and refunds the latest paid
// invoice, once. These drive it against a fake Stripe.
const getSubscriptionForUser = vi.fn();
const getUser = vi.fn();
const logBillingEvent = vi.fn();
vi.mock("./storage", () => ({ storage: { getSubscriptionForUser, getUser, logBillingEvent } }));

const { stopBillingForExemptAccount } = await import("./billing");

function fakeStripe(over: Partial<Record<"retrieve" | "list" | "cancel" | "refund", ReturnType<typeof vi.fn>>> = {}) {
  const retrieve =
    over.retrieve ??
    vi.fn().mockResolvedValue({ latest_invoice: { id: "in_1", status: "paid", amount_paid: 1999, currency: "usd" } });
  const list =
    over.list ?? vi.fn().mockResolvedValue({ data: [{ status: "paid", payment: { payment_intent: "pi_1" } }] });
  const cancel = over.cancel ?? vi.fn().mockResolvedValue({});
  const refund = over.refund ?? vi.fn().mockResolvedValue({ amount: 1999 });
  const stripe = {
    subscriptions: { retrieve, cancel },
    invoicePayments: { list },
    refunds: { create: refund },
  } as unknown as Stripe;
  return { stripe, retrieve, list, cancel, refund };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ id: 7, freeAgentAddOns: [], billingAddOns: [], addOnTerms: {} });
  getSubscriptionForUser.mockResolvedValue({ status: "active", stripeSubscriptionId: "sub_1", appleOriginalTransactionId: null });
});

describe("an account added to the exempt list stops being charged", () => {
  it("cancels the card plan and refunds the most recent payment, once", async () => {
    const f = fakeStripe();
    const result = await stopBillingForExemptAccount(7, f.stripe);
    expect(f.cancel).toHaveBeenCalledTimes(1);
    expect(f.cancel).toHaveBeenCalledWith("sub_1");
    expect(f.refund).toHaveBeenCalledTimes(1);
    expect(f.refund).toHaveBeenCalledWith({ payment_intent: "pi_1" });
    expect(result.cancelled).toEqual(["sub_1"]);
    expect(result.refunds).toEqual([{ subscriptionId: "sub_1", amountCents: 1999, currency: "usd" }]);
    expect(result.failed).toEqual([]);
  });

  it("refunds nothing when the latest invoice was not a real payment", async () => {
    const f = fakeStripe({
      retrieve: vi.fn().mockResolvedValue({ latest_invoice: { id: "in_0", status: "paid", amount_paid: 0, currency: "usd" } }),
    });
    const result = await stopBillingForExemptAccount(7, f.stripe);
    expect(f.cancel).toHaveBeenCalledTimes(1);
    expect(f.refund).not.toHaveBeenCalled();
    expect(result.refunds).toEqual([]);
  });

  it("does nothing at Stripe for an account with no live card plan", async () => {
    getSubscriptionForUser.mockResolvedValue({ status: "canceled", stripeSubscriptionId: "sub_old", appleOriginalTransactionId: null });
    const f = fakeStripe();
    const result = await stopBillingForExemptAccount(7, f.stripe);
    expect(f.retrieve).not.toHaveBeenCalled();
    expect(f.cancel).not.toHaveBeenCalled();
    expect(f.refund).not.toHaveBeenCalled();
    expect(result.cancelled).toEqual([]);
  });

  it("does not refund when the cancel fails, and names the subscription", async () => {
    const f = fakeStripe({ cancel: vi.fn().mockRejectedValue(new Error("stripe down")) });
    const result = await stopBillingForExemptAccount(7, f.stripe);
    expect(f.refund).not.toHaveBeenCalled();
    expect(result.failed).toEqual([{ subscriptionId: "sub_1", step: "cancel", error: "stripe down" }]);
  });

  it("reports a refund that fails after the cancel, and never throws", async () => {
    const f = fakeStripe({ refund: vi.fn().mockRejectedValue(new Error("card network")) });
    const result = await stopBillingForExemptAccount(7, f.stripe);
    expect(result.cancelled).toEqual(["sub_1"]);
    expect(result.refunds).toEqual([]);
    expect(result.failed).toEqual([{ subscriptionId: "sub_1", step: "refund", error: "card network" }]);
  });

  it("reports an App Store plan and touches nothing at Stripe for it", async () => {
    getSubscriptionForUser.mockResolvedValue({ status: "active", stripeSubscriptionId: null, appleOriginalTransactionId: "2000001" });
    const f = fakeStripe();
    const result = await stopBillingForExemptAccount(7, f.stripe);
    expect(result.appStoreSubscription).toBe(true);
    expect(f.cancel).not.toHaveBeenCalled();
    expect(f.refund).not.toHaveBeenCalled();
  });

  it("names the subscription when Stripe is not configured", async () => {
    const result = await stopBillingForExemptAccount(7, null);
    expect(result.stripeConfigured).toBe(false);
    expect(result.failed).toEqual([{ subscriptionId: "sub_1", step: "read", error: "stripe_not_configured" }]);
  });
});
