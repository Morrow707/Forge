import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { resetDatabase, db } from "./test-support/fixtures";
import { guardianLinks, videoReviews } from "@shared/schema";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { UPLOADS_ROOT } from "./uploaded-files";
import {
  startTestServer,
  makeLoginableUser,
  addToRoster,
  loginAs,
  type TestServer,
} from "./test-support/http-app";

/**
 * WHO CAN SEE A SAVED REVIEW, AND WHEN.
 *
 * A review is coaching content about a person, very often a minor, and it exists in a draft
 * state before the coach means anyone to read it. So there are two separate questions and both
 * matter: whose review is it, and has it been shared yet.
 *
 * The second one is the easy thing to get wrong. A list route that forgets
 * `sharedWithAthleteAt` shows an athlete a half-written note about themselves -- not a privacy
 * breach in the legal sense, but exactly the thing that stops a coach using the tool honestly.
 * The failure is silent: nothing errors, the athlete just sees something they should not have.
 *
 * Asked over HTTP because the answer depends on middleware order and role gates as much as on
 * the query.
 */
describe("saved video reviews", () => {
  let server: TestServer;

  const CLIP = { videoUrl: "/uploads/form-videos/a.mp4", source: "set" as const, label: "Squat, set 2" };

  // ONE LOGIN PER ACTOR FOR THE WHOLE FILE. loginLimiter allows 15 attempts, and a fresh login
  // in every test burns that budget and fails the file with a 429 that reads like an auth bug.
  // So the world is built once and only the reviews table is cleared between tests -- which is
  // also all these tests write.
  let actors: {
    coach: Awaited<ReturnType<typeof loginAs>>;
    otherCoach: Awaited<ReturnType<typeof loginAs>>;
    athlete: Awaited<ReturnType<typeof loginAs>>;
    otherAthlete: Awaited<ReturnType<typeof loginAs>>;
    guardian: Awaited<ReturnType<typeof loginAs>>;
  };
  let ids: { athleteId: number; otherAthleteId: number };

  beforeAll(async () => {
    server = await startTestServer();
    await resetDatabase();
    const coach = await makeLoginableUser({ role: "coach" });
    const otherCoach = await makeLoginableUser({ role: "coach" });
    const athlete = await makeLoginableUser({ role: "athlete" });
    const otherAthlete = await makeLoginableUser({ role: "athlete" });
    const guardian = await makeLoginableUser({ role: "guardian" });
    await addToRoster(coach.id, athlete.id);
    await addToRoster(otherCoach.id, otherAthlete.id);
    await db.insert(guardianLinks).values({ athleteId: athlete.id, guardianId: guardian.id });
    ids = { athleteId: athlete.id, otherAthleteId: otherAthlete.id };
    actors = {
      coach: await loginAs(server.baseUrl, coach),
      otherCoach: await loginAs(server.baseUrl, otherCoach),
      athlete: await loginAs(server.baseUrl, athlete),
      otherAthlete: await loginAs(server.baseUrl, otherAthlete),
      guardian: await loginAs(server.baseUrl, guardian),
    };
  });
  afterAll(async () => {
    await server.close();
  });
  // Events cascade from the review, so one delete clears both tables.
  beforeEach(async () => {
    await db.delete(videoReviews);
  });

  async function createReview(client: Awaited<ReturnType<typeof loginAs>>, athleteId: number) {
    const res = await client.post("/api/coach/video-reviews", {
      athleteId,
      title: "Squat depth",
      leftClip: CLIP,
    });
    expect(res.status).toBe(201);
    return res.body as { id: number };
  }

  it("lets a coach create and read back their own review", async () => {
    const client = actors.coach;
    const review = await createReview(client, ids.athleteId);

    const got = await client.get(`/api/coach/video-reviews/${review.id}`);
    expect(got.status).toBe(200);
    expect((got.body as any).title).toBe("Squat depth");
    expect((got.body as any).events).toEqual([]);
  });

  it("refuses to create a review about an athlete the coach cannot see", async () => {
    const client = actors.otherCoach;
    const res = await client.post("/api/coach/video-reviews", {
      athleteId: ids.athleteId,
      title: "Not mine",
      leftClip: CLIP,
    });
    expect(res.status).toBe(404);
  });

  it("does not show one coach another coach's review", async () => {
    const mine = actors.coach;
    const review = await createReview(mine, ids.athleteId);

    const theirs = actors.otherCoach;
    expect((await theirs.get(`/api/coach/video-reviews/${review.id}`)).status).toBe(404);
    expect((await theirs.get("/api/coach/video-reviews")).body).toEqual([]);
    // And cannot edit it, which is the write half of the same question.
    expect((await theirs.patch(`/api/coach/video-reviews/${review.id}`, { title: "hijacked" })).status).toBe(404);
  });

  it("HIDES AN UNSHARED REVIEW FROM THE ATHLETE IT IS ABOUT", async () => {
    // The one that matters most. A coach drafting a note is not publishing it.
    const coachClient = actors.coach;
    const review = await createReview(coachClient, ids.athleteId);

    const athleteClient = actors.athlete;
    expect((await athleteClient.get("/api/athlete/video-reviews")).body).toEqual([]);
    // 404 rather than 403: a 403 tells the athlete their coach is writing something about them.
    expect((await athleteClient.get(`/api/athlete/video-reviews/${review.id}`)).status).toBe(404);
  });

  it("shows it once the coach shares, and hides it again if they take it back", async () => {
    const coachClient = actors.coach;
    const review = await createReview(coachClient, ids.athleteId);
    const athleteClient = actors.athlete;

    expect((await coachClient.patch(`/api/coach/video-reviews/${review.id}`, { shared: true })).status).toBe(200);
    expect((await athleteClient.get("/api/athlete/video-reviews")).body).toHaveLength(1);
    expect((await athleteClient.get(`/api/athlete/video-reviews/${review.id}`)).status).toBe(200);

    // Un-sharing is a real state, not a one-way door -- a coach who shares early gets it back.
    expect((await coachClient.patch(`/api/coach/video-reviews/${review.id}`, { shared: false })).status).toBe(200);
    expect((await athleteClient.get("/api/athlete/video-reviews")).body).toEqual([]);
  });

  it("never shows an athlete another athlete's shared review", async () => {
    const coachClient = actors.coach;
    const review = await createReview(coachClient, ids.athleteId);
    await coachClient.patch(`/api/coach/video-reviews/${review.id}`, { shared: true });

    const stranger = actors.otherAthlete;
    expect((await stranger.get("/api/athlete/video-reviews")).body).toEqual([]);
    expect((await stranger.get(`/api/athlete/video-reviews/${review.id}`)).status).toBe(404);
  });

  it("gives a guardian exactly what their athlete sees -- no drafts", async () => {
    const coachClient = actors.coach;
    const review = await createReview(coachClient, ids.athleteId);
    const guardianClient = actors.guardian;

    // Unshared: the guardian sees nothing either. A parent is not a back door into a draft.
    expect((await guardianClient.get(`/api/guardian/athletes/${ids.athleteId}/video-reviews`)).body).toEqual([]);

    await coachClient.patch(`/api/coach/video-reviews/${review.id}`, { shared: true });
    const after = await guardianClient.get(`/api/guardian/athletes/${ids.athleteId}/video-reviews`);
    expect(after.body).toHaveLength(1);
  });

  it("refuses a guardian asking about a child who is not theirs", async () => {
    const client = actors.guardian;
    const res = await client.get(`/api/guardian/athletes/${ids.otherAthleteId}/video-reviews`);
    expect(res.status).toBe(404);
  });

  it("stores and returns an event timeline in time order", async () => {
    // visibleAt scans forward for the next boundary, so out-of-order events would make a
    // drawing hold to the wrong one. The order is the route's promise, asserted here.
    const client = actors.coach;
    const review = await createReview(client, ids.athleteId);

    const res = await client.put(`/api/coach/video-reviews/${review.id}/events`, {
      events: [
        { t: 9, side: "left", payload: { kind: "scrub", to: 0 } },
        { t: 2, side: "left", payload: { kind: "circle", center: { x: 0.5, y: 0.4 }, radius: 0.1, color: "#f00" } },
        { t: 5, side: "both", payload: { kind: "text", at: { x: 0.2, y: 0.2 }, text: "knees", color: "#fff" } },
      ],
    });
    expect(res.status).toBe(200);
    expect((res.body as any[]).map((e) => e.t)).toEqual([2, 5, 9]);

    const got = await client.get(`/api/coach/video-reviews/${review.id}`);
    expect((got.body as any).events).toHaveLength(3);
  });

  it("replaces the timeline rather than appending to it", async () => {
    const client = actors.coach;
    const review = await createReview(client, ids.athleteId);
    const one = { events: [{ t: 1, side: "left", payload: { kind: "pause" } }] };
    await client.put(`/api/coach/video-reviews/${review.id}/events`, one);
    const second = await client.put(`/api/coach/video-reviews/${review.id}/events`, one);
    expect(second.body).toHaveLength(1);
  });

  it("refuses an event payload it does not recognise", async () => {
    // The zod-strip lesson: an undeclared payload would be silently emptied on insert, and the
    // review would replay with a drawing that renders as nothing.
    const client = actors.coach;
    const review = await createReview(client, ids.athleteId);
    const res = await client.put(`/api/coach/video-reviews/${review.id}/events`, {
      events: [{ t: 1, side: "left", payload: { kind: "hologram", spin: 4 } }],
    });
    expect(res.status).toBe(400);
  });

  it("takes a voice-over, owner-only, and deletes the take it replaces", async () => {
    // A re-record replaces the audio. The previous take must not survive on the persistent disk
    // -- a coach unhappy with their first attempt is the normal case, not the rare one.
    const client = actors.coach;
    const review = await createReview(client, ids.athleteId);

    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }), "take.webm");
    form.append("startAt", "12.5");
    const first = await fetch(`${server.baseUrl}/api/coach/video-reviews/${review.id}/audio`, {
      method: "POST",
      headers: { cookie: client.cookieHeader(), "x-forge-device-id": client.deviceId },
      body: form,
    });
    expect(first.status).toBe(201);
    const { voiceOverUrl } = (await first.json()) as { voiceOverUrl: string };
    expect(voiceOverUrl).toMatch(/^\/uploads\/reviews\//);

    const onDisk = join(UPLOADS_ROOT, voiceOverUrl.replace("/uploads/", ""));
    expect(existsSync(onDisk)).toBe(true);

    // Re-record.
    const form2 = new FormData();
    form2.append("audio", new Blob([new Uint8Array([4, 5, 6])], { type: "audio/webm" }), "take2.webm");
    form2.append("startAt", "0");
    const second = await fetch(`${server.baseUrl}/api/coach/video-reviews/${review.id}/audio`, {
      method: "POST",
      headers: { cookie: client.cookieHeader(), "x-forge-device-id": client.deviceId },
      body: form2,
    });
    expect(second.status).toBe(201);
    expect(existsSync(onDisk), "the replaced take is still on disk").toBe(false);
  });

  it("refuses a voice-over on somebody else's review", async () => {
    const review = await createReview(actors.coach, ids.athleteId);
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array([1])], { type: "audio/webm" }), "x.webm");
    const res = await fetch(`${server.baseUrl}/api/coach/video-reviews/${review.id}/audio`, {
      method: "POST",
      headers: {
        cookie: actors.otherCoach.cookieHeader(),
        "x-forge-device-id": actors.otherCoach.deviceId,
      },
      body: form,
    });
    expect(res.status).toBe(404);
  });

  it("refuses an unauthenticated caller", async () => {
    const res = await fetch(`${server.baseUrl}/api/coach/video-reviews`);
    expect([401, 403]).toContain(res.status);
  });
});
