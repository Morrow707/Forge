import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDatabase } from "./test-support/fixtures";
import {
  startTestServer,
  makeLoginableUser,
  TestClient,
  TEST_PASSWORD,
  type TestServer,
} from "./test-support/http-app";

/**
 * Credential stuffing, stopped at the door.
 *
 * Its own file because it is the one test here that deliberately spends the
 * login limiter's whole budget. That counter lives in the auth module rather
 * than in the app, so a fresh server does not reset it and every test in a
 * file shares it -- a suite that exhausts it would break every later login
 * in the same file for reasons having nothing to do with what those tests
 * were asking. A separate file gets its own process and its own counter.
 *
 * Worth testing over HTTP specifically: a limiter is only as good as where
 * it is mounted. This one has to sit in front of the login route, and
 * nothing in the source tells you whether it actually does.
 */
let server: TestServer;
let victim: Awaited<ReturnType<typeof makeLoginableUser>>;

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
  victim = await makeLoginableUser({ role: "coach", name: "Target Account" });
});

afterAll(async () => {
  await server?.close();
});

describe("password guessing runs out of attempts", () => {
  it("starts refusing long before a six-character password could be searched", async () => {
    const attacker = new TestClient(server.baseUrl);

    let firstThrottledAt: number | null = null;
    for (let attempt = 1; attempt <= 25; attempt++) {
      const res = await attacker.login(victim.email, `guess-${attempt}`);
      if (res.status === 429) {
        firstThrottledAt = attempt;
        break;
      }
      expect(res.status, `attempt ${attempt} answered ${res.status}`).toBe(401);
    }

    expect(firstThrottledAt, "the limiter never engaged across 25 attempts").not.toBeNull();
    expect(firstThrottledAt!).toBeLessThanOrEqual(20);
  });

  it("does not let the right password through once throttling has started", async () => {
    // The failure worth catching: a limiter placed after authentication
    // rather than in front of it still counts attempts and still hands out
    // a session on the attempt that happens to be correct, which defeats
    // the entire point of counting.
    const attacker = new TestClient(server.baseUrl);
    const res = await attacker.login(victim.email, TEST_PASSWORD);

    expect(res.status, "a correct password was served while throttled").toBe(429);
    expect(attacker.hasSessionCookie(), "a session cookie was issued while throttled").toBe(false);
  });

  it("says nothing about whether the account exists", async () => {
    // Both branches are throttled by now, so this checks the refusals stay
    // indistinguishable rather than one leaking through as a different
    // status or message.
    const attacker = new TestClient(server.baseUrl);
    const real = await attacker.login(victim.email, "wrong");
    const fake = await attacker.login("nobody-at-all@example.test", "wrong");

    expect(real.status).toBe(fake.status);
    expect(JSON.stringify(real.body)).toBe(JSON.stringify(fake.body));
  });
});
