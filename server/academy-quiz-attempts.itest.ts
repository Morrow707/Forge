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

describe("four question shapes on a track quiz (2026-10-04)", () => {
  it("never sends the key before grading, grades every shape on the server, and keeps a lesson's flashcards", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const coach = await makeLoginableUser({ role: "coach" });
    const ca = await loginAs(server.baseUrl, admin);
    const created = await ca.post("/api/admin/academy/tracks", {
      title: "Shapes",
      description: "Every shape once.",
      keyPrinciplesForAi: "Shapes.",
      lessons: [
        {
          lessonNumber: 1,
          title: "One",
          content: "Read.",
          estMinutes: 3,
          sources: [],
          flashcards: [{ front: "What is the pass mark?", back: "Eighty percent." }],
        },
      ],
      quizQuestions: [
        {
          orderIndex: 0,
          questionText: "Pick one?",
          questionType: "multiple_choice",
          answers: [0, 1].map((i) => ({ orderIndex: i, answerText: `A${i}`, isCorrect: i === 0, explanation: `Because ${i}.` })),
        },
        { orderIndex: 1, questionText: "The cycle is the ___ cycle.", questionType: "fill_blank", payload: { accepted: ["stretch-shortening", "SSC"], explanation: "SSC." }, answers: [] },
        { orderIndex: 2, questionText: "Order the session.", questionType: "ordering", payload: { items: ["warm up", "lift", "cool down"] }, answers: [] },
        { orderIndex: 3, questionText: "Match them.", questionType: "matching", payload: { pairs: [{ left: "squat", right: "knee" }, { left: "deadlift", right: "hip" }] }, answers: [] },
      ],
    });
    expect(created.status).toBe(201);
    const track = created.body as { id: number; lessons: { id: number; flashcards: unknown[] }[]; quizQuestions: { id: number; questionType: string; payload: any; answers: { id: number }[] }[] };
    expect(track.lessons[0].flashcards).toEqual([{ front: "What is the pass mark?", back: "Eighty percent." }]);

    // A malformed shape is refused by the shared rule, not stored.
    const bad = await ca.post("/api/admin/academy/tracks", {
      title: "Bad",
      description: "x",
      keyPrinciplesForAi: "x",
      lessons: [],
      quizQuestions: [{ orderIndex: 0, questionText: "No blank here", questionType: "fill_blank", payload: { accepted: ["x"] }, answers: [] }],
    });
    expect(bad.status).toBe(400);

    const cc = await loginAs(server.baseUrl, coach);
    const detail = await cc.get(`/api/coach/academy/tracks/${track.id}`);
    expect(detail.status).toBe(200);
    const byType = Object.fromEntries(detail.body.quizQuestions.map((q: any) => [q.questionType, q]));
    // The key stays on the server: no accepted answers, items shuffled, rights shuffled.
    expect(byType.fill_blank.payload ?? {}).toEqual({});
    expect([...byType.ordering.payload.items].sort()).toEqual(["cool down", "lift", "warm up"]);
    expect(byType.ordering.payload.items).not.toEqual(["warm up", "lift", "cool down"]);
    expect(byType.matching.payload.pairs.map((p: any) => p.left)).toEqual(["squat", "deadlift"]);
    expect(byType.matching.payload.pairs.map((p: any) => p.right).sort()).toEqual(["hip", "knee"]);
    expect(byType.matching.payload.pairs).not.toEqual([{ left: "squat", right: "knee" }, { left: "deadlift", right: "hip" }]);
    expect(detail.body.lessons[0].flashcards).toHaveLength(1);

    // Three right of four: case and punctuation do not decide the blank; the key comes back
    // only on the graded result.
    const attempt = await cc.post(`/api/coach/academy/tracks/${track.id}/quiz-attempt`, {
      answers: [
        { questionId: byType.multiple_choice.id, answerId: byType.multiple_choice.answers[0].id },
        { questionId: byType.fill_blank.id, text: "Stretch shortening" },
        { questionId: byType.ordering.id, order: ["warm up", "lift", "cool down"] },
        { questionId: byType.matching.id, matches: { squat: "hip", deadlift: "knee" } },
      ],
    });
    expect(attempt.status).toBe(200);
    expect(attempt.body).toMatchObject({ correct: 3, total: 4, passed: false });
    const graded = Object.fromEntries(attempt.body.results.map((r: any) => [r.questionType, r]));
    expect(graded.fill_blank).toMatchObject({ correct: true, payload: { accepted: ["stretch-shortening", "SSC"] } });
    expect(graded.ordering.correct).toBe(true);
    expect(graded.matching).toMatchObject({ correct: false, payload: { pairs: [{ left: "squat", right: "knee" }, { left: "deadlift", right: "hip" }] } });
    expect(graded.multiple_choice.payload).toBeNull();

    // The pre-2026-10-04 client shape still grades.
    const legacy = await cc.post(`/api/coach/academy/tracks/${track.id}/quiz-attempt`, {
      picks: [{ questionId: byType.multiple_choice.id, answerId: byType.multiple_choice.answers[0].id }],
    });
    expect(legacy.body).toMatchObject({ correct: 1, total: 4 });
  });
});

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
