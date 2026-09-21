import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resetDatabase, db, makeUploadedFile } from "./test-support/fixtures";
import { referenceClips } from "@shared/schema";
import { UPLOADS_ROOT, deleteUploadedFile } from "./uploaded-files";
import {
  startTestServer,
  makeLoginableUser,
  addToRoster,
  loginAs,
  type TestServer,
} from "./test-support/http-app";

/**
 * A REFERENCE IS A COPY, AND THE COPY IS THE WHOLE POINT.
 *
 * A coach builds a library of model lifts, and one source of those is a roster athlete's own
 * clip. That clip is governed by the athlete's retention cap and their deletion rights. A
 * library entry that merely POINTED at their file would fail in one of two ways: it breaks when
 * the cap purges the clip, or -- far worse -- it keeps an athlete's footage alive after they
 * asked for it to be gone, in a place nobody thinks to look.
 *
 * So the file is copied and the copy belongs to the coach. This file asserts that directly:
 * delete the athlete's original and the reference must still play.
 */
describe("the coach's reference library", () => {
  let server: TestServer;
  let coachClient: Awaited<ReturnType<typeof loginAs>>;
  let otherCoachClient: Awaited<ReturnType<typeof loginAs>>;
  let athleteId: number;
  let strangerAthleteId: number;

  beforeAll(async () => {
    server = await startTestServer();
    await resetDatabase();
    const coach = await makeLoginableUser({ role: "coach" });
    const otherCoach = await makeLoginableUser({ role: "coach" });
    const athlete = await makeLoginableUser({ role: "athlete" });
    const stranger = await makeLoginableUser({ role: "athlete" });
    await addToRoster(coach.id, athlete.id);
    await addToRoster(otherCoach.id, stranger.id);
    athleteId = athlete.id;
    strangerAthleteId = stranger.id;
    coachClient = await loginAs(server.baseUrl, coach);
    otherCoachClient = await loginAs(server.baseUrl, otherCoach);
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(async () => {
    await db.delete(referenceClips);
  });

  const abs = (url: string) => join(UPLOADS_ROOT, url.replace("/uploads/", ""));

  it("copies the file, so the reference outlives the athlete's clip", async () => {
    const athleteClipUrl = await makeUploadedFile("athlete-squat.mp4");
    expect(existsSync(abs(athleteClipUrl))).toBe(true);

    const res = await coachClient.post("/api/coach/reference-clips/from-athlete", {
      athleteId,
      videoUrl: athleteClipUrl,
      title: "Model squat",
      movement: "Back Squat",
    });
    expect(res.status).toBe(201);
    const reference = res.body as { videoUrl: string; source: string; sourceAthleteId: number };

    // A DIFFERENT FILE, not the same path under a new name.
    expect(reference.videoUrl).not.toBe(athleteClipUrl);
    expect(reference.videoUrl).toMatch(/^\/uploads\/reference-clips\//);
    expect(existsSync(abs(reference.videoUrl))).toBe(true);

    // Provenance is recorded, and it is provenance -- not a live link.
    expect(reference.source).toBe("from_athlete");
    expect(reference.sourceAthleteId).toBe(athleteId);

    // The athlete's clip goes, as retention or a deletion request would take it.
    await deleteUploadedFile(athleteClipUrl);
    expect(existsSync(abs(athleteClipUrl))).toBe(false);
    // The reference is untouched. This is the assertion the whole design exists for.
    expect(existsSync(abs(reference.videoUrl))).toBe(true);
  });

  it("refuses to take a clip from an athlete the coach cannot see", async () => {
    const clip = await makeUploadedFile("not-mine.mp4");
    const res = await coachClient.post("/api/coach/reference-clips/from-athlete", {
      athleteId: strangerAthleteId,
      videoUrl: clip,
      title: "Someone else's lift",
    });
    expect(res.status).toBe(404);
  });

  it("refuses a clip path that does not exist", async () => {
    const res = await coachClient.post("/api/coach/reference-clips/from-athlete", {
      athleteId,
      videoUrl: "/uploads/form-videos/nope.mp4",
      title: "Ghost",
    });
    expect(res.status).toBe(404);
  });

  it("refuses a path that tries to escape the uploads root", async () => {
    // videoUrl is client-supplied. copyUploadedFile carries the same traversal guard
    // deleteUploadedFile does, and this is the assertion that it is actually wired up.
    const res = await coachClient.post("/api/coach/reference-clips/from-athlete", {
      athleteId,
      videoUrl: "/uploads/../../etc/passwd",
      title: "Nope",
    });
    expect(res.status).toBe(404);
  });

  it("does not show one coach another coach's library", async () => {
    const clip = await makeUploadedFile("mine.mp4");
    await coachClient.post("/api/coach/reference-clips/from-athlete", {
      athleteId,
      videoUrl: clip,
      title: "Mine",
    });
    expect((await coachClient.get("/api/coach/reference-clips")).body).toHaveLength(1);
    expect((await otherCoachClient.get("/api/coach/reference-clips")).body).toEqual([]);
  });

  it("deletes the copy with the row, and only for its owner", async () => {
    const clip = await makeUploadedFile("to-delete.mp4");
    const created = await coachClient.post("/api/coach/reference-clips/from-athlete", {
      athleteId,
      videoUrl: clip,
      title: "Temporary",
    });
    const ref = created.body as { id: number; videoUrl: string };

    // Another coach cannot delete it.
    expect((await otherCoachClient.delete(`/api/coach/reference-clips/${ref.id}`)).status).toBe(404);
    expect(existsSync(abs(ref.videoUrl))).toBe(true);

    expect((await coachClient.delete(`/api/coach/reference-clips/${ref.id}`)).status).toBe(200);
    expect(existsSync(abs(ref.videoUrl)), "the copy is the coach's, so it goes with the row").toBe(false);
  });

  it("refuses an unauthenticated caller", async () => {
    const res = await fetch(`${server.baseUrl}/api/coach/reference-clips`);
    expect([401, 403]).toContain(res.status);
  });
});
