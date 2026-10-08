import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_FREE_AGENT_TIER_IDS,
  FREE_AGENT_TIERS,
  FREE_AGENT_TIER_ORDER,
  WITHDRAWN_FREE_AGENT_TIERS,
  entitlementsForFreeAgentTier,
  isFreeAgentTierPurchasable,
  appleProductIdForFreeAgentTier,
  WITHDRAWN_ADD_ONS,
  FREE_AGENT_ADD_ON_ORDER,
  addOnIsOffered,
} from "./free-agent-tiers";

/**
 * WITHDRAWING A TIER HAS TO DO TWO OPPOSITE THINGS AT ONCE, AND THIS KEEPS BOTH WORKING WHILE
 * NOTHING IS WITHDRAWN.
 *
 * AI Coach + Video was pulled from sale on 2026-09-19 and put back the same day, once the
 * decision became "sell it with a warning" rather than "stall it". So WITHDRAWN_FREE_AGENT_TIERS
 * is empty right now, and the obvious move is to delete all of this.
 *
 * Don't. The machinery is what made the withdrawal safe, and the thing it protects against is
 * silent and one-directional: a cleanup that shrinks one more list to "the tiers we sell" takes a
 * paid feature away from a paying customer, with no error anywhere and nothing on any screen to
 * show it happened. They just quietly stop getting what they are billed for. Rebuilding that
 * understanding under time pressure, the next time something has to be pulled, is exactly when
 * it will be got wrong.
 *
 * So this tests the SHAPE rather than one tier's membership: the two lists stay distinct, the
 * sale list drives what is offered, the ever-sold list drives what still resolves, and nothing
 * that resolves an existing subscription consults the sale list.
 */

const read = (...parts: string[]) => readFileSync(join(__dirname, "..", ...parts), "utf8");

describe("the two lists stay distinct and keep their separate jobs", () => {
  it("has an ever-sold list that is a superset of the for-sale list", () => {
    for (const tier of FREE_AGENT_TIER_ORDER) expect(ALL_FREE_AGENT_TIER_IDS).toContain(tier);
    expect(ALL_FREE_AGENT_TIER_IDS.length).toBeGreaterThanOrEqual(FREE_AGENT_TIER_ORDER.length);
  });

  it("treats exactly the non-withdrawn tiers as purchasable", () => {
    for (const tier of ALL_FREE_AGENT_TIER_IDS) {
      const withdrawn = WITHDRAWN_FREE_AGENT_TIERS.includes(tier);
      expect(isFreeAgentTierPurchasable(tier)).toBe(!withdrawn);
      expect(FREE_AGENT_TIER_ORDER.includes(tier)).toBe(!withdrawn);
    }
  });

  it("never lets a withdrawal revoke an entitlement", () => {
    // THE ONE THAT MATTERS MOST, and it holds whether or not anything is withdrawn today.
    // entitlementsForFreeAgentTier must answer from the tier's own definition and never consult
    // the sale list, or pulling a tier would strip the feature from everyone already paying.
    for (const tier of ALL_FREE_AGENT_TIER_IDS) {
      const def = FREE_AGENT_TIERS[tier];
      expect(entitlementsForFreeAgentTier(tier)).toEqual({
        hasAiChat: def.hasAiChat,
        hasVideoFormCheck: def.hasVideoFormCheck,
        hasSkills: def.hasSkills,
      });
    }
    const tiers = read("shared", "free-agent-tiers.ts");
    const at = tiers.indexOf("export function entitlementsForFreeAgentTier");
    const body = tiers.slice(at, at + 700);
    expect(body).not.toContain("FREE_AGENT_TIER_ORDER");
    expect(body).not.toContain("WITHDRAWN_FREE_AGENT_TIERS");
  });

  it("resolves an Apple receipt from the ever-sold list, not the sale list", () => {
    // Built from the sale list instead, this map returns null for a withdrawn tier's product id
    // on renewal -- which reads as "unknown product", grants nothing, and strips the feature from
    // somebody still being billed.
    const appleIap = read("server", "apple-iap.ts");
    expect(appleIap).toContain("ALL_FREE_AGENT_TIER_IDS.map((tier) => [appleProductIdForFreeAgentTier(tier), tier])");
    expect(appleIap).not.toContain("FREE_AGENT_TIER_ORDER.map((tier) => [appleProductIdForFreeAgentTier(tier), tier])");
  });

  it("validates a stored tier against the ever-sold list", () => {
    // An admin opening an athlete on a withdrawn tier has to be able to save the form without
    // the tier they are not changing being rejected on the way through.
    const schema = read("shared", "schema.ts");
    const form = schema.slice(schema.indexOf("export const updateFreeAgentBillingSchema"));
    expect(form.slice(0, 400)).toContain(".enum(ALL_FREE_AGENT_TIER_IDS");
  });

  it("keeps an Apple product id for every tier ever sold, which a restore needs", () => {
    for (const tier of ALL_FREE_AGENT_TIER_IDS) {
      expect(appleProductIdForFreeAgentTier(tier)).toBeTruthy();
    }
  });

  it("derives the checkout enum rather than naming tiers as literals", () => {
    // The route used to list the three ids as strings, so withdrawing a tier everywhere else
    // would have left that one endpoint still selling it.
    const routes = read("server", "routes.ts");
    const checkout = routes.slice(routes.indexOf("/api/billing/checkout/free-agent-tier"));
    const body = checkout.slice(0, checkout.indexOf("createFreeAgentTierCheckout"));
    expect(body).toContain("z.enum(FREE_AGENT_TIER_ORDER");
    for (const tier of ALL_FREE_AGENT_TIER_IDS) expect(body).not.toContain(`"${tier}"`);
  });

  it("sizes the tier-card grid to however many tiers are on sale", () => {
    for (const parts of [
      ["client", "src", "pages", "pricing.tsx"],
      ["client", "src", "pages", "landing.tsx"],
      ["client", "src", "pages", "athlete", "upgrade.tsx"],
    ]) {
      expect(read(...parts)).toContain("FREE_AGENT_TIER_GRID_COLS");
    }
  });
});

/* THE SAME MACHINERY EXISTS FOR ADD-ONS AND NOTHING HELD THE SURFACES TO IT.
 *
 * Everything above is about TIERS, where WITHDRAWN_FREE_AGENT_TIERS is empty and the shape is
 * what is being protected. The add-on half is the opposite situation: WITHDRAWN_ADD_ONS has three
 * real entries -- golf_swing, hitting, pitching, pulled because nobody has tested them -- and
 * there was no test anywhere that a surface respected `addOnIsOffered`.
 *
 * So on 2026-10-08 the launch audit's price sweep found /pricing rendering all three at $7.99/mo,
 * under the heading "Sport-specialist coaches, available as add-ons on any Free Agent tier",
 * live, on the one page a stranger reads, in the sitemap at priority 0.9 -- while every checkout
 * path refused them. athlete/upgrade.tsx had filtered correctly all along and carried the
 * argument in a comment ("A card saying $7.99, coming soon is still an offer"), which is what
 * makes the other two surfaces an oversight rather than a decision.
 *
 * This half is a SCAN over every surface that maps the add-on list, because the next surface to
 * be written will not be on anybody's list either -- which is exactly how these two were not.
 */
describe("a withdrawn add-on is not offered on any surface", () => {
  it("has three withdrawn add-ons, so these assertions are not vacuous", () => {
    // If the sport coaches are ever un-withdrawn this block stops proving anything, and that
    // should be a visible decision rather than a silent one.
    expect(WITHDRAWN_ADD_ONS.length).toBeGreaterThan(0);
    for (const id of WITHDRAWN_ADD_ONS) expect(addOnIsOffered(id)).toBe(false);
  });

  it("treats exactly the non-withdrawn add-ons as offered", () => {
    for (const id of FREE_AGENT_ADD_ON_ORDER) {
      expect(addOnIsOffered(id)).toBe(!WITHDRAWN_ADD_ONS.includes(id));
    }
  });

  /* Discovered, never listed. Any client file that maps the sport-coach ids is a surface that
   * can price them. */
  const surfaces = (() => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(__dirname, "..", dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) {
          if (readFileSync(join(__dirname, "..", rel), "utf8").includes("SPORT_COACH_ADD_ON_IDS")) {
            found.push(rel);
          }
        }
      }
    };
    walk("client/src");
    return found;
  })();

  it("finds the surfaces at all", () => {
    // Three today: pricing.tsx, athlete/upgrade.tsx, athlete/sport-coaches.tsx. A rename that
    // left this at zero would make every assertion below pass while checking nothing.
    expect(surfaces.length).toBeGreaterThanOrEqual(3);
  });

  it.each(surfaces)("%s CALLS addOnIsOffered, not merely imports it", (rel) => {
    // The surface has to ASK. How it answers differs by surface and both answers are right --
    // /pricing and the upgrade screen drop the card entirely, while athlete/sport-coaches.tsx
    // keeps it (that page is how somebody holding one opens it, and WITHDRAWN_ADD_ONS' comment is
    // explicit that an admin still reaches them) and drops only the price and the buy button.
    // Asserting a single shape would force the wrong one on one of them.
    //
    // A PLAIN toContain("addOnIsOffered") IS NOT ENOUGH and mutation testing is what showed it:
    // deleting the filter while leaving the import, or leaving the name in a comment, kept that
    // assertion green. So the two real call shapes are named -- a direct call, and the point-free
    // form handed to .filter -- and the import line is stripped first so it cannot answer for the
    // body. Same failure this repo already records for transport-failure-is-retryable.test.ts: a
    // regex is satisfied by a file containing the right words.
    const src = readFileSync(join(__dirname, "..", rel), "utf8");
    const withoutImports = src.replace(/^import[\s\S]*?from\s+"[^"]+";$/gm, "");
    expect(
      /addOnIsOffered\s*\(|\.filter\(\s*addOnIsOffered\s*\)/.test(withoutImports),
      `${rel} imports addOnIsOffered but never calls it`,
    ).toBe(true);
  });

  it("never names a withdrawn add-on as a literal on a surface", () => {
    // How the tier half of this file states the same rule: a hand-typed id is a surface that
    // keeps its own idea of what is for sale, and the withdrawal cannot reach it.
    for (const rel of surfaces) {
      const src = readFileSync(join(__dirname, "..", rel), "utf8");
      for (const id of WITHDRAWN_ADD_ONS) {
        expect(src, `${rel} names "${id}" directly`).not.toContain(`"${id}"`);
      }
    }
  });

  it("refuses a withdrawn add-on at checkout, derived rather than listed", () => {
    // The server half, and the reason the client half is a presentation bug rather than a way to
    // take money for nothing.
    const billing = read("server", "billing.ts");
    const at = billing.indexOf("createFreeAgentAddOnCheckout");
    expect(at).toBeGreaterThanOrEqual(0);
    const body = billing.slice(at, at + 1400);
    expect(body).toMatch(/addOnIsOffered|WITHDRAWN_ADD_ONS/);
  });
});
