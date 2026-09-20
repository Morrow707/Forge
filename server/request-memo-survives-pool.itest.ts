import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import { db, pool, resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";
import { onDbQuery } from "./db";
import { inRequestMemoScope, withRequestMemoScope } from "./request-cache";
import { storage } from "./storage";

// The per-request memo (server/request-cache.ts) against the real pool and the real routes.
//
// Three things only a database can prove. That the scope survives a callback-style pool
// query -- the session store's shape, and where AsyncLocalStorage would lose it without the
// binding in db.ts. That a route which used to load the signed-in user twice now loads it
// once. And that a write inside the scope makes the next read fresh, so no route can be
// handed the row it just changed.

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(resetDatabase);

function countStatements(matching: RegExp) {
  const seen: string[] = [];
  const stop = onDbQuery((sqlText) => {
    if (matching.test(sqlText)) seen.push(sqlText);
  });
  return { seen, stop };
}

describe("request memo", () => {
  it("survives a callback-style pool query, which is how the session store reads a session", async () => {
    await pool.query("SELECT 1"); // a connection that predates the scope, as in production
    const inside = await withRequestMemoScope(
      () =>
        new Promise<{ inCallback: boolean; afterCallback: boolean }>((resolve, reject) => {
          pool.query("SELECT 1", (err) => {
            if (err) return reject(err);
            const inCallback = inRequestMemoScope();
            // What passport does next: a promise chain started from inside that callback.
            storage.getUser(0).then(() => resolve({ inCallback, afterCallback: inRequestMemoScope() }), reject);
          });
        }),
    );
    expect(inside).toEqual({ inCallback: true, afterCallback: true });
    expect(inRequestMemoScope()).toBe(false);
  });

  it("reads the same user once per scope, and again after a write to it", async () => {
    const athlete = await makeLoginableUser({ role: "athlete", name: "Before" });
    const userReads = countStatements(/^select .* from "users"/);
    try {
      await withRequestMemoScope(async () => {
        const a = await storage.getUser(athlete.id);
        const b = await storage.getUser(athlete.id);
        expect(a?.name).toBe("Before");
        expect(b?.name).toBe("Before");
        expect(a).not.toBe(b); // a copy each, so a caller's edit stays its own
        expect(userReads.seen).toHaveLength(1);

        await db.update(users).set({ name: "After" }).where(eq(users.id, athlete.id));
        const c = await storage.getUser(athlete.id);
        expect(c?.name).toBe("After");
        expect(userReads.seen).toHaveLength(2);
      });
    } finally {
      userReads.stop();
    }
  });

  it("loads the signed-in user once for a request that used to load it twice", async () => {
    const athlete = await makeLoginableUser({ role: "athlete" });
    const client = await loginAs(server.baseUrl, athlete);
    const userReads = countStatements(/^select .* from "users" "users" where "users"\."id" = \$1/);
    try {
      const res = await client.get("/api/notifications");
      expect(res.status).toBe(200);
      // passport's deserializeUser, and the guardian gate's athleteGateStatus which re-read the
      // same row -- one statement now.
      expect(userReads.seen).toHaveLength(1);
    } finally {
      userReads.stop();
    }
  });
});
