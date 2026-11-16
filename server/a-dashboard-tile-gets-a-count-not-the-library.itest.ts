import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeCoach, makeExercise, resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/** The coach and admin dashboards show how many exercises there are. They used to download the
 *  whole library (410 rows, 335KB) to count it, which held the dashboard's request burst open
 *  0.5-1s on the live server. The summary must equal the length of the list it replaces. */
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

describe("a dashboard tile gets a count, not the library", () => {
  it("the coach's summary equals the coach's visible list", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const coach = await makeLoginableUser({ role: "coach" });
    const otherCoach = await makeCoach();
    await makeExercise(admin.id, { name: "Back Squat", category: "strength" });
    await makeExercise(admin.id, { name: "Box Jump", category: "plyometric" });
    await makeExercise(coach.id, { name: "My Row", category: "strength" });
    await makeExercise(otherCoach.id, { name: "Not Mine", category: "mobility" });

    const client = await loginAs(server.baseUrl, coach);
    const list = await client.get("/api/coach/exercises");
    const summary = await client.get("/api/coach/exercises/summary");
    expect(summary.status).toBe(200);
    expect(summary.body.total).toBe(list.body.length);
    expect(summary.body.total).toBe(3);
  });

  it("the admin's summary equals the admin list and counts its categories", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    await makeExercise(admin.id, { name: "Back Squat", category: "strength" });
    await makeExercise(admin.id, { name: "Bench Press", category: "strength" });
    await makeExercise(admin.id, { name: "Box Jump", category: "plyometric" });

    const client = await loginAs(server.baseUrl, admin);
    const list = await client.get("/api/admin/exercises");
    const summary = await client.get("/api/admin/exercises/summary");
    expect(summary.status).toBe(200);
    expect(summary.body.total).toBe(list.body.length);
    expect(summary.body.categories).toBe(new Set(list.body.map((e: { category: string }) => e.category)).size);
  });

  it("a coach cannot read the admin summary", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const client = await loginAs(server.baseUrl, coach);
    expect((await client.get("/api/admin/exercises/summary")).status).toBe(403);
  });
});
