import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { coachStaff, users, MAX_EXPECTED_ATHLETES } from "@shared/schema";
import { bandForAthleteCount, ORG_PER_ATHLETE_CENTS } from "@shared/billing-tiers";
import { storage } from "./storage";
import { resetDatabase } from "./test-support/fixtures";
import {
  addToRoster,
  loginAs,
  makeLoginableUser,
  startTestServer,
  TestClient,
  type TestServer,
} from "./test-support/http-app";

/** A SCHOOL PICKS ITS OWN PLAN, AT SIGNUP, WITH NO ADMIN IN THE LOOP.
 *
 * billingTier used to be settable only by an admin, which meant a school that signed up on a
 * Sunday had no plan, no Institutional Service Agreement asked of it, and -- if it subscribed --
 * a quote for the band its EMPTY roster fell into, which is the cheapest one there is. The
 * number the school types at signup is what fixes all three: it picks the band, it is kept as
 * users.plannedAthleteCount, and billing charges the larger of it and the real roster.
 */
function coachSignupBody(over: Record<string, unknown> = {}) {
  return {
    email: `coach-${Math.random().toString(36).slice(2)}@example.test`,
    password: "correct-horse-battery-staple-9",
    name: "Head Coach",
    role: "coach",
    dateOfBirth: "1985-04-02",
    agreedToTerms: true,
    expectedAthletes: 34,
    ...over,
  };
}

function athleteSignupBody(over: Record<string, unknown> = {}) {
  return {
    email: `athlete-${Math.random().toString(36).slice(2)}@example.test`,
    password: "correct-horse-battery-staple-9",
    name: "Adult Athlete",
    role: "athlete",
    dateOfBirth: "1995-06-15",
    sport: "Football",
    position: "WR",
    heightIn: 72,
    bodyWeightLbs: 190,
    agreedToTerms: true,
    ...over,
  };
}

describe("the plan a school picks at signup", () => {
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

  it("refuses a coach signup that never says how many athletes it expects", async () => {
    const body = coachSignupBody();
    delete (body as any).expectedAthletes;
    const res = await new TestClient(server.baseUrl).post("/api/auth/signup", body);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Tell us roughly how many athletes you'll have");
    expect(await db.query.users.findFirst({ where: eq(users.email, body.email) })).toBeUndefined();
  });

  it("keeps the stated number and BUYS NOTHING WITH IT", async () => {
    // THIS USED TO ASSERT billingTier === "21-40", AND THAT WAS THE BUG (fixed 2026-10-11).
    // Signup wrote the band straight from this form field -- before a card, before a payment --
    // and getEntitlements derives four paid entitlements from it (includesFullPersonalization is
    // `lo > ORG_BLOCK_SIZE`, which is 20). So typing 21 into "roughly how many athletes will you
    // have" handed out Full Personalization at $24.99 a month and multi-team, permanently, free.
    //
    // The number itself is right and still kept: plannedAthleteCount is what the school SAID,
    // the roster is what they HAVE, and billing charges the larger of the two
    // (getBilledAthleteCountForCoach). What changed is that one column had been answering two
    // different questions -- what we would bill you, and what you have paid for. billingTier is
    // now only ever the second.
    const body = coachSignupBody({ expectedAthletes: 34 });
    const res = await new TestClient(server.baseUrl).post("/api/auth/signup", body);
    expect(res.status).toBe(201);
    const row = await db.query.users.findFirst({ where: eq(users.email, body.email) });
    expect(row!.plannedAthleteCount).toBe(34);
    expect(row!.billingTier).toBeNull();
    // The tier is a price. Through the beta a signup was exempt from enforcing it (isBetaAccount
    // defaulted true); the beta ended 2026-10-11 and a new account is billed from its first day.
    // The admin billing panel's Beta box is the only thing that comps one now.
    expect(row!.isBetaAccount).toBe(false);
  });

  it("still quotes the band that number lands in, which is all it was ever for", async () => {
    // The other half, and the reason dropping the write costs a school nothing: the quote is
    // DERIVED wherever it is shown (coachPlanPayload reads bandForAthleteCount(billedCount)), so
    // a coach who typed 34 is still quoted the 21-40 band on their own billing page. Without
    // this the test above would pass just as well against a change that lost the number.
    const body = coachSignupBody({ expectedAthletes: 34 });
    const client = new TestClient(server.baseUrl);
    expect((await client.post("/api/auth/signup", body)).status).toBe(201);

    const plan = await client.get("/api/coach/plan");
    expect(plan.status).toBe(200);
    expect(plan.body.billedCount).toBe(34);
    expect(plan.body.band.id).toBe(bandForAthleteCount(34).id);
    // And says, separately, that nothing has been paid for -- which is every coach who only
    // typed a number.
    expect(plan.body.paidBand).toBeNull();
  });

  it("is what makes the Institutional Service Agreement get asked for at all", async () => {
    // getInstitutionalAgreementStatus used to key off billingTier ALONE, so before the plan at
    // signup existed a school was never asked for the agreement until an admin happened to put
    // them on a plan. It reads `!plannedAthleteCount && !billingTier` since 2026-10-11, because
    // signup stopped writing a band and this would otherwise have silently stopped asking every
    // new school for a signed agreement -- a legal surface, failing quietly. This case is what
    // proves it still asks; see a-typed-number-buys-nothing.test.ts for the condition itself.
    const body = coachSignupBody();
    const client = new TestClient(server.baseUrl);
    expect((await client.post("/api/auth/signup", body)).status).toBe(201);
    const status = await client.get("/api/coach/institutional-agreement");
    expect(status.status).toBe(200);
    expect(status.body.required).toBe(true);
    expect(status.body.onFile).toBe(false);
  });

  it("lets an assistant join an existing program's staff at signup with no headcount", async () => {
    // The plan is the head coach's. An assistant carrying a staff invite code is not asked
    // for a number, gets no tier of their own, and lands on the staff -- so the primary's
    // plan, roster and agreement all resolve for them the way they do for any staff coach.
    const head = coachSignupBody({ expectedAthletes: 60 });
    expect((await new TestClient(server.baseUrl).post("/api/auth/signup", head)).status).toBe(201);
    const headRow = await db.query.users.findFirst({ where: eq(users.email, head.email) });
    const code = await storage.getOrCreateStaffInviteCode(headRow!.id);

    const assistant = coachSignupBody({ staffInviteCode: code });
    delete (assistant as any).expectedAthletes;
    const client = new TestClient(server.baseUrl);
    const res = await client.post("/api/auth/signup", assistant);
    expect(res.status).toBe(201);
    const row = await db.query.users.findFirst({ where: eq(users.email, assistant.email) });
    expect(row!.plannedAthleteCount).toBeNull();
    expect(row!.billingTier).toBeNull();
    const link = await db.query.coachStaff.findFirst({ where: eq(coachStaff.staffCoachId, row!.id) });
    expect(link?.primaryCoachId).toBe(headRow!.id);
    // And what they see is the head coach's plan, not an empty one of their own.
    const plan = await client.get("/api/coach/plan");
    expect(plan.status).toBe(200);
    expect(plan.body.plannedAthleteCount).toBe(60);
  });

  it("refuses a bad staff invite code before creating the account", async () => {
    const assistant = coachSignupBody({ staffInviteCode: "NOPE-000" });
    delete (assistant as any).expectedAthletes;
    const res = await new TestClient(server.baseUrl).post("/api/auth/signup", assistant);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/staff invite code/);
    expect(await db.query.users.findFirst({ where: eq(users.email, assistant.email) })).toBeUndefined();
  });

  it("ignores the field on an athlete signup", async () => {
    const body = athleteSignupBody({ expectedAthletes: 500 });
    const res = await new TestClient(server.baseUrl).post("/api/auth/signup", body);
    expect(res.status).toBe(201);
    const row = await db.query.users.findFirst({ where: eq(users.email, body.email) });
    expect(row!.plannedAthleteCount).toBeNull();
    expect(row!.billingTier).toBeNull();
  });

  it("reports the plan, the roster and what is actually billed", async () => {
    const coach = await makeLoginableUser({
      role: "coach",
      plannedAthleteCount: 34,
      billingTier: "21-40",
    });
    const athlete = await makeLoginableUser({ role: "athlete" });
    await addToRoster(coach.id, athlete.id);
    const client = await loginAs(server.baseUrl, coach);

    const res = await client.get("/api/coach/plan");
    expect(res.status).toBe(200);
    expect(res.body.plannedAthleteCount).toBe(34);
    expect(res.body.rosterCount).toBe(1);
    // The stated number wins while the roster is still smaller than it.
    expect(res.body.billedCount).toBe(34);
    expect(res.body.band).toEqual({
      id: "21-40",
      label: bandForAthleteCount(34).label,
      monthlyPriceCents: bandForAthleteCount(34).monthlyPriceCents,
      athleteCapIncluded: 40,
      athleteFloor: 21,
    });
    // False in beta: the cap is enforcement and enforcement is off.
    // atCap is gone from this payload: a roster is never capped (Scott, 2026-10-11, "coaches
    // should never have a roster cap as each athlete add on is $4 no matter what"), so there is
    // no wall for it to report and the band is purely what the program is billed.
    expect(res.body).not.toHaveProperty("atCap");
    expect(res.body.perAthleteCents).toBe(ORG_PER_ATHLETE_CENTS);
  });

  it("bills the roster once it overtakes what the school said", async () => {
    const coach = await makeLoginableUser({ role: "coach", plannedAthleteCount: 2, billingTier: "0-5" });
    for (let i = 0; i < 7; i++) {
      const athlete = await makeLoginableUser({ role: "athlete" });
      await addToRoster(coach.id, athlete.id);
    }
    expect(await storage.getBilledAthleteCountForCoach(coach.id)).toBe(7);
  });

  it("re-quotes when the primary coach restates the number, and buys nothing with it either", async () => {
    // THE SAME BUG, REACHABLE AT ANY TIME. This asserted that restating the number re-wrote
    // billingTier -- so a coach already on the platform could raise their typed headcount past
    // twenty and be granted Full Personalization and multi-team, from a route guarded by nothing
    // but their own primary-coach status. The quote moves; the purchase does not.
    const coach = await makeLoginableUser({ role: "coach", plannedAthleteCount: 4, billingTier: "0-5" });
    const client = await loginAs(server.baseUrl, coach);
    const res = await client.put("/api/coach/plan", { expectedAthletes: 120 });
    expect(res.status).toBe(200);
    expect(res.body.plannedAthleteCount).toBe(120);
    // The QUOTE follows the number, which is the whole point of the field.
    expect(res.body.band.id).toBe(bandForAthleteCount(120).id);
    // What they actually bought is untouched, and reported as its own fact so the billing page
    // can show both rather than conflating them.
    expect(res.body.paidBand?.id).toBe("0-5");
    const row = await db.query.users.findFirst({ where: eq(users.id, coach.id) });
    expect(row!.billingTier).toBe("0-5");
    expect(row!.plannedAthleteCount).toBe(120);
  });

  it("refuses a number outside the bounds the signup form uses", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const client = await loginAs(server.baseUrl, coach);
    expect((await client.put("/api/coach/plan", { expectedAthletes: 0 })).status).toBe(400);
    expect((await client.put("/api/coach/plan", { expectedAthletes: MAX_EXPECTED_ATHLETES + 1 })).status).toBe(400);
  });

  it("will not let a staff coach change what the org pays", async () => {
    const primary = await makeLoginableUser({ role: "coach", plannedAthleteCount: 30, billingTier: "21-40" });
    const staff = await makeLoginableUser({ role: "coach" });
    await db.insert(coachStaff).values({ primaryCoachId: primary.id, staffCoachId: staff.id });
    const client = await loginAs(server.baseUrl, staff);

    // Reading is fine -- the plan is org-wide information, and it resolves off the primary's row.
    const read = await client.get("/api/coach/plan");
    expect(read.status).toBe(200);
    expect(read.body.plannedAthleteCount).toBe(30);

    const write = await client.put("/api/coach/plan", { expectedAthletes: 999 });
    expect(write.status).toBe(403);
    const row = await db.query.users.findFirst({ where: eq(users.id, primary.id) });
    expect(row!.plannedAthleteCount).toBe(30);
  });

});
