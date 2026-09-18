import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bandForAthleteCount, ORG_BASE_CENTS } from "@shared/billing-tiers";

/**
 * WHAT CHECKOUT ACTUALLY SENDS TO STRIPE.
 *
 * server/billing.test.ts covers the other half -- what Forge does when Stripe calls BACK. This
 * covers the outbound side: given a signed-in user and a tier, is the session Stripe is asked to
 * create the right one? That question was only ever answered by reading the source (see
 * stripe-checkout.test.ts, which greps routes.ts) or by paying with a real card.
 *
 * Stripe itself is stubbed. The point is not to prove Stripe works -- it does -- but to pin the
 * arguments, because every way this can be wrong is silent: a session created with the wrong
 * price charges the wrong amount, a quantity of 1 on the coach plan bills a fifty-athlete school
 * for one seat, and a missing metadata field means the webhook cannot tell whose subscription
 * just started. None of those throw. They just take the wrong money.
 */

const sessionsCreate = vi.fn();
const getSubscriptionForUser = vi.fn();

vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: sessionsCreate } };
    billingPortal = { sessions: { create: vi.fn() } };
  },
}));

vi.mock("./storage", () => ({
  storage: { getSubscriptionForUser },
}));

/** BILLING_LIVE is read once at module load, so each posture needs its own import. */
async function loadBilling(billingLive: boolean) {
  vi.resetModules();
  process.env.BILLING_LIVE = billingLive ? "true" : "";
  process.env.STRIPE_SECRET_KEY = "sk_test_stub";
  return import("./billing");
}

const savedEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  getSubscriptionForUser.mockResolvedValue(null);
  sessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.test/session" });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

describe("the beta gate", () => {
  it("refuses every checkout path and never reaches Stripe", async () => {
    // The guarantee is "during beta, nobody pays" -- and the thing that makes it a guarantee
    // rather than a hope is that it holds even with a real key and real prices configured, which
    // is exactly the state this account is in right now.
    const billing = await loadBilling(false);
    process.env.STRIPE_PRICE_FREE_AGENT_BASIC = "price_basic";
    process.env.STRIPE_PRICE_COACH_PER_ATHLETE = "price_per_athlete";

    const tier = await billing.createFreeAgentTierCheckout(1, "a@b.test", "basic", "s", "c");
    const coach = await billing.createCoachSubscriptionCheckout(2, "c@d.test", 12, "s", "c");
    const lesson = await billing.createLessonCheckout(
      3,
      "e@f.test",
      { enrollmentId: 1, lessonId: 1, lessonTitle: "L", priceCents: 4999 },
      "s",
      "c",
    );

    for (const result of [tier, coach, lesson]) {
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toMatch(/beta/i);
    }
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});

describe("a Free Agent's own tier", () => {
  it("refuses when that tier has no price configured, rather than charging something else", async () => {
    const billing = await loadBilling(true);
    delete process.env.STRIPE_PRICE_FREE_AGENT_AI_COACH;

    const result = await billing.createFreeAgentTierCheckout(1, "a@b.test", "ai_coach", "s", "c");
    expect((result as { error: string }).error).toMatch(/no stripe price/i);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("sends the price for the tier asked for, and carries the user and tier in metadata", async () => {
    const billing = await loadBilling(true);
    process.env.STRIPE_PRICE_FREE_AGENT_AI_COACH_VIDEO = "price_video";
    process.env.STRIPE_PRICE_FREE_AGENT_AI_COACH = "price_coach";

    await billing.createFreeAgentTierCheckout(42, "a@b.test", "ai_coach_video", "s", "c");

    const args = sessionsCreate.mock.calls[0][0];
    expect(args.mode).toBe("subscription");
    // The two AI tiers differ by one word in their env var names, and crossing them grants the
    // $19.99 tier's entitlements for $9.99 without erroring anywhere.
    expect(args.line_items).toEqual([{ price: "price_video", quantity: 1 }]);
    expect(args.metadata).toMatchObject({ kind: "free_agent_tier", userId: "42", tier: "ai_coach_video" });
    // The webhook reads this off the SUBSCRIPTION, not just the session, because
    // customer.subscription.updated arrives with no session attached.
    expect(args.subscription_data.metadata).toMatchObject({ userId: "42", tier: "ai_coach_video" });
  });

  it("identifies a returning subscriber by customer id, and a new one by email", async () => {
    const billing = await loadBilling(true);
    process.env.STRIPE_PRICE_FREE_AGENT_BASIC = "price_basic";

    await billing.createFreeAgentTierCheckout(7, "new@b.test", "basic", "s", "c");
    expect(sessionsCreate.mock.calls[0][0]).toMatchObject({
      customer_email: "new@b.test",
      client_reference_id: "7",
    });

    // A returning customer must reuse their Stripe customer, or they accumulate a new one per
    // purchase and their billing history stops being one history.
    getSubscriptionForUser.mockResolvedValue({ stripeCustomerId: "cus_existing" });
    await billing.createFreeAgentTierCheckout(7, "new@b.test", "basic", "s", "c");
    const second = sessionsCreate.mock.calls[1][0];
    expect(second.customer).toBe("cus_existing");
    expect(second.customer_email).toBeUndefined();
  });
});

describe("a coach organisation's roster", () => {
  it("bills the band's ceiling as the quantity, not one seat", async () => {
    // THE EXPENSIVE ONE TO GET WRONG. One $4.00 Price expresses every band; the band is carried
    // entirely by the quantity. A quantity of 1 here would charge a fifty-athlete school $4.00 a
    // month and look perfectly successful doing it.
    const billing = await loadBilling(true);
    process.env.STRIPE_PRICE_COACH_PER_ATHLETE = "price_per_athlete";

    await billing.createCoachSubscriptionCheckout(9, "coach@b.test", 37, "s", "c");

    const args = sessionsCreate.mock.calls[0][0];
    const band = bandForAthleteCount(37);
    expect(args.mode).toBe("subscription");
    expect(args.line_items).toEqual([
      { price: "price_per_athlete", quantity: band.athleteCapIncluded },
    ]);
    expect(band.athleteCapIncluded).toBeGreaterThan(1);
  });

  it("does not line-item the account fee while that fee is zero", async () => {
    // Line-iteming a $0 price is how the old checkout managed to look configured and bill
    // nothing at all.
    const billing = await loadBilling(true);
    process.env.STRIPE_PRICE_COACH_PER_ATHLETE = "price_per_athlete";
    delete process.env.STRIPE_PRICE_COACH_BASE;

    await billing.createCoachSubscriptionCheckout(9, "coach@b.test", 5, "s", "c");

    expect(ORG_BASE_CENTS).toBe(0);
    expect(sessionsCreate.mock.calls[0][0].line_items).toHaveLength(1);
  });

  it("refuses without the per-athlete price rather than falling back to the account fee", async () => {
    const billing = await loadBilling(true);
    delete process.env.STRIPE_PRICE_COACH_PER_ATHLETE;

    const result = await billing.createCoachSubscriptionCheckout(9, "coach@b.test", 5, "s", "c");
    expect((result as { error: string }).error).toMatch(/no stripe price/i);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});

describe("a one-off class lesson", () => {
  it("builds the amount inline from the lesson, so no Stripe Price has to exist for it", async () => {
    const billing = await loadBilling(true);

    await billing.createLessonCheckout(
      5,
      "a@b.test",
      { enrollmentId: 11, lessonId: 22, lessonTitle: "Bar Path Basics", priceCents: 4999 },
      "s",
      "c",
    );

    const args = sessionsCreate.mock.calls[0][0];
    expect(args.mode).toBe("payment");
    expect(args.line_items[0].price_data).toMatchObject({
      currency: "usd",
      unit_amount: 4999,
      product_data: { name: "Bar Path Basics" },
    });
  });

  it("refuses a free or malformed price instead of charging zero", async () => {
    const billing = await loadBilling(true);

    for (const priceCents of [0, -100, 49.99]) {
      const result = await billing.createLessonCheckout(
        5,
        "a@b.test",
        { enrollmentId: 11, lessonId: 22, lessonTitle: "L", priceCents },
        "s",
        "c",
      );
      expect((result as { error: string }).error).toMatch(/paid lesson/i);
    }
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});

describe("when Stripe answers without a URL", () => {
  it("reports an error rather than handing the caller nothing to redirect to", async () => {
    const billing = await loadBilling(true);
    process.env.STRIPE_PRICE_FREE_AGENT_BASIC = "price_basic";
    sessionsCreate.mockResolvedValue({ url: null });

    const result = await billing.createFreeAgentTierCheckout(1, "a@b.test", "basic", "s", "c");
    expect(result).toHaveProperty("error");
  });
});
