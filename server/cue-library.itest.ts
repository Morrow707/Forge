import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "./db";
import { coachCues, videoReviews } from "@shared/schema";
import { resetDatabase } from "./test-support/fixtures";
import {
  startTestServer,
  makeLoginableUser,
  addToRoster,
  loginAs,
  type TestServer,
  type TestClient,
} from "./test-support/http-app";

/**
 * THE CUE LIBRARY -- Phase 4b of docs/video-review-plan.md.
 *
 * The things a coach says over and over, ready to drop onto a review's timeline.
 *
 * The property worth a test is the one that is easy to get wrong and impossible to notice:
 * a cue dropped on a timeline copies its TEXT into the event. If the event referenced the cue
 * by id instead, then editing a cue would silently rewrite what the coach already said in a
 * review somebody has watched, and deleting one would blank it. The library is a source of new
 * events, never the storage for old ones.
 *
 * The rest is ordinary ownership: a staff shares a library (same as the reference clips), and
 * only the coach who made a cue may change or delete it -- a shared library anybody can delete
 * from is one where a head coach's teaching material disappears without a trace.
 */
describe("the cue library", () => {
  let server: TestServer;
  let coach: TestClient;
  let otherCoach: TestClient;
  let athlete: TestClient;
  let athleteId: number;

  beforeAll(async () => {
    server = await startTestServer();
    await resetDatabase();
    const coachUser = await makeLoginableUser({ role: "coach" });
    const otherCoachUser = await makeLoginableUser({ role: "coach" });
    const athleteUser = await makeLoginableUser({ role: "athlete" });
    await addToRoster(coachUser.id, athleteUser.id);
    athleteId = athleteUser.id;
    // ONE LOGIN PER ACTOR -- loginLimiter allows 15 per IP per fifteen minutes.
    coach = await loginAs(server.baseUrl, coachUser);
    otherCoach = await loginAs(server.baseUrl, otherCoachUser);
    athlete = await loginAs(server.baseUrl, athleteUser);
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await db.delete(coachCues);
    await db.delete(videoReviews);
  });

  async function makeCue(label = "Chest up", body = "Chest up through the bottom") {
    const res = await coach.post("/api/coach/cues", { label, body });
    expect(res.status).toBe(201);
    return res.body as { id: number; label: string; body: string; kind: string };
  }

  it("saves a cue and lists it back", async () => {
    const cue = await makeCue();
    expect(cue).toMatchObject({ label: "Chest up", kind: "text" });
    const list = await coach.get("/api/coach/cues");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(cue.id);
  });

  it("does NOT show one coach's cues to another", async () => {
    await makeCue();
    const theirs = await otherCoach.get("/api/coach/cues");
    expect(theirs.status).toBe(200);
    expect(theirs.body).toEqual([]);
  });

  it("lets only the owner edit or delete a cue", async () => {
    const cue = await makeCue();
    expect((await otherCoach.patch(`/api/coach/cues/${cue.id}`, { body: "nope" })).status).toBe(404);
    expect((await otherCoach.delete(`/api/coach/cues/${cue.id}`)).status).toBe(404);
    expect((await coach.patch(`/api/coach/cues/${cue.id}`, { body: "Chest tall" })).status).toBe(200);
    expect((await coach.delete(`/api/coach/cues/${cue.id}`)).status).toBe(200);
    expect((await coach.get("/api/coach/cues")).body).toEqual([]);
  });

  it("keeps a review saying what it said after the cue is edited AND after it is deleted", async () => {
    // The whole point. A coach drops a cue onto a timeline; the event carries a copy. Later they
    // reword the cue, and later still they delete it. The review somebody has already watched
    // must say exactly what it said at the time.
    const cue = await makeCue("Knees out", "Drive the knees out");
    const review = await coach.post("/api/coach/video-reviews", {
      athleteId,
      title: "Squat check",
      leftClip: { videoUrl: "/uploads/x.mp4", source: "set", label: "Back Squat" },
    });
    expect(review.status).toBe(201);

    const saved = await coach.put(`/api/coach/video-reviews/${review.body.id}/events`, {
      events: [
        {
          t: 3.5,
          side: "left",
          payload: { kind: "cue", text: "Drive the knees out", cueId: cue.id, color: "#fff" },
        },
      ],
    });
    expect(saved.status).toBe(200);

    await coach.patch(`/api/coach/cues/${cue.id}`, { body: "Push the knees out over the toes" });
    await coach.delete(`/api/coach/cues/${cue.id}`);

    const read = await coach.get(`/api/coach/video-reviews/${review.body.id}`);
    expect(read.status).toBe(200);
    expect(read.body.events).toHaveLength(1);
    expect(read.body.events[0].payload).toMatchObject({
      kind: "cue",
      text: "Drive the knees out",
    });
  });

  it("shares a library across a coaching staff", async () => {
    // Same rule as the reference clips: a head coach and their assistants teach from one
    // library rather than each building their own.
    const head = await makeLoginableUser({ role: "coach" });
    const assistantUser = await makeLoginableUser({ role: "coach" });
    const { coachStaff } = await import("@shared/schema");
    await db.insert(coachStaff).values({ primaryCoachId: head.id, staffCoachId: assistantUser.id });
    await db.insert(coachCues).values({
      coachId: head.id,
      label: "Brace",
      body: "Big breath, brace, then descend",
    });

    const assistant = await loginAs(server.baseUrl, assistantUser);
    const list = await assistant.get("/api/coach/cues");
    expect(list.status).toBe(200);
    expect(list.body.map((c: { label: string }) => c.label)).toEqual(["Brace"]);

    // Shared to READ, not to delete: a head coach's teaching material must not disappear
    // because an assistant tidied up.
    const theirs = list.body[0] as { id: number };
    expect((await assistant.delete(`/api/coach/cues/${theirs.id}`)).status).toBe(404);
  });

  it("refuses an athlete and an unauthenticated caller", async () => {
    expect((await athlete.get("/api/coach/cues")).status).toBe(403);
    expect([401, 403]).toContain((await fetch(`${server.baseUrl}/api/coach/cues`)).status);
  });

  it("rejects an empty or oversized cue", async () => {
    expect((await coach.post("/api/coach/cues", { label: "", body: "x" })).status).toBe(400);
    expect((await coach.post("/api/coach/cues", { label: "x", body: "y".repeat(400) })).status).toBe(400);
  });
});
