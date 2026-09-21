import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "./db";
import { videoReviews } from "@shared/schema";
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
 * ATHLETE SELF-REVIEW -- Phase 4b of docs/video-review-plan.md.
 *
 * The same editor and the same tables, in the other direction: an athlete breaks down their own
 * lift and can SEND it to their coach.
 *
 * Two columns carry the whole design and this file is about both. `authorId` is whose work it
 * is to edit; `coachId` is which coach it is filed with. Collapsing them would make a
 * self-review either invisible to the coach it was sent to, or editable by them -- and being
 * able to rewrite what an athlete said about their own lift, under that athlete's name, is the
 * worse of the two.
 *
 * `sentToCoachAt` is the other half: until it is set, a draft is the athlete's alone. A coach
 * reading an unsent draft is reading over somebody's shoulder.
 */
describe("an athlete's review of their own lift", () => {
  let server: TestServer;
  let coach: TestClient;
  let athlete: TestClient;
  let stranger: TestClient;
  let athleteId: number;
  let coachId: number;

  beforeAll(async () => {
    server = await startTestServer();
    await resetDatabase();
    const coachUser = await makeLoginableUser({ role: "coach" });
    const athleteUser = await makeLoginableUser({ role: "athlete" });
    const strangerUser = await makeLoginableUser({ role: "athlete" });
    await addToRoster(coachUser.id, athleteUser.id);
    coachId = coachUser.id;
    athleteId = athleteUser.id;
    // ONE LOGIN PER ACTOR -- loginLimiter allows 15 per IP per fifteen minutes.
    coach = await loginAs(server.baseUrl, coachUser);
    athlete = await loginAs(server.baseUrl, athleteUser);
    stranger = await loginAs(server.baseUrl, strangerUser);
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await db.delete(videoReviews);
  });

  async function selfReview(title = "My squat") {
    const res = await athlete.post("/api/athlete/self-reviews", {
      title,
      leftClip: { videoUrl: "/uploads/x.mp4", source: "set", label: "Back Squat" },
    });
    expect(res.status).toBe(201);
    return res.body as { id: number; authorId: number; coachId: number };
  }

  it("is authored by the athlete and filed with their coach", async () => {
    const review = await selfReview();
    expect(review.authorId).toBe(athleteId);
    expect(review.coachId).toBe(coachId);
    const mine = await athlete.get("/api/athlete/self-reviews");
    expect(mine.body).toHaveLength(1);
  });

  it("is NOT on the coach's list until it is sent", async () => {
    const review = await selfReview();
    expect((await coach.get("/api/coach/video-reviews")).body).toEqual([]);
    expect((await coach.get(`/api/coach/video-reviews/${review.id}`)).status).toBe(404);

    expect((await athlete.patch(`/api/athlete/self-reviews/${review.id}`, { sentToCoach: true })).status).toBe(200);
    expect((await coach.get("/api/coach/video-reviews")).body).toHaveLength(1);
    expect((await coach.get(`/api/coach/video-reviews/${review.id}`)).status).toBe(200);
  });

  it("can be taken back", async () => {
    // The mirror of a coach un-sharing. Somebody who sent early and thought better of it gets
    // it back.
    const review = await selfReview();
    await athlete.patch(`/api/athlete/self-reviews/${review.id}`, { sentToCoach: true });
    await athlete.patch(`/api/athlete/self-reviews/${review.id}`, { sentToCoach: false });
    expect((await coach.get("/api/coach/video-reviews")).body).toEqual([]);
  });

  it("cannot be edited by the coach it was sent to", async () => {
    // THE point of authorId. A coach who could PATCH this would be rewriting what an athlete
    // said about their own lift, under that athlete's name.
    const review = await selfReview();
    await athlete.patch(`/api/athlete/self-reviews/${review.id}`, { sentToCoach: true });

    expect((await coach.patch(`/api/coach/video-reviews/${review.id}`, { title: "Not yours" })).status).toBe(404);
    expect(
      (
        await coach.put(`/api/coach/video-reviews/${review.id}/events`, {
          events: [{ t: 0, side: "left", payload: { kind: "flag", note: "mine now" } }],
        })
      ).status,
    ).toBe(404);

    const read = await coach.get(`/api/coach/video-reviews/${review.id}`);
    expect(read.body.title).toBe("My squat");
  });

  it("lets the athlete draw on their own timeline", async () => {
    const review = await selfReview();
    const saved = await athlete.put(`/api/athlete/self-reviews/${review.id}/events`, {
      events: [{ t: 1.5, side: "left", payload: { kind: "text", at: { x: 0.5, y: 0.5 }, text: "here", color: "#fff" } }],
    });
    expect(saved.status).toBe(200);
    const read = await athlete.get(`/api/athlete/self-reviews/${review.id}`);
    expect(read.body.events).toHaveLength(1);
  });

  it("belongs to nobody else", async () => {
    const review = await selfReview();
    expect((await stranger.get("/api/athlete/self-reviews")).body).toEqual([]);
    expect((await stranger.get(`/api/athlete/self-reviews/${review.id}`)).status).toBe(404);
    expect((await stranger.patch(`/api/athlete/self-reviews/${review.id}`, { title: "mine" })).status).toBe(404);
    expect(
      (await stranger.put(`/api/athlete/self-reviews/${review.id}/events`, { events: [] })).status,
    ).toBe(404);
  });

  it("never lets the body name a different athlete", async () => {
    // athleteId is not read from the request at all. A self-review is about its author, and a
    // field a client could set is a field a client will set.
    const res = await athlete.post("/api/athlete/self-reviews", {
      athleteId: 999_999,
      title: "Someone else's",
      leftClip: { videoUrl: "/uploads/x.mp4", source: "set", label: "Back Squat" },
    });
    expect(res.status).toBe(201);
    expect(res.body.athleteId).toBe(athleteId);
  });

  it("does not leave a coach's own review editable by its subject", async () => {
    // The reverse direction of the same rule -- the coach's reviews stay the coach's.
    const made = await coach.post("/api/coach/video-reviews", {
      athleteId,
      title: "Coach's own",
      leftClip: { videoUrl: "/uploads/y.mp4", source: "set", label: "Back Squat" },
    });
    expect(made.status).toBe(201);
    expect((await athlete.patch(`/api/athlete/self-reviews/${made.body.id}`, { title: "no" })).status).toBe(404);
    expect((await athlete.get(`/api/athlete/self-reviews/${made.body.id}`)).status).toBe(404);
  });

  it("refuses an unauthenticated caller", async () => {
    expect([401, 403]).toContain((await fetch(`${server.baseUrl}/api/athlete/self-reviews`)).status);
  });
});
