import { describe, it, expect, vi, beforeEach } from "vitest";

// Same reason as billing.test.ts: storage.ts pulls in db.ts, which throws at
// import time without DATABASE_URL.
vi.mock("./storage", () => ({
  storage: {
    getSubscriptionForUser: vi.fn(async () => ({ stripeCustomerId: "cus_test" })),
    updateSubscriptionByUserId: vi.fn(),
  },
}));

// A Stripe client that would succeed if it were ever reached. Reaching it is
// exactly what these tests assert cannot happen.
const sessionsCreate = vi.fn(async () => ({ url: "https://checkout.stripe.test/live" }));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: sessionsCreate } };
    billingPortal = { sessions: { create: sessionsCreate } };
  },
}));

describe("nothing can be charged while Forge is in beta", () => {
  beforeEach(() => {
    vi.resetModules();
    sessionsCreate.mockClear();
  });

  it("refuses every Stripe entry point when BILLING_LIVE is unset, even with a key and prices set", async () => {
    // The scenario this exists for: someone pastes a Stripe key in to test
    // something. Before the guard, that alone opened a real till.
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_pretend");
    vi.stubEnv("STRIPE_PRICE_FREE_AGENT_AI_COACH", "price_pretend");
    vi.stubEnv("STRIPE_PRICE_COACH_PER_ATHLETE", "price_pretend");
    vi.stubEnv("BILLING_LIVE", "");

    const billing = await import("./billing");
    const results = [
      await billing.createFreeAgentTierCheckout(1, "a@b.c", "ai_coach", "s", "c"),
      await billing.createCoachSubscriptionCheckout(1, "a@b.c", 25, "s", "c"),
      await billing.createLessonCheckout(
        1,
        "a@b.c",
        { enrollmentId: 1, lessonId: 1, lessonTitle: "L", priceCents: 1499 },
        "s",
        "c",
      ),
      await billing.createBillingPortalSession(1, "https://forge.test"),
    ];

    for (const r of results) {
      expect(r).toHaveProperty("error");
      expect((r as { error: string }).error).toMatch(/beta/i);
    }
    // The decisive assertion: Stripe was never asked to create anything.
    expect(sessionsCreate).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("still refuses when BILLING_LIVE is any value other than true", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_pretend");
    vi.stubEnv("BILLING_LIVE", "yes");
    const billing = await import("./billing");
    const r = await billing.createFreeAgentTierCheckout(1, "a@b.c", "ai_coach", "s", "c");
    expect(r).toHaveProperty("error");
    expect(sessionsCreate).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("the guard is what stops it, not the missing key -- with BILLING_LIVE on it gets as far as Stripe", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_pretend");
    vi.stubEnv("STRIPE_PRICE_FREE_AGENT_AI_COACH", "price_pretend");
    vi.stubEnv("BILLING_LIVE", "true");
    const billing = await import("./billing");
    await billing.createFreeAgentTierCheckout(1, "a@b.c", "ai_coach", "s", "c");
    expect(sessionsCreate).toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
