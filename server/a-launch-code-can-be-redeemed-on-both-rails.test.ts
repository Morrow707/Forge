import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/* A LAUNCH CODE HAS SOMEWHERE TO BE TYPED, ON BOTH RAILS (2026-10-15).
 *
 * Scott, declining a free tier: "we will be offering limited coupon codes at launch and other
 * holiday things to get people interested." Nothing accepted one. Stripe Checkout only shows
 * its promotion-code field when the session is created with allow_promotion_codes, and none of
 * the five sale checkouts set it; and an App Store offer code is redeemed on Apple's own sheet,
 * which the app never opened. A code that cannot be entered anywhere is not a promotion.
 */
const ROOT = join(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const billing = read("server/billing.ts");
const swift = read("ios/App/App/AppleIapPlugin.swift");
const iap = read("client/src/lib/apple-iap.ts");
const upgrade = read("client/src/pages/athlete/upgrade.tsx");

describe("the web rail: every sale checkout accepts a Stripe promotion code", () => {
  const sessions = billing.split("stripe.checkout.sessions.create({").slice(1);

  it("there are six checkout sessions and one of them is not a sale", () => {
    expect(sessions).toHaveLength(6);
  });

  it("the five sales set allow_promotion_codes; the guardian's 50-cent card check does not", () => {
    for (const s of sessions) {
      const head = s.slice(0, 400);
      const isGuardianCheck = head.includes("baseSessionParams(guardianId");
      if (isGuardianCheck) {
        // Not a sale: an identity step a child's account stands on. A discount on it would make
        // the record it produces mean something else.
        expect(head).not.toContain("allow_promotion_codes");
      } else {
        expect(head).toContain("allow_promotion_codes: true");
      }
    }
    expect(sessions.filter((s) => s.slice(0, 400).includes("baseSessionParams(guardianId"))).toHaveLength(1);
  });
});

describe("the App Store rail: the upgrade screen opens Apple's offer code sheet", () => {
  it("the plugin exposes redeemOfferCode and presents Apple's sheet, never reading a code", () => {
    expect(swift).toContain('CAPPluginMethod(name: "redeemOfferCode"');
    expect(swift).toContain("AppStore.presentOfferCodeRedeemSheet(in: scene)");
    const fn = swift.slice(swift.indexOf("@objc func redeemOfferCode"));
    // No argument is read off the call: the code is typed on Apple's sheet, not in Forge.
    expect(fn.slice(0, fn.indexOf("\n    }\n"))).not.toMatch(/call\.getString|call\.options/);
  });

  it("the TypeScript wrapper exists and the upgrade screen draws the button on iOS only", () => {
    expect(iap).toContain("redeemOfferCode(): Promise<void>;");
    expect(iap).toContain("export async function redeemAppleOfferCode()");
    expect(upgrade).toContain("redeemAppleOfferCode");
    // Gated on the platform capability, beside Restore Purchases, where a buyer looks.
    expect(upgrade).toMatch(/\{supported && \(\s*<Button[^>]*onClick=\{handleRedeemCode\}/);
  });

  it("a redeemed code grants nothing by itself: no new verify path was added for it", () => {
    // The transaction a redemption produces arrives through Transaction.updates and the
    // existing watcher verifies it with the server exactly like a purchase.
    const fn = iap.slice(iap.indexOf("export async function redeemAppleOfferCode()"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).not.toContain("apiRequest");
    expect(body).not.toContain("verifyAndFinish");
  });
});
