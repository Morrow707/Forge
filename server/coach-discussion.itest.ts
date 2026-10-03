import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/** Coaches Corner peer discussion (2026-10-03): coaches with the add-on post by name, a coach
 * removes only their own, a hidden post is never served to a coach, a locked thread takes no
 * replies, and every report lands in the admin queue. Beta accounts are comped, so every
 * coach here has the add-on; the 402 branch is covered by the entitlement tests elsewhere. */

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

describe("the discussion board", () => {
  it("posts, replies, removes own only, and reports into the admin queue", async () => {
    const a = await makeLoginableUser({ role: "coach", name: "Coach A" });
    const b = await makeLoginableUser({ role: "coach", name: "Coach B" });
    const admin = await makeLoginableUser({ role: "admin" });
    const ca = await loginAs(server.baseUrl, a);
    const cb = await loginAs(server.baseUrl, b);
    const cadmin = await loginAs(server.baseUrl, admin);

    const created = await ca.post("/api/coach/discussion/threads", { title: "In-season lifting", body: "How often?" });
    expect(created.status).toBe(201);
    const threadId = created.body.id;

    const replied = await cb.post(`/api/coach/discussion/threads/${threadId}/replies`, { body: "Twice, short." });
    expect(replied.status).toBe(201);
    const list = await cb.get("/api/coach/discussion/threads");
    expect(list.body.find((t: any) => t.id === threadId)).toMatchObject({ replyCount: 1, author: { name: "Coach A" } });

    // B cannot remove A's thread; A can.
    expect((await cb.delete(`/api/coach/discussion/threads/${threadId}`)).status).toBe(404);
    // B reports A's thread first.
    expect((await cb.post(`/api/coach/discussion/threads/${threadId}/report`, { reason: "Names a kid" })).status).toBe(201);
    const queue = await cadmin.get("/api/admin/discussion/reports");
    expect(queue.body).toHaveLength(1);
    expect(queue.body[0]).toMatchObject({ reason: "Names a kid", reporter: { name: "Coach B" }, thread: { id: threadId } });

    // Admin hides it: coaches no longer see it, the admin still does with the reason.
    expect((await cadmin.patch(`/api/admin/discussion/threads/${threadId}`, { hidden: true, reason: "Athlete named" })).status).toBe(200);
    expect((await cb.get(`/api/coach/discussion/threads/${threadId}`)).status).toBe(404);
    expect((await cb.get("/api/coach/discussion/threads")).body.find((t: any) => t.id === threadId)).toBeUndefined();
    const adminView = await cadmin.get(`/api/admin/discussion/threads/${threadId}`);
    expect(adminView.body.hiddenReason).toBe("Athlete named");
    expect((await cadmin.post(`/api/admin/discussion/reports/${queue.body[0].id}/resolve`, { resolution: "Hidden" })).status).toBe(200);
    expect((await cadmin.get("/api/admin/discussion/reports")).body).toHaveLength(0);

    // Unhide, then A removes their own: hidden with the author reason, gone for B.
    await cadmin.patch(`/api/admin/discussion/threads/${threadId}`, { hidden: false });
    expect((await cb.get(`/api/coach/discussion/threads/${threadId}`)).status).toBe(200);
    expect((await ca.delete(`/api/coach/discussion/threads/${threadId}`)).status).toBe(204);
    expect((await cb.get(`/api/coach/discussion/threads/${threadId}`)).status).toBe(404);
  });

  it("a locked thread takes no replies, and a hidden reply is withheld from coaches", async () => {
    const a = await makeLoginableUser({ role: "coach" });
    const admin = await makeLoginableUser({ role: "admin" });
    const ca = await loginAs(server.baseUrl, a);
    const cadmin = await loginAs(server.baseUrl, admin);
    const t = await ca.post("/api/coach/discussion/threads", { title: "Welcome", body: "Read the rules." });
    const r = await ca.post(`/api/coach/discussion/threads/${t.body.id}/replies`, { body: "Will do." });
    await cadmin.patch(`/api/admin/discussion/replies/${r.body.id}`, { hidden: true });
    expect((await ca.get(`/api/coach/discussion/threads/${t.body.id}`)).body.replies).toHaveLength(0);
    await cadmin.patch(`/api/admin/discussion/threads/${t.body.id}`, { locked: true, pinned: true });
    expect((await ca.post(`/api/coach/discussion/threads/${t.body.id}/replies`, { body: "One more" })).status).toBe(409);
    expect((await ca.get("/api/coach/discussion/threads")).body[0]).toMatchObject({ id: t.body.id, pinned: true, locked: true });
  });

  it("an athlete cannot reach the board at all", async () => {
    const athlete = await makeLoginableUser({ role: "athlete" });
    const c = await loginAs(server.baseUrl, athlete);
    expect((await c.get("/api/coach/discussion/threads")).status).toBe(403);
  });
});
