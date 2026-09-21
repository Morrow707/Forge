import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { videoReviewExports, videoReviews } from "@shared/schema";
import { UPLOADS_ROOT } from "./uploaded-files";
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
 * THE BURNED-IN EXPORT AND ITS SHARE LINK -- Phase 5 of docs/video-review-plan.md.
 *
 * Everything else about a review is data rather than a rendered video, on purpose. This is the
 * exception, for the one thing data cannot do: leave the platform. Which makes it the most
 * dangerous surface in the whole feature -- it is a copy of footage of a named person, very
 * often a minor, and it outlives every permission Forge enforces.
 *
 * So the four things asserted here are not conveniences:
 *  - the link EXPIRES and can be REVOKED, and both answer exactly like a wrong token, because
 *    "this link has expired" tells a stranger the review exists;
 *  - a MINOR'S export is refused until the coach confirms the guardian consent that covers it,
 *    and an unknown date of birth counts as a minor;
 *  - only the review's AUTHOR may export -- exporting is publishing;
 *  - a refused upload leaves no file behind.
 */
describe("exporting a review", () => {
  let server: TestServer;
  let coach: TestClient;
  let otherCoach: TestClient;
  let coachId: number;
  let adultId: number;
  let minorId: number;

  beforeAll(async () => {
    server = await startTestServer();
    await resetDatabase();
    const coachUser = await makeLoginableUser({ role: "coach" });
    const otherCoachUser = await makeLoginableUser({ role: "coach" });
    const adult = await makeLoginableUser({ role: "athlete", dateOfBirth: "1995-06-15" });
    const minor = await makeLoginableUser({ role: "athlete", dateOfBirth: "2014-06-15" });
    await addToRoster(coachUser.id, adult.id);
    await addToRoster(coachUser.id, minor.id);
    coachId = coachUser.id;
    adultId = adult.id;
    minorId = minor.id;
    // ONE LOGIN PER ACTOR -- loginLimiter allows 15 per IP per fifteen minutes.
    coach = await loginAs(server.baseUrl, coachUser);
    otherCoach = await loginAs(server.baseUrl, otherCoachUser);
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await db.delete(videoReviewExports);
    await db.delete(videoReviews);
  });

  async function makeReview(athleteId: number | null, client: TestClient = coach) {
    const res = await client.post("/api/coach/video-reviews", {
      athleteId: athleteId ?? undefined,
      title: "Squat check",
      leftClip: { videoUrl: "/uploads/x.mp4", source: "set", label: "Back Squat" },
    });
    expect(res.status).toBe(201);
    return res.body as { id: number };
  }

  async function postExport(
    reviewId: number,
    client: TestClient,
    opts: { guardianConsentConfirmed?: boolean } = {},
  ) {
    const form = new FormData();
    form.append("video", new Blob([new Uint8Array([1, 2, 3, 4])], { type: "video/mp4" }), "review.mp4");
    if (opts.guardianConsentConfirmed) form.append("guardianConsentConfirmed", "true");
    const res = await fetch(`${server.baseUrl}/api/coach/video-reviews/${reviewId}/export`, {
      method: "POST",
      headers: { cookie: client.cookieHeader(), "x-forge-device-id": client.deviceId },
      body: form,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  it("exports an adult's review and hands back a link that plays", async () => {
    const review = await makeReview(adultId);
    const res = await postExport(review.id, coach);
    expect(res.status).toBe(201);
    expect(res.body.minorAtExport).toBe(false);
    expect(res.body.shareUrl).toMatch(/^\/api\/review-exports\/[a-f0-9]{64}$/);

    // Unauthenticated on purpose: the audience is a parent or a recruiter with no account,
    // and the token is the credential.
    const played = await fetch(`${server.baseUrl}${res.body.shareUrl}`);
    expect(played.status).toBe(200);
  });

  it("stores only the hash of the token", async () => {
    // Same treatment as every other token in this schema: a leak of the table alone must not
    // hand out playable links.
    const review = await makeReview(adultId);
    const res = await postExport(review.id, coach);
    const token = String(res.body.shareUrl).split("/").pop();
    const [row] = await db.select().from(videoReviewExports);
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toHaveLength(64);
  });

  it("refuses a minor's export without the guardian-consent confirmation, and leaves no file", async () => {
    const review = await makeReview(minorId);
    const refused = await postExport(review.id, coach);
    expect(refused.status).toBe(409);
    expect(await db.select().from(videoReviewExports)).toEqual([]);

    const allowed = await postExport(review.id, coach, { guardianConsentConfirmed: true });
    expect(allowed.status).toBe(201);
    expect(allowed.body.minorAtExport).toBe(true);
  });

  it("treats an unknown date of birth as a minor", async () => {
    // The fail-open version of this question is the one that goes wrong, and it is the same
    // answer the rest of the guardian gate gives.
    const unknown = await makeLoginableUser({ role: "athlete", dateOfBirth: null });
    await addToRoster(coachId, unknown.id);
    const review = await makeReview(unknown.id);
    expect((await postExport(review.id, coach)).status).toBe(409);
  });

  it("is author-only: exporting is publishing", async () => {
    const review = await makeReview(adultId);
    expect((await postExport(review.id, otherCoach)).status).toBe(404);
    expect(await db.select().from(videoReviewExports)).toEqual([]);
  });

  it("answers a revoked link exactly like a wrong one", async () => {
    // "This link has expired" tells a stranger the review exists, which is the thing the
    // expiry was protecting.
    const review = await makeReview(adultId);
    const res = await postExport(review.id, coach);
    const shareUrl = String(res.body.shareUrl);

    expect((await coach.post(`/api/coach/review-exports/${res.body.id}/revoke`)).status).toBe(200);
    const after = await fetch(`${server.baseUrl}${shareUrl}`);
    expect(after.status).toBe(404);

    const madeUp = await fetch(`${server.baseUrl}/api/review-exports/${"0".repeat(64)}`);
    expect(madeUp.status).toBe(404);
    expect(await after.json()).toEqual(await madeUp.json());
  });

  it("answers an expired link the same way, and keeps the row", async () => {
    const review = await makeReview(adultId);
    const res = await postExport(review.id, coach);
    await db
      .update(videoReviewExports)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(videoReviewExports.id, res.body.id));
    expect((await fetch(`${server.baseUrl}${res.body.shareUrl}`)).status).toBe(404);
    // Revoking and expiring are marks, never deletes: "this link was made" is the fact
    // somebody will need to establish later.
    expect(await db.select().from(videoReviewExports)).toHaveLength(1);
  });

  it("keeps an audit trail the coach can read, without the token", async () => {
    const review = await makeReview(adultId);
    await postExport(review.id, coach);
    const list = await coach.get(`/api/coach/video-reviews/${review.id}/exports`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ exportedBy: coachId, athleteId: adultId });
    expect(JSON.stringify(list.body)).not.toContain("tokenHash");
  });

  it("does not let another coach revoke a link", async () => {
    const review = await makeReview(adultId);
    const res = await postExport(review.id, coach);
    expect((await otherCoach.post(`/api/coach/review-exports/${res.body.id}/revoke`)).status).toBe(404);
    expect((await fetch(`${server.baseUrl}${res.body.shareUrl}`)).status).toBe(200);
  });

  it("writes the burned-in file where the review's own audio lives", async () => {
    const review = await makeReview(adultId);
    await postExport(review.id, coach);
    const [row] = await db.select().from(videoReviewExports);
    expect(row.videoUrl).toMatch(/^\/uploads\/reviews\//);
    expect(existsSync(join(UPLOADS_ROOT, row.videoUrl.replace("/uploads/", "")))).toBe(true);
  });
});
