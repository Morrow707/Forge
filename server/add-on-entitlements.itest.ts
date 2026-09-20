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
import { FREE_AGENT_ADD_ON_ORDER } from "@shared/free-agent-tiers";

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

describe("a Free Agent's sport coaches", () => {
  it("gives a beta account all three, without anybody having bought one", async () => {
    const res = await asBetaAthlete.get("/api/athlete/entitlements");
    expect(res.status).toBe(200);
    for (const id of FREE_AGENT_ADD_ON_ORDER) {
      expect(res.body.addOns[id]).toBe(true);
      // Access and ownership are separate answers on purpose: a surface that
      // cannot tell them apart either implies a purchase that never happened or
      // offers to sell something already held.
      expect(res.body.ownedAddOns[id]).toBe(false);
    }
  });

  it("lets a beta account actually open one, not just see it unlocked", async () => {
    // The gate, not the convenience endpoint. A 402 here would mean the page and
    // the route disagree, which is the exact failure the old client-side
    // re-derivation produced.
    const res = await asBetaAthlete.post("/api/athlete/coach/hitting/chat", {
      message: "how is my swing",
    });
    expect(res.status).not.toBe(402);
  });

  it("gives a non-beta account with no add-ons none of them", async () => {
    const res = await asPayingAthlete.get("/api/athlete/entitlements");
    expect(res.status).toBe(200);
    for (const id of FREE_AGENT_ADD_ON_ORDER) expect(res.body.addOns[id]).toBe(false);
    const chat = await asPayingAthlete.post("/api/athlete/coach/hitting/chat", { message: "hi" });
    expect(chat.status).toBe(402);
  });

  it("gives a non-beta account exactly what it owns, once ownership is recorded", async () => {
    // What the webhook branch writes, asserted through the read path that decides
    // access -- so a purchase recorded in the column really does open the gate.
    await db
      .update(users)
      .set({ freeAgentAddOns: ["golf_swing"] })
      .where(eq(users.id, payingAthlete.id));
    const res = await asPayingAthlete.get("/api/athlete/entitlements");
    expect(res.body.addOns.golf_swing).toBe(true);
    expect(res.body.ownedAddOns.golf_swing).toBe(true);
    expect(res.body.addOns.pitching).toBe(false);
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
