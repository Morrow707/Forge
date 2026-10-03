import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDatabase, db } from "./test-support/fixtures";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  startTestServer,
  makeLoginableUser,
  loginAs,
  TestClient,
  type TestServer,
} from "./test-support/http-app";
import { FREE_AGENT_ADD_ON_ORDER, WITHDRAWN_ADD_ONS } from "@shared/free-agent-tiers";

/**
 * SPORT-COACH ADD-ONS AND COACHES CORNER, ASKED OVER HTTP.
 *
 * Both were entitlements with no purchase path: three permanently disabled cards
 * and a button that had been deleted because every branch behind it answered 402.
 * The framework exists now and is dormant -- free while Forge is in beta, sold
 * once BILLING_LIVE is on -- and these are the assertions that say which is which.
 *
 * The source scans in add-on-checkout-framework.test.ts check that the routes are
 * WRITTEN correctly. Neither they nor a storage test can answer what an actual
 * request gets back, which is where a gate mounted in the wrong order or an
 * entitlement resolved off the wrong row would show up. Same reasoning as
 * http-authorization.itest.ts, and the same one-login-per-actor discipline: the
 * login limiter's counter lives in the module, not the app.
 */
let server: TestServer;
let betaAthlete: Awaited<ReturnType<typeof makeLoginableUser>>;
let payingAthlete: Awaited<ReturnType<typeof makeLoginableUser>>;
let betaCoach: Awaited<ReturnType<typeof makeLoginableUser>>;

let asBetaAthlete: TestClient;
let asPayingAthlete: TestClient;
let asBetaCoach: TestClient;

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();

  // isBetaAccount defaults true (see its column comment) -- this is every account
  // on Forge today.
  betaAthlete = await makeLoginableUser({ role: "athlete", name: "Beta Free Agent" });
  // The only kind of account any of this restricts: beta explicitly off, no trial,
  // nothing bought.
  payingAthlete = await makeLoginableUser({
    role: "athlete",
    name: "Paying Free Agent",
    isBetaAccount: false,
    trialExpiresAt: null,
  });
  betaCoach = await makeLoginableUser({ role: "coach", name: "Beta Coach" });

  asBetaAthlete = await loginAs(server.baseUrl, betaAthlete);
  asPayingAthlete = await loginAs(server.baseUrl, payingAthlete);
  asBetaCoach = await loginAs(server.baseUrl, betaCoach);
});

afterAll(async () => {
  await server?.close();
});

describe("a Free Agent's add-ons", () => {
  /* THE THREE SPORT COACHES ARE WITHHELD (WITHDRAWN_ADD_ONS, 2026-09-28) and these tests were
   * written before that. They asserted the contract that a beta account gets EVERY add-on, which
   * was right until the withdrawal and is now exactly what must not happen: the coaches work as
   * code and nobody has held them against a real swing, a real at-bat or a real pitch.
   *
   * Rewritten to pin the withdrawal instead of deleted, because the interesting half is not "they
   * are off" but WHICH doors the withdrawal closes -- beta, an active trial and a recorded
   * PURCHASE all open every other entitlement in this system, and it has to beat all three. */
  const offered = FREE_AGENT_ADD_ON_ORDER.filter((id) => !WITHDRAWN_ADD_ONS.includes(id));

  /* NOTHING IS OFFERED ON THE FREE AGENT SIDE TODAY, and that is the designed state rather than
   * a gap. The three sport coaches are withdrawn (above), and the Video Analysis add-on is gone
   * as of 2026-10-03 -- Scott: "there are 3 tiers, built on purpose, and anyone being coached
   * gets it already", so the video workbench rides with the camera entitlement instead of being
   * sold separately. That emptied `offered`, and this test used to assert the list was non-empty,
   * which is a rule nobody ever made: it was a guard against the loop below going vacuous, and it
   * failed the moment the last Free Agent add-on stopped being sold.
   *
   * So it states the emptiness explicitly instead. The loop below stays and is vacuous today --
   * harmlessly, because this test is what says why, so nothing is silently passing. The live
   * version of that contract ("beta opens what is offered, and does not claim it was bought") is
   * pinned on the coach side, where Coaches Corner really is sold. */
  it("offers no Free Agent add-on today, with the machinery intact behind it", () => {
    expect(offered).toEqual([]);
    // The ids still exist and are still withdrawn, which is the difference between an add-on
    // being unsellable and the add-on framework being gone. Same reasoning as
    // WITHDRAWN_FREE_AGENT_TIERS being kept while empty.
    expect(FREE_AGENT_ADD_ON_ORDER.length).toBeGreaterThan(0);
    expect(WITHDRAWN_ADD_ONS.length).toBe(FREE_AGENT_ADD_ON_ORDER.length);
  });

  it("gives a beta account the offered add-ons, without anybody having bought one", async () => {
    const res = await asBetaAthlete.get("/api/athlete/entitlements");
    expect(res.status).toBe(200);
    for (const id of offered) {
      expect(res.body.addOns[id]).toBe(true);
      // Access and ownership are separate answers on purpose: a surface that
      // cannot tell them apart either implies a purchase that never happened or
      // offers to sell something already held.
      expect(res.body.ownedAddOns[id]).toBe(false);
    }
  });

  it("closes a withdrawn add-on even for a beta account", async () => {
    // Beta unlocks everything Forge MEANS to sell. Something nobody has tested is not that, so
    // the withdrawal is applied after the beta short-circuit rather than before it.
    const res = await asBetaAthlete.get("/api/athlete/entitlements");
    for (const id of WITHDRAWN_ADD_ONS) expect(res.body.addOns[id]).toBe(false);
  });

  it("refuses the chat route too, not just the flag", async () => {
    // The gate, not the convenience endpoint. The page and the route disagreeing is the exact
    // failure the old client-side re-derivation produced -- here it would mean a withheld coach
    // hidden on screen and still reachable by anyone who typed the URL.
    const res = await asBetaAthlete.post("/api/athlete/coach/hitting/chat", {
      message: "how is my swing",
    });
    expect(res.status).toBe(402);
  });

  it("gives a non-beta account with no add-ons none of them", async () => {
    const res = await asPayingAthlete.get("/api/athlete/entitlements");
    expect(res.status).toBe(200);
    for (const id of FREE_AGENT_ADD_ON_ORDER) expect(res.body.addOns[id]).toBe(false);
    const chat = await asPayingAthlete.post("/api/athlete/coach/hitting/chat", { message: "hi" });
    expect(chat.status).toBe(402);
  });

  it("does not open a withdrawn add-on even for an account that OWNS it", async () => {
    // The sharpest case, and the one no test covered before. Ownership is what the Stripe and
    // Apple webhooks write, and it opens every other entitlement here -- so if the withdrawal
    // did not beat it, anybody who bought a sport coach before today would still be talking to
    // an untested one. Ownership is still REPORTED, because it is a fact about what they paid
    // for and the refund conversation needs it; only access is closed.
    await db
      .update(users)
      .set({ freeAgentAddOns: ["golf_swing"] })
      .where(eq(users.id, payingAthlete.id));
    const res = await asPayingAthlete.get("/api/athlete/entitlements");
    expect(res.body.ownedAddOns.golf_swing).toBe(true);
    expect(res.body.addOns.golf_swing).toBe(false);
  });
});

describe("Coaches Corner", () => {
  it("is unlocked for a beta coach", async () => {
    // It was not, and nothing could sell it either: hasCoachesCornerAccess read
    // subscriptions.tier === "pro" and a two-email allowlist, and asked
    // isBetaAccount nowhere, so every coach on Forge was locked out.
    const res = await asBetaCoach.get("/api/coach/entitlements");
    expect(res.status).toBe(200);
    expect(res.body.coachesCorner.unlocked).toBe(true);
    expect(res.body.coachesCorner.owned).toBe(false);
    expect(res.body.coachesCorner.compedForRoster).toBe(false);
  });

  it("quotes the add-on from the shared price list", async () => {
    const { COACHES_CORNER_MONTHLY_PRICE_CENTS } = await import("@shared/billing-tiers");
    const res = await asBetaCoach.get("/api/coach/entitlements");
    expect(res.body.coachesCorner.monthlyPriceCents).toBe(COACHES_CORNER_MONTHLY_PRICE_CENTS);
    expect(res.body.purchasableAddOns).toEqual([
      expect.objectContaining({ id: "coaches_corner", monthlyPriceCents: COACHES_CORNER_MONTHLY_PRICE_CENTS }),
    ]);
  });

  it("serves the catalog unlocked to a beta coach", async () => {
    const res = await asBetaCoach.get("/api/coach/academy/tracks");
    expect(res.status).toBe(200);
    for (const track of res.body) expect(track.unlocked).toBe(true);
  });
});

describe("nobody can be charged while Forge is in beta", () => {
  it("refuses a sport-coach checkout with the beta answer", async () => {
    const res = await asBetaAthlete.post("/api/billing/checkout/free-agent-add-on", {
      addOnId: "pitching",
    });
    expect(res.status).toBe(503);
    expect(res.body.message).toContain("beta");
  });

  it("refuses a coach add-on checkout with the same answer", async () => {
    const res = await asBetaCoach.post("/api/billing/checkout/coach-add-on", {
      addOnId: "coaches_corner",
    });
    expect(res.status).toBe(503);
    expect(res.body.message).toContain("beta");
  });

  it("answers the old unlock route with the same sentence rather than a dead end", async () => {
    const res = await asBetaCoach.post("/api/coach/academy/unlock", {});
    expect(res.status).toBe(402);
    expect(res.body.message).toContain("beta");
    // The old copy pointed at a "Pro coaching plan" -- a tier the roster-band
    // pricing model has no room for and nothing ever sold.
    expect(res.body.message).not.toContain("Pro");
  });

  it("rejects an add-on id it has never heard of before anything else happens", async () => {
    for (const [path, body] of [
      ["/api/billing/checkout/free-agent-add-on", { addOnId: "archery" }],
      ["/api/billing/checkout/free-agent-add-on", {}],
    ] as const) {
      const res = await asBetaAthlete.post(path, body);
      expect(res.status).toBe(400);
    }
    const coach = await asBetaCoach.post("/api/billing/checkout/coach-add-on", {
      // A real add-on id that simply is not sold here -- the distinction between
      // "is this an add-on" and "may this be bought here".
      addOnId: "custom_colors",
    });
    expect(coach.status).toBe(400);
  });
});
