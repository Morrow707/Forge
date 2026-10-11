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

/** Every checkout route's registration, from `app.post("/api/billing/checkout/...` up to the
 * handler's own `async (req, res)` -- which is exactly the middleware list and nothing else. */
function checkoutRoutes(): Record<string, string> {
  const found: Record<string, string> = {};
  const re = /app\.post\(\s*\n?\s*"(\/api\/billing\/checkout\/[a-z-]+)"([\s\S]*?)async \(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(routes))) found[m[1]] = m[2];
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
    // One definition of the comparison itself.
    const comparisons = routes.match(/coachIds\[0\] !== user\.id/g) ?? [];
    expect(comparisons.length).toBe(1);
  });

  it("tells an assistant who to ask instead of refusing them blankly", () => {
    // "Only the primary coach can change this" reads wrong in front of a card. The thing an
    // assistant needs is the name of the person who can.
    const billingMessage = routes.match(
      /const requirePrimaryCoachForBilling = primaryCoachOnly\(\s*"([^"]+)"/,
    )?.[1];
    expect(billingMessage).toBeDefined();
    expect(billingMessage).toMatch(/head coach/i);
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
