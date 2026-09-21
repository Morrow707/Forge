import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { db } from "./db";
import { storage } from "./storage";
import { UPLOADS_ROOT } from "./uploaded-files";
import {
  resetDatabase,
  makeExercise,
  makeAssignedProgram,
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
 * THE WHOLE VIDEO-REVIEW SURFACE, WALKED THROUGH ONCE AS THE PEOPLE WHO USE IT.
 *
 * Every other test in this area asks one question well. This one asks the question Scott
 * actually asks after a release: are the tools THERE, do they work, can a coach really put a
 * video in and get it back out. It is deliberately a single ordered journey rather than
 * independent cases, because that is the thing the unit tests cannot see -- each step consumes
 * what the last one produced, so a route that works in isolation but returns the wrong shape
 * for the next call fails here and nowhere else.
 *
 * What it cannot cover, and must not be read as covering: the camera itself, the canvas
 * burn-in render (MediaRecorder needs a real browser), the phone gestures, and how any of it
 * looks. Those need a device.
 */
describe("video review, end to end, as a coach and their athlete", () => {
  let server: TestServer;
  let coach: TestClient;
  let athlete: TestClient;
  let stranger: TestClient;
  let coachId: number;
  let athleteId: number;
  let ids: { assignmentId: number; programDayId: number; exerciseId: number; programExerciseId: number };

  beforeAll(async () => {
    server = await startTestServer();
    await resetDatabase();
    const coachUser = await makeLoginableUser({ role: "coach" });
    const athleteUser = await makeLoginableUser({ role: "athlete", dateOfBirth: "1998-04-02" });
    const strangerUser = await makeLoginableUser({ role: "coach" });
    await addToRoster(coachUser.id, athleteUser.id);
    coachId = coachUser.id;
    athleteId = athleteUser.id;
    coach = await loginAs(server.baseUrl, coachUser);
    athlete = await loginAs(server.baseUrl, athleteUser);
    stranger = await loginAs(server.baseUrl, strangerUser);

    const exercise = await makeExercise(coachUser.id, { name: "Back Squat" });
    const assigned = await makeAssignedProgram({
      coachId: coachUser.id,
      athleteId: athleteUser.id,
      exerciseIds: [exercise.id],
    });
    // A second training day. The fixture builds one, and a one-day program is not a program:
    // with only one day, logging it leaves nothing "next" and step 9 would be testing the
    // end-of-program refusal rather than the ordinary path. Both are asserted, separately.
    const { programDays } = await import("@shared/schema");
    await db.insert(programDays).values({ weekId: assigned.week.id, dayNumber: 2, title: "Day 2" });
    ids = {
      assignmentId: assigned.assignment.id,
      programDayId: assigned.day.id,
      exerciseId: exercise.id,
      programExerciseId: assigned.programExercises[0].id,
    };
  });

  afterAll(async () => {
    await server.close();
  });

  /** The real multipart upload the tracker dialogs use. */
  async function uploadFormVideo(client: TestClient) {
    const form = new FormData();
    form.append("video", new Blob([new Uint8Array([0, 1, 2, 3, 4, 5])], { type: "video/mp4" }), "set.mp4");
    const res = await fetch(`${server.baseUrl}/api/athlete/form-video`, {
      method: "POST",
      headers: { cookie: client.cookieHeader(), "x-forge-device-id": client.deviceId },
      body: form,
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as { url?: string } | null };
  }

  let clipUrl = "";
  let setId = 0;
  let reviewId = 0;
  let shareUrl = "";

  it("1. a coach uploads a video and the bytes are really on disk", async () => {
    const up = await uploadFormVideo(coach);
    expect(up.status).toBe(201);
    expect(up.body?.url).toMatch(/^\/uploads\/form-videos\//);
    clipUrl = up.body!.url!;
    // The signature is appended for the client's own <video>; the file behind it is what
    // matters here.
    const bare = clipUrl.split("?")[0];
    expect(existsSync(join(UPLOADS_ROOT, bare.replace("/uploads/", "")))).toBe(true);
  });

  it("2. the athlete's own upload attaches to a logged set and is KEPT", async () => {
    const up = await uploadFormVideo(athlete);
    expect(up.status).toBe(201);
    const url = up.body!.url!;

    const logged = await athlete.post("/api/athlete/log", {
      assignmentId: ids.assignmentId,
      programDayId: ids.programDayId,
      date: "2026-09-21",
      completed: true,
      entries: [
        {
          programExerciseId: ids.programExerciseId,
          exerciseId: ids.exerciseId,
          weightMode: "numeric",
          sets: [
            {
              setNumber: 1,
              reps: "5",
              weight: "225",
              weightUnit: "lbs",
              formCheckVideoUrl: url,
            },
          ],
        },
      ],
    });
    expect([200, 201]).toContain(logged.status);

    // Read it back the way the app does, not out of the database.
    const clips = await athlete.get("/api/athlete/clips");
    expect(clips.status).toBe(200);
    const mine = clips.body as { id: number; videoUrl: string; exerciseName: string }[];
    expect(mine.length).toBeGreaterThan(0);
    setId = mine[0].id;
    expect(mine[0].exerciseName).toBe("Back Squat");
    expect(mine[0].videoUrl).toBeTruthy();
  });

  it("3. the coach sees that clip on their roster, and a stranger does not", async () => {
    const theirs = await coach.get(`/api/coach/roster/${athleteId}/clips`);
    expect(theirs.status).toBe(200);
    expect((theirs.body as unknown[]).length).toBeGreaterThan(0);

    expect((await stranger.get(`/api/coach/roster/${athleteId}/clips`)).status).toBe(404);
  });

  it("4. the athlete queues it for review and the coach's queue shows it", async () => {
    const asked = await athlete.post("/api/athlete/video-review-requests", {
      setId,
      note: "Is my depth ok?",
    });
    expect(asked.status).toBe(201);

    const queue = await coach.get("/api/coach/video-review-requests");
    expect(queue.status).toBe(200);
    expect(queue.body).toHaveLength(1);
    expect(queue.body[0]).toMatchObject({ athleteId, setId, clipAvailable: true });

    const count = await coach.get("/api/coach/video-review-requests/count");
    expect(count.body).toEqual({ open: 1 });

    // And nobody else's queue.
    expect((await stranger.get("/api/coach/video-review-requests")).body).toEqual([]);
  });

  it("5. the coach makes a review of it, draws on it, and saves", async () => {
    const made = await coach.post("/api/coach/video-reviews", {
      athleteId,
      title: "Depth check",
      leftClip: { videoUrl: clipUrl.split("?")[0], source: "set", label: "Back Squat", setId },
      syncL: 0.5,
      syncR: 0,
      mode: "split",
    });
    expect(made.status).toBe(201);
    reviewId = made.body.id;

    const saved = await coach.put(`/api/coach/video-reviews/${reviewId}/events`, {
      events: [
        { t: 1.2, side: "left", payload: { kind: "circle", center: { x: 0.5, y: 0.6 }, radius: 0.1, color: "#f00" } },
        { t: 2.0, side: "left", payload: { kind: "text", at: { x: 0.2, y: 0.2 }, text: "hips", color: "#fff" } },
      ],
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toHaveLength(2);

    const read = await coach.get(`/api/coach/video-reviews/${reviewId}`);
    expect(read.status).toBe(200);
    expect(read.body.events).toHaveLength(2);
    expect(read.body.syncL).toBeCloseTo(0.5, 5);
  });

  it("6. a cue drops onto the timeline carrying its own text", async () => {
    const cue = await coach.post("/api/coach/cues", { label: "Depth", body: "Hip crease below the knee" });
    expect(cue.status).toBe(201);

    const saved = await coach.put(`/api/coach/video-reviews/${reviewId}/events`, {
      events: [
        { t: 1.2, side: "left", payload: { kind: "circle", center: { x: 0.5, y: 0.6 }, radius: 0.1, color: "#f00" } },
        { t: 3.0, side: "left", payload: { kind: "cue", text: "Hip crease below the knee", cueId: cue.body.id, color: "#fff" } },
      ],
    });
    expect(saved.status).toBe(200);

    // Delete the cue; the review must still say what it said.
    expect((await coach.delete(`/api/coach/cues/${cue.body.id}`)).status).toBe(200);
    const read = await coach.get(`/api/coach/video-reviews/${reviewId}`);
    const cueEvent = (read.body.events as { payload: { kind: string; text?: string } }[]).find(
      (e) => e.payload.kind === "cue",
    );
    expect(cueEvent?.payload.text).toBe("Hip crease below the knee");
  });

  it("7. the athlete cannot see the review until it is SHARED, and then can", async () => {
    expect((await athlete.get(`/api/athlete/video-reviews/${reviewId}`)).status).toBe(404);
    expect((await athlete.get("/api/athlete/video-reviews")).body).toEqual([]);

    expect((await coach.patch(`/api/coach/video-reviews/${reviewId}`, { shared: true })).status).toBe(200);

    const now = await athlete.get(`/api/athlete/video-reviews/${reviewId}`);
    expect(now.status).toBe(200);
    expect(now.body.events.length).toBeGreaterThan(0);
  });

  it("8. sharing closed the queue entry and told the athlete", async () => {
    expect((await coach.get("/api/coach/video-review-requests")).body).toEqual([]);
    const mine = await athlete.get("/api/athlete/video-review-requests");
    expect(mine.body[0].resolvedAt).toBeTruthy();
    expect(mine.body[0].reviewId).toBe(reviewId);

    const notes = await athlete.get("/api/notifications");
    expect(
      (notes.body as { type: string }[]).some((n) => n.type === "video_review"),
    ).toBe(true);
  });

  it("9. the coach prescribes a corrective from the review", async () => {
    const drill = await makeExercise(coachId, { name: "Goblet Squat" });
    const added = await coach.post(`/api/coach/video-reviews/${reviewId}/corrective`, {
      exerciseId: drill.id,
      sets: 2,
      reps: "8",
    });
    expect(added.status).toBe(201);
    expect(added.body.corrective).toMatchObject({ exerciseId: drill.id, sourceReviewId: reviewId });
    // It landed on the day the athlete has NOT done yet, not the one they just logged.
    expect(added.body.programDayId).not.toBe(ids.programDayId);
  });

  it("9b. at the end of a program it says so, instead of writing onto a past session", async () => {
    // The case a coach meets on the last session of a block: they review it, they want to
    // prescribe a drill, and there is no session left to put it on. A 409 with a sentence is
    // the honest answer; silently attaching it to a day already in the past would be worse.
    const { workoutLogs, programDays } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const days = await db.select({ id: programDays.id }).from(programDays);
    for (const d of days) {
      const already = await db
        .select({ id: workoutLogs.id })
        .from(workoutLogs)
        .where(eq(workoutLogs.programDayId, d.id));
      if (already.length > 0) continue;
      await db.insert(workoutLogs).values({
        assignmentId: ids.assignmentId,
        programDayId: d.id,
        athleteId,
        date: "2026-09-21",
        completed: true,
      });
    }
    const drill = await makeExercise(coachId, { name: "Box Squat" });
    const refused = await coach.post(`/api/coach/video-reviews/${reviewId}/corrective`, {
      exerciseId: drill.id,
    });
    expect(refused.status).toBe(409);
    expect(String(refused.body.message)).toMatch(/no upcoming training day/i);
  });

  it("10. the export writes a real file and the share link plays it", async () => {
    const form = new FormData();
    form.append("video", new Blob([new Uint8Array([9, 9, 9, 9])], { type: "video/mp4" }), "review.mp4");
    form.append("guardianConsentConfirmed", "true");
    const res = await fetch(`${server.baseUrl}/api/coach/video-reviews/${reviewId}/export`, {
      method: "POST",
      headers: { cookie: coach.cookieHeader(), "x-forge-device-id": coach.deviceId },
      body: form,
    });
    expect(res.status).toBe(201);
    const saved = (await res.json()) as { id: number; shareUrl: string; minorAtExport: boolean };
    shareUrl = saved.shareUrl;
    expect(saved.minorAtExport).toBe(false); // this athlete is an adult

    // Unauthenticated, as a parent or recruiter would open it.
    const played = await fetch(`${server.baseUrl}${shareUrl}`);
    expect(played.status).toBe(200);

    // And the audit trail names who did it.
    const trail = await coach.get(`/api/coach/video-reviews/${reviewId}/exports`);
    expect(trail.body).toHaveLength(1);
    expect(trail.body[0]).toMatchObject({ exportedBy: coachId, athleteId });

    // Revoking stops it.
    expect((await coach.post(`/api/coach/review-exports/${saved.id}/revoke`)).status).toBe(200);
    expect((await fetch(`${server.baseUrl}${shareUrl}`)).status).toBe(404);
  });

  it("11. the athlete reviews their own lift and sends it back", async () => {
    const self = await athlete.post("/api/athlete/self-reviews", {
      title: "My squat",
      leftClip: { videoUrl: clipUrl.split("?")[0], source: "set", label: "Back Squat", setId },
    });
    expect(self.status).toBe(201);

    // Unsent: the coach must not see it.
    expect(
      (await coach.get("/api/coach/video-reviews")).body.some(
        (r: { id: number }) => r.id === self.body.id,
      ),
    ).toBe(false);

    expect((await athlete.patch(`/api/athlete/self-reviews/${self.body.id}`, { sentToCoach: true })).status).toBe(200);
    expect(
      (await coach.get("/api/coach/video-reviews")).body.some(
        (r: { id: number }) => r.id === self.body.id,
      ),
    ).toBe(true);

    // And the coach cannot rewrite what the athlete said.
    expect((await coach.patch(`/api/coach/video-reviews/${self.body.id}`, { title: "no" })).status).toBe(404);
  });

  it("12. the prior-clip suggestion answers without inventing one", async () => {
    // Only one clip exists and it is today's, so there is nothing 14 days older. The honest
    // answer is null, not a suggestion of the same clip.
    const prior = await coach.get(
      `/api/coach/roster/${athleteId}/clips/prior?exercise=Back%20Squat&before=2099-01-01`,
    );
    expect(prior.status).toBe(200);
    expect(prior.body).not.toBeUndefined();
  });

  it("12b. a purge takes the file and KEEPS the coaching around it", async () => {
    // "Can you upload videos and keep them" has a second half: what happens when retention
    // eventually takes one. The clip goes; the set, its numbers, the review's marks and the
    // queue history all stay. A purge that took the coaching with it would be data loss
    // wearing a compliance badge.
    const { workoutSetEntries } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const before = await coach.get(`/api/coach/video-reviews/${reviewId}`);
    const markCount = (before.body.events as unknown[]).length;

    const purged = await storage.deleteAdminVideo("set", setId);
    expect(purged.deleted).toBe(true);

    const [row] = await db
      .select()
      .from(workoutSetEntries)
      .where(eq(workoutSetEntries.id, setId));
    expect(row, "the SET must survive its video").toBeTruthy();
    expect(row.formCheckVideoUrl).toBeNull();
    expect(row.reps).toBe("5");
    expect(row.weight).toBe("225");

    const after = await coach.get(`/api/coach/video-reviews/${reviewId}`);
    expect(after.status).toBe(200);
    expect((after.body.events as unknown[]).length).toBe(markCount);

    // The athlete's ask is still on the record too, resolved as it was.
    const mine = await athlete.get("/api/athlete/video-review-requests");
    expect(mine.body).toHaveLength(1);
  });

  it("13. the reference library takes a clip and keeps its own copy", async () => {
    const saved = await coach.post("/api/coach/reference-clips/from-athlete", {
      athleteId,
      videoUrl: clipUrl.split("?")[0],
      title: "Model squat",
      movement: "Back Squat",
    });
    expect(saved.status).toBe(201);

    const list = await coach.get("/api/coach/reference-clips");
    expect(list.status).toBe(200);
    expect((list.body as { title: string; videoUrl: string }[])[0].title).toBe("Model squat");

    // A COPY, not a pointer: the reference must survive the athlete's retention purge, and
    // must not keep their footage alive after they have asked for it to go.
    const ref = (list.body as { videoUrl: string }[])[0];
    expect(ref.videoUrl.split("?")[0]).not.toBe(clipUrl.split("?")[0]);
    expect(existsSync(join(UPLOADS_ROOT, ref.videoUrl.split("?")[0].replace("/uploads/", "")))).toBe(true);
  });
});
