import { randomBytes } from "node:crypto";
import { trustDevice } from "../trusted-devices";
import express from "express";
import cors from "cors";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { registerRoutes } from "../routes";
import { verifyRequestOrigin } from "../csrf-protection";
import { NATIVE_APP_ORIGINS } from "../native-app-origins";
import { hashPassword } from "../auth-utils";
import { db } from "../db";
import { users, coachAthletes } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Boots the real Express stack on a real port, so a test can attack it the
 * way a browser or a script would.
 *
 * Everything else that checks authorization in this repo reads source or
 * calls storage directly. Both are worth having and neither can see the
 * layer an actual request passes through: whether a guard is mounted at all,
 * whether it is mounted BEFORE the route it is supposed to protect, whether
 * the session cookie a reply hands out is the one the next request is
 * honoured under, and what status a refusal actually carries. A route can be
 * perfectly scoped in storage.ts and still be reachable by the wrong person
 * because a middleware went on in the wrong order -- source-scanning cannot
 * see ordering, and a storage test never runs the middleware at all.
 *
 * Mirrors server/index.ts's middleware order for everything that can decide
 * an authorization question: CORS, the CSRF origin check, and the body
 * parsers, then registerRoutes (which mounts the numeric-id guard, the minor
 * gate, setupAuth with its session and rate limiters, and every route).
 * Helmet, compression and the request logger are deliberately left out --
 * they shape headers and output, never who is allowed through, and leaving
 * them out keeps a failure here unambiguous.
 */
export type TestServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

export async function startTestServer(): Promise<TestServer> {
  const app = express();
  app.use(cors({ origin: NATIVE_APP_ORIGINS, credentials: true }));
  app.use(verifyRequestOrigin(NATIVE_APP_ORIGINS));
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: false }));

  const server: Server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

export type Response = { status: number; body: any; headers: Headers };

/**
 * One caller, holding its own cookies.
 *
 * A cookie jar per client is the point: it is what lets a test hold two
 * sessions at once and fire the same request as each of them, which is the
 * shape of every cross-tenant question worth asking.
 */
export class TestClient {
  private cookies = new Map<string, string>();
  /** The id this client is known by for new-device approval (see
   * server/trusted-devices.ts). One per client, like a real browser. loginAs
   * trusts it before signing in, so a test that is not ABOUT the device gate
   * never meets it; new-device-approval.itest.ts is the one that does. */
  readonly deviceId = `test-device-${randomBytes(8).toString("hex")}`;

  constructor(private readonly baseUrl: string) {}

  async request(
    method: string,
    path: string,
    options: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { "x-forge-device-id": this.deviceId, ...options.headers };
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (this.cookies.size > 0) {
      headers["cookie"] = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: "manual",
    });

    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }

    const text = await res.text();
    let body: any = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // A non-JSON body is itself worth asserting on (an HTML error page
      // where JSON was expected usually means a request fell through to a
      // handler nobody intended), so it is returned as the raw string
      // rather than swallowed.
    }
    return { status: res.status, body, headers: res.headers };
  }

  get = (path: string, headers?: Record<string, string>) =>
    this.request("GET", path, { headers });
  post = (path: string, body?: unknown, headers?: Record<string, string>) =>
    this.request("POST", path, { body, headers });
  patch = (path: string, body?: unknown) => this.request("PATCH", path, { body });
  put = (path: string, body?: unknown) => this.request("PUT", path, { body });
  delete = (path: string) => this.request("DELETE", path);

  async login(email: string, password: string): Promise<Response> {
    return this.post("/api/auth/login", { email, password });
  }

  hasSessionCookie(): boolean {
    return this.cookies.size > 0;
  }

  /** The Cookie header this client would send -- for a test that has to make its own fetch
   * (a multipart upload, say) but still wants a session this client established. */
  cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

/**
 * A user who can actually log in.
 *
 * The shared fixtures store a placeholder in passwordHash, which is right
 * for a storage test and useless here -- the local strategy runs a real
 * scrypt comparison against it and every login would fail for a reason that
 * has nothing to do with what is under test.
 *
 * `emailVerified` is set because unverified accounts are gated separately,
 * and that gate is not what any of these tests is asking about.
 */
export const TEST_PASSWORD = "correct-horse-battery-staple-9";

let seq = 0;
const uniqueEmail = (role: string) => `${role}-${Date.now().toString(36)}-${seq++}@example.test`;

export async function makeLoginableUser(
  overrides: Partial<typeof users.$inferInsert> = {},
): Promise<typeof users.$inferSelect & { plainPassword: string }> {
  const role = overrides.role ?? "athlete";
  const [row] = await db
    .insert(users)
    .values({
      email: uniqueEmail(String(role)),
      passwordHash: await hashPassword(TEST_PASSWORD),
      name: "Test User",
      role,
      emailVerified: true,
      // Adults unless a test says otherwise: the under-18 gate is its own
      // question and would otherwise silently answer several of these.
      dateOfBirth: "1995-06-15",
      ...overrides,
    })
    .returning();
  return { ...row, plainPassword: TEST_PASSWORD };
}

/** Puts an athlete on a coach's roster, which is what every coach scope resolves against. */
export async function addToRoster(coachId: number, athleteId: number): Promise<void> {
  await db.insert(coachAthletes).values({ coachId, athleteId });
}

/** Logs a client in and fails loudly rather than leaving a test to misread a 401 later. */
export async function loginAs(
  baseUrl: string,
  user: { email: string },
  password = TEST_PASSWORD,
): Promise<TestClient> {
  const client = new TestClient(baseUrl);
  await trustClientDevice(client, user);
  const res = await client.login(user.email, password);
  if (res.status !== 200) {
    throw new Error(
      `login failed for ${user.email}: ${res.status} ${JSON.stringify(res.body)}. ` +
        `If this is a 429 the file has spent the login limiter's budget -- see its own comment.`,
    );
  }
  return client;
}

/** Makes `client` a trusted device for `user`, so a password alone signs in there -- the state
 * a real person's own phone is in after their first approved sign-in. Tests of the gate itself
 * skip this and go through the email. */
export async function trustClientDevice(client: TestClient, user: { email: string }): Promise<void> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, user.email));
  if (!row) throw new Error(`trustClientDevice: no user with email ${user.email}`);
  await trustDevice(row.id, client.deviceId, { deviceLabel: "test client" });
}
