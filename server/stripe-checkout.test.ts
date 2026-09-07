import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { missingPriceEnvVars, freeAgentPriceEnvVar, freeAgentPriceId } from "./stripe-prices";
import { FREE_AGENT_TIER_ORDER } from "@shared/free-agent-tiers";

const routes = readFileSync(join(__dirname, "routes.ts"), "utf8");
const billing = readFileSync(join(__dirname, "billing.ts"), "utf8");

describe("Stripe price configuration", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("reports every price that still has to be created", () => {
    for (const tier of FREE_AGENT_TIER_ORDER) delete process.env[freeAgentPriceEnvVar(tier)];
    delete process.env.STRIPE_PRICE_COACH_BASE;
    delete process.env.STRIPE_PRICE_COACH_SEAT;
    const missing = missingPriceEnvVars();
    expect(missing).toContain("STRIPE_PRICE_FREE_AGENT_AI_COACH");
    expect(missing).toContain("STRIPE_PRICE_COACH_BASE");
    expect(missing).toContain("STRIPE_PRICE_COACH_SEAT");
    expect(missing.length).toBe(FREE_AGENT_TIER_ORDER.length + 2);
  });

  it("goes quiet once every price is set", () => {
    for (const tier of FREE_AGENT_TIER_ORDER) process.env[freeAgentPriceEnvVar(tier)] = `price_${tier}`;
    process.env.STRIPE_PRICE_COACH_BASE = "price_base";
    process.env.STRIPE_PRICE_COACH_SEAT = "price_seat";
    expect(missingPriceEnvVars()).toEqual([]);
    expect(freeAgentPriceId("ai_coach")).toBe("price_ai_coach");
  });

  it("treats a blank env var as unset rather than as a price id", () => {
    process.env.STRIPE_PRICE_COACH_BASE = "   ";
    expect(missingPriceEnvVars()).toContain("STRIPE_PRICE_COACH_BASE");
  });
});

describe("web checkout never runs inside the native app", () => {
  // Apple requires an in-app digital purchase to go through StoreKit. A
  // Stripe checkout reachable from the app is what puts a submission at
  // risk, so the guard is on the server as well as the client.
  it("guards every checkout route", () => {
    const guarded = routes.match(/requireWebCheckout/g) ?? [];
    // One definition plus one use on each of the four routes.
    expect(guarded.length).toBeGreaterThanOrEqual(5);
    for (const path of [
      '"/api/billing/checkout/free-agent-tier"',
      '"/api/billing/checkout/coach"',
      '"/api/billing/checkout/class-lesson"',
      '"/api/billing/portal"',
    ]) {
      const idx = routes.indexOf(path);
      expect(idx).toBeGreaterThan(-1);
      expect(routes.slice(idx, idx + 220)).toContain("requireWebCheckout");
    }
  });

  it("keys the guard off the platform header the native client sends", () => {
    expect(routes).toContain('req.headers["x-forge-platform"]');
    const client = readFileSync(
      join(__dirname, "..", "client", "src", "lib", "queryClient.ts"),
      "utf8",
    );
    expect(client).toContain("X-Forge-Platform");
    expect(client).toContain("Capacitor.isNativePlatform()");
  });
});

describe("prices and quantities come from the server, never the request", () => {
  it("reads the coach seat count from the roster", () => {
    const idx = routes.indexOf('"/api/billing/checkout/coach"');
    const route = routes.slice(idx, idx + 900);
    expect(route).toContain("getRosterSeatCountForCoach");
    // A quantity taken from the body would be a client choosing its price.
    expect(route).not.toMatch(/seatCount:\s*z\./);
  });

  it("reads the lesson price from the lesson row", () => {
    const idx = routes.indexOf('"/api/billing/checkout/class-lesson"');
    const route = routes.slice(idx, idx + 1600);
    expect(route).toContain("getClassLessonForPurchase");
    expect(route).toContain("lesson.priceCents");
    expect(route).not.toMatch(/priceCents:\s*z\./);
  });

  it("scopes a lesson purchase to the buying athlete's own enrolment", () => {
    const idx = routes.indexOf('"/api/billing/checkout/class-lesson"');
    const route = routes.slice(idx, idx + 1600);
    expect(route).toContain("getClassEnrollmentForAthlete");
    expect(billing).toContain("enrollmentId: String(input.enrollmentId)");
  });
});

describe("the webhook grants exactly what was bought", () => {
  it("credits a lesson purchase to the enrolment in the session metadata", () => {
    expect(billing).toContain('kind === "class_lesson"');
    expect(billing).toContain("markLessonPurchased(enrollmentId, lessonId)");
    // An unpaid session must not unlock anything.
    expect(billing).toContain('session.payment_status !== "paid"');
  });

  it("sets the tier the athlete actually paid for", () => {
    expect(billing).toContain('kind === "free_agent_tier"');
    expect(billing).toContain("updateFreeAgentBilling(userId, { freeAgentTier:");
  });

  it("still refuses to process the same Stripe event twice", () => {
    expect(billing).toContain("wasStripeEventProcessed(event.id)");
  });
});
