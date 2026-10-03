import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/** Learning paths (2026-10-03): admin-authored ordered sets of tracks; a coach sees progress
 * per path and earns the path's certificate only when every track in it is complete. */

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

async function track(ca: any, title: string) {
  const r = await ca.post("/api/admin/academy/tracks", {
    title,
    description: "d",
    keyPrinciplesForAi: "k",
    lessons: [{ lessonNumber: 1, title: "L1", content: "c", estMinutes: 4, sources: [] }],
    quizQuestions: [],
  });
  expect(r.status).toBe(201);
  return r.body as { id: number; lessons: { id: number }[] };
}

describe("learning paths", () => {
  it("are built by an admin and completed by a coach track by track", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const coach = await makeLoginableUser({ role: "coach", name: "Sam Lee" });
    const ca = await loginAs(server.baseUrl, admin);
    const cc = await loginAs(server.baseUrl, coach);
    const t1 = await track(ca, "First");
    const t2 = await track(ca, "Second");

    const created = await ca.post("/api/admin/academy/paths", {
      title: "Starter",
      description: "Two tracks.",
      audience: "New coaches",
      trackIds: [t2.id, t1.id],
    });
    expect(created.status).toBe(201);
    expect(created.body.tracks.map((t: any) => t.title)).toEqual(["Second", "First"]);
    const pathId = created.body.id;

    let paths = await cc.get("/api/coach/academy/paths");
    expect(paths.body[0]).toMatchObject({ id: pathId, tracksCompleted: 0, completed: false });
    expect((await cc.get(`/api/coach/academy/paths/${pathId}/certificate`)).status).toBe(409);

    await cc.post(`/api/coach/academy/lessons/${t1.lessons[0].id}/complete`, { completed: true });
    paths = await cc.get("/api/coach/academy/paths");
    expect(paths.body[0]).toMatchObject({ tracksCompleted: 1, completed: false });

    await cc.post(`/api/coach/academy/lessons/${t2.lessons[0].id}/complete`, { completed: true });
    paths = await cc.get("/api/coach/academy/paths");
    expect(paths.body[0]).toMatchObject({ tracksCompleted: 2, completed: true });
    const cert = await cc.get(`/api/coach/academy/paths/${pathId}/certificate`);
    expect(cert.status).toBe(200);
    expect(cert.body).toMatchObject({ trackTitle: "Starter", coachName: "Sam Lee", trackCount: 2, lessonCount: 2, estimatedMinutes: 8 });

    // Reorder and drop a track; delete.
    const updated = await ca.put(`/api/admin/academy/paths/${pathId}`, { title: "Starter", description: "One track.", audience: "", trackIds: [t1.id] });
    expect(updated.body.tracks.map((t: any) => t.id)).toEqual([t1.id]);
    expect((await ca.delete(`/api/admin/academy/paths/${pathId}`)).status).toBe(204);
    expect((await cc.get("/api/coach/academy/paths")).body).toHaveLength(0);
  });
});
