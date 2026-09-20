import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FREE_AGENT_ADD_ON_ORDER,
  FREE_AGENT_ADD_ONS,
  appleProductIdForFreeAgentAddOn,
} from "@shared/free-agent-tiers";
import {
  BILLING_ADD_ONS,
  BILLING_ADD_ON_ORDER,
  COACH_PURCHASABLE_ADD_ON_ORDER,
  COACHES_CORNER_MONTHLY_PRICE_CENTS,
} from "@shared/billing-tiers";

const routes = readFileSync(join(__dirname, "routes.ts"), "utf8");
const billing = readFileSync(join(__dirname, "billing.ts"), "utf8");

/**
 * THE ADD-ON PURCHASE PATH IS BUILT AND DORMANT, and both halves of that matter.
 *
 * Built: there are two real checkout routes, two real Stripe session builders, two
 * webhook branches and StoreKit product ids, so opening billing is a flag rather
 * than a project. Dormant: every one of them goes through chargingClosed() first,
 * so today nothing can be charged and everything is free in beta.
 */
describe("the add-on checkout routes derive their ids from the shared lists", () => {
  // Same reasoning as the tier checkout's own enum: a hand-typed copy of a list is
  // a copy that stops agreeing with the list, and this one would go on selling an
  // add-on after it had been pulled everywhere else.
  it("takes the Free Agent add-on ids from FREE_AGENT_ADD_ON_ORDER", () => {
    const at = routes.indexOf('"/api/billing/checkout/free-agent-add-on"');
    expect(at).toBeGreaterThan(-1);
    const body = routes.slice(at, at + 1600);
    expect(body).toContain("z.enum(FREE_AGENT_ADD_ON_ORDER");
    for (const id of FREE_AGENT_ADD_ON_ORDER) {
      expect(body).not.toContain(`"${id}"`);
    }
  });

  it("takes the coach add-on ids from COACH_PURCHASABLE_ADD_ON_ORDER", () => {
    const at = routes.indexOf('"/api/billing/checkout/coach-add-on"');
    expect(at).toBeGreaterThan(-1);
    const body = routes.slice(at, at + 1600);
    expect(body).toContain("z.enum(COACH_PURCHASABLE_ADD_ON_ORDER");
  });

  it("refuses to charge while billing is closed, in both builders", () => {
    for (const fn of ["createFreeAgentAddOnCheckout", "createCoachAddOnCheckout"]) {
      const at = billing.indexOf(`export async function ${fn}`);
      expect(at).toBeGreaterThan(-1);
      // chargingClosed() FIRST, before the Stripe client is even asked for: the
      // beta guarantee is a switch somebody has to turn on, not a missing key.
      const head = billing.slice(at, at + 600);
      expect(head.indexOf("chargingClosed()")).toBeGreaterThan(-1);
      expect(head.indexOf("chargingClosed()")).toBeLessThan(head.indexOf("getStripeClient()"));
    }
  });

  it("appends ownership in the webhook rather than overwriting it", () => {
    // A second sport coach must not replace the first, and Coaches Corner must not
    // replace a personalization add-on somebody assigned.
    expect(billing).toContain('kind === "free_agent_add_on"');
    expect(billing).toContain('kind === "coach_add_on"');
    expect(billing).toContain("storage.addFreeAgentAddOn(");
    expect(billing).toContain("storage.addCoachBillingAddOn(");
  });

  it("validates the add-on id off the webhook metadata against the shared list", () => {
    // Metadata is a string that came back from an external system. An unrecognised
    // id written onto an account is an entitlement nothing can resolve.
    const at = billing.indexOf('if (kind === "free_agent_add_on")');
    const body = billing.slice(at, at + 900);
    expect(body).toContain("FREE_AGENT_ADD_ON_ORDER.includes");
  });
});

describe("Coaches Corner is a real, priced coach add-on", () => {
  it("is on the add-on list and carries the shared price", () => {
    expect(BILLING_ADD_ON_ORDER).toContain("coaches_corner");
    expect(BILLING_ADD_ONS.coaches_corner.monthlyPriceCents).toBe(
      COACHES_CORNER_MONTHLY_PRICE_CENTS,
    );
  });

  it("is the one coach add-on checkout will sell", () => {
    // The personalization add-ons are real, assignable, priced ids with no
    // self-serve checkout -- "is this an add-on" and "may this be bought here" are
    // two questions and only the second belongs in a checkout.
    expect(COACH_PURCHASABLE_ADD_ON_ORDER).toEqual(["coaches_corner"]);
  });

  it("no longer tells a coach it comes with a plan that does not exist", () => {
    // The org model is roster bands at a flat per-athlete rate. There is no "Pro
    // coaching plan" to include anything in, and nothing sold one.
    const page = readFileSync(
      join(__dirname, "..", "client", "src", "pages", "coach", "coaches-corner.tsx"),
      "utf8",
    );
    expect(page).not.toContain("Pro coaching plan");
  });

  it("resolves through the entitlements object, so beta means unlocked", () => {
    // It used to read subscriptions.tier === "pro" and a hardcoded email allowlist,
    // and asked isBetaAccount nowhere -- which locked out every coach on Forge.
    const at = routes.indexOf("async function hasCoachesCornerAccess");
    const body = routes.slice(at, routes.indexOf("async function coachesCornerAccessFor"));
    expect(body).toContain("getEntitlementsForCoach");
    expect(body).toContain("hasCoachesCorner");
    expect(body).not.toContain('sub.tier === "pro"');
  });
});

describe("the sport-coach gate is answered in one place", () => {
  it("resolves through getFreeAgentEntitlements, not a raw column read", () => {
    const at = routes.indexOf("async function sportCoachAccessFor");
    const body = routes.slice(at, routes.indexOf("async function requireFreeAgentAddOn"));
    expect(body).toContain("getFreeAgentEntitlements");
  });

  it("the route gate requires an explicit true", () => {
    const at = routes.indexOf("async function requireFreeAgentAddOn");
    const body = routes.slice(at, at + 900);
    // Refusing anything that is not exactly true, rather than accepting anything
    // truthy: an add-on the server has not answered for is not an add-on somebody
    // owns.
    expect(body).toContain("!== true");
    // The old gate read isBetaAccount off the user row itself, which was a second
    // copy of a rule that also has to account for a trial and the enforcement flag.
    expect(body).not.toContain("user?.isBetaAccount");
  });

  it("the page asks the server instead of re-deriving it", () => {
    const page = readFileSync(
      join(__dirname, "..", "client", "src", "pages", "athlete", "sport-coaches.tsx"),
      "utf8",
    );
    expect(page).toContain("/api/athlete/entitlements");
    // The re-derivation this replaced, exactly as it was written.
    expect(page).not.toContain("user?.isBetaAccount");
    // "Free while Forge is in beta" is only true for an account that IS comped --
    // the locked branch is reached precisely by one that is not.
    expect(page).toContain("Not available yet");
  });
});

describe("every add-on has somewhere to be bought", () => {
  it("gives each sport coach its own StoreKit product id under the bundle", () => {
    const ids = FREE_AGENT_ADD_ON_ORDER.map(appleProductIdForFreeAgentAddOn);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^com\.foreperformancesystems\.forge\.addon\./);
  });

  it("prices every sport coach from the shared list", () => {
    for (const id of FREE_AGENT_ADD_ON_ORDER) {
      expect(FREE_AGENT_ADD_ONS[id].monthlyPriceCents).toBeGreaterThan(0);
    }
  });

  it("requires a Stripe Price for each one before billing can call itself ready", async () => {
    const { missingPriceEnvVars } = await import("./stripe-prices");
    const missing = missingPriceEnvVars();
    for (const id of FREE_AGENT_ADD_ON_ORDER) {
      expect(missing).toContain(`STRIPE_PRICE_FREE_AGENT_ADDON_${id.toUpperCase()}`);
    }
    expect(missing).toContain("STRIPE_PRICE_COACH_ADDON_COACHES_CORNER");
  });
});
