import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * THE WIRING, not the rule -- shared/add-on-terms.test.ts owns the rule.
 *
 * This exists because the rule being correct is worth nothing if a reader skips it. Until
 * 2026-10-11 users.freeAgentAddOns and users.billingAddOns had two writers between them, both
 * append-only, and no removal function in the repo at all: an add-on bought once was owned for
 * good, whatever happened at Stripe or Apple afterwards. The four things that have to stay true
 * are that every access reader asks the rule, that a purchase records the handle a cancellation
 * needs, that a refund revokes on both rails, and that a cancellation never refunds.
 */

const SERVER = resolve(import.meta.dirname);
const read = (f: string) => readFileSync(resolve(SERVER, f), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const storage = stripComments(read("storage.ts"));
const billing = stripComments(read("billing.ts"));
const routes = stripComments(read("routes.ts"));

describe("every reader asks whether the add-on is still owed", () => {
  it("resolves coach entitlements off the ACTIVE set, not the raw column", () => {
    // The array keeps a cancelled add-on until its paid month runs out -- that is what makes
    // turning it back on free -- so reading the array alone would answer yes forever.
    expect(billing).toContain("activeAddOns(account.billingAddOns, account.addOnTerms)");
    expect(billing).not.toMatch(/new Set<AddOnId>\(\(account\.billingAddOns \?\? \[\]\)/);
  });

  it("resolves Free Agent add-ons the same way", () => {
    expect(billing).toContain("addOnMap(activeAddOns(account.freeAgentAddOns, account.addOnTerms))");
  });

  it("asks the rule for Coaches Corner and for All Classes", () => {
    expect(routes).toContain('addOnIsActive(primary?.billingAddOns, primary?.addOnTerms, "coaches_corner")');
    expect(routes).toContain("addOnIsActive(account?.freeAgentAddOns, account?.addOnTerms, ALL_CLASSES_ADD_ON_ID)");
    // The two raw `.includes` reads these replaced are the bug, and must not come back.
    expect(routes).not.toMatch(/billingAddOns \?\? \[\]\)\.includes\("coaches_corner"\)/);
  });

  it("selects the terms column, or the whole mechanism is inert on the athlete side", () => {
    // getFreeAgentBillingAccount is a narrow select; leaving addOnTerms out of it would make
    // every cancellation invisible to the gate while every test above still passed.
    const sel = storage.slice(storage.indexOf("async getFreeAgentBillingAccount"));
    expect(sel.slice(0, sel.indexOf("},"))).toContain("addOnTerms: users.addOnTerms");
  });
});

describe("a purchase records the handle a cancellation needs", () => {
  it("writes the Stripe subscription id with the add-on", () => {
    // subscriptions.userId is UNIQUE, so an add-on's subscription id cannot live on that row --
    // it belongs to the tier. Without this, nothing could cancel an add-on at Stripe even in
    // principle, and the "cancellation" would be local while Stripe went on billing.
    const grants = billing.split("kind === \"free_agent_add_on\"")[1] ?? "";
    expect(grants).toContain("stripeSubscriptionId:");
    expect(billing.split('kind === "coach_add_on"')[1] ?? "").toContain("stripeSubscriptionId:");
  });

  it("writes the Apple original transaction id with the add-on", () => {
    expect(storage).toContain("appleOriginalTransactionId: verified.originalTransactionId");
  });
});

describe("a refund revokes, on both rails", () => {
  it("handles charge.refunded and resolves the invoice to a subscription", () => {
    expect(billing).toContain('case "charge.refunded"');
    expect(billing).toContain("subscriptionIdForInvoice");
    expect(billing).toContain("revokeAddOnsForStripeSubscription");
  });

  it("revokes an add-on when Apple reports a revocation, before the tier lookup", () => {
    const branch = storage.slice(storage.indexOf('if (notification.kind === "revoked") {'));
    const revoke = branch.indexOf("revokeAddOnsForAppleTransaction");
    const tier = branch.indexOf("updateSubscriptionByAppleOriginalTransactionId");
    expect(revoke).toBeGreaterThan(-1);
    // An add-on purchase may have no subscriptions row of its own, so an early return on the
    // tier lookup would skip the revocation entirely. Order is the guarantee.
    expect(revoke).toBeLessThan(tier);
  });

  it("takes the add-on out of the owned list AND stamps it", () => {
    const fn = storage.slice(storage.indexOf("async revokeAddOnAfterRefund"));
    const body = fn.slice(0, fn.indexOf("\n  },"));
    expect(body).toContain("freeAgentAddOns: freeAgent");
    expect(body).toContain("billingAddOns: coach");
    expect(body).toContain("refundedAt");
  });
});

describe("a cancellation is not a refund", () => {
  it("cancels at the period end at Stripe, never immediately", () => {
    const fn = billing.slice(billing.indexOf("export async function cancelAddOnAtProvider"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain("cancel_at_period_end: true");
    // An immediate cancel would end access early AND leave a proration credit nobody asked for.
    expect(body).not.toMatch(/subscriptions\.cancel\(/);
    expect(body).not.toMatch(/prorate/);
  });

  it("leaves the add-on in the owned list, which is what makes restoring it free", () => {
    const fn = storage.slice(storage.indexOf("async scheduleAddOnRemoval"));
    const body = fn.slice(0, fn.indexOf("\n  },"));
    expect(body).toContain("accessUntil");
    expect(body).not.toContain("freeAgentAddOns:");
    expect(body).not.toContain("billingAddOns:");
  });

  it("refuses to restore a refunded add-on", () => {
    // Restoring one would hand back a product that was paid for and then un-paid for.
    const route = routes.slice(routes.indexOf('"/api/billing/add-on/:addOnId/restore"'));
    expect(route.slice(0, 2000)).toContain("term?.refundedAt != null");
  });

  it("tells the buyer when Apple is still billing them", () => {
    // An Apple subscription is cancelled by the person in iOS Settings; reporting a clean
    // "cancelled" while Apple goes on charging would be a lie.
    const route = routes.slice(routes.indexOf('app.delete("/api/billing/add-on/:addOnId"'));
    expect(route.slice(0, 3000)).toContain("alsoCancelInAppStore");
  });
});
