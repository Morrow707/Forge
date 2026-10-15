import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

/* THREE PLACES FORGE CHANGED ITS OWN MIND AND NEVER TOLD THE PROVIDER.
 *
 * From the 2026-10-14 audit panel, all three still real at HEAD and all three the same shape: a
 * decision about money was written into Forge's own columns and the card went on doing whatever
 * it was doing before.
 *
 *   - **A restore never un-cancelled the subscription.** Cancelling an add-on sets
 *     `cancel_at_period_end: true` at Stripe; restoring cleared Forge's `accessUntil` and
 *     nothing else, so the add-on worked again and the billing still stopped at the end of the
 *     month -- access nobody would ever pay for, for good, on the one route whose entire purpose
 *     is "I changed my mind inside the month I paid for".
 *   - **A partial refund revoked the whole add-on, permanently.** Stripe sends charge.refunded
 *     for ANY refund, and the handler stamped `refundedAt`, which addOnIsActive treats as final
 *     and the restore route refuses to clear. So a $1 goodwill credit on a $19.99 add-on took
 *     the product away for good from somebody still being billed every month for it.
 *   - **A role change stranded whatever the old role was paying for.** The two sides read
 *     different columns, so an athlete promoted to coach stops reading the tier they are still
 *     charged for, and a demoted coach stops reading the band their school still pays. Nothing
 *     said so anywhere.
 *
 * The first two are FIXED -- the provider call is made, and a partial refund is not a refund.
 * The third is REPORTED, deliberately: a subscription is the customer's and an admin tidying a
 * mis-signup must not cancel it as a side effect of a dropdown. Same posture, same reason, as
 * the admin add-on removal.
 */
const logBillingEvent = vi.fn();
const wasStripeEventProcessed = vi.fn();
const revokeAddOnsForStripeSubscription = vi.fn();
const updateSubscriptionByStripeId = vi.fn();
const updateFreeAgentBilling = vi.fn();
const clearCoachBand = vi.fn();
const accountForStripeSubscription = vi.fn();
const endAddOnsForDeletedStripeSubscription = vi.fn();
const getSubscriptionForUser = vi.fn();
const upsertSubscriptionByUserId = vi.fn();
const updateSubscriptionByUserId = vi.fn();
const upsertStripeCustomerId = vi.fn();
const applyCoachSubscriptionBand = vi.fn();

vi.mock("./storage", () => ({
  storage: {
    logBillingEvent,
    wasStripeEventProcessed,
    revokeAddOnsForStripeSubscription,
    updateSubscriptionByStripeId,
    updateFreeAgentBilling,
    clearCoachBand,
    accountForStripeSubscription,
    endAddOnsForDeletedStripeSubscription,
    getSubscriptionForUser,
    upsertSubscriptionByUserId,
    updateSubscriptionByUserId,
    upsertStripeCustomerId,
    applyCoachSubscriptionBand,
  },
}));
const invoiceRetrieve = vi.fn();
const subscriptionUpdate = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    subscriptions = { cancel: vi.fn(), retrieve: vi.fn(), update: subscriptionUpdate };
    checkout = { sessions: { create: vi.fn() } };
    refunds = { create: vi.fn() };
    invoices = { retrieve: invoiceRetrieve };
    charges = { retrieve: vi.fn() };
    billingPortal = { sessions: { create: vi.fn() } };
    webhooks = { constructEvent: vi.fn() };
  },
}));
vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_for_this_file");

const { handleStripeWebhookEvent, resumeAddOnAtProvider } = await import("./billing");

function refundEvent(amount: number, amountRefunded: number, refunded: boolean) {
  invoiceRetrieve.mockResolvedValue({ id: "in_1", subscription: "sub_addon" });
  return {
    id: `evt_${amount}_${amountRefunded}`,
    type: "charge.refunded",
    data: { object: { id: "ch_1", invoice: "in_1", amount, amount_refunded: amountRefunded, refunded } },
  } as unknown as Stripe.Event;
}

beforeEach(() => {
  vi.clearAllMocks();
  wasStripeEventProcessed.mockResolvedValue(false);
  revokeAddOnsForStripeSubscription.mockResolvedValue({ userId: 5, addOnIds: ["all_classes"] });
  updateSubscriptionByStripeId.mockResolvedValue(null);
  accountForStripeSubscription.mockResolvedValue(5);
});

describe("a partial refund is not a refund", () => {
  it("revokes nothing when only part of the charge came back", async () => {
    await handleStripeWebhookEvent(refundEvent(1999, 100, false));
    expect(revokeAddOnsForStripeSubscription).not.toHaveBeenCalled();
    expect(updateFreeAgentBilling).not.toHaveBeenCalled();
  });

  it("records it against the account that holds the subscription", async () => {
    // Not against userId 0: an audit row for a user nobody has fails the foreign key and
    // vanishes, which is the opposite of a record.
    await handleStripeWebhookEvent(refundEvent(1999, 100, false));
    expect(accountForStripeSubscription).toHaveBeenCalledWith("sub_addon");
    const logged = logBillingEvent.mock.calls.find(([, e]) => String(e).includes("partial_refund"));
    expect(logged).toBeTruthy();
    expect(logged![0]).toBe(5);
  });

  it("revokes on a FULL refund, by Stripe's own flag", async () => {
    await handleStripeWebhookEvent(refundEvent(1999, 1999, true));
    expect(revokeAddOnsForStripeSubscription).toHaveBeenCalledWith("sub_addon");
  });

  it("revokes on a full refund even if the flag is the thing that moved", async () => {
    // The amounts are checked as well as `refunded`, because that flag is what a future API
    // version is most likely to relocate -- and a full refund read as partial stops revoking.
    await handleStripeWebhookEvent(refundEvent(1999, 1999, false));
    expect(revokeAddOnsForStripeSubscription).toHaveBeenCalledWith("sub_addon");
  });
});

describe("a restore un-cancels the subscription it restores", () => {
  it("clears cancel_at_period_end at Stripe", async () => {
    subscriptionUpdate.mockResolvedValue({});
    const out = await resumeAddOnAtProvider("sub_addon");
    expect(subscriptionUpdate).toHaveBeenCalledWith("sub_addon", { cancel_at_period_end: false });
    expect(out.resumed).toBe(true);
  });

  it("reports a refusal rather than throwing", async () => {
    subscriptionUpdate.mockRejectedValue(new Error("nope"));
    const out = await resumeAddOnAtProvider("sub_addon");
    expect(out).toEqual({ resumed: false, error: "provider_refused" });
  });

  it("has nothing to do for an add-on with no Stripe subscription", async () => {
    const out = await resumeAddOnAtProvider(undefined);
    expect(out.resumed).toBe(false);
    expect(subscriptionUpdate).not.toHaveBeenCalled();
  });

  it("is what the restore route calls, and the route still restores if it fails", () => {
    const routes = readFileSync(join(import.meta.dirname, "routes.ts"), "utf8");
    const at = routes.indexOf('"/api/billing/add-on/:addOnId/restore"');
    const body = routes.slice(at, routes.indexOf("app.post", at + 10));
    expect(body).toMatch(/resumeAddOnAtProvider\(term\?\.stripeSubscriptionId\)/);
    // The local restore is NOT conditional on the provider call: the month is paid for, so
    // withholding it because Stripe refused is the wrong error. What changes is what is said.
    const resumeAt = body.indexOf("resumeAddOnAtProvider");
    const restoreAt = body.indexOf("storage.restoreAddOn");
    expect(restoreAt).toBeGreaterThan(resumeAt);
    expect(body).not.toMatch(/if \(resumed[.\w]*\)\s*\{?\s*await storage\.restoreAddOn/);
    expect(body).toMatch(/stillCancellingAtProvider/);
    expect(body).toMatch(/alsoResumeInAppStore/);
  });
});

describe("a role change says what it stranded", () => {
  const storageSrc = readFileSync(join(import.meta.dirname, "storage.ts"), "utf8");
  const routesSrc = readFileSync(join(import.meta.dirname, "routes.ts"), "utf8");

  function fn(name: string) {
    const start = storageSrc.indexOf(`async ${name}(`);
    expect(start, name).toBeGreaterThan(-1);
    return storageSrc.slice(start, storageSrc.indexOf("\n  },\n", start));
  }

  it("reads the live handles BEFORE the role is written", () => {
    const body = fn("setUserRole");
    const read = body.indexOf("liveBillingHandlesForRoleChange");
    const write = body.indexOf("db.update(users)");
    expect(read).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(read);
  });

  it("warns and records, and cancels nothing", () => {
    const body = fn("setUserRole");
    expect(body).toMatch(/console\.warn\(/);
    expect(body).toMatch(/role_changed_while_billing/);
    // A subscription is the customer's; an admin's dropdown does not end it.
    expect(body).not.toMatch(/cancelSuperseded|subscriptions\.cancel|revokeAddOn/);
  });

  it("counts both rails and both places an id lives", () => {
    const body = fn("liveBillingHandlesForRoleChange");
    expect(body).toMatch(/stripeSubscriptionId/);
    expect(body).toMatch(/appleOriginalTransactionId/);
    expect(body).toMatch(/addOnTerms/);
  });

  it("ignores what nobody is being charged for", () => {
    const body = fn("liveBillingHandlesForRoleChange");
    // A refunded or cancelled term, and a row with no provider id, are nothing to chase.
    expect(body).toMatch(/term\.refundedAt != null \|\| term\.accessUntil != null/);
    expect(body).toMatch(/status === "active"/);
  });

  it("only counts what the NEW role stops reading", () => {
    // The point of the finding: a coach's band is unreadable to an athlete and a Free Agent's
    // tier to a coach. A row the new role still reads is not stranded.
    const body = fn("liveBillingHandlesForRoleChange");
    expect(body).toMatch(/nextRole !== "athlete"/);
    expect(body).toMatch(/nextRole !== "coach"/);
  });

  it("reaches the admin on the screen where the change was made", () => {
    const at = routesSrc.indexOf("storage.setUserRole(userId, parsed.data.role)");
    expect(at).toBeGreaterThan(-1);
    expect(routesSrc.slice(at, at + 400)).toMatch(/strandedBilling/);
  });
});
