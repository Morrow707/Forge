import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db, resetDatabase } from "./test-support/fixtures";
import { startTestServer, makeLoginableUser, TestClient, TEST_PASSWORD, trustClientDevice, type TestServer } from "./test-support/http-app";
import { testOutbox } from "./email";
import { deviceApprovals } from "@shared/schema";
import { eq } from "drizzle-orm";

/** A password alone signs in only on a device this account has used before. Everything else
 * waits on the email -- see server/trusted-devices.ts for the rule, and this file for the proof
 * that every branch of it does what the comment says. Runs the real login route, the real
 * approval rows, and reads the real email out of the test outbox, because the bug this guards
 * against (a link that approves on GET, a claim that works from the wrong device, a denial
 * that leaves a session alive) lives between those pieces, not inside any one of them. */

let server: TestServer;

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
});

afterAll(async () => {
  await server?.close();
});

beforeEach(() => {
  testOutbox.length = 0;
});

function lastApprovalLink(): { url: URL; token: string } {
  const mail = [...testOutbox].reverse().find((m) => m.subject.includes("New device"));
  if (!mail) throw new Error("no approval email was sent");
  const match = mail.html.match(/href="([^"]*\/device-approval\?token=[^"]+)"/);
  if (!match) throw new Error("approval email has no review link");
  const url = new URL(match[1].replace(/&amp;/g, "&"));
  return { url, token: url.searchParams.get("token")! };
}

describe("a new device waits on the email", () => {
  it("does not get a session from the password alone, and an email goes out", async () => {
    const user = await makeLoginableUser({ role: "athlete", name: "Riley Athlete" });
    const phone = new TestClient(server.baseUrl);
    const res = await phone.login(user.email, TEST_PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body.deviceApprovalRequired).toBe(true);
    expect(typeof res.body.pollToken).toBe("string");
    expect(res.body.emailHint).toMatch(/^.•••@/);
    expect(phone.hasSessionCookie()).toBe(false);
    const me = await phone.get("/api/auth/me");
    expect(me.status).toBe(401);
    const { url } = lastApprovalLink();
    expect(url.pathname).toBe("/device-approval");
  });

  it("opening the link does nothing by itself; the poll still says pending", async () => {
    const user = await makeLoginableUser({ role: "coach" });
    const laptop = new TestClient(server.baseUrl);
    const res = await laptop.login(user.email, TEST_PASSWORD);
    const { token } = lastApprovalLink();
    const anyBrowser = new TestClient(server.baseUrl);
    const review = await anyBrowser.get(`/api/auth/device-approval/review?token=${token}`);
    expect(review.status).toBe(200);
    expect(review.body.status).toBe("pending");
    expect(review.body.deviceLabel).toBeTruthy();
    const poll = await laptop.get(`/api/auth/device-approval/status?pollToken=${res.body.pollToken}`);
    expect(poll.body.status).toBe("pending");
  });

  it("approve from the email, and the waiting device signs in and is trusted from then on", async () => {
    const user = await makeLoginableUser({ role: "athlete" });
    const phone = new TestClient(server.baseUrl);
    const first = await phone.login(user.email, TEST_PASSWORD);
    const { token } = lastApprovalLink();

    // Claiming before approval is refused.
    const early = await phone.post("/api/auth/device-approval/complete", { pollToken: first.body.pollToken });
    expect(early.status).toBe(409);

    const owner = new TestClient(server.baseUrl);
    const decided = await owner.post("/api/auth/device-approval/decide", { token, decision: "approve" });
    expect(decided.status).toBe(200);
    expect(decided.body.decision).toBe("approved");

    const poll = await phone.get(`/api/auth/device-approval/status?pollToken=${first.body.pollToken}`);
    expect(poll.body.status).toBe("approved");

    const claimed = await phone.post("/api/auth/device-approval/complete", { pollToken: first.body.pollToken });
    expect(claimed.status).toBe(200);
    expect(claimed.body.email).toBe(user.email);
    expect(phone.hasSessionCookie()).toBe(true);

    // An approval is spent once.
    const again = await phone.post("/api/auth/device-approval/complete", { pollToken: first.body.pollToken });
    expect(again.status).toBe(409);

    // Same device, next time: straight in, no email.
    testOutbox.length = 0;
    const fresh = new TestClient(server.baseUrl);
    (fresh as any).deviceId = phone.deviceId;
    const second = await fresh.login(user.email, TEST_PASSWORD);
    expect(second.status).toBe(200);
    expect(second.body.email).toBe(user.email);
    expect(second.body.deviceApprovalRequired).toBeUndefined();
    expect(testOutbox.some((m) => m.subject.includes("New device"))).toBe(false);

    const list = await fresh.get("/api/auth/trusted-devices");
    expect(list.status).toBe(200);
    expect(list.body.some((d: any) => d.isCurrent)).toBe(true);
  });

  it("a claim from a device other than the one that asked does not trust that device", async () => {
    const user = await makeLoginableUser({ role: "athlete" });
    const phone = new TestClient(server.baseUrl);
    const first = await phone.login(user.email, TEST_PASSWORD);
    const { token } = lastApprovalLink();
    await new TestClient(server.baseUrl).post("/api/auth/device-approval/decide", { token, decision: "approve" });
    // Somebody who stole the poll token but is on a different device.
    const stranger = new TestClient(server.baseUrl);
    const claimed = await stranger.post("/api/auth/device-approval/complete", { pollToken: first.body.pollToken });
    // They get the session the owner approved (that is what approval means) but their device
    // is not remembered: the next password-only sign-in from it waits again.
    expect(claimed.status).toBe(200);
    const list = await stranger.get("/api/auth/trusted-devices");
    expect(list.body.some((d: any) => d.isCurrent)).toBe(false);
  });

  it("signing out forgets the device, so the next sign-in waits on the email again", async () => {
    const user = await makeLoginableUser({ role: "athlete" });
    const phone = new TestClient(server.baseUrl);
    await trustClientDevice(phone, user);
    const inRes = await phone.login(user.email, TEST_PASSWORD);
    expect(inRes.body.deviceApprovalRequired).toBeUndefined();
    const out = await phone.post("/api/auth/logout");
    expect(out.status).toBe(204);
    const again = await phone.login(user.email, TEST_PASSWORD);
    expect(again.body.deviceApprovalRequired).toBe(true);
  });

  it("deny signs every device out, forgets them all, and hands over a password reset", async () => {
    const user = await makeLoginableUser({ role: "coach" });
    const ownPhone = new TestClient(server.baseUrl);
    await trustClientDevice(ownPhone, user);
    await ownPhone.login(user.email, TEST_PASSWORD);
    expect((await ownPhone.get("/api/auth/me")).status).toBe(200);

    const thief = new TestClient(server.baseUrl);
    const attempt = await thief.login(user.email, TEST_PASSWORD);
    expect(attempt.body.deviceApprovalRequired).toBe(true);
    const { token } = lastApprovalLink();

    const decided = await new TestClient(server.baseUrl).post("/api/auth/device-approval/decide", { token, decision: "deny" });
    expect(decided.status).toBe(200);
    expect(decided.body.decision).toBe("denied");
    expect(typeof decided.body.resetToken).toBe("string");

    // The thief's claim is refused, and the owner's own session is gone too.
    const claim = await thief.post("/api/auth/device-approval/complete", { pollToken: attempt.body.pollToken });
    expect(claim.status).toBe(403);
    expect((await ownPhone.get("/api/auth/me")).status).toBe(401);

    // The owner's once-trusted phone waits on the email now.
    const relogin = await ownPhone.login(user.email, TEST_PASSWORD);
    expect(relogin.body.deviceApprovalRequired).toBe(true);

    // The reset token the denier was handed works, and a second decision on
    // the same link is refused.
    const reset = await new TestClient(server.baseUrl).post("/api/auth/reset-password", {
      token: decided.body.resetToken,
      password: "a-brand-new-password-42!",
    });
    expect(reset.status).toBe(204);
    const twice = await new TestClient(server.baseUrl).post("/api/auth/device-approval/decide", { token, decision: "approve" });
    expect(twice.status).toBe(409);
  });

  it("an expired link cannot be approved and the waiting device is told so", async () => {
    const user = await makeLoginableUser({ role: "athlete" });
    const phone = new TestClient(server.baseUrl);
    const first = await phone.login(user.email, TEST_PASSWORD);
    const { token } = lastApprovalLink();
    await db.update(deviceApprovals).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(deviceApprovals.userId, user.id));
    const poll = await phone.get(`/api/auth/device-approval/status?pollToken=${first.body.pollToken}`);
    expect(poll.body.status).toBe("expired");
    const decided = await new TestClient(server.baseUrl).post("/api/auth/device-approval/decide", { token, decision: "approve" });
    expect(decided.status).toBe(409);
    // Resend opens a fresh attempt only while the old one is pending.
    const resend = await phone.post("/api/auth/device-approval/resend", { pollToken: first.body.pollToken });
    expect(resend.status).toBe(400);
  });

  it("an account with an authenticator meets the email first and the code second", async () => {
    const user = await makeLoginableUser({ role: "coach", mfaEnabled: true, mfaSecret: "JBSWY3DPEHPK3PXP" });
    const laptop = new TestClient(server.baseUrl);
    const first = await laptop.login(user.email, TEST_PASSWORD);
    expect(first.body.deviceApprovalRequired).toBe(true);
    expect(first.body.mfaRequired).toBeUndefined();
    const { token } = lastApprovalLink();
    await new TestClient(server.baseUrl).post("/api/auth/device-approval/decide", { token, decision: "approve" });
    const claimed = await laptop.post("/api/auth/device-approval/complete", { pollToken: first.body.pollToken });
    expect(claimed.status).toBe(200);
    expect(claimed.body.mfaRequired).toBe(true);
    expect(typeof claimed.body.mfaToken).toBe("string");
    expect(laptop.hasSessionCookie()).toBe(false);
  });

  it("a wrong password never reaches the device step or sends anything", async () => {
    const user = await makeLoginableUser({ role: "athlete" });
    const res = await new TestClient(server.baseUrl).login(user.email, "not-the-password");
    expect(res.status).toBe(401);
    expect(testOutbox.length).toBe(0);
  });

  it("an exempt account (the App Review demo logins) signs in with the password alone", async () => {
    const user = await makeLoginableUser({ role: "athlete" });
    process.env.DEVICE_VERIFICATION_EXEMPT_EMAILS = `someone@else.test, ${user.email.toUpperCase()}`;
    try {
      const res = await new TestClient(server.baseUrl).login(user.email, TEST_PASSWORD);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe(user.email);
    } finally {
      delete process.env.DEVICE_VERIFICATION_EXEMPT_EMAILS;
    }
  });

  it("signing up trusts the device the account was created on", async () => {
    const browser = new TestClient(server.baseUrl);
    const email = `signup-${Date.now()}@example.test`;
    const signup = await browser.post("/api/auth/signup", {
      email,
      password: TEST_PASSWORD,
      name: "New Coach",
      role: "coach",
      dateOfBirth: "1990-01-01",
      agreedToTerms: true,
      // A coach signup picks its plan here -- see server/plan-at-signup.itest.ts. Nothing to do
      // with the device gate; without it the route 400s before this test's subject is reached.
      expectedAthletes: 25,
    });
    if (signup.status !== 201) {
      throw new Error(`signup did not succeed: ${signup.status} ${JSON.stringify(signup.body)}`);
    }
    // No approval email went out for the account's own first device, and it
    // is on the trusted list as this device.
    expect(testOutbox.some((m) => m.subject.includes("New device"))).toBe(false);
    const list = await browser.get("/api/auth/trusted-devices");
    expect(list.status).toBe(200);
    expect(list.body.some((d: any) => d.isCurrent)).toBe(true);
  });
});
