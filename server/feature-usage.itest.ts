import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { featureUsageDaily, featureUsagePaths, featureUsageSeen } from "@shared/schema";
import { USAGE_FLOOR } from "@shared/feature-usage";
import { db } from "./db";
import { flushFeatureUsage } from "./feature-usage";
import { makeExercise, resetDatabase } from "./test-support/fixtures";
import { TestClient, addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/* WHAT PEOPLE USE, ON REAL POSTGRES (2026-11-12). Every page, action and named interaction is
 * counted as its pattern -- never an id, never a person -- by kind of account and platform, with
 * where people came from and what was saved from which page. The report is admin-only, leaves
 * admins and the demo accounts out by default, and hides a small group's numbers behind the floor. */

const OK = 200;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const WAIT_MS = 5_000;
const POLL_MS = 25;
const OLD_DAY = "2026-01-01";
const ZONE_LOW_MPS = 0.5;
const ZONE_HIGH_MPS = 0.75;
const ZONE = { lowMps: ZONE_LOW_MPS, highMps: ZONE_HIGH_MPS };

type Daily = typeof featureUsageDaily.$inferSelect;
/** Counting happens after the response has gone and is written once a minute, so a test reading
 * it flushes and waits, bounded, and throws with what it saw rather than passing on an absence. */
async function until(what: string, test: (rows: Daily[]) => boolean): Promise<Daily[]> {
  const deadline = Date.now() + WAIT_MS;
  const read = async () => {
    await flushFeatureUsage();
    return db.select().from(featureUsageDaily);
  };
  const poll = async (): Promise<Daily[]> => {
    const rows = await read();
    if (test(rows) || Date.now() >= deadline) return rows;
    await new Promise((r) => setTimeout(r, POLL_MS));
    return poll();
  };
  const rows = await poll();
  if (!test(rows)) throw new Error(`never recorded: ${what}. Saw ${rows.map((r) => `${r.kind} ${r.feature} [${r.userGroup}]`).join("; ")}`);
  return rows;
}
const has = (kind: string, feature: string, group?: string) => (rows: Daily[]) => rows.some((r) => r.kind === kind && r.feature === feature && (!group || r.userGroup === group));

let server: TestServer;
let coachClient: TestClient;
let adminClient: TestClient;
let demoClient: TestClient;
let athleteId: number;
let exerciseId: number;

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
  const coach = await makeLoginableUser({ role: "coach" });
  const athlete = await makeLoginableUser({ role: "athlete" });
  const admin = await makeLoginableUser({ role: "admin" });
  const demo = await makeLoginableUser({ role: "coach", email: "coach@forge.app" });
  await addToRoster(coach.id, athlete.id);
  athleteId = athlete.id;
  exerciseId = (await makeExercise(coach.id, { name: "Usage Squat" })).id;
  [coachClient, adminClient, demoClient] = await Promise.all([coach, admin, demo].map((u) => loginAs(server.baseUrl, u)));
});

afterAll(async () => {
  await server.close();
});

describe("what is counted", () => {
  it("an action is counted as its route template, never with the id that was in the address", async () => {
    expect((await coachClient.get(`/api/coach/roster/${athleteId}`)).status).toBe(OK);
    const rows = await until("the roster athlete read", has("action", "GET /api/coach/roster/:athleteId", "Coaches"));
    rows.forEach((r) => {
      // No stored feature may hold a numeric path segment: "/coach/roster/:athleteId" yes, "/coach/roster/17" no.
      // https://regex101.com/?regex=%2F%5Cd%2B(%2F%7C%24%7C%5Cs)&testString=GET%20%2Fapi%2Fcoach%2Froster%2F17
      expect(r.feature, r.feature).not.toMatch(/\/\d+(\/|$|\s)/);
    });
  });

  it("a page is counted as its pattern, with the page before it", async () => {
    const res = await coachClient.post("/api/usage/page", { path: `/coach/roster/${athleteId}`, from: "/coach" });
    expect(res.status).toBe(NO_CONTENT);
    await until("the roster page", has("page", "/coach/roster/:athleteId", "Coaches"));
    const paths = await db.select().from(featureUsagePaths);
    expect(paths).toContainEqual(expect.objectContaining({ kind: "came-from", page: "/coach/roster/:athleteId", other: "/coach" }));
  });

  it("a save is counted against the page it was made on, and the iPhone app is told apart from the website", async () => {
    const res = await coachClient.request("PUT", `/api/me/velocity-zones/${exerciseId}`, {
      body: ZONE,
      headers: { "x-forge-page": `/coach/roster/${athleteId}`, "x-forge-platform": "ios" },
    });
    expect(res.status).toBe(OK);
    const rows = await until("the zone save", has("action", "PUT /api/me/velocity-zones/:exerciseId"));
    expect(rows.find((r) => r.feature === "PUT /api/me/velocity-zones/:exerciseId")?.platform).toBe("iPhone app");
    const paths = await db.select().from(featureUsagePaths);
    expect(paths).toContainEqual(expect.objectContaining({ kind: "done-on", page: "/coach/roster/:athleteId", other: "PUT /api/me/velocity-zones/:exerciseId" }));
  });

  it("a refusal is counted as refused, so a feature people cannot use shows up", async () => {
    expect((await coachClient.get("/api/admin/feature-usage")).status).toBe(FORBIDDEN);
    const rows = await until("the refused report read", has("action", "GET /api/admin/feature-usage", "Coaches"));
    expect(rows.find((r) => r.feature === "GET /api/admin/feature-usage" && r.userGroup === "Coaches")?.refused).toBeGreaterThan(0);
  });

  it("a named interaction is counted, and a name not on the list is refused", async () => {
    expect((await coachClient.post("/api/usage/interaction", { name: "Hardy: opened" })).status).toBe(NO_CONTENT);
    expect((await coachClient.post("/api/usage/interaction", { name: "Jordan's private page" })).status).toBe(BAD_REQUEST);
    await until("Hardy opened", has("interaction", "Hardy: opened"));
  });

  it("signing in is counted, which needs the counter in front of the sign-in routes", async () => {
    // loginAs in beforeAll signed three accounts in; the sign-in route is registered in setupAuth,
    // so a counter mounted after it would never see one.
    const rows = await until("a sign-in", has("action", "POST /api/auth/login"));
    expect(rows.find((r) => r.feature === "POST /api/auth/login")?.uses).toBeGreaterThan(0);
  });

  it("the demo accounts are never counted", async () => {
    await demoClient.get("/api/hardy/access");
    await coachClient.get("/api/coach/roster");
    const rows = await until("a real coach's roster read", has("action", "GET /api/coach/roster"));
    expect(rows.some((r) => r.feature === "GET /api/hardy/access")).toBe(false);
  });

  it("stores nobody: person keys are daily hashes, and yesterday's are deleted", async () => {
    await db.insert(featureUsageSeen).values({ day: OLD_DAY, kind: "page", feature: "/x", userGroup: "Coaches", personKey: "old" });
    await flushFeatureUsage();
    const seen = await db.select().from(featureUsageSeen);
    expect(seen.some((s) => s.day === OLD_DAY)).toBe(false);
    seen.forEach((s) => expect(s.personKey).not.toBe(String(athleteId)));
  });
});

describe("the report", () => {
  it("is admin-only", async () => {
    expect((await coachClient.get("/api/admin/feature-usage")).status).toBe(FORBIDDEN);
  });

  it("lists every page with its count, the zeros included, and where people came from", async () => {
    const res = await adminClient.get("/api/admin/feature-usage?days=7");
    expect(res.status).toBe(OK);
    const roster = res.body.entries.find((e: { feature: string }) => e.feature === "/coach/roster/:athleteId");
    expect(roster).toMatchObject({ kind: "page", uses: 1, label: "Coach › Roster › (one athlete)" });
    expect(roster.cameFrom[0]).toMatchObject({ page: "/coach" });
    expect(res.body.entries.some((e: { kind: string; uses: number }) => e.kind === "page" && e.uses === 0)).toBe(true);
    expect(res.body.groups).not.toContain("Admins");
  });

  it("looking at one kind of account, hides a number with fewer than the floor behind it", async () => {
    const res = await adminClient.get("/api/admin/feature-usage?days=7&groups=Coaches");
    const roster = res.body.entries.find((e: { feature: string }) => e.feature === "/coach/roster/:athleteId");
    expect(res.body.floor).toBe(USAGE_FLOOR);
    expect(roster.uses).toBeNull();
  });
});
