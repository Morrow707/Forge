import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

/* ONE ROW, TWO RAILS: EITHER ONE ENDING TOOK THE OTHER'S TIER AWAY.
 *
 * Found 2026-10-14, reading the Apple notification path against the Stripe one. `subscriptions`
 * is UNIQUE on userId, so one account has one row -- and that row has a column for EACH rail's
 * handle (stripeSubscriptionId, appleOriginalTransactionId). Neither purchase path cleared the
 * other's, so an account that bought on both carried both, and every lifecycle event matched the
 * row by its own handle and then acted as though it owned the tier:
 *
 *   - Buy Basic in the app, upgrade to AI Coach + Video on the web, then stop the App Store
 *     subscription in iOS Settings (which is exactly what somebody moving rails does). Apple
 *     sends EXPIRED, applyAppleServerNotification finds the row by the Apple id and nulls
 *     users.freeAgentTier -- and the athlete who is paying Stripe $19.99 a month loses the
 *     camera, skills and AI chat.
 *   - The same thing in the other direction, which is likelier still: buy on the web, buy in the
 *     app, cancel the web one in the Stripe portal, and customer.subscription.deleted nulls the
 *     SKU Apple is paying for.
 *
 * AND BOTH RAILS WENT ON BILLING in the meantime, because taking over the row never cancelled
 * what it replaced. The Stripe->Stripe case was fixed on 2026-10-11
 * (cancelSupersededStripeSubscription); cross-rail was not.
 *
 * THE RULE: A PURCHASE TAKES THE ROW, AND THE ROW NAMES ONE RAIL. A tier bought on either rail
 * clears the other's handle, so "the handle is on the row" means "this is the rail Forge believes
 * is paying" and a lifecycle event can trust it. What happens to the rail that lost the row
 * depends on whether this server can reach it: a Stripe subscription is CANCELLED (the same
 * best-effort call the Stripe->Stripe swap makes), and an App Store subscription can only be
 * stopped by the person who bought it in iOS Settings -- so that one is warned about and
 * recorded, which is the same posture, for the same reason, as the self-serve cancel route's
 * `alsoCancelInAppStore`.
 *
 * A ROW THAT ALREADY CARRIES BOTH keeps its tier: neither revocation branch clears the SKU while
 * the other rail's handle is present. That is the legacy state this rule prevents from here on,
 * and withholding access from somebody who may still be paying is the worse of the two errors.
 */
const upsertSubscriptionByUserId = vi.fn();
const updateSubscriptionByUserId = vi.fn();
const upsertStripeCustomerId = vi.fn();
const updateSubscriptionByStripeId = vi.fn();
const getSubscriptionForUser = vi.fn();
const updateFreeAgentBilling = vi.fn();
const applyCoachSubscriptionBand = vi.fn();
const logBillingEvent = vi.fn();
const wasStripeEventProcessed = vi.fn();
const clearCoachBand = vi.fn();
const revokeAddOnsForStripeSubscription = vi.fn();
const endAddOnsForDeletedStripeSubscription = vi.fn();

vi.mock("./storage", () => ({
  storage: {
    upsertSubscriptionByUserId,
    updateSubscriptionByUserId,
    upsertStripeCustomerId,
    updateSubscriptionByStripeId,
    getSubscriptionForUser,
    updateFreeAgentBilling,
    applyCoachSubscriptionBand,
    logBillingEvent,
    wasStripeEventProcessed,
    clearCoachBand,
    revokeAddOnsForStripeSubscription,
    endAddOnsForDeletedStripeSubscription,
  },
}));

const cancel = vi.fn();
// The invoice -> subscription lookup the refund path makes needs a client; faked so nothing
// leaves the process, and the key is stubbed because without one getStripeClient() returns null
// and charge.refunded is a silent no-op -- which would make the event-id case below vacuous.
const invoiceRetrieve = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    subscriptions = { cancel, retrieve: vi.fn(), update: vi.fn() };
    checkout = { sessions: { create: vi.fn() } };
    refunds = { create: vi.fn() };
    invoices = { retrieve: invoiceRetrieve };
    charges = { retrieve: vi.fn() };
    billingPortal = { sessions: { create: vi.fn() } };
    webhooks = { constructEvent: vi.fn() };
  },
}));
vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_for_this_file");

const { handleStripeWebhookEvent } = await import("./billing");

function fakeEvent<T>(id: string, type: string, object: T): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

beforeEach(() => {
  vi.clearAllMocks();
  wasStripeEventProcessed.mockResolvedValue(false);
  getSubscriptionForUser.mockResolvedValue(null);
  revokeAddOnsForStripeSubscription.mockResolvedValue({ userId: null, addOnIds: [] });
  endAddOnsForDeletedStripeSubscription.mockResolvedValue({ userId: null, addOnIds: [] });
});

const tierPurchase = () =>
  fakeEvent("evt_rail_1", "checkout.session.completed", {
    id: "cs_rail",
    client_reference_id: "42",
    subscription: "sub_new",
    customer: "cus_1",
    mode: "subscription",
    metadata: { kind: "free_agent_tier", tier: "ai_coach_video" },
  });

describe("a web tier purchase takes the row from the App Store", () => {
  it("clears the Apple handle, so a later Apple event cannot claim this tier", async () => {
    getSubscriptionForUser.mockResolvedValue({ appleOriginalTransactionId: "2000000111" });
    await handleStripeWebhookEvent(tierPurchase());
    const [, values] = upsertSubscriptionByUserId.mock.calls.at(-1)!;
    expect(values.stripeSubscriptionId).toBe("sub_new");
    expect(values.appleOriginalTransactionId).toBeNull();
  });

  it("says plainly that the App Store subscription is still billing", async () => {
    // Forge cannot cancel it: an Apple subscription is stopped by the person in iOS Settings.
    // So the honest act is a record naming the transaction, not a silent takeover.
    getSubscriptionForUser.mockResolvedValue({ appleOriginalTransactionId: "2000000111" });
    await handleStripeWebhookEvent(tierPurchase());
    const logged = logBillingEvent.mock.calls.find(([, event]) =>
      String(event).includes("rail_changed"),
    );
    expect(logged, "no rail_changed billing event was recorded").toBeTruthy();
    expect(JSON.stringify(logged![2])).toContain("2000000111");
  });

  it("leaves the column alone for an ordinary purchase", async () => {
    // THE CONTROL. Writing appleOriginalTransactionId: null on every web purchase would pass the
    // first case just as well and would rewrite a column nobody asked about.
    getSubscriptionForUser.mockResolvedValue({ stripeSubscriptionId: "sub_old" });
    await handleStripeWebhookEvent(tierPurchase());
    const [, values] = upsertSubscriptionByUserId.mock.calls.at(-1)!;
    expect("appleOriginalTransactionId" in values).toBe(false);
  });
});

describe("a Stripe cancellation does not take a tier the App Store is paying for", () => {
  const deletion = () =>
    fakeEvent("evt_rail_2", "customer.subscription.deleted", { id: "sub_old", current_period_end: 0 });

  it("keeps the SKU when the row also carries an Apple transaction", async () => {
    updateSubscriptionByStripeId.mockResolvedValue({
      userId: 42,
      accountType: "free_agent",
      appleOriginalTransactionId: "2000000111",
    });
    await handleStripeWebhookEvent(deletion());
    expect(updateFreeAgentBilling).not.toHaveBeenCalled();
    const logged = logBillingEvent.mock.calls.find(([, event]) =>
      String(event).includes("rail_still_on_file"),
    );
    expect(logged, "the kept SKU was not recorded").toBeTruthy();
  });

  it("still cancels the row and ends that subscription's add-ons", async () => {
    // Everything else about the branch is unchanged: only the SKU is withheld.
    updateSubscriptionByStripeId.mockResolvedValue({
      userId: 42,
      accountType: "free_agent",
      appleOriginalTransactionId: "2000000111",
    });
    await handleStripeWebhookEvent(deletion());
    expect(updateSubscriptionByStripeId).toHaveBeenCalledWith("sub_old", { status: "canceled" });
    expect(endAddOnsForDeletedStripeSubscription).toHaveBeenCalled();
  });

  it("clears the SKU on an ordinary single-rail cancellation", async () => {
    // THE CONTROL for the case above -- a handler that never cleared the SKU would pass it.
    updateSubscriptionByStripeId.mockResolvedValue({ userId: 42, accountType: "free_agent" });
    await handleStripeWebhookEvent(deletion());
    expect(updateFreeAgentBilling).toHaveBeenCalledWith(42, { freeAgentTier: null });
  });
});

describe("the Apple side of the same rule", () => {
  const storageSrc = readFileSync(join(import.meta.dirname, "storage.ts"), "utf8");
  const routesSrc = readFileSync(join(import.meta.dirname, "routes.ts"), "utf8");

  function fn(name: string) {
    const start = storageSrc.indexOf(`async ${name}(`);
    expect(start, `${name} not found`).toBeGreaterThan(-1);
    return storageSrc.slice(start, storageSrc.indexOf("\n  },\n", start));
  }

  it("an Apple tier purchase takes the row from Stripe", () => {
    const body = fn("applyAppleIapVerification");
    expect(body).toMatch(/stripeSubscriptionId: null/);
    // And hands the id up, because cancelling it needs the Stripe client and storage.ts may not
    // import billing.ts -- the cycle that module's own comment warns about.
    expect(body).toMatch(/supersededStripeSubscriptionId/);
  });

  it("the verify route cancels what the purchase superseded", () => {
    expect(routesSrc).toMatch(/cancelSupersededStripeSubscription\(/);
  });

  it("an Apple revocation does not take a tier Stripe is paying for", () => {
    const body = fn("applyAppleServerNotification");
    expect(body).toMatch(/stripeSubscriptionId/);
    expect(body).toMatch(/rail_still_on_file/);
  });
});

describe("the athlete is told before the second charge, not after", () => {
  const routesSrc = readFileSync(join(import.meta.dirname, "routes.ts"), "utf8");
  const upgradePage = readFileSync(
    join(import.meta.dirname, "..", "client", "src", "pages", "athlete", "upgrade.tsx"),
    "utf8",
  );

  it("the entitlements route says which rail is billing the plan", () => {
    // Answerable only because of the takeover rule above: before it, a handle on the row meant
    // "bought on this rail at some point", which is not the same question.
    expect(routesSrc).toMatch(/appleSubscriptionOnFile: Boolean\(/);
  });

  it("the upgrade page warns on the web and nowhere else", () => {
    expect(upgradePage).toMatch(/appleSubscriptionOnFile/);
    // `supported` is the StoreKit platform check, so !supported is the web. Inside the app a
    // tier swap stays inside one StoreKit subscription group and there is nothing to warn about.
    expect(upgradePage).toMatch(/!supported && !androidNative && entitlements\?\.appleSubscriptionOnFile/);
    expect(upgradePage).toMatch(/iOS Settings/);
  });

  it("does not send a native buyer to a browser to fix it", () => {
    // Guideline 3.1.1: the app may not point at the web checkout. The notice names iOS Settings,
    // which is Apple's own surface, and never a browser or the Forge site.
    const notice = upgradePage.slice(
      upgradePage.indexOf("appleSubscriptionOnFile &&"),
      upgradePage.indexOf("FREE_AGENT_TIER_GRID_COLS", upgradePage.indexOf("appleSubscriptionOnFile &&")),
    );
    expect(notice).not.toMatch(/browser|forgeperformancesystems|open Forge in/i);
  });
});

/** ONE DELIVERY MAY CLAIM THE STRIPE EVENT ID ONCE.
 *
 * billing_audit_log.stripe_event_id is UNIQUE -- it is the idempotency check
 * handleStripeWebhookEvent makes before processing a delivery at all -- so a handler that writes
 * two rows carrying one id throws on the second insert, 500s the webhook, and leaves Stripe
 * retrying a delivery that has already done half its work. Mocked storage has no constraint to
 * violate, which is why every other unit test of this handler is blind to it; the itest beside
 * this file proves it against real Postgres, and this counts the calls, which is what makes the
 * rule visible in a file somebody reads.
 */
describe("the unique Stripe event id is claimed once per delivery", () => {
  it("a refund that revokes both an add-on and a tier writes one row with the id", async () => {
    // revokeEverythingForSubscription's two halves can both find something: an add-on's
    // subscription id lives in users.addOnTerms (matched by a text LIKE) and a tier's in the
    // subscriptions row. It passed the same eventId to both until 2026-10-14.
    revokeAddOnsForStripeSubscription.mockResolvedValue({ userId: 42, addOnIds: ["all_classes"] });
    updateSubscriptionByStripeId.mockResolvedValue({ userId: 42, accountType: "free_agent" });
    invoiceRetrieve.mockResolvedValue({ id: "in_1", subscription: "sub_refunded" });
    await handleStripeWebhookEvent(
      fakeEvent("evt_refund_1", "charge.refunded", { id: "ch_1", invoice: "in_1" }),
    );
    const withId = logBillingEvent.mock.calls.filter((call) => call[3] != null);
    expect(withId.length).toBeLessThanOrEqual(1);
    // And both rows were still written -- the fix is about the id, not about saying less.
    expect(logBillingEvent.mock.calls.length).toBeGreaterThanOrEqual(2);
    // The id travels in the detail of the row that could not claim it, so nothing is lost.
    expect(JSON.stringify(logBillingEvent.mock.calls)).toContain("evt_refund_1");
  });

  it("a cross-rail purchase writes one row with the id", async () => {
    getSubscriptionForUser.mockResolvedValue({ appleOriginalTransactionId: "2000000111" });
    await handleStripeWebhookEvent(tierPurchase());
    const withId = logBillingEvent.mock.calls.filter((call) => call[3] != null);
    expect(withId.length).toBe(1);
  });
});
