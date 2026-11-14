import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Scott, 2026-11-13: "when a user goes to upgrade, and clicks a new one, it should either still
 * hold the coupon code if there is one, and tell them how long they have left."
 *
 * A code lives on the Stripe SUBSCRIPTION. The old plan change was a second checkout that
 * cancelled the first subscription, which dropped the code and then refused it as already used.
 * A Free Agent already paying by card now has the PRICE changed on the subscription they have,
 * so the discount and its end date stay. Stripe is stubbed; the arguments are what is pinned.
 */
const retrieve = vi.fn();
const update = vi.fn();
const couponsRetrieve = vi.fn();
const couponsCreate = vi.fn();
const promotionCodesCreate = vi.fn();
const pricesRetrieve = vi.fn();
const sessionsCreate = vi.fn();
const getSubscriptionForUser = vi.fn();
const upsertSubscriptionByUserId = vi.fn();
const updateFreeAgentBilling = vi.fn();
const logBillingEvent = vi.fn();

vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: sessionsCreate } };
    subscriptions = { retrieve, update };
    coupons = { retrieve: couponsRetrieve, create: couponsCreate };
    promotionCodes = { create: promotionCodesCreate };
    prices = { retrieve: pricesRetrieve };
  },
}));
vi.mock("./storage", () => ({
  storage: { getSubscriptionForUser, upsertSubscriptionByUserId, updateFreeAgentBilling, logBillingEvent },
}));

async function loadBilling() {
  vi.resetModules();
  vi.stubEnv("BILLING_LIVE", "true");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_stub");
  vi.stubEnv("STRIPE_PRICE_FREE_AGENT_AI_COACH", "price_ai");
  return import("./billing");
}

const LIVE_ROW = { stripeSubscriptionId: "sub_1", accountType: "free_agent", status: "active" };

beforeEach(() => {
  vi.clearAllMocks();
  getSubscriptionForUser.mockResolvedValue(LIVE_ROW);
  retrieve.mockResolvedValue({ id: "sub_1", status: "active", metadata: { a: "b" }, items: { data: [{ id: "si_1" }] }, discounts: [] });
  update.mockResolvedValue({});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("changing plan on the card already on file", () => {
  it("changes the price on the SAME subscription, never a new one, and writes the new tier", async () => {
    const billing = await loadBilling();
    const result = await billing.switchFreeAgentTierInPlace(9, "ai_coach");
    expect(result).toEqual({ switched: true });
    expect(update).toHaveBeenCalledTimes(1);
    const [id, args] = update.mock.calls[0];
    expect(id).toBe("sub_1");
    expect(args.items).toEqual([{ id: "si_1", price: "price_ai", quantity: 1 }]);
    // Nothing in the update touches the discount, which is what keeps the code and its end date.
    expect("discounts" in args).toBe(false);
    expect("coupon" in args).toBe(false);
    expect(args.metadata.tier).toBe("ai_coach");
    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(updateFreeAgentBilling).toHaveBeenCalledWith(9, { freeAgentTier: "ai_coach" });
  });

  it("does nothing and says to use checkout when there is no live card subscription", async () => {
    const billing = await loadBilling();
    for (const row of [null, { ...LIVE_ROW, stripeSubscriptionId: null }, { ...LIVE_ROW, status: "canceled" }, { ...LIVE_ROW, accountType: "coach" }]) {
      getSubscriptionForUser.mockResolvedValueOnce(row);
      expect(await billing.switchFreeAgentTierInPlace(9, "ai_coach")).toMatchObject({ switched: false });
    }
    retrieve.mockResolvedValueOnce({ id: "sub_1", status: "canceled", metadata: {}, items: { data: [{ id: "si_1" }] } });
    expect(await billing.switchFreeAgentTierInPlace(9, "ai_coach")).toMatchObject({ switched: false });
    expect(update).not.toHaveBeenCalled();
    expect(updateFreeAgentBilling).not.toHaveBeenCalled();
  });

  it("grants nothing when Stripe refuses the change", async () => {
    const billing = await loadBilling();
    update.mockRejectedValueOnce(new Error("card declined"));
    expect(await billing.switchFreeAgentTierInPlace(9, "ai_coach")).toHaveProperty("error");
    expect(updateFreeAgentBilling).not.toHaveBeenCalled();
  });
});

describe("how long a code has left on the current plan", () => {
  it("reads the percentage and the end date off the live subscription's discount", async () => {
    const billing = await loadBilling();
    const end = Math.floor(Date.now() / 1000) + 20 * 86400;
    retrieve.mockResolvedValueOnce({ discounts: [{ end, coupon: { name: "FREE30", percent_off: 100 } }] });
    const d = await billing.currentPlanDiscount(9);
    expect(d).toEqual({ code: "FREE30", percentOff: 100, endsAt: new Date(end * 1000) });
  });
  it("reads the newer shape too, and ignores a discount that has ended", async () => {
    const billing = await loadBilling();
    const end = Math.floor(Date.now() / 1000) + 86400;
    retrieve.mockResolvedValueOnce({ discounts: [{ end: 1000, coupon: { name: "OLD", percent_off: 100 } }, { end, source: { coupon: "co_1" } }] });
    couponsRetrieve.mockResolvedValueOnce({ name: "HALF3", percent_off: 50 });
    expect(await billing.currentPlanDiscount(9)).toMatchObject({ code: "HALF3", percentOff: 50 });
  });
  it("is null with no discount, no card subscription, or an unreadable Stripe", async () => {
    const billing = await loadBilling();
    expect(await billing.currentPlanDiscount(9)).toBeNull();
    getSubscriptionForUser.mockResolvedValueOnce(null);
    expect(await billing.currentPlanDiscount(9)).toBeNull();
    retrieve.mockRejectedValueOnce(new Error("down"));
    expect(await billing.currentPlanDiscount(9)).toBeNull();
  });
});

describe("a code locked to a plan is locked at Stripe too", () => {
  beforeEach(() => {
    couponsCreate.mockResolvedValue({ id: "co_new" });
    promotionCodesCreate.mockResolvedValue({ id: "promo_new" });
    pricesRetrieve.mockResolvedValue({ product: "prod_ai" });
  });

  it("restricts the coupon to that plan's product, so Stripe's own code box takes nothing off another plan", async () => {
    const billing = await loadBilling();
    const made = await billing.createStripePromoForCode({ code: "AIONLY30", percentOff: 100, months: 1, appliesTo: "ai_coach" });
    expect(made.couponId).toBe("co_new");
    expect(pricesRetrieve).toHaveBeenCalledWith("price_ai");
    expect(couponsCreate.mock.calls[0][0].applies_to).toEqual({ products: ["prod_ai"] });
  });

  it("an unlocked code's coupon carries no restriction", async () => {
    const billing = await loadBilling();
    await billing.createStripePromoForCode({ code: "ANY30", percentOff: 100, months: 1 });
    expect("applies_to" in couponsCreate.mock.calls[0][0]).toBe(false);
    expect(pricesRetrieve).not.toHaveBeenCalled();
  });

  it("with no Stripe price for the plan, no unrestricted coupon is created in its place", async () => {
    const billing = await loadBilling();
    const made = await billing.createStripePromoForCode({ code: "BASIC30", percentOff: 100, months: 1, appliesTo: "basic" });
    expect(made).toMatchObject({ couponId: null, reason: "no_stripe_price_for_that_plan" });
    expect(couponsCreate).not.toHaveBeenCalled();
  });

  it("three free months is a repeating coupon for three bills", async () => {
    const billing = await loadBilling();
    await billing.createStripePromoForCode({ code: "FREE90", percentOff: 100, months: 3 });
    expect(couponsCreate.mock.calls[0][0]).toMatchObject({ percent_off: 100, duration: "repeating", duration_in_months: 3 });
  });
});
