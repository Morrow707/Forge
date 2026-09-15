import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";
import { storage } from "./storage";

// THE MINOR GATE, ASKED OVER HTTP.
//
// Every other test of this rule calls storage directly, and storage is not where the rule lives.
// It lives in a middleware mounted ahead of ~300 routes in server/routes.ts, and the things that
// can go wrong there are invisible from storage: mounted after the route it protects, mounted
// behind a prefix that skips it, a refusal that carries the wrong status, or an allow-list entry
// that quietly opens more than it meant to.
//
// The rule being asserted: every athlete under 18 needs a linked guardian account before they can
// use Forge, regardless of how they got here -- free agent or on a roster -- and an athlete whose
// age is unknown is held too, because nobody can say whether the rule applies to them.
const isoYearsAgo = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
};

describe("the minor gate over HTTP", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(resetDatabase);

  it("refuses a real route to a minor with no guardian", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", dateOfBirth: isoYearsAgo(15) });
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.get("/api/workouts/today");
    expect(res.status).toBe(403);
    expect(res.body?.code).toBe("guardian_link_required");
  });

  // The hole this closes. An athlete with no birthdate used to pass the gate entirely, so "every
  // minor has a guardian" had an exception nobody could see from the outside.
  it("refuses a real route to an athlete whose age is unknown", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", dateOfBirth: null });
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.get("/api/workouts/today");
    expect(res.status).toBe(403);
    expect(res.body?.code).toBe("date_of_birth_required");
  });

  // Failing closed is only acceptable because the way out stays open. If this route were not on
  // the allow-list the previous test would describe a trap rather than a gate.
  it("still lets that athlete supply the birthdate that clears the hold", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", dateOfBirth: null });
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.post("/api/account/backfill-date-of-birth", {
      dateOfBirth: isoYearsAgo(22),
    });
    expect(res.status).toBe(200);
    // And the gate re-evaluates on the next request rather than holding a stale answer.
    expect((await client.get("/api/workouts/today")).status).not.toBe(403);
  });

  it("holds a minor who supplies a birthdate, under the guardian reason", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", dateOfBirth: null });
    const client = await loginAs(server.baseUrl, athlete);
    await client.post("/api/account/backfill-date-of-birth", { dateOfBirth: isoYearsAgo(14) });
    const res = await client.get("/api/workouts/today");
    expect(res.status).toBe(403);
    expect(res.body?.code).toBe("guardian_link_required");
  });

  it("lets an adult athlete through", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", dateOfBirth: isoYearsAgo(30) });
    const client = await loginAs(server.baseUrl, athlete);
    expect((await client.get("/api/workouts/today")).status).not.toBe(403);
  });

  // A held athlete can always leave, and can always chase the parent. Both are on the allow-list
  // on purpose, and an allow-list is only correct if someone checks it still allows what it says.
  it("never traps a held athlete in an account they cannot act on", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", dateOfBirth: isoYearsAgo(15) });
    const client = await loginAs(server.baseUrl, athlete);
    expect((await client.get("/api/auth/me")).status).toBe(200);
    expect((await client.get("/api/account/guardian-link")).status).not.toBe(403);
  });

  // The gate reads role and age. It has never read membership, and this says so out loud so that
  // a future change scoping it to rostered athletes fails here.
  it("holds a minor free agent exactly as it holds a rostered one", async () => {
    const freeAgent = await makeLoginableUser({ role: "athlete", dateOfBirth: isoYearsAgo(12) });
    expect(await storage.athleteGateStatus(freeAgent.id)).toBe("needs_guardian");
    const client = await loginAs(server.baseUrl, freeAgent);
    const res = await client.get("/api/workouts/today");
    expect(res.status).toBe(403);
    expect(res.body?.code).toBe("guardian_link_required");
  });
});
