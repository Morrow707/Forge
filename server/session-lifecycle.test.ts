import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const auth = readFileSync(join(__dirname, "auth.ts"), "utf8");
const index = readFileSync(join(__dirname, "index.ts"), "utf8");
const renderConfig = readFileSync(join(__dirname, "..", "render.yaml"), "utf8");

// Two rules that are only true if they hold at EVERY site, which is exactly
// the kind of thing that gets half-applied later: every path that
// establishes a session must regenerate it first, and signing out must end
// the session server-side, not just drop a cookie.

describe("session fixation", () => {
  it("routes every login through the regenerating helper", () => {
    // A bare req.login anywhere else is a session the attacker's planted id
    // survives into. The helper's own body is the one legitimate call.
    const callSites = auth
      .split("\n")
      .filter((line) => line.includes("req.login(") && !line.trim().startsWith("//"));
    expect(callSites.length).toBe(1);
    expect(auth).toContain("function loginWithFreshSession(");
  });

  it("regenerates before establishing the identity, not after", () => {
    const helper = auth.slice(auth.indexOf("function loginWithFreshSession("));
    const regenerateAt = helper.indexOf("req.session.regenerate(");
    const loginAt = helper.indexOf("req.login(");
    expect(regenerateAt).toBeGreaterThan(-1);
    expect(regenerateAt).toBeLessThan(loginAt);
  });

  it("still records the web session id, which is read after regeneration", () => {
    // The recorded id has to be the fresh one -- otherwise "log out this
    // device" points at a session that no longer exists.
    expect(auth).toContain("storage.setSessionWebId(record.id, req.sessionID)");
  });
});

describe("logout ends the session server-side", () => {
  const logout = auth.slice(
    auth.indexOf('app.post("/api/auth/logout"'),
    auth.indexOf('app.post("/api/account/delete"'),
  );

  it("revokes the session record, which is what invalidates a native token", () => {
    expect(logout).toContain("storage.revokeSession(");
  });

  it("deletes the web session row rather than only clearing the cookie", () => {
    expect(logout).toContain('DELETE FROM "session"');
  });

  it("revokes before responding", () => {
    expect(logout.indexOf("storage.revokeSession(")).toBeLessThan(logout.indexOf("res.status(204)"));
  });
});

describe("the health check can observe a broken database", () => {
  it("queries the database rather than serving a static page", () => {
    const handler = index.slice(
      index.indexOf('app.get("/healthz"'),
      index.indexOf("(async () =>"),
    );
    expect(handler).toContain('pool.query("SELECT 1")');
    expect(handler).toContain("503");
  });

  it("is what the platform actually probes", () => {
    expect(renderConfig).toContain("healthCheckPath: /healthz");
  });
});

describe("response bodies stay out of production logs", () => {
  it("logs a body only in development", () => {
    const logging = index.slice(index.indexOf("let logLine ="));
    const guard = logging.slice(0, logging.indexOf("logLine += "));
    expect(guard).toContain('app.get("env") === "development"');
  });

  it("still logs method, path, status and duration everywhere", () => {
    expect(index).toContain("${req.method} ${reqPath} ${res.statusCode} in ${duration}ms");
  });
});
