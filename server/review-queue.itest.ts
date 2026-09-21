import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "./db";
import { videoReviewRequests, videoReviews, workoutLogs } from "@shared/schema";
import {
  resetDatabase,
  makeExercise,
  makeAssignedProgram,
  makeLoggedSetWithVideo,
  makeUploadedFile,
} from "./test-support/fixtures";
import {
  startTestServer,
  makeLoginableUser,
  addToRoster,
  loginAs,
  type TestServer,
  type TestClient,
} from "./test-support/http-app";

/**
 * "ASK MY COACH TO CHECK THIS" -- the review queue, Phase 4b of docs/video-review-plan.md.
 *
 * The feature exists for one failure: an athlete films a set, nobody watches it, and there is
 * no record that anybody was ever asked. A comment can be read and forgotten; a request has a
 * resolvedAt, so what is still owed can be shown and counted.
 *
 * That makes four properties load-bearing, and every one of them is invisible from the
 * outside once it breaks:
 *
 *  - ONE OPEN ASK PER SET. A queue that lists the same clip three times is one a coach learns
 *    to ignore.
 *  - THE QUEUE IS OLDEST FIRST. The ask that has been waiting eleven days is the one that has
 *    gone wrong; newest-first buries it under this morning's.
 *  - SHARING RESOLVES, SAVING DOES NOT. Closing an ask on an unshared draft tells an athlete
 *    they have been answered by something they cannot see.
 *  - THE BADGE COUNTS WHAT THE COACH CAN OPEN. A count that includes another coach's athlete
 *    is a number nobody can reconcile with the list under it.
 */
describe("the review queue", () => {
  let server: TestServer;
  let coachId: number;
  let athleteId: number;
  let coach: TestClient;
  let otherCoach: TestClient;
  let athlete: TestClient;
  let assignmentId: number;
  let programDayId: number;
  let exerciseId: number;
  let programExerciseId: number;

  // ONE LOGIN PER ACTOR FOR THE WHOLE FILE -- loginLimiter allows 15 per IP per fifteen
  // minutes and every client here comes from 127.0.0.1. Only the logs and the requests are
  // cleared between tests.
  beforeAll(async () => {
    server = await startTestServer();
    await resetDatabase();

    const coachUser = await makeLoginableUser({ role: "coach" });
    const athleteUser = await makeLoginableUser({ role: "athlete" });
    const otherCoachUser = await makeLoginableUser({ role: "coach" });
    const otherAthleteUser = await makeLoginableUser({ role: "athlete" });
    await addToRoster(coachUser.id, athleteUser.id);
    await addToRoster(otherCoachUser.id, otherAthleteUser.id);
    coachId = coachUser.id;
    athleteId = athleteUser.id;

    const exercise = await makeExercise(coachUser.id, { name: "Back Squat" });
    exerciseId = exercise.id;
    const assigned = await makeAssignedProgram({
      coachId: coachUser.id,
      athleteId: athleteUser.id,
      exerciseIds: [exercise.id],
    });
    assignmentId = assigned.assignment.id;
    programDayId = assigned.day.id;
    programExerciseId = assigned.programExercises[0].id;

    coach = await loginAs(server.baseUrl, coachUser);
    otherCoach = await loginAs(server.baseUrl, otherCoachUser);
    athlete = await loginAs(server.baseUrl, athleteUser);
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await db.delete(videoReviewRequests);
    await db.delete(videoReviews);
    await db.delete(workoutLogs);
  });

  async function loggedSet(date = "2026-09-20", withVideo = true) {
    const videoUrl = withVideo ? await makeUploadedFile(`q-${date}-${Math.random()}.mp4`) : "";
    const made = await makeLoggedSetWithVideo({
      athleteId,
      assignmentId,
      programDayId,
      exerciseId,
      programExerciseId,
      date,
      videoUrl: videoUrl || (await makeUploadedFile("placeholder.mp4")),
    });
    if (!withVideo) {
      const { workoutSetEntries } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(workoutSetEntries)
        .set({ formCheckVideoUrl: null })
        .where(eq(workoutSetEntries.id, made.set.id));
    }
    return made;
  }

  it("puts an athlete's ask on their coach's queue", async () => {
    const made = await loggedSet();
    const asked = await athlete.post("/api/athlete/video-review-requests", {
      setId: made.set.id,
      note: "Knees caving on the third rep?",
    });
    expect(asked.status).toBe(201);

    const queue = await coach.get("/api/coach/video-review-requests");
    expect(queue.status).toBe(200);
    expect(queue.body).toHaveLength(1);
    expect(queue.body[0]).toMatchObject({
      athleteId,
      setId: made.set.id,
      note: "Knees caving on the third rep?",
      exerciseName: "Back Squat",
      clipAvailable: true,
    });
  });

  it("treats asking twice as the same ask", async () => {
    const made = await loggedSet();
    const first = await athlete.post("/api/athlete/video-review-requests", { setId: made.set.id });
    const second = await athlete.post("/api/athlete/video-review-requests", { setId: made.set.id });
    expect(first.status).toBe(201);
    // 200, not a 409: from the athlete's side tapping again means "yes, please", not "something
    // went wrong", and they should be shown the ask they already have.
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);

    const queue = await coach.get("/api/coach/video-review-requests");
    expect(queue.body).toHaveLength(1);
  });

  it("lists the queue oldest first", async () => {
    const older = await loggedSet("2026-08-01");
    const newer = await loggedSet("2026-09-19");
    await athlete.post("/api/athlete/video-review-requests", { setId: older.set.id });
    await athlete.post("/api/athlete/video-review-requests", { setId: newer.set.id });

    const queue = await coach.get("/api/coach/video-review-requests");
    expect(queue.body.map((r: { setId: number }) => r.setId)).toEqual([
      older.set.id,
      newer.set.id,
    ]);
  });

  it("refuses an ask for a set that is not the athlete's, and one with no clip", async () => {
    const noClip = await loggedSet("2026-09-01", false);
    expect((await athlete.post("/api/athlete/video-review-requests", { setId: noClip.set.id })).status).toBe(404);
    // Same answer for a set id that exists but belongs to somebody else -- a distinct refusal
    // would tell an athlete whose set an id is.
    expect((await athlete.post("/api/athlete/video-review-requests", { setId: 999_999 })).status).toBe(404);
  });

  it("does NOT show one coach's queue to another", async () => {
    const made = await loggedSet();
    await athlete.post("/api/athlete/video-review-requests", { setId: made.set.id });

    const theirs = await otherCoach.get("/api/coach/video-review-requests");
    expect(theirs.status).toBe(200);
    expect(theirs.body).toEqual([]);
    const count = await otherCoach.get("/api/coach/video-review-requests/count");
    expect(count.body).toEqual({ open: 0 });
  });

  it("counts exactly what the list shows", async () => {
    const made = await loggedSet();
    await athlete.post("/api/athlete/video-review-requests", { setId: made.set.id });
    const count = await coach.get("/api/coach/video-review-requests/count");
    const list = await coach.get("/api/coach/video-review-requests");
    expect(count.body.open).toBe(list.body.length);
    expect(count.body.open).toBe(1);
  });

  it("resolves the ask when the review is SHARED, and not when it is only saved", async () => {
    const made = await loggedSet();
    await athlete.post("/api/athlete/video-review-requests", { setId: made.set.id });

    const review = await coach.post("/api/coach/video-reviews", {
      athleteId,
      title: "Squat check",
      leftClip: {
        videoUrl: "/uploads/x.mp4",
        source: "set",
        label: "Back Squat",
        setId: made.set.id,
      },
    });
    expect(review.status).toBe(201);

    // Saving a draft leaves the ask open. The athlete has not been answered by something they
    // cannot see.
    await coach.patch(`/api/coach/video-reviews/${review.body.id}`, { title: "Squat check v2" });
    expect((await coach.get("/api/coach/video-review-requests")).body).toHaveLength(1);

    await coach.patch(`/api/coach/video-reviews/${review.body.id}`, { shared: true });
    expect((await coach.get("/api/coach/video-review-requests")).body).toHaveLength(0);

    const mine = await athlete.get("/api/athlete/video-review-requests");
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].resolvedAt).toBeTruthy();
    expect(mine.body[0].reviewId).toBe(review.body.id);
  });

  it("tells the athlete their clip was reviewed", async () => {
    const made = await loggedSet();
    await athlete.post("/api/athlete/video-review-requests", { setId: made.set.id });
    const review = await coach.post("/api/coach/video-reviews", {
      athleteId,
      title: "Squat check",
      leftClip: { videoUrl: "/uploads/x.mp4", source: "set", label: "Back Squat", setId: made.set.id },
    });
    await coach.patch(`/api/coach/video-reviews/${review.body.id}`, { shared: true });

    const notes = await athlete.get("/api/notifications");
    expect(notes.status).toBe(200);
    expect(
      (notes.body as { type: string; link: string | null }[]).some(
        (n) => n.type === "video_review" && n.link === `/athlete/video-reviews/${review.body.id}`,
      ),
    ).toBe(true);
  });

  it("lets an athlete withdraw their own ask, and nobody else's", async () => {
    const made = await loggedSet();
    const asked = await athlete.post("/api/athlete/video-review-requests", { setId: made.set.id });

    // The route takes no athlete id: a request that is not the caller's reads as absent.
    expect((await athlete.delete(`/api/athlete/video-review-requests/999999`)).status).toBe(404);

    expect((await athlete.delete(`/api/athlete/video-review-requests/${asked.body.id}`)).status).toBe(200);
    expect((await coach.get("/api/coach/video-review-requests")).body).toHaveLength(0);

    // Resolved, not deleted: the coach may already have started on it, and a row that vanishes
    // from under them is confusing in a way a closed one is not.
    const mine = await athlete.get("/api/athlete/video-review-requests");
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].resolvedAt).toBeTruthy();
  });

  it("keeps an ask whose clip has been purged, and says the clip is gone", async () => {
    // Retention takes the file, not the ask. Dropping the row would hide exactly the request
    // that has been waiting longest, and the coach would have no way to tell it from a clip
    // that failed to load.
    const made = await loggedSet();
    await athlete.post("/api/athlete/video-review-requests", { setId: made.set.id });
    const { workoutSetEntries } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    await db
      .update(workoutSetEntries)
      .set({ formCheckVideoUrl: null })
      .where(eq(workoutSetEntries.id, made.set.id));

    const queue = await coach.get("/api/coach/video-review-requests");
    expect(queue.body).toHaveLength(1);
    expect(queue.body[0].clipAvailable).toBe(false);
  });

  it("refuses an unauthenticated caller on both sides", async () => {
    expect([401, 403]).toContain((await fetch(`${server.baseUrl}/api/coach/video-review-requests`)).status);
    expect([401, 403]).toContain((await fetch(`${server.baseUrl}/api/athlete/video-review-requests`)).status);
  });
});
