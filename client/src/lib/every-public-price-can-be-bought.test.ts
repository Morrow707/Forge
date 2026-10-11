import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { COACH_PURCHASABLE_ADD_ON_ORDER } from "@shared/billing-tiers";
import { FREE_AGENT_TIER_ORDER, FREE_AGENT_ADD_ON_ORDER, addOnIsOffered } from "@shared/free-agent-tiers";

/* A PRICE ON A PUBLIC PAGE IS AN OFFER, AND ONE OF THEM HAD NOTHING BEHIND IT.
 *
 * Found 2026-10-11. `/pricing` read "Extra video storage, $9.99/mo" -- indexable, in the sitemap
 * at priority 0.9, the one page a stranger reads -- and `users.hasVideoStorageAddOn` has no
 * Stripe Price, no checkout route, no App Store product, and no control on the athlete's own
 * upgrade screen. The only way to get it is an admin ticking a box on /admin/billing.
 *
 * It is the SAME bug as the three withdrawn sport coaches priced a few lines above it on the same
 * page, which the launch audit's price sweep caught on 2026-10-08. That sweep could not catch
 * this one, because it scanned for `SPORT_COACH_ADD_ON_IDS` -- the thing it already knew about.
 * A scan aimed at a known id cannot fail for a price nobody aimed it at, which is the fourth
 * instance this month of one shape: the public legal-doc assertion iterating the set it was meant
 * to police, the upload-directory list that could not fail for a directory nobody added, the
 * email-claims glob that could not see a file named something else.
 *
 * SO THIS ONE DISCOVERS THE PRICES. It reads `shared/` for every exported thing that defines a
 * monthly price, then reads each public marketing page and requires that every one of those the
 * page actually renders is either BUYABLE or named here with a reason. The machinery for a
 * divergence exists, the divergences are two, and adding a third costs a sentence that shows up
 * in a grep -- the same shape as FITTED_OVERRIDES in the camera registry and NOT_PUBLIC_ON_PURPOSE
 * in the legal-document scan.
 */
const ROOT = join(import.meta.dirname, "../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** Every exported name in shared/ that carries a monthly price, discovered rather than listed.
 *
 * Deliberately generous: a name lands here if its declaration assigns `monthlyPriceCents` or if
 * it ends in `_CENTS`. Over-capturing costs nothing, because only the names a public page
 * actually renders have to be classified below -- and under-capturing is the failure this file
 * exists to prevent. */
function discoverPricedNames(): string[] {
  const dir = join(ROOT, "shared");
  const names = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".ts") || file.includes(".test.")) continue;
    const src = readFileSync(join(dir, file), "utf8");
    // Split at each top-level export, so a declaration's own text is what is tested -- not the
    // whole file, which would match every name in a file that prices anything at all.
    const parts = src.split(/^export (?:const|function|type|interface) /m);
    for (let i = 1; i < parts.length; i++) {
      const name = parts[i].match(/^([A-Za-z0-9_]+)/)?.[1];
      if (!name) continue;
      if (/_CENTS$/.test(name) || /monthlyPriceCents\s*:/.test(parts[i])) names.add(name);
    }
  }
  return [...names].sort();
}

/* The public pages a stranger reads prose and prices on. Same list as
 * every-marketing-page-has-a-way-out.test.ts classifies as marketing pages, for the same reason:
 * PUBLIC_ROUTES also holds nine legal documents and a handful of forms, and none of those prices
 * anything. */
const MARKETING_PAGES: Record<string, string> = {
  "/": "client/src/pages/landing.tsx",
  "/pricing": "client/src/pages/pricing.tsx",
  "/for-high-schools": "client/src/pages/for-high-schools.tsx",
  "/for-athletes": "client/src/pages/for-athletes.tsx",
  "/camera-validation": "client/src/pages/camera-validation.tsx",
  "/movements": "client/src/pages/movement.tsx",
};

/** Priced AND buyable: a visitor who reads this number can act on it today. The note says which
 * rail, because "there is a checkout" is the claim being made and a rail nobody can reach is not
 * one. */
const BUYABLE: Record<string, string> = {
  FREE_AGENT_TIERS:
    "The three Free Agent tiers. POST /api/billing/checkout/free-agent-tier on the web and one " +
    "App Store subscription group on iOS. Both enums derive from FREE_AGENT_TIER_ORDER, so a " +
    "withdrawn tier is refused by the route rather than by a copy of the list.",
  FREE_AGENT_ADD_ONS:
    "All Classes, $19.99: POST /api/billing/checkout/free-agent-add-on and ...addon.all_classes_v1 " +
    "at Apple. The three sport coaches in the same record are withdrawn and the page filters them " +
    "out with addOnIsOffered -- see tier-withdrawal-machinery.test.ts, which polices the members.",
  ORG_PER_ATHLETE_CENTS:
    "The $4-an-athlete rate every coach band is built from. POST /api/billing/checkout/coach, web " +
    "only by App Store guideline 3.1.3(c), and the native app may not price it at all " +
    "(native-paywall-never-points-at-the-web.test.ts).",
};

/** Priced on a public page with no checkout behind it, each with the reason. An entry here is a
 * decision somebody made out loud, never a default. */
const PRICED_WITHOUT_A_CHECKOUT: Record<string, string> = {
  BILLING_ADD_ONS:
    "Full Personalization, $24.99, is admin-assigned on purpose and has no checkout on either " +
    "rail: COACH_PURCHASABLE_ADD_ON_ORDER is ['coaches_corner'] alone. Scott, 2026-10-08, asked " +
    "directly: 'we won't be adding to apple, which is fine.' A program's add-on is part of the " +
    "conversation a school has with Forge when they buy the plan, which is itself sold off the " +
    "app, so the price on this page is what they will be quoted rather than a button they expect.",
  ORG_BLOCK_SIZE:
    "Not a price at all -- the twenty-athlete threshold above which a band already includes Full " +
    "Personalization. It lands in the discovered set because the band table that reads it prices " +
    "every band, and the over-capture is deliberate (see discoverPricedNames).",
};

describe("a price on a public page has something behind it", () => {
  const priced = discoverPricedNames();

  it("discovers the priced names rather than holding a list", () => {
    // A scan that finds nothing passes every assertion below it. This is the floor: the four
    // records that define Forge's money have to be in there, or the discovery has broken and
    // the rest of this file is decoration.
    expect(priced).toContain("FREE_AGENT_TIERS");
    expect(priced).toContain("BILLING_ADD_ONS");
    expect(priced).toContain("FREE_AGENT_ADD_ONS");
    expect(priced).toContain("VIDEO_STORAGE_ADD_ON");
    expect(priced.length).toBeGreaterThan(5);
  });

  it("classifies every price a public marketing page renders", () => {
    const unclassified: string[] = [];
    for (const [route, rel] of Object.entries(MARKETING_PAGES)) {
      const src = read(rel);
      for (const name of priced) {
        if (!new RegExp(`\\b${name}\\b`).test(src)) continue;
        if (name in BUYABLE || name in PRICED_WITHOUT_A_CHECKOUT) continue;
        unclassified.push(`${route} renders ${name}`);
      }
    }
    // The message is the remedy: either wire a checkout, or say in PRICED_WITHOUT_A_CHECKOUT why
    // a stranger is being quoted a number they cannot act on.
    expect(unclassified).toEqual([]);
  });

  it("asks for a real reason, not a word", () => {
    for (const [name, reason] of Object.entries(PRICED_WITHOUT_A_CHECKOUT)) {
      expect(reason.length, `${name}'s reason is too short to be one`).toBeGreaterThan(80);
    }
    for (const [name, note] of Object.entries(BUYABLE)) {
      expect(note.length, `${name} should name the rail it is bought on`).toBeGreaterThan(40);
    }
  });

  it("keeps the two lists disjoint", () => {
    // A name in both would make the classification above pass for either reason, which is how a
    // price that lost its checkout would keep reading as buyable.
    for (const name of Object.keys(BUYABLE)) {
      expect(PRICED_WITHOUT_A_CHECKOUT).not.toHaveProperty(name);
    }
  });

  it("the video storage add-on is not priced on any public page", () => {
    // The finding itself, pinned by name. hasVideoStorageAddOn is set by an admin and by nothing
    // else -- there is no STRIPE_PRICE_* env var for it, no checkout route, no App Store product
    // and no control on athlete/upgrade.tsx. If it becomes buyable, this moves to BUYABLE with
    // the rail named; until then the public page states the included caps and no price.
    for (const [route, rel] of Object.entries(MARKETING_PAGES)) {
      expect(read(rel), `${route} prices an add-on nobody can buy`).not.toContain(
        "VIDEO_STORAGE_ADD_ON",
      );
    }
  });

  it("holds the claims in BUYABLE against the actual lists", () => {
    // The notes above say "there is a checkout", and these are the lists the routes derive their
    // enums from. A tier or add-on going off sale has to move out of BUYABLE, not sit there
    // asserting a rail that now refuses it.
    expect(FREE_AGENT_TIER_ORDER.length).toBeGreaterThan(0);
    expect(FREE_AGENT_ADD_ON_ORDER.filter(addOnIsOffered).length).toBeGreaterThan(0);
    expect(COACH_PURCHASABLE_ADD_ON_ORDER).toContain("coaches_corner");
  });
});
