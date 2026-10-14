import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* THREE CHECKOUT ROUTES TOOK MONEY FOR SOMETHING THEY COULD NOT GRANT.
 *
 * Found 2026-10-11, reading the four Stripe checkout routes side by side. Each one wrote the
 * purchase to the SESSION user's row, and in three cases that is not the row the entitlement
 * resolves off:
 *
 * 1. /api/billing/checkout/free-agent-tier had requireRole("athlete") and no requireFreeAgent,
 *    while the ADD-ON route immediately below it has carried that guard since it was written. So
 *    the one that takes the larger sum was the open one: $19.99 a month for AI Coach + Video from
 *    a COACHED athlete, whose camera, skills and AI already come from their coach and whose gates
 *    resolve through the coached branch and never through users.freeAgentTier. Money for something
 *    they already had. The client could not reach it -- athlete/upgrade.tsx is behind
 *    FreeAgentGate -- which is exactly why it needed closing here, since "hiding a button is not
 *    a permission check" is the standing rule and a checkout is the last place to lean on one.
 *
 * 2. /api/billing/checkout/coach and 3. /api/billing/checkout/coach-add-on charged an ASSISTANT
 *    coach and wrote the band or the add-on to the assistant's own row -- while
 *    getEntitlementsForCoach takes coachIds[0] and ownsCoachesCorner looks the primary up by
 *    hand. So an assistant could pay the band price, or $19.99 for Coaches Corner, and the
 *    program would be granted nothing. Not a direct-POST hole either: /coach/billing drew both
 *    buttons for any staff coach, because that page never asked -- user.isPrimaryCoach is on the
 *    session user and only coach/branding.tsx read it.
 *
 * A SCAN, NOT A LIST. Every app.post under /api/billing/checkout is discovered from the source
 * and must carry a guard, so a fifth checkout added later cannot default into having none --
 * which is how three of the four got here. The itests drive the real routes; this is the ratchet
 * that fails if a guard is dropped.
 */
const ROOT = join(import.meta.dirname, "..");
const routes = readFileSync(join(ROOT, "server/routes.ts"), "utf8");

/** EVERY ROUTE THAT STARTS A CHECKOUT, DISCOVERED BY WHAT IT CALLS -- NOT BY ITS PATH.
 *
 * This matched `app.post("/api/billing/checkout/...` for its first two days, and on 2026-10-14
 * the billing sweep found POST /api/coach/academy/unlock: a third door onto the Coaches Corner
 * purchase, calling createCoachAddOnCheckout with requireRole("coach") alone -- no primary-coach
 * guard and no requireWebCheckout -- which this scan could not see, because it is not under that
 * prefix.
 *
 * So the axis is wrong, and it is the THIRD time in one sweep that a scan's discovery axis
 * missed a member it looked like it covered (the money-route scan that knew only checkouts, the
 * compliance scan that asserted copy and not prices, this). A route is a checkout because it
 * CREATES one, so that is what gets matched: every app.post whose handler calls a create*Checkout
 * function, wherever it lives.
 *
 * Returns the middleware list -- from the path to the handler's own `async (` -- which is
 * exactly the middleware and nothing else. */
function checkoutRoutes(): Record<string, string> {
  const found: Record<string, string> = {};
  const re = /app\.post\(\s*\n?\s*"([^"]+)"([\s\S]*?)async \(req[^)]*\) => \{([\s\S]*?)\n  \}?\)?;?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(routes))) {
    const [, path, middleware, body] = m;
    // BOUNDED AT THE NEXT REGISTRATION, not at a character count. A fixed window bleeds into
    // the route below and attributes its checkout call to this one -- the first run of this axis
    // reported /api/billing/add-on/:addOnId/restore as a checkout for exactly that reason, since
    // the route after it creates one. Same lesson as the 220-character window this file already
    // rewrote: a window measured in characters is a window measured in the wrong thing.
    const rest = routes.slice(m.index + 10);
    const nextRoute = rest.search(/\n  app\.(post|get|put|patch|delete)\(/);
    const window = nextRoute > -1 ? rest.slice(0, nextRoute) : rest;
    if (/create[A-Za-z]*Checkout\(/.test(window)) found[path] = middleware;
  }
  return found;
}

/** What each checkout must establish before it may charge anybody, and why that guard and not
 * another. The reason is the point: a guard list with no reasons is a list somebody prunes. */
const REQUIRED_GUARD: Record<string, { guard: string; because: string }> = {
  "/api/billing/checkout/free-agent-tier": {
    guard: "requireFreeAgent",
    because:
      "A coached athlete's camera, skills and AI come from their coach, so a Free Agent tier " +
      "grants them nothing they do not already have. The add-on route next door has always had " +
      "this guard; the tier route, which costs four times as much, did not.",
  },
  "/api/billing/checkout/free-agent-add-on": {
    guard: "requireFreeAgent",
    because:
      "Same rule, same reason, and this is the route that already had it -- kept here so the " +
      "pair cannot drift back apart.",
  },
  "/api/billing/checkout/coach": {
    guard: "requirePrimaryCoachForBilling",
    because:
      "The program's subscription lives on the primary coach's row: getEntitlementsForCoach " +
      "resolves off coachIds[0], so a band bought by an assistant lands where nothing looks.",
  },
  "/api/billing/checkout/coach-add-on": {
    guard: "requirePrimaryCoachForBilling",
    because:
      "ownsCoachesCorner looks the primary coach up explicitly, so a coach add-on is org-wide " +
      "by construction and an assistant's $19.99 unlocked it for nobody, themselves included.",
  },
  "/api/coach/academy/unlock": {
    guard: "requirePrimaryCoachForBilling",
    because:
      "A third door onto the Coaches Corner purchase, calling createCoachAddOnCheckout exactly " +
      "as /api/billing/checkout/coach-add-on does. It had requireRole(\"coach\") alone, so an " +
      "assistant could land the program's add-on on their own row -- which ownsCoachesCorner " +
      "does not read -- and the route answered a Stripe URL from inside the native app, which " +
      "is the 3.1.1 exposure requireWebCheckout exists to close.",
  },
  "/api/guardian/athletes/:athleteId/parental-verification": {
    guard: "requireGuardianAccess",
    because:
      "The 50c charge-and-refund that verifies a guardian's card under COPPA, which is NOT a " +
      "sale: nothing digital is bought, the money is returned, and it does not sit behind " +
      "BILLING_LIVE. requireGuardianAccess is the right gate because the question is whether " +
      "this adult may act for THIS child, not whether they may spend the program's money, and " +
      "it carries no requireWebCheckout on purpose -- a guardian claims on whatever device the " +
      "emailed link opened on, and refusing the native app would strand the commonest case.",
  },
  "/api/billing/checkout/class-lesson": {
    guard: "requireRole(\"athlete\")",
    because:
      "A priced class lesson is bought per enrolment, by the athlete it is for, and the " +
      "enrolment is what scopes it -- there is no org row for it to land on wrongly.",
  },
};

describe("every billing checkout establishes who it may charge", () => {
  const found = checkoutRoutes();

  it("finds every checkout route rather than trusting a list", () => {
    // A scan that matches nothing passes everything below it.
    expect(Object.keys(found).length).toBeGreaterThanOrEqual(5);
    expect(found).toHaveProperty("/api/billing/checkout/free-agent-tier");
    expect(found).toHaveProperty("/api/billing/checkout/coach");
  });

  it("classifies every one it finds", () => {
    const unclassified = Object.keys(found).filter((path) => !(path in REQUIRED_GUARD));
    // The remedy is in the message: name the guard this checkout needs and why, above.
    expect(unclassified).toEqual([]);
  });

  it("carries the guard each one needs", () => {
    const missing: string[] = [];
    for (const [path, { guard }] of Object.entries(REQUIRED_GUARD)) {
      const middleware = found[path];
      expect(middleware, `${path} is not registered any more`).toBeDefined();
      if (!middleware.includes(guard)) missing.push(`${path} is missing ${guard}`);
    }
    expect(missing).toEqual([]);
  });

  it("every checkout refuses the native app, wherever it lives", () => {
    // requireWebCheckout is the 3.1.1 guard: a Stripe checkout reachable from inside the app is
    // what puts a submission at risk. stripe-checkout.test.ts names four routes BY HAND and so
    // could not fail for the fifth -- /api/coach/academy/unlock, which had no such guard. This
    // asserts it on every route discovered above, by what it calls rather than by a list.
    // The guardian verification is the one exception and is stated as one: it sells nothing,
    // refunds the money, and a guardian claims on whatever device opened the emailed link.
    // Everything that SELLS must refuse the app.
    const SELLS_NOTHING = ["/api/guardian/athletes/:athleteId/parental-verification"];
    const missing: string[] = [];
    for (const [path, middleware] of Object.entries(found)) {
      if (SELLS_NOTHING.includes(path)) continue;
      if (!middleware.includes("requireWebCheckout")) missing.push(path);
    }
    expect(missing).toEqual([]);
  });

  it("asks for a reason, not a word", () => {
    for (const [path, { because }] of Object.entries(REQUIRED_GUARD)) {
      expect(because.length, `${path}'s reason is too short to be one`).toBeGreaterThan(80);
    }
  });

  it("keeps the primary-coach rule in ONE implementation", () => {
    // Two copies of "is this the primary coach" is how the two stop agreeing. primaryCoachOnly is
    // the rule and the message is its parameter, so the billing refusal can say who to ask
    // without a second copy of the check behind it.
    expect(routes).toContain("function primaryCoachOnly(message: string)");
    expect(routes).toContain('const requirePrimaryCoach = primaryCoachOnly(');
    expect(routes).toContain("const requirePrimaryCoachForBilling = primaryCoachOnly(");
    // ONE definition of the comparison itself, and it moved on 2026-10-14. The add-on
    // lifecycle routes needed the same rule with a different pass-through (an athlete may
    // cancel their own), so a second copy of `coachIds[0] !== user.id` appeared -- and THIS
    // assertion caught it, which is what it is for. The comparison now lives in isPrimaryCoach
    // and every caller asks that.
    expect(routes).toContain("async function isPrimaryCoach(userId: number)");
    const comparisons = routes.match(/coachIds\[0\] (!==|===) (user\.id|userId)/g) ?? [];
    expect(comparisons.length).toBe(1);
    // And one sentence for the refusal, shared by both money guards.
    const sentences = routes.match(/Your head coach looks after the program's plan and add-ons\./g) ?? [];
    expect(sentences.length).toBe(1);
  });

  it("tells an assistant who to ask instead of refusing them blankly", () => {
    // "Only the primary coach can change this" reads wrong in front of a card. The thing an
    // assistant needs is the name of the person who can. The sentence is a named constant since
    // 2026-10-14, shared with the add-on lifecycle guard, so the two cannot drift apart.
    expect(routes).toContain("const HEAD_COACH_OWNS_THE_MONEY =");
    const sentence = routes.match(/const HEAD_COACH_OWNS_THE_MONEY = "([^"]+)"/)?.[1];
    expect(sentence).toBeDefined();
    expect(sentence).toMatch(/head coach/i);
    expect(routes).toContain("primaryCoachOnly(HEAD_COACH_OWNS_THE_MONEY)");
  });
});

describe("the surfaces that draw a buy button ask the same question", () => {
  const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

  it("the coach billing page withholds Subscribe from an assistant", () => {
    const page = read("client/src/pages/coach/billing.tsx");
    expect(page).toContain("isPrimaryCoach");
    // The band's own Subscribe, and the add-on buy buttons, both behind it.
    expect(page).toMatch(/!isPrimaryCoach \?/);
    expect(page).toContain("!unlocked && isPrimaryCoach && entitlements.billingOpen");
  });

  it("the Coaches Corner upsell withholds its StoreKit button from an assistant", () => {
    // This one matters more than the web button: StoreKit takes the money BEFORE the server is
    // asked, so a route guard cannot save an assistant who taps it. The server then grants the
    // add-on to the primary's row rather than refusing a paid transaction (build 611's lesson),
    // but the honest surface is not to offer it.
    const page = read("client/src/pages/coach/coaches-corner.tsx");
    expect(page).toContain("const isPrimaryCoach = authUser?.isPrimaryCoach === true;");
    expect(page).toMatch(/appleSellable\s*=\s*\n?\s*isPrimaryCoach/);
  });

  it("an Apple coach add-on is granted to the row that reads it", () => {
    const storage = read("server/storage.ts");
    // The grant, not a refusal: Apple has already taken the money by the time this runs and the
    // phone never finishes a transaction the server refuses, so refusing would leave it
    // replaying at every launch forever.
    expect(storage).toContain("const grantTo = await this.getPrimaryCoachId(userId);");
    expect(storage).toContain("await this.addCoachBillingAddOn(grantTo, coachAddOn,");
    // And the buyer stays in the audit row, because the receipt is theirs even though the add-on
    // is the program's -- an Apple subscription is cancelled by whoever bought it.
    expect(storage).toContain("grantedToPrimaryCoachId");
  });
});

/* AND THE ROUTES THAT END A PURCHASE, WHICH THE FIRST VERSION OF THIS FILE DID NOT COVER.
 *
 * Found 2026-10-14 by the billing sweep. The scan above discovers every `app.post` under
 * /api/billing/checkout -- which cannot see a route that is not a checkout. DELETE
 * /api/billing/add-on/:addOnId and POST /api/billing/add-on/:addOnId/restore carried
 * `requireAuth` and nothing else.
 *
 * That matters because of where they WRITE: `owner` in both is
 * `getEffectiveCoachIds(user.id)[0]` for a coach -- the PRIMARY's row, correct for entitlements
 * and exactly what makes the gap harmful. An assistant coach could cancel the whole program's
 * Coaches Corner, or restore one the primary had deliberately ended.
 *
 * Same omission as the checkout routes three days earlier: those were given
 * requirePrimaryCoachForBilling in the same session these were written, and these were missed.
 * A guard added to one path and not its siblings is the defect this repo keeps recording -- so
 * this file now discovers BOTH shapes of money route, not just the one that takes payment.
 */
describe("the routes that end a purchase are guarded too", () => {
  const ROUTES = [
    { verb: 'app.delete', path: '/api/billing/add-on/:addOnId' },
    { verb: 'app.post', path: '/api/billing/add-on/:addOnId/restore' },
  ];

  it("finds both add-on lifecycle routes", () => {
    for (const r of ROUTES) {
      expect(routes, `${r.path} is not registered any more`).toContain(`${r.verb}("${r.path}"`);
    }
  });

  it("carries the primary-coach guard on each", () => {
    for (const r of ROUTES) {
      const idx = routes.indexOf(`${r.verb}("${r.path}"`);
      // The middleware list, never a character window -- see the lesson in the scan above.
      const middleware = routes.slice(idx).split("async (")[0];
      expect(middleware, `${r.path} can be called by any coach, not just the primary`).toContain(
        "requirePrimaryCoachForAddOnChange",
      );
    }
  });

  it("lets a Free Agent through, because their add-on is their own", () => {
    // The rule is conditional on the role rather than a blanket middleware. A blanket one would
    // lock an athlete out of cancelling their own All Classes -- `owner` is their own id there
    // and no primary coach is involved. That asymmetry is why this is its own guard.
    const fn = routes.slice(routes.indexOf("async function requirePrimaryCoachForAddOnChange"));
    const body = fn.slice(0, fn.indexOf("\n  }"));
    expect(body).toContain('if (user.role !== "coach") return next()');
    // DELEGATES the comparison, never copies it -- the duplication this file's one-rule
    // assertion caught when this guard was first written.
    expect(body).toContain("await isPrimaryCoach(user.id)");
    expect(body).toContain("403");
  });

  it("says who to ask, reusing the checkout refusal's own sentence", () => {
    const fn = routes.slice(routes.indexOf("async function requirePrimaryCoachForAddOnChange"));
    expect(fn.slice(0, fn.indexOf("\n  }"))).toContain("HEAD_COACH_OWNS_THE_MONEY");
  });
});
