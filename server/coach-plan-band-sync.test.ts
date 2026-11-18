import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bandForAthleteCount } from "@shared/billing-tiers";

/** The band follows the plan onto the Stripe subscription (2026-10-05). Before this a plan
 * change recorded a number and left Stripe billing the old band. Up is prorated now; down
 * bills from the next invoice with no credit; no subscription means nothing is touched. */
const subscriptionsRetrieve = vi.fn();
const subscriptionsUpdate = vi.fn();
const subscriptionItemsUpdate = vi.fn();
const getSubscriptionForUser = vi.fn();
const applyCoachSubscriptionBand = vi.fn();
const logBillingEvent = vi.fn();

vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: vi.fn() } };
    billingPortal = { sessions: { create: vi.fn() } };
    subscriptions = { retrieve: subscriptionsRetrieve, update: subscriptionsUpdate };
    subscriptionItems = { update: subscriptionItemsUpdate };
  },
}));
vi.mock("./storage", () => ({ storage: { getSubscriptionForUser, applyCoachSubscriptionBand, logBillingEvent } }));

async function loadBilling() {
  vi.resetModules();
  process.env.BILLING_LIVE = "true";
  process.env.STRIPE_SECRET_KEY = "sk_test_stub";
  process.env.STRIPE_PRICE_COACH_PER_ATHLETE = "price_per_athlete";
  return import("./billing");
}
const savedEnv = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  getSubscriptionForUser.mockResolvedValue({ stripeSubscriptionId: "sub_1", accountType: "coach", status: "active" });
  subscriptionsRetrieve.mockResolvedValue({ items: { data: [{ id: "si_1", quantity: 20, price: { id: "price_per_athlete" } }] } });
});
afterEach(() => {
  process.env = { ...savedEnv };
});

describe("syncCoachSubscriptionBand", () => {
  it("raises the quantity to exactly the athletes, prorated", async () => {
    const { syncCoachSubscriptionBand } = await loadBilling();
    const result = await syncCoachSubscriptionBand(7, 23);
    // 23 athletes are 23 x $4, never the 40 of the band's ceiling (2026-11-18).
    expect(result).toEqual({ synced: true, previousQuantity: 20, quantity: 23, prorated: true });
    expect(subscriptionItemsUpdate).toHaveBeenCalledWith("si_1", { quantity: 23, proration_behavior: "create_prorations" });
    expect(applyCoachSubscriptionBand).toHaveBeenCalledWith(7, bandForAthleteCount(23).id);
  });

  it("lowers it without a credit", async () => {
    const { syncCoachSubscriptionBand } = await loadBilling();
    const result = await syncCoachSubscriptionBand(7, 3);
    expect(result).toMatchObject({ synced: true, prorated: false, quantity: 3 });
    expect(subscriptionItemsUpdate).toHaveBeenCalledWith("si_1", { quantity: 3, proration_behavior: "none" });
  });

  it("moves for one athlete inside a band, does nothing when it already matches, and nothing without a live subscription", async () => {
    const { syncCoachSubscriptionBand } = await loadBilling();
    expect(await syncCoachSubscriptionBand(7, 18)).toMatchObject({ synced: true, previousQuantity: 20, quantity: 18 });
    expect(subscriptionItemsUpdate).toHaveBeenCalledWith("si_1", { quantity: 18, proration_behavior: "none" });
    subscriptionItemsUpdate.mockClear();
    expect(await syncCoachSubscriptionBand(7, 20)).toMatchObject({ synced: true, previousQuantity: 20, quantity: 20 });
    expect(subscriptionItemsUpdate).not.toHaveBeenCalled();
    getSubscriptionForUser.mockResolvedValue(null);
    expect(await syncCoachSubscriptionBand(7, 50)).toEqual({ synced: false, reason: "no_stripe_subscription" });
  });
});
