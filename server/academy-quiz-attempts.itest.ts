import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/** Scored Coaches Corner quizzes (2026-10-03): graded on the server, every attempt kept, the
 * best one counts, and the certificate is issued only when every lesson is read and the quiz
 * passed. */

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
  return created.body as { id: number; lessons: { id: number }[]; quizQuestions: { id: number; answers: { id: number; isCorrect: boolean }[] }[] };
}

describe("a scored quiz", () => {
  it("is graded by the server, keeps the best attempt, and gates the certificate", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const coach = await makeLoginableUser({ role: "coach", name: "Pat Rivera" });
    const ca = await loginAs(server.baseUrl, admin);
    const track = await makeTrack(ca);
    const cc = await loginAs(server.baseUrl, coach);

    // Three of five right: 60%, fails. A pick the client claims is right is still graded by the server.
    const wrongOf = (q: (typeof track.quizQuestions)[number]) => q.answers.find((a) => !a.isCorrect)!.id;
    const rightOf = (q: (typeof track.quizQuestions)[number]) => q.answers.find((a) => a.isCorrect)!.id;
    const first = await cc.post(`/api/coach/academy/tracks/${track.id}/quiz-attempt`, {
      picks: track.quizQuestions.map((q, i) => ({ questionId: q.id, answerId: i < 3 ? rightOf(q) : wrongOf(q) })),
    });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ correct: 3, total: 5, passed: false });
    expect(first.body.results.filter((r: any) => r.correct)).toHaveLength(3);

    // Not done: lessons unread and quiz failed.
    expect((await cc.get(`/api/coach/academy/tracks/${track.id}/certificate`)).status).toBe(409);
    const catalog1 = await cc.get("/api/coach/academy/tracks");
    expect(catalog1.body.find((t: any) => t.id === track.id)).toMatchObject({ completed: false, bestAttempt: { correct: 3, passed: false } });

    // Four of five: 80%, passes. Best attempt moves up.
    const second = await cc.post(`/api/coach/academy/tracks/${track.id}/quiz-attempt`, {
      picks: track.quizQuestions.map((q, i) => ({ questionId: q.id, answerId: i < 4 ? rightOf(q) : wrongOf(q) })),
    });
    expect(second.body).toMatchObject({ correct: 4, total: 5, passed: true, best: { correct: 4, passed: true } });

    // A worse attempt afterwards does not lower the best.
    await cc.post(`/api/coach/academy/tracks/${track.id}/quiz-attempt`, { picks: [] });
    const detail = await cc.get(`/api/coach/academy/tracks/${track.id}`);
    expect(detail.body.bestAttempt).toMatchObject({ correct: 4, total: 5, passed: true });

    // Still no certificate until every lesson is read.
    expect((await cc.get(`/api/coach/academy/tracks/${track.id}/certificate`)).status).toBe(409);
    for (const l of track.lessons) {
      expect((await cc.post(`/api/coach/academy/lessons/${l.id}/complete`, { completed: true })).status).toBe(204);
    }
    const cert = await cc.get(`/api/coach/academy/tracks/${track.id}/certificate`);
    expect(cert.status).toBe(200);
    expect(cert.body).toMatchObject({ trackTitle: "Speed", coachName: "Pat Rivera", lessonCount: 2, quiz: { correct: 4, total: 5 }, estimatedMinutes: 10 });
    const catalog2 = await cc.get("/api/coach/academy/tracks");
    expect(catalog2.body.find((t: any) => t.id === track.id)).toMatchObject({ completed: true, lessonsRead: 2 });
  });

  it("a track with no quiz is complete once every lesson is read", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const coach = await makeLoginableUser({ role: "coach" });
    const ca = await loginAs(server.baseUrl, admin);
    const created = await ca.post("/api/admin/academy/tracks", {
      title: "Culture",
      description: "Standards.",
      keyPrinciplesForAi: "Be consistent.",
      lessons: [{ lessonNumber: 1, title: "Standards", content: "Hold them.", estMinutes: 3, sources: [] }],
      quizQuestions: [],
    });
    const cc = await loginAs(server.baseUrl, coach);
    expect((await cc.post(`/api/coach/academy/tracks/${created.body.id}/quiz-attempt`, { picks: [] })).status).toBe(404);
    await cc.post(`/api/coach/academy/lessons/${created.body.lessons[0].id}/complete`, { completed: true });
    expect((await cc.get(`/api/coach/academy/tracks/${created.body.id}/certificate`)).status).toBe(200);
  });
});

describe("analytics and flagged questions", () => {
  it("count per question misses and list what the library couldn't answer, naming nobody", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const c1 = await makeLoginableUser({ role: "coach" });
    const c2 = await makeLoginableUser({ role: "coach" });
    const c3 = await makeLoginableUser({ role: "coach" });
    const ca = await loginAs(server.baseUrl, admin);
    const track = await makeTrack(ca);
    const rightOf = (q: (typeof track.quizQuestions)[number]) => q.answers.find((a) => a.isCorrect)!.id;
    const wrongOf = (q: (typeof track.quizQuestions)[number]) => q.answers.find((a) => !a.isCorrect)!.id;
    // Everyone misses question 0; everyone gets the rest.
    for (const coach of [c1, c2, c3]) {
      const cc = await loginAs(server.baseUrl, coach);
      await cc.post(`/api/coach/academy/tracks/${track.id}/quiz-attempt`, {
        picks: track.quizQuestions.map((q, i) => ({ questionId: q.id, answerId: i === 0 ? wrongOf(q) : rightOf(q) })),
      });
      await cc.post(`/api/coach/academy/lessons/${track.lessons[0].id}/complete`, { completed: true });
    }
    const cc1 = await loginAs(server.baseUrl, c1);
    expect((await cc1.post("/api/coach/academy/ask/flag", { question: "How do I periodize for wrestling?", answerGiven: "The library has nothing on wrestling." })).status).toBe(201);

    const a = await ca.get("/api/admin/coaches-corner/analytics");
    expect(a.status).toBe(200);
    const row = a.body.tracks.find((t: any) => t.trackId === track.id);
    expect(row).toMatchObject({ started: 3, allLessonsRead: 0, quizAttempts: 3, quizPasses: 3, quizCoaches: 3 });
    expect(row.lessons[0].readBy).toBe(3);
    expect(a.body.hardestQuestions[0]).toMatchObject({ questionText: "Q0?", answered: 3, missed: 3, missRate: 1 });
    expect(a.body.openQuestions).toBe(1);
    expect(JSON.stringify(a.body)).not.toContain("Test User");

    const qs = await ca.get("/api/admin/coaches-corner/questions");
    expect(qs.body[0]).toMatchObject({ question: "How do I periodize for wrestling?" });
    expect((await ca.post(`/api/admin/coaches-corner/questions/${qs.body[0].id}/resolve`, { adminNote: "Wrote the wrestling track" })).status).toBe(200);
    expect((await ca.get("/api/admin/coaches-corner/questions")).body).toHaveLength(0);
  });
});
