import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { coachAthletes, coachStaff } from "@shared/schema";
import { db } from "./db";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/** THE REAL ROUTES, REFUSING THE THREE PURCHASES THEY COULD NOT HAVE HONOURED.
 *
 * The unit ratchet beside this file (a-checkout-only-takes-money-it-can-honour.test.ts) scans the
 * middleware list and explains each guard. This drives the routes, because what matters is the
 * status code an assistant coach or a coached athlete actually meets -- and because a middleware
 * named in a list could still be registered in an order that never runs it.
 *
 * Every case asserts 403 rather than a 503 or a 400, which is the distinction worth pinning: a
 * refusal because of WHO is asking has to come before anything about whether Stripe is
 * configured, or the guard is decorative on a correctly-configured server and nowhere else. These
 * run with no STRIPE_SECRET_KEY, so an ungated route would answer 503 "Billing isn't configured"
 * -- and 503 is what every one of these returned before 2026-10-11.
 */
let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(async () => {
  await resetDatabase();
});

describe("a coached athlete is not sold a Free Agent tier", () => {
  it("refuses the tier checkout with 403, before anything about Stripe", async () => {
    const coach = await makeLoginableUser({ role: "coach", isBetaAccount: true });
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: true });
    await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: athlete.id });
    const client = await loginAs(server.baseUrl, athlete);

    const res = await client.post("/api/billing/checkout/free-agent-tier", {
      tier: "ai_coach_video",
    });
    expect(res.status).toBe(403);
    // The same sentence the add-on route has always given, because it is the same rule.
    expect(JSON.stringify(res.body)).toMatch(/coach manages this for you/i);
  });

  it("lets an athlete with no coach through to the ordinary Stripe answer", async () => {
    // The control. A Free Agent is not refused by WHO they are -- they get as far as billing
    // configuration, which on this server is absent. Without this the test above would pass
    // just as well against a route that refused everybody.
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: true });
    const client = await loginAs(server.baseUrl, athlete);

    const res = await client.post("/api/billing/checkout/free-agent-tier", { tier: "basic" });
    expect(res.status).not.toBe(403);
  });
});

describe("an assistant coach does not buy the program's plan or add-ons", () => {
  async function staffCoachOf(primaryId: number) {
    const staff = await makeLoginableUser({ role: "coach", isBetaAccount: true });
    await db.insert(coachStaff).values({ primaryCoachId: primaryId, staffCoachId: staff.id });
    return { staff, client: await loginAs(server.baseUrl, staff) };
  }

  it("refuses the band checkout with 403 and says who to ask", async () => {
    const primary = await makeLoginableUser({ role: "coach", isBetaAccount: true });
    const { client } = await staffCoachOf(primary.id);

    const res = await client.post("/api/billing/checkout/coach", {});
    expect(res.status).toBe(403);
    // Not "Only the primary coach can change this" -- in front of a card, the useful fact is who
    // can.
    expect(JSON.stringify(res.body)).toMatch(/head coach/i);
  });

  it("refuses the coach add-on checkout with 403", async () => {
    const primary = await makeLoginableUser({ role: "coach", isBetaAccount: true });
    const { client } = await staffCoachOf(primary.id);

    const res = await client.post("/api/billing/checkout/coach-add-on", {
      addOnId: "coaches_corner",
    });
    expect(res.status).toBe(403);
  });

  it("lets the primary coach through to the ordinary Stripe answer", async () => {
    // The control, and the thing that would have broken if the guard had been written as
    // "nobody" rather than "not an assistant": a solo coach has no staff row at all, so
    // getEffectiveCoachIds returns their own id first and they pass.
    const primary = await makeLoginableUser({ role: "coach", isBetaAccount: true });
    const client = await loginAs(server.baseUrl, primary);

    const plan = await client.post("/api/billing/checkout/coach", {});
    expect(plan.status).not.toBe(403);
    const addOn = await client.post("/api/billing/checkout/coach-add-on", {
      addOnId: "coaches_corner",
    });
    expect(addOn.status).not.toBe(403);
  });

  it("still lets an assistant READ the plan, which is org-wide information", async () => {
    // The refusal is about spending money, not about knowing what the program is on. A guard
    // that took the numbers off an assistant's screen would be a different and worse change.
    const primary = await makeLoginableUser({ role: "coach", isBetaAccount: true });
    const { client } = await staffCoachOf(primary.id);

    const res = await client.get("/api/coach/plan");
    expect(res.status).toBe(200);
  });
});
