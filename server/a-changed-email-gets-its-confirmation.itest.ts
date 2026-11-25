import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "@shared/schema";
import { testOutbox } from "./email";
import { resetDatabase } from "./test-support/fixtures";
import { waitForEmailTo } from "./test-support/wait-for-email";
import { loginAs, makeLoginableUser, startTestServer, TEST_PASSWORD, type TestServer } from "./test-support/http-app";

/** 2026-11-25: an athlete corrected a mistyped signup address and "never got an email to
 *  confirm". Changing the address cleared emailVerified and deleted the old link, and nothing sent
 *  a new one. The route sends it itself now, to the NEW address, and the link it carries works. */
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

describe("a changed email gets its confirmation link", () => {
  it("sends the link to the new address, and the link confirms it", async () => {
    const athlete = await makeLoginableUser({ role: "athlete" });
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, athlete.id));
    const client = await loginAs(server.baseUrl, athlete);
    testOutbox.length = 0;

    const res = await client.patch("/api/account/email", { password: TEST_PASSWORD, newEmail: "Fixed.Address@Example.edu" });
    expect(res.status).toBe(200);
    expect(res.body.confirmationSent).toBe(true);

    const sent = await waitForEmailTo("fixed.address@example.edu", "Confirm your Forge email");
    const token = /verify-email\?token=([A-Za-z0-9_-]+)/.exec(sent.html)?.[1];
    expect(token).toBeTruthy();

    const [before] = await db.select({ v: users.emailVerified }).from(users).where(eq(users.id, athlete.id));
    expect(before.v).toBe(false);
    expect((await client.post("/api/auth/verify-email", { token })).status).toBe(204);
    const [after] = await db.select({ v: users.emailVerified }).from(users).where(eq(users.id, athlete.id));
    expect(after.v).toBe(true);
  });

  it("changes nothing when the password is wrong", async () => {
    const athlete = await makeLoginableUser({ role: "athlete" });
    const client = await loginAs(server.baseUrl, athlete);
    testOutbox.length = 0;
    const res = await client.patch("/api/account/email", { password: "wrong-password-1!", newEmail: "other@example.edu" });
    expect(res.status).toBe(401);
    const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, athlete.id));
    expect(row.email).toBe(athlete.email);
  });
});
