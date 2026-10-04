import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/** The lesson-level Coaches Corner additions of 2026-10-04: a coach's private note, "flag
 * this lesson" with its required reason, the release date and the dates the Continue row
 * orders by. In its own file because the quiz file has spent the login limiter's budget. */

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

async function makeTrack(adminClient: any) {
  const answers = (correctIndex: number) =>
    [0, 1, 2, 3].map((i) => ({ orderIndex: i, answerText: `Answer ${i}`, isCorrect: i === correctIndex, explanation: `Because ${i}.` }));
  const created = await adminClient.post("/api/admin/academy/tracks", {
    title: "Speed",
    description: "Running fast.",
    keyPrinciplesForAi: "Sprint fresh.",
    lessons: [
      { lessonNumber: 1, title: "Acceleration", content: "Push.", estMinutes: 5, sources: [] },
      { lessonNumber: 2, title: "Max velocity", content: "Fly.", estMinutes: 5, sources: [] },
    ],
    quizQuestions: [0, 1, 2, 3, 4].map((i) => ({ orderIndex: i, questionText: `Q${i}?`, answers: answers(i % 4) })),
  });
  expect(created.status).toBe(201);
  return created.body as { id: number; lessons: { id: number }[] };
}

describe("a coach's private lesson note (2026-10-04)", () => {
  it("is saved, read back on the track, deleted when emptied, and never served to another coach", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const coach = await makeLoginableUser({ role: "coach" });
    const other = await makeLoginableUser({ role: "coach" });
    const ca = await loginAs(server.baseUrl, admin);
    const track = await makeTrack(ca);
    const lessonId = track.lessons[0].id;
    const cc = await loginAs(server.baseUrl, coach);
    expect((await cc.put(`/api/coach/academy/lessons/${lessonId}/note`, { body: "  Try the hip cue with the sophomores.  " })).status).toBe(200);
    const detail = await cc.get(`/api/coach/academy/tracks/${track.id}`);
    expect(detail.body.lessons.find((l: any) => l.id === lessonId).note).toBe("Try the hip cue with the sophomores.");
    const oc = await loginAs(server.baseUrl, other);
    const otherDetail = await oc.get(`/api/coach/academy/tracks/${track.id}`);
    expect(otherDetail.body.lessons.find((l: any) => l.id === lessonId).note).toBe("");
    expect((await cc.put(`/api/coach/academy/lessons/${lessonId}/note`, { body: "   " })).status).toBe(200);
    const after = await cc.get(`/api/coach/academy/tracks/${track.id}`);
    expect(after.body.lessons.find((l: any) => l.id === lessonId).note).toBe("");
  });
});

describe("flags, release dates and the Continue row (2026-10-04)", () => {
  it("files a flag only with a reason, lists it for the admin without the coach, and dates the catalog", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const coach = await makeLoginableUser({ role: "coach" });
    const ca = await loginAs(server.baseUrl, admin);
    const track = await makeTrack(ca);
    const cc = await loginAs(server.baseUrl, coach);
    const lessonId = track.lessons[0].id;

    expect((await cc.post(`/api/coach/academy/lessons/${lessonId}/flag`, { reason: "wrong" })).status).toBe(400);
    expect((await cc.post(`/api/coach/academy/lessons/${lessonId}/flag`, { reason: "The sprint drill in paragraph three names the wrong rest interval." })).status).toBe(201);
    expect((await cc.post(`/api/coach/academy/lessons/999999/flag`, { reason: "A lesson that does not exist cannot be flagged." })).status).toBe(404);

    const open = await ca.get("/api/admin/coaches-corner/lesson-flags");
    expect(open.status).toBe(200);
    expect(open.body).toHaveLength(1);
    expect(open.body[0]).toMatchObject({ lessonId, trackTitle: "Speed", lessonNumber: 1, lessonTitle: "Acceleration", trackId: track.id });
    expect(open.body[0]).not.toHaveProperty("coachId");
    expect((await ca.post(`/api/admin/coaches-corner/lesson-flags/${open.body[0].id}/resolve`, {})).status).toBe(200);
    expect((await ca.get("/api/admin/coaches-corner/lesson-flags")).body).toHaveLength(0);
    expect((await ca.post(`/api/admin/coaches-corner/lesson-flags/${open.body[0].id}/resolve`, {})).status).toBe(404);

    // Release date on every catalog entry; lastReadAt once a lesson is read, so the Continue
    // row can order by it.
    const before = await cc.get("/api/coach/academy/tracks");
    const entry0 = before.body.find((t: any) => t.id === track.id);
    expect(typeof entry0.releasedAt).toBe("string");
    expect(entry0.lastReadAt).toBeNull();
    await cc.post(`/api/coach/academy/lessons/${lessonId}/complete`, { completed: true });
    const after = await cc.get("/api/coach/academy/tracks");
    const entry1 = after.body.find((t: any) => t.id === track.id);
    expect(typeof entry1.lastReadAt).toBe("string");
    expect(entry1.completedAt).toBeNull();
  });
});
