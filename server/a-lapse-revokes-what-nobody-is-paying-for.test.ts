import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

/* A FAILED CARD KEPT EVERYTHING, BECAUSE ONLY ONE EVENT EVER REVOKED ANYTHING.
 *
 * Found 2026-10-15 by the billing audit panel. Every revocation Forge does on the Stripe rail
 * lived inside `customer.subscription.deleted` -- the tier, the coach's band and the add-ons --
 * and that is not the only way a subscription stops being paid for:
 *
 *   - **Stripe cancels through an `updated` event.** mapStripeStatus' own comment has said so
 *     since it was written. That branch recorded the status and stopped, so a cancellation Forge
 *     had been told about revoked nothing.
 *   - **`unpaid` is where dunning ENDS.** Stripe retries a failed card for weeks and then, on a
 *     subscription set to "mark unpaid" rather than "cancel", stops retrying and never deletes
 *     anything. Since 2026-10-11 the gates read users.freeAgentTier and not the row's status, so
 *     the tier stayed granted for good: full access, no money, no event left to take it away.
 *
 * `past_due` is deliberately NOT a lapse. A card inside Stripe's retry window is an account
 * somebody is still trying to pay for, and withholding access from a possible payer is the worse
 * error -- the same posture the cross-rail guard takes. The control case below pins that.
 *
 * And the RAW Stripe status is what decides: mapStripeStatus collapses `unpaid` into `past_due`
 * because the column's enum has no `unpaid`, so the column cannot tell "still trying" from
 * "given up" and acting on it would revoke an account mid-dunning.
 */
const updateSubscriptionByStripeId = vi.fn();
const updateFreeAgentBilling = vi.fn();
const clearCoachBand = vi.fn();
const endAddOnsForDeletedStripeSubscription = vi.fn();
const logBillingEvent = vi.fn();
const wasStripeEventProcessed = vi.fn();
const revokeAddOnsForStripeSubscription = vi.fn();
const getSubscriptionForUser = vi.fn();
const upsertSubscriptionByUserId = vi.fn();
const updateSubscriptionByUserId = vi.fn();
const upsertStripeCustomerId = vi.fn();
const applyCoachSubscriptionBand = vi.fn();

vi.mock("./storage", () => ({
  storage: {
    updateSubscriptionByStripeId,
    updateFreeAgentBilling,
    clearCoachBand,
    endAddOnsForDeletedStripeSubscription,
    logBillingEvent,
    wasStripeEventProcessed,
    revokeAddOnsForStripeSubscription,
    getSubscriptionForUser,
    upsertSubscriptionByUserId,
    updateSubscriptionByUserId,
    upsertStripeCustomerId,
    applyCoachSubscriptionBand,
  },
}));
vi.mock("stripe", () => ({
  default: class {
    subscriptions = { cancel: vi.fn(), retrieve: vi.fn(), update: vi.fn() };
    checkout = { sessions: { create: vi.fn() } };
    refunds = { create: vi.fn() };
    invoices = { retrieve: vi.fn() };
    charges = { retrieve: vi.fn() };
    billingPortal = { sessions: { create: vi.fn() } };
    webhooks = { constructEvent: vi.fn() };
  },
}));

const { handleStripeWebhookEvent } = await import("./billing");

function updatedEvent(status: string, id = "evt_lapse") {
  return {
    id,
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_1",
        status,
        cancel_at_period_end: false,
        current_period_end: 0,
        items: { data: [{ current_period_end: 0 }] },
      },
    },
  } as unknown as Stripe.Event;
}

beforeEach(() => {
  vi.clearAllMocks();
  wasStripeEventProcessed.mockResolvedValue(false);
  endAddOnsForDeletedStripeSubscription.mockResolvedValue({ userId: null, addOnIds: [] });
  revokeAddOnsForStripeSubscription.mockResolvedValue({ userId: null, addOnIds: [] });
  updateSubscriptionByStripeId.mockResolvedValue({ userId: 7, accountType: "free_agent" });
});

describe("a subscription that ends through customer.subscription.updated", () => {
  it("takes the Free Agent tier off when Stripe reports it cancelled", async () => {
    await handleStripeWebhookEvent(updatedEvent("canceled"));
    expect(updateFreeAgentBilling).toHaveBeenCalledWith(7, { freeAgentTier: null });
  });

  it("takes it off when dunning finishes in `unpaid`, which sends no deleted event at all", async () => {
    await handleStripeWebhookEvent(updatedEvent("unpaid"));
    expect(updateFreeAgentBilling).toHaveBeenCalledWith(7, { freeAgentTier: null });
  });

  it("clears the coach's band on the same two statuses", async () => {
    updateSubscriptionByStripeId.mockResolvedValue({ userId: 7, accountType: "coach" });
    await handleStripeWebhookEvent(updatedEvent("unpaid"));
    expect(clearCoachBand).toHaveBeenCalledWith(7);
  });

  it("ends that subscription's add-ons too, honouring the paid month", async () => {
    await handleStripeWebhookEvent(updatedEvent("canceled"));
    expect(endAddOnsForDeletedStripeSubscription).toHaveBeenCalled();
  });

  it("leaves a past_due account alone -- somebody is still trying to pay", async () => {
    // THE CONTROL, and the one case where doing nothing is the right answer. Without it every
    // assertion above would pass against a handler that revoked on any status change.
    await handleStripeWebhookEvent(updatedEvent("past_due"));
    expect(updateFreeAgentBilling).not.toHaveBeenCalled();
    expect(clearCoachBand).not.toHaveBeenCalled();
    expect(endAddOnsForDeletedStripeSubscription).not.toHaveBeenCalled();
  });

  it("leaves an active account alone", async () => {
    await handleStripeWebhookEvent(updatedEvent("active"));
    expect(updateFreeAgentBilling).not.toHaveBeenCalled();
  });

  it("still records the status change itself", async () => {
    await handleStripeWebhookEvent(updatedEvent("canceled"));
    expect(updateSubscriptionByStripeId).toHaveBeenCalledWith("sub_1", expect.objectContaining({ status: "canceled" }));
  });

  it("claims the unique event id once across the status row and the clear-down", async () => {
    // billing_audit_log.stripe_event_id is UNIQUE; two rows claiming one delivery's id throws on
    // the second insert and 500s the webhook. The updated branch now writes a row AND calls the
    // clear-down, which writes more, so the claimer is shared.
    updateSubscriptionByStripeId.mockResolvedValue({ userId: 7, accountType: "free_agent" });
    endAddOnsForDeletedStripeSubscription.mockResolvedValue({ userId: 7, addOnIds: ["all_classes"] });
    await handleStripeWebhookEvent(updatedEvent("canceled"));
    const withId = logBillingEvent.mock.calls.filter((call) => call[3] != null);
    expect(withId.length).toBe(1);
    expect(logBillingEvent.mock.calls.length).toBeGreaterThan(1);
  });

  it("does not withhold a tier the other rail may still be paying for", async () => {
    // The cross-rail guard came with the clear-down when it was factored out, rather than being
    // left behind in the branch it used to live in.
    updateSubscriptionByStripeId.mockResolvedValue({
      userId: 7,
      accountType: "free_agent",
      appleOriginalTransactionId: "2000000111",
    });
    await handleStripeWebhookEvent(updatedEvent("canceled"));
    expect(updateFreeAgentBilling).not.toHaveBeenCalled();
  });
});

describe("the deleted branch still does everything it did", () => {
  it("goes through the same one clear-down", async () => {
    const src = readFileSync(join(import.meta.dirname, "billing.ts"), "utf8");
    const branch = src.slice(src.indexOf('case "customer.subscription.deleted"'));
    const body = branch.slice(0, branch.indexOf("\n    }"));
    // One call, not a second copy of the logic -- a copy is how the two paths drift.
    expect(body).toMatch(/endStripeSubscription\(/);
    expect(body).not.toMatch(/updateFreeAgentBilling|clearCoachBand/);
  });

  it("revokes the tier, the band and the add-ons", async () => {
    await handleStripeWebhookEvent({
      id: "evt_del",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", current_period_end: 0 } },
    } as unknown as Stripe.Event);
    expect(updateFreeAgentBilling).toHaveBeenCalledWith(7, { freeAgentTier: null });
    expect(endAddOnsForDeletedStripeSubscription).toHaveBeenCalled();
  });
});

describe("the Skill Bank's detail route is gated like its list", () => {
  const routes = readFileSync(join(import.meta.dirname, "routes.ts"), "utf8");

  it("asks for the skills entitlement on the route that serves the drill", () => {
    // The list was gated when "browsing was never gated" was found; the DETAIL route, which
    // serves the drill itself by id, was missed -- so a Basic Free Agent on a tier sold without
    // skills could read the whole bank one id at a time.
    const at = routes.indexOf('"/api/athlete/skill-exercises/:id"');
    expect(at).toBeGreaterThan(-1);
    const middleware = routes.slice(at, routes.indexOf("async (req", at));
    expect(middleware).toMatch(/requirePaidAiAccess\("skillsAi"\)/);
  });

  it("and the list route it was copied from still has it", () => {
    const at = routes.indexOf('"/api/athlete/skill-exercises",');
    const middleware = routes.slice(at, routes.indexOf("async (req", at));
    expect(middleware).toMatch(/requirePaidAiAccess\("skillsAi"\)/);
  });
});

describe("one account never pays twice for one add-on", () => {
  const storageSrc = readFileSync(join(import.meta.dirname, "storage.ts"), "utf8");
  const billingSrc = readFileSync(join(import.meta.dirname, "billing.ts"), "utf8");

  for (const fn of ["addFreeAgentAddOn", "addCoachBillingAddOn"] as const) {
    it(`${fn} hands up the Stripe subscription it replaced`, () => {
      const start = storageSrc.indexOf(`async ${fn}(`);
      const body = storageSrc.slice(start, storageSrc.indexOf("\n  },\n", start));
      // Read BEFORE the write, or the prior id is already gone.
      expect(body).toMatch(/const prior = current\?\.addOnTerms\?\.\[addOnId\]/);
      expect(body).toMatch(/supersededStripeSubscriptionId/);
      // Never the id just bought, and never a refunded term's -- nothing is billing there.
      expect(body).toMatch(/priorStripeId !== provider\?\.stripeSubscriptionId/);
      expect(body).toMatch(/prior\?\.refundedAt == null/);
    });
  }

  it("the webhook cancels it on both add-on rails", () => {
    // The whole guarded CALL, not just a mention of the field: `if (false && granted?....)`
    // keeps every substring and cancels nothing, which is the mutation that found this wording.
    const block =
      "if (granted?.supersededStripeSubscriptionId) {\n" +
      "          await cancelSupersededStripeSubscription(userId, granted.supersededStripeSubscriptionId);\n" +
      "        }";
    expect(billingSrc.split(block).length - 1).toBe(2);
  });

  it("and an in-app add-on purchase supersedes the web one the same way", () => {
    const start = storageSrc.indexOf("async applyAppleIapVerification(");
    const body = storageSrc.slice(start, storageSrc.indexOf("\n  },\n", start));
    expect(body.match(/supersededStripeSubscriptionId/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
