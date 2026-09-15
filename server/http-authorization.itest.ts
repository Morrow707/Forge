import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDatabase, db, makeExercise, makeAssignedProgram } from "./test-support/fixtures";
import { goals, assignmentCorrectives } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  startTestServer,
  makeLoginableUser,
  addToRoster,
  loginAs,
  TestClient,
  type TestServer,
} from "./test-support/http-app";

/**
 * Authorization, asked over HTTP.
 *
 * cross-tenant-scoping.test.ts reads routes.ts and checks that every
 * parameterised route resolves its ids against the caller; the storage
 * integration tests check that the queries behind them filter correctly.
 * Both are worth having. Neither can answer the question an attacker
 * actually asks, which is not "is this route written correctly" but "what
 * happens when I send this request".
 *
 * The gap between those is real and it is where this class of bug lives: a
 * guard mounted after the route it protects, a role check that reads client
 * state, a session cookie honoured for the wrong principal, a refusal that
 * leaks in its body what it just refused to return. Source-scanning cannot
 * see middleware ORDER at all, and a storage test never runs the middleware.
 *
 * ONE login per actor for the whole file, on purpose. loginLimiter allows 15
 * attempts per 15 minutes per IP and its counter lives in the module, not in
 * the app, so a fresh server does not reset it -- every request in this file
 * comes from 127.0.0.1 and shares one budget. Tests here reuse the sessions
 * built in beforeAll and are read-only or expected-to-fail, so the world
 * stays intact across them; a test that needs to spend login attempts
 * belongs in its own file, which gets its own process and its own counter.
 */
let server: TestServer;

let coachA: Awaited<ReturnType<typeof makeLoginableUser>>;
let coachB: Awaited<ReturnType<typeof makeLoginableUser>>;
let athleteA: Awaited<ReturnType<typeof makeLoginableUser>>;
let athleteB: Awaited<ReturnType<typeof makeLoginableUser>>;
let admin: Awaited<ReturnType<typeof makeLoginableUser>>;

let asCoachA: TestClient;
let asCoachB: TestClient;
let asAthleteA: TestClient;
let asAdmin: TestClient;
let anonymous: TestClient;

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();

  coachA = await makeLoginableUser({ role: "coach", name: "Coach A" });
  coachB = await makeLoginableUser({ role: "coach", name: "Coach B" });
  admin = await makeLoginableUser({ role: "admin", name: "Platform Admin" });

  athleteA = await makeLoginableUser({
    role: "athlete",
    name: "Athlete A",
    sport: "Football",
    age: 17,
    heightIn: 72,
    bodyWeightLbs: 210,
    researchDataConsent: true,
  });
  athleteB = await makeLoginableUser({
    role: "athlete",
    name: "Athlete B",
    sport: "Football",
    age: 17,
    researchDataConsent: true,
  });

  await addToRoster(coachA.id, athleteA.id);
  await addToRoster(coachB.id, athleteB.id);

  asCoachA = await loginAs(server.baseUrl, coachA);
  asCoachB = await loginAs(server.baseUrl, coachB);
  asAthleteA = await loginAs(server.baseUrl, athleteA);
  asAdmin = await loginAs(server.baseUrl, admin);
  anonymous = new TestClient(server.baseUrl);
});

afterAll(async () => {
  await server?.close();
});

/** Refused, and without saying anything about what was behind the door. */
function expectRefused(res: { status: number; body: any }, context: string) {
  expect([401, 403, 404], `${context} answered ${res.status}`).toContain(res.status);
  const serialized = JSON.stringify(res.body ?? "");
  for (const leak of ["Athlete A", "Athlete B", athleteA.email, athleteB.email]) {
    expect(serialized, `${context} leaked ${leak} in its refusal`).not.toContain(leak);
  }
}

describe("an anonymous caller reaches nothing", () => {
  // The floor. Every one of these is a route that returns somebody's data,
  // and a session is the only thing standing in front of any of them.
  const endpoints = [
    "/api/coach/roster",
    "/api/admin/aggregate-athlete-data",
    "/api/admin/athletes/query",
    "/api/guardian/athletes",
  ];

  for (const path of endpoints) {
    it(`refuses GET ${path}`, async () => {
      const res = await anonymous.get(path);
      expect([401, 403, 404]).toContain(res.status);
    });
  }

  it("refuses a roster read even with a real athlete id in the URL", async () => {
    expectRefused(await anonymous.get(`/api/coach/roster/${athleteA.id}`), "anonymous roster read");
  });
});

describe("a coach cannot reach another coach's athlete", () => {
  it("lets the owning coach read their own athlete", async () => {
    // The positive control. Without it, every assertion below passes just as
    // happily against a route that is broken for everybody.
    const res = await asCoachA.get(`/api/coach/roster/${athleteA.id}`);
    expect(res.status).toBe(200);
    expect(res.body?.name).toBe("Athlete A");
  });

  it("refuses the same read to a coach whose roster the athlete is not on", async () => {
    expectRefused(
      await asCoachB.get(`/api/coach/roster/${athleteA.id}`),
      "cross-tenant roster read",
    );
  });

  it("refuses every athlete-scoped sub-resource to the wrong coach", async () => {
    // One route being scoped says nothing about the next one: scoping here
    // is per route, three different ways, with no single middleware
    // enforcing it. So this asks a spread of them rather than one.
    for (const path of [
      `/api/coach/roster/${athleteA.id}/goals`,
      `/api/coach/roster/${athleteA.id}/goniometer`,
      `/api/coach/roster/${athleteA.id}/food-log`,
      `/api/coach/roster/${athleteA.id}/form-check-videos`,
      `/api/coach/roster/${athleteA.id}/acwr-history`,
      `/api/coach/cara/${athleteA.id}/history`,
    ]) {
      expectRefused(await asCoachB.get(path), `coach B reading ${path}`);
    }
  });

  it("returns no data from a route that scopes in SQL instead of refusing", async () => {
    // recent-correctives answers 200 with an empty list rather than 404,
    // because it filters on the caller's own coach ids inside the query and
    // never asks whether the athlete exists. That is a legitimate second
    // pattern, but a status code cannot tell the two apart -- an empty 200
    // and a leaking 200 look identical until there is something to leak. So
    // this one is asked with real data on the other side of it.
    const exercise = await makeExercise(coachA.id, { name: "Cross-tenant corrective" });
    const { assignment, day } = await makeAssignedProgram({
      coachId: coachA.id,
      athleteId: athleteA.id,
      exerciseIds: [exercise.id],
    });
    await db.insert(assignmentCorrectives).values({
      assignmentId: assignment.id,
      programDayId: day.id,
      exerciseId: exercise.id,
    });

    const owning = await asCoachA.get(`/api/coach/athletes/${athleteA.id}/recent-correctives`);
    expect(owning.status).toBe(200);
    expect(owning.body, "the owning coach should see the corrective").toHaveLength(1);

    const foreign = await asCoachB.get(`/api/coach/athletes/${athleteA.id}/recent-correctives`);
    expect(foreign.status).toBe(200);
    expect(foreign.body, "another coach saw this athlete's correctives").toEqual([]);
    expect(JSON.stringify(foreign.body)).not.toContain("Cross-tenant corrective");
  });

  it("refuses a WRITE against another coach's athlete, and writes nothing", async () => {
    // A refusal that still wrote is the worse bug of the two, and a status
    // code alone cannot tell you which happened.
    const before = await db.select().from(goals).where(eq(goals.athleteId, athleteA.id));

    const res = await asCoachB.post(`/api/coach/roster/${athleteA.id}/goals`, {
      type: "testing",
      testingMetric: "benchMaxLbs",
      targetValue: 315,
      targetUnit: "lbs",
    });
    expectRefused(res, "cross-tenant goal write");

    const after = await db.select().from(goals).where(eq(goals.athleteId, athleteA.id));
    expect(after.length, "a refused write still created a row").toBe(before.length);
  });

  it("refuses to delete another coach's athlete from a roster", async () => {
    expectRefused(
      await asCoachB.delete(`/api/coach/roster/${athleteA.id}`),
      "cross-tenant roster delete",
    );
    // The athlete is still on coach A's roster afterwards.
    const stillThere = await asCoachA.get(`/api/coach/roster/${athleteA.id}`);
    expect(stillThere.status).toBe(200);
  });
});

describe("role boundaries hold on the server, not in the client", () => {
  it("keeps an athlete out of the admin analytics surfaces", async () => {
    for (const path of ["/api/admin/aggregate-athlete-data", "/api/admin/athletes/query"]) {
      expectRefused(await asAthleteA.get(path), `athlete reading ${path}`);
    }
  });

  it("keeps a coach out of the admin analytics surfaces", async () => {
    // A coach is trusted with their own athletes by name. That is precisely
    // why they are not trusted with the platform-wide surfaces, which are
    // everyone else's athletes.
    for (const path of ["/api/admin/aggregate-athlete-data", "/api/admin/athletes/query"]) {
      expectRefused(await asCoachB.get(path), `coach reading ${path}`);
    }
  });

  it("keeps an athlete out of the coach surfaces", async () => {
    expectRefused(await asAthleteA.get("/api/coach/roster"), "athlete reading a coach roster");
    expectRefused(
      await asAthleteA.get(`/api/coach/roster/${athleteB.id}`),
      "athlete reading another athlete via a coach route",
    );
  });
});

describe("the admin analytics surface is de-identified over the wire", () => {
  it("returns subject codes and no way back to a person", async () => {
    // The same invariant the storage tests assert, asked of the actual HTTP
    // response. This is the one that matters: storage returning a clean row
    // is not the promise -- the promise is that nothing identifying reaches
    // the client, and only a response can show that.
    const res = await asAdmin.get("/api/admin/aggregate-athlete-data");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.rows)).toBe(true);
    expect(res.body.rows.length).toBeGreaterThan(0);

    const serialized = JSON.stringify(res.body);
    for (const identifying of [
      "Athlete A",
      "Athlete B",
      athleteA.email,
      athleteB.email,
      "1995-06-15",
    ]) {
      expect(serialized, `the response carried ${identifying}`).not.toContain(identifying);
    }
    for (const row of res.body.rows) {
      expect(row.subjectCode).toMatch(/^[0-9a-f]{16}$/);
      expect(row).not.toHaveProperty("id");
      expect(row).not.toHaveProperty("athleteId");
      expect(row).not.toHaveProperty("name");
      expect(row).not.toHaveProperty("email");
      expect(row).not.toHaveProperty("dateOfBirth");
    }
  });

  it("does not hand back a code that can be turned into a person", async () => {
    // The specific failure this pseudonymization replaced: a bare id, plus
    // /api/admin/users/:id, was a two-request re-identification of every row.
    // A subjectCode must not work there.
    const res = await asAdmin.get("/api/admin/aggregate-athlete-data");
    const [code] = res.body.rows.map((r: any) => r.subjectCode);
    expect(code).toBeTruthy();

    const lookup = await asAdmin.get(`/api/admin/users/${code}`);
    expect(
      [400, 404].includes(lookup.status),
      `a subject code resolved through /api/admin/users/:id with ${lookup.status}`,
    ).toBe(true);
  });
});

describe("an id in the URL cannot be used to probe the server", () => {
  it("answers a malformed athlete id with a clean refusal, never a stack trace", async () => {
    // The numeric guard runs before the routes so a junk id never reaches a
    // query. What matters as much as the status is that a 500 is never the
    // answer: an error page from a query that received "1 OR 1=1" tells an
    // attacker the id reached SQL.
    for (const id of ["abc", "-1", "0", "1.5", "1e9999", "1%20OR%201=1", "null", "%00"]) {
      const res = await asCoachA.get(`/api/coach/roster/${id}`);
      expect(
        res.status,
        `id "${id}" answered ${res.status} (${JSON.stringify(res.body).slice(0, 120)})`,
      ).toBeLessThan(500);
      expect([400, 401, 403, 404]).toContain(res.status);
    }
  });

  it("does not distinguish a real athlete on someone else's roster from one that does not exist", async () => {
    // If the two answer differently, the difference is an oracle: an admin
    // -- or a coach -- can walk the id space and learn exactly which ids are
    // real athletes without ever being allowed to read one.
    const realButForeign = await asCoachB.get(`/api/coach/roster/${athleteA.id}`);
    const doesNotExist = await asCoachB.get(`/api/coach/roster/999999`);
    expect(realButForeign.status).toBe(doesNotExist.status);
  });
});

describe("a cross-site request cannot ride a logged-in session", () => {
  it("refuses a state-changing request carrying a foreign Origin", async () => {
    // The session cookie is sent on a cross-site POST by design; the origin
    // check is the thing that stops it counting. Uses coach A's real,
    // working session so the only variable is the Origin header.
    const res = await asCoachA.post(
      `/api/coach/roster/${athleteA.id}/goals`,
      { type: "testing", testingMetric: "benchMaxLbs", targetValue: 315, targetUnit: "lbs" },
      { origin: "https://evil.example" },
    );
    expect(res.status).toBe(403);

    const planted = await db.select().from(goals).where(eq(goals.athleteId, athleteA.id));
    expect(planted.length, "a cross-site POST created a row").toBe(0);
  });

  it("still allows the same request from the app's own origin", async () => {
    // Otherwise the test above passes against a server that refuses
    // everything, which proves nothing.
    const res = await asCoachA.post(
      `/api/coach/roster/${athleteA.id}/goals`,
      { type: "testing", testingMetric: "benchMaxLbs", targetValue: 315, targetUnit: "lbs" },
      { origin: server.baseUrl },
    );
    expect(res.status).toBeLessThan(400);

    // Clean up so the write does not follow the rest of the file around.
    await db.delete(goals).where(eq(goals.athleteId, athleteA.id));
  });
});

describe("athlete footage is not served on the strength of a session", () => {
  it("refuses a gated upload path with no signature, logged in or not", async () => {
    // The signed-URL scheme exists because a <video src> carries no session.
    // The corollary is the part worth testing: having a session must not be
    // an alternative way in, or the signature is decorative.
    for (const client of [anonymous, asCoachA, asAdmin]) {
      const res = await client.get("/uploads/form-videos/whatever.mp4");
      expect(res.status).toBe(403);
    }
  });

  it("refuses a forged signature", async () => {
    const res = await asCoachA.get(
      `/uploads/form-videos/whatever.mp4?exp=${Date.now() + 3_600_000}&sig=${"a".repeat(64)}`,
    );
    expect(res.status).toBe(403);
  });
});
