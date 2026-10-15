import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect, vi } from "vitest";

// storage.ts's import chain pulls in server/db.ts, which throws at import time with no
// DATABASE_URL -- the same reason every other unit test of billing.ts mocks it. Nothing here
// calls it; getFreeAgentEntitlements is a pure function over the account it is handed.
vi.mock("./storage", () => ({ storage: {} }));
// The gates only restrict with enforcement on, which is production's setting since 2026-10-11
// and the integration config's. Stubbed BEFORE the import, because billing.ts reads it once at
// module load -- a test of a paywall with the paywalls off asserts nothing.
vi.stubEnv("BILLING_ENFORCEMENT_ENABLED", "true");
const { getFreeAgentEntitlements } = await import("./billing");

/* FIVE GATES AND ONE SENTENCE, ALL FROM THE 2026-10-14 AUDIT PANEL, ALL REAL AT HEAD.
 *
 * Each is small on its own and they are one family: a paid thing that forgot to ask the question
 * its neighbour asks.
 */
const routes = readFileSync(join(import.meta.dirname, "routes.ts"), "utf8");
const storage = readFileSync(join(import.meta.dirname, "storage.ts"), "utf8");

function middlewareOf(path: string) {
  const at = routes.indexOf(`"${path}"`);
  expect(at, path).toBeGreaterThan(-1);
  return routes.slice(at, routes.indexOf("async (req", at));
}

describe("a tier sold without skills does not get skills, by any door", () => {
  it("self-assigning a drill asks for the skills entitlement", () => {
    // A Basic Free Agent could not LIST the Skill Bank and could still assign themselves a drill
    // out of it, which runs the camera-timed session the tier does not include.
    expect(middlewareOf("/api/athlete/my/skill-assignments")).toMatch(/requirePaidAiAccess\("skillsAi"\)/);
  });

  it("so do the two Skill Bank reads", () => {
    expect(middlewareOf("/api/athlete/skill-exercises")).toMatch(/requirePaidAiAccess\("skillsAi"\)/);
    expect(middlewareOf("/api/athlete/skill-exercises/:id")).toMatch(/requirePaidAiAccess\("skillsAi"\)/);
  });
});

describe("a coach's promo trial is not a Free Agent tier", () => {
  it("does not unlock the paid tier for an account carrying a coach's trial", () => {
    // users.trialExpiresAt is written by storage.redeemCode alone, from a coach-only route. An
    // admin demoting that coach used to hand them camera, skills and AI chat free for the rest
    // of the promo window -- a quarter of a year on a 90-day code.
    const inAMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const ents = getFreeAgentEntitlements({
      freeAgentTier: null,
      freeAgentAddOns: null,
      addOnTerms: null,
      isBetaAccount: false,
      trialExpiresAt: inAMonth,
    } as Parameters<typeof getFreeAgentEntitlements>[0]);
    expect(ents.hasVideoFormCheck).toBe(false);
    expect(ents.hasSkills).toBe(false);
  });

  it("still comps a deliberately comped account", () => {
    // THE CONTROL: the branch above it is the one admin switch that comps on purpose, and
    // removing the trial must not have taken that with it.
    const ents = getFreeAgentEntitlements({
      freeAgentTier: null,
      freeAgentAddOns: null,
      addOnTerms: null,
      isBetaAccount: true,
      trialExpiresAt: null,
    } as Parameters<typeof getFreeAgentEntitlements>[0]);
    expect(ents.hasVideoFormCheck).toBe(true);
  });

  it("and the COACH side still honours the trial it was written for", () => {
    const billing = readFileSync(join(import.meta.dirname, "billing.ts"), "utf8");
    const fn = billing.slice(billing.indexOf("export function getEntitlements("));
    expect(fn.slice(0, fn.indexOf("\n}"))).toMatch(/trial/i);
  });

  it("is the only writer, which is what made it invisible", () => {
    // If something ever starts setting trialExpiresAt for an athlete, this test is where the
    // decision gets re-made rather than inherited.
    const writers = storage.match(/set\(\{ trialExpiresAt/g) ?? [];
    expect(writers).toHaveLength(1);
    const at = storage.indexOf("set({ trialExpiresAt");
    expect(storage.slice(at - 600, at)).toMatch(/coachId/);
  });
});

describe("a gated chapter is never activated by a read", () => {
  it("every athlete class progress read passes the pricing gate", () => {
    // getClassProgressForAthlete recomputes as it reads, so a bare call does not merely show a
    // gated chapter as open -- it can put one on the calendar, which the pricing rule says
    // never happens.
    expect(routes).not.toMatch(/getClassProgressForAthlete\(user\.id, id\)/);
    const gated = routes.match(/getClassProgressForAthlete\(user\.id, id, undefined, await classTierGated\(user\)\)/g);
    expect(gated?.length).toBeGreaterThanOrEqual(4);
  });
});

describe("a revoked Google Play subscription takes the SKU with it", () => {
  it("clears the tier, as the Apple twin does", () => {
    const at = storage.indexOf("async applyGooglePlayNotification");
    const body = storage.slice(at, storage.indexOf("\n  },\n", at));
    expect(body).toMatch(/updateFreeAgentBilling\([\s\S]{0,60}freeAgentTier: null/);
    // And carries the same cross-rail guard: a row that also names a live Stripe subscription
    // may still be paid for.
    expect(body).toMatch(/stripeSubscriptionId/);
  });
});

describe("a 402 names something that exists", () => {
  it("no refusal cites a Growth plan or a Workflow add-on", () => {
    // Neither has ever existed in BILLING_TIERS or ALL_ADD_ON_IDS. hasWorkflowCustomization
    // comes from Full Personalization or a band above ORG_BLOCK_SIZE; hasMultiTeam from the band
    // alone, so naming an add-on there would be the same lie in the other direction.
    expect(routes).not.toMatch(/Growth plan/);
    expect(routes).not.toMatch(/Workflow add-on/);
  });

  it("and names no price, which the app may not show a coach", () => {
    // Guideline 3.1.1: the iOS app may not price the coach plan. A band threshold is not a
    // price, which is the line native-paywall-never-points-at-the-web.test.ts already draws.
    for (const msg of routes.match(/"[^"]*above 20 athletes[^"]*"/g) ?? []) {
      expect(msg).not.toMatch(/\$|\d+\.\d\d/);
    }
  });
});
