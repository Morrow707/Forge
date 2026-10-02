import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { emailListSubscribers } from "@shared/schema";
import { testOutbox } from "./email";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, TestClient, type TestServer } from "./test-support/http-app";

/** THE LAUNCH EMAIL LIST, through the real routes. The rules under test are the ones in
 * server/email-list.ts's header: a join answers the same whether or not the address was already
 * there; the unsubscribe link only opens a page and the POST is what acts; an unsubscribe keeps
 * the row and a send never reaches it; the recipients are read at send time; a test send goes
 * to the admin alone and is not a campaign. */

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

const anon = () => new TestClient(server.baseUrl);

describe("POST /api/public/email-list", () => {
  it("joins, lower-cases, and answers identically for a repeat", async () => {
    const first = await anon().post("/api/public/email-list", { email: "  Fan@Example.test ", source: "footer" });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true });
    const again = await anon().post("/api/public/email-list", { email: "fan@example.test", source: "signup" });
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    const rows = await db.select().from(emailListSubscribers);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("fan@example.test");
    expect(rows[0].source).toBe("footer");
    expect(rows[0].unsubscribeToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses something that is not an address", async () => {
    const res = await anon().post("/api/public/email-list", { email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(await db.select().from(emailListSubscribers)).toHaveLength(0);
  });
});

describe("unsubscribe", () => {
  it("is a POST with the token; the row stays, flagged, and a re-join clears the flag", async () => {
    await anon().post("/api/public/email-list", { email: "leaver@example.test" });
    const [row] = await db.select().from(emailListSubscribers);
    const res = await anon().post("/api/public/email-list/unsubscribe", { token: row.unsubscribeToken });
    expect(res.status).toBe(200);
    const [after] = await db.select().from(emailListSubscribers).where(eq(emailListSubscribers.id, row.id));
    expect(after.unsubscribedAt).not.toBeNull();
    // Pressing the button twice is still "done".
    expect((await anon().post("/api/public/email-list/unsubscribe", { token: row.unsubscribeToken })).status).toBe(200);
    // A guessed token is not.
    expect((await anon().post("/api/public/email-list/unsubscribe", { token: "f".repeat(64) })).status).toBe(404);
    expect((await anon().post("/api/public/email-list/unsubscribe", { token: "short" })).status).toBe(400);
    // Re-joining is the person's choice and clears the flag.
    await anon().post("/api/public/email-list", { email: "leaver@example.test" });
    const [rejoined] = await db.select().from(emailListSubscribers).where(eq(emailListSubscribers.id, row.id));
    expect(rejoined.unsubscribedAt).toBeNull();
    expect(rejoined.unsubscribeToken).toBe(row.unsubscribeToken);
  });

  it("the unsubscribe route never answers a GET", async () => {
    const res = await anon().get("/api/public/email-list/unsubscribe?token=" + "a".repeat(64));
    expect(res.status).not.toBe(200);
    expect(await db.select().from(emailListSubscribers)).toHaveLength(0);
  });
});

describe("admin", () => {
  it("the list is admin-only", async () => {
    const athlete = await makeLoginableUser({ role: "athlete" });
    const client = await loginAs(server.baseUrl, athlete);
    expect((await client.get("/api/admin/email-list")).status).toBe(403);
    expect((await client.post("/api/admin/email-list/send", { subject: "x", body: "y" })).status).toBe(403);
    expect((await anon().get("/api/admin/email-list")).status).toBe(401);
  });

  it("a send reaches the active list at send time with an unsubscribe link, and skips the unsubscribed", async () => {
    await anon().post("/api/public/email-list", { email: "a@example.test" });
    await anon().post("/api/public/email-list", { email: "b@example.test" });
    await anon().post("/api/public/email-list", { email: "gone@example.test" });
    const [gone] = await db.select().from(emailListSubscribers).where(eq(emailListSubscribers.email, "gone@example.test"));
    await anon().post("/api/public/email-list/unsubscribe", { token: gone.unsubscribeToken });

    const admin = await makeLoginableUser({ role: "admin" });
    const client = await loginAs(server.baseUrl, admin);
    // Signing in sends the admin a new-login notice; the mailing is what is under test.
    testOutbox.length = 0;

    const before = await client.get("/api/admin/email-list");
    expect(before.status).toBe(200);
    expect(before.body.active).toBe(2);
    expect(before.body.unsubscribed).toBe(1);

    // Somebody leaves between the screen loading and Send being pressed.
    const [b] = await db.select().from(emailListSubscribers).where(eq(emailListSubscribers.email, "b@example.test"));
    await anon().post("/api/public/email-list/unsubscribe", { token: b.unsubscribeToken });

    const sent = await client.post("/api/admin/email-list/send", {
      subject: "Forge opens next month",
      body: "First paragraph with a link https://forgeperformancesystems.com/pricing here.\n\nSecond <b>paragraph</b>.",
    });
    expect(sent.status).toBe(200);

    expect(testOutbox.map((m) => m.to)).toEqual(["a@example.test"]);
    const [mail] = testOutbox;
    expect(mail.subject).toBe("Forge opens next month");
    const [a] = await db.select().from(emailListSubscribers).where(eq(emailListSubscribers.email, "a@example.test"));
    expect(mail.html).toContain(`/unsubscribe?token=${a.unsubscribeToken}`);
    expect(mail.html).toContain('<a href="https://forgeperformancesystems.com/pricing"');
    // Typed markup is text, not markup.
    expect(mail.html).toContain("&lt;b&gt;paragraph&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>paragraph</b>");

    const after = await client.get("/api/admin/email-list");
    expect(after.body.campaigns).toHaveLength(1);
    expect(after.body.campaigns[0]).toMatchObject({ recipientCount: 1, sentCount: 1, failedCount: 0 });
    expect(after.body.campaigns[0].finishedAt).not.toBeNull();

    const csv = await client.get("/api/admin/email-list.csv");
    expect(csv.status).toBe(200);
    expect(String(csv.body)).toContain("a@example.test");
    expect(String(csv.body)).not.toContain("gone@example.test");
  });

  it("a test send goes to the admin alone and is not a campaign", async () => {
    await anon().post("/api/public/email-list", { email: "a@example.test" });
    const admin = await makeLoginableUser({ role: "admin" });
    const client = await loginAs(server.baseUrl, admin);
    testOutbox.length = 0;
    const res = await client.post("/api/admin/email-list/send-test", { subject: "Hello", body: "Body" });
    expect(res.status).toBe(200);
    expect(testOutbox.map((m) => m.to)).toEqual([admin.email]);
    expect(testOutbox[0].subject).toBe("[TEST] Hello");
    const list = await client.get("/api/admin/email-list");
    expect(list.body.campaigns).toHaveLength(0);
  });
});
