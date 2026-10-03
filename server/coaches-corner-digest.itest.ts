import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testOutbox } from "./email";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/** The monthly Coaches Corner digest (2026-10-03): drafted from what changed, sent to every
 * coach with the add-on who wants email, with the coach footer and no unsubscribe token. */

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(async () => {
  await resetDatabase();
  testOutbox.length = 0;
});

describe("the digest", () => {
  it("drafts what's new and goes to coaches who want email, never to athletes", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const wants = await makeLoginableUser({ role: "coach", notifyEmail: true });
    const quiet = await makeLoginableUser({ role: "coach", notifyEmail: false });
    await makeLoginableUser({ role: "athlete", notifyEmail: true });
    const ca = await loginAs(server.baseUrl, admin);
    await ca.post("/api/admin/academy/tracks", {
      title: "Brand new track",
      description: "Fresh.",
      keyPrinciplesForAi: "k",
      lessons: [{ lessonNumber: 1, title: "L", content: "c", estMinutes: 3, sources: [] }],
      quizQuestions: [],
    });

    const draft = await ca.get("/api/admin/coaches-corner/digest-draft");
    expect(draft.status).toBe(200);
    expect(draft.body.body).toContain("Brand new track");
    expect(draft.body.newTrackCount).toBe(1);
    expect(draft.body.recipientCount).toBe(1);

    testOutbox.length = 0;
    const sent = await ca.post("/api/admin/coaches-corner/digest/send", { subject: draft.body.subject, body: draft.body.body });
    expect(sent.status).toBe(200);
    expect(sent.body.recipientCount).toBe(1);
    const mails = testOutbox.filter((m) => m.subject === draft.body.subject);
    expect(mails.map((m) => m.to)).toEqual([wants.email]);
    expect(mails[0].html).toContain("your Forge account has Coaches Corner");
    expect(mails[0].html).not.toContain("/unsubscribe?token=");
    expect(testOutbox.some((m) => m.to === quiet.email && m.subject === draft.body.subject)).toBe(false);

    const list = await ca.get("/api/admin/coaches-corner/digests");
    expect(list.body[0]).toMatchObject({ audience: "coaches_corner", recipientCount: 1, sentCount: 1 });
    // The launch-list screen does not list it.
    const launch = await ca.get("/api/admin/email-list");
    expect(launch.body.campaigns.every((c: any) => c.audience === "launch_list")).toBe(true);
  });
});
