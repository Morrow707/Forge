import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDatabase, db } from "./test-support/fixtures";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { startTestServer, makeLoginableUser, loginAs, type TestClient, type TestServer } from "./test-support/http-app";
import { ALL_CLASSES_ADD_ON_ID } from "@shared/free-agent-tiers";

/**
 * THE TWO DEMO ACCOUNTS MEET THE WALL. Scott, 2026-10-05: "lock the classes and the coaches
 * corner for both free agent and the coach". Beta and enforcement-off comp every add-on, and
 * these are the accounts whose job is to show the purchase in sandbox and to App Review. So on
 * exactly these two, All Classes and Coaches Corner answer from the purchase record alone,
 * whatever the switches say -- and a recorded purchase opens them like anybody else's.
 */
let server: TestServer;
let demoFreeAgent: Awaited<ReturnType<typeof makeLoginableUser>>;
let demoCoach: Awaited<ReturnType<typeof makeLoginableUser>>;
let otherBetaAthlete: Awaited<ReturnType<typeof makeLoginableUser>>;
let asFreeAgent: TestClient;
let asCoach: TestClient;
let asOther: TestClient;

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
  // Beta ON for all three: the point is that beta does not open these two.
  demoFreeAgent = await makeLoginableUser({ role: "athlete", email: "freeagent@forge.app", name: "Morgan Freeagent" });
  demoCoach = await makeLoginableUser({ role: "coach", email: "coach@forge.app", name: "Coach Riley" });
  otherBetaAthlete = await makeLoginableUser({ role: "athlete", name: "Any Beta Free Agent" });
  asFreeAgent = await loginAs(server.baseUrl, demoFreeAgent);
  asCoach = await loginAs(server.baseUrl, demoCoach);
  asOther = await loginAs(server.baseUrl, otherBetaAthlete);
});

afterAll(async () => {
  await server?.close();
});

describe("the demo Free Agent", () => {
  it("is refused All Classes while any other beta Free Agent is comped", async () => {
    const demo = await asFreeAgent.get("/api/athlete/entitlements");
    expect(demo.status).toBe(200);
    expect(demo.body.addOns[ALL_CLASSES_ADD_ON_ID]).toBe(false);
    expect(demo.body.ownedAddOns[ALL_CLASSES_ADD_ON_ID]).toBe(false);

    const other = await asOther.get("/api/athlete/entitlements");
    expect(other.body.addOns[ALL_CLASSES_ADD_ON_ID]).toBe(true);
  });

  it("opens All Classes by a recorded purchase and nothing else", async () => {
    await db.update(users).set({ freeAgentAddOns: [ALL_CLASSES_ADD_ON_ID] }).where(eq(users.id, demoFreeAgent.id));
    const res = await asFreeAgent.get("/api/athlete/entitlements");
    expect(res.body.addOns[ALL_CLASSES_ADD_ON_ID]).toBe(true);
    expect(res.body.ownedAddOns[ALL_CLASSES_ADD_ON_ID]).toBe(true);
    await db.update(users).set({ freeAgentAddOns: [] }).where(eq(users.id, demoFreeAgent.id));
  });
});

describe("the demo coach", () => {
  it("is refused Coaches Corner on beta, and the routes refuse too", async () => {
    const res = await asCoach.get("/api/coach/entitlements");
    expect(res.status).toBe(200);
    expect(res.body.coachesCorner.unlocked).toBe(false);
    expect(res.body.coachesCorner.owned).toBe(false);
    // The track list stays open as the catalog behind the upsell; a track's content is gated.
    const certificate = await asCoach.get("/api/coach/academy/paths/1/certificate");
    expect(certificate.status).toBe(402);
  });

  it("opens Coaches Corner by a recorded purchase", async () => {
    await db.update(users).set({ billingAddOns: ["coaches_corner"] }).where(eq(users.id, demoCoach.id));
    const res = await asCoach.get("/api/coach/entitlements");
    expect(res.body.coachesCorner.unlocked).toBe(true);
    expect(res.body.coachesCorner.owned).toBe(true);
    const certificate = await asCoach.get("/api/coach/academy/paths/1/certificate");
    expect(certificate.status).not.toBe(402);
  });
});
