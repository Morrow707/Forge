import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "./test-support/fixtures";
import {
  makeLoginableUser,
  startTestServer,
  TestClient,
  trustClientDevice,
  type TestServer,
} from "./test-support/http-app";

/** The phone's sign-in runs 30 days from the last use, not from sign-in (2026-11-16). A token
 *  renews only from a request it authenticated itself, names the same session record, and dies
 *  with that session. */
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

const NATIVE = { origin: "capacitor://localhost" };

async function nativeSignIn() {
  const user = await makeLoginableUser({ role: "athlete" });
  const client = new TestClient(server.baseUrl);
  await trustClientDevice(client, user);
  const res = await client.post("/api/auth/login", { email: user.email, password: user.plainPassword }, NATIVE);
  expect(res.status).toBe(200);
  expect(typeof res.body.nativeToken).toBe("string");
  return { user, token: res.body.nativeToken as string, deviceId: client.deviceId };
}

/** A request carrying only the bearer token -- no cookie -- as the phone sends it. */
function bearer(token: string, deviceId: string) {
  const c = new TestClient(server.baseUrl);
  const headers = { ...NATIVE, authorization: `Bearer ${token}`, "x-forge-device-id": deviceId };
  return {
    get: (path: string) => c.get(path, headers),
    post: (path: string, body?: unknown) => c.post(path, body, headers),
  };
}

describe("a phone's sign-in renews itself", () => {
  it("a signed-in phone gets a fresh token for the same account, later than the old one", async () => {
    const { user, token, deviceId } = await nativeSignIn();
    await new Promise((r) => setTimeout(r, 5));
    const res = await bearer(token, deviceId).post("/api/auth/native-token/renew");
    expect(res.status).toBe(200);
    const fresh = res.body.nativeToken as string;
    expect(fresh).not.toBe(token);
    const [uid, sid, exp] = fresh.split(".");
    const [oldUid, oldSid, oldExp] = token.split(".");
    expect(uid).toBe(String(user.id));
    expect(uid).toBe(oldUid);
    expect(sid).toBe(oldSid);
    expect(Number(exp)).toBeGreaterThan(Number(oldExp));
    const me = await bearer(fresh, deviceId).get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(user.id);
  });

  it("revoking the session ends the renewed token too", async () => {
    const { token, deviceId } = await nativeSignIn();
    const fresh = (await bearer(token, deviceId).post("/api/auth/native-token/renew")).body.nativeToken as string;
    const out = await bearer(fresh, deviceId).post("/api/auth/logout");
    expect(out.status).toBeLessThan(300);
    expect((await bearer(fresh, deviceId).get("/api/auth/me")).status).toBe(401);
    expect((await bearer(fresh, deviceId).post("/api/auth/native-token/renew")).status).toBe(401);
  });

  it("nobody without a phone token can get one", async () => {
    const c = new TestClient(server.baseUrl);
    expect((await c.post("/api/auth/native-token/renew", undefined, NATIVE)).status).toBe(401);
    const { deviceId } = await nativeSignIn();
    expect((await bearer("1.2.9999999999999.deadbeef", deviceId).post("/api/auth/native-token/renew")).status).toBe(401);
  });
});
