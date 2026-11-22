/* eslint-disable ts-patterns/no-magic-numbers -- test fixtures */
// THE LANGUAGE A PERSON READS FORGE IN (2026-11-22), on real Postgres through the real routes:
// the saved choice, the identity that carries it (with the role flags, as every self response
// must), the parent's weekly email in the guardian's language, and the translation route.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "@shared/schema";
import { resetDatabase } from "./test-support/fixtures";
import { TestClient, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";
import { clearTranslationCache, translateTexts, type TranslateAsker } from "./translation";

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(async () => {
  await resetDatabase();
  clearTranslationCache();
});

describe("the language a person reads Forge in", () => {
  it("is English (null) until chosen, and /api/auth/me carries it", async () => {
    const athlete = await makeLoginableUser({ role: "athlete" });
    const client = await loginAs(server.baseUrl, athlete);
    const me = await client.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.language).toBeNull();
  });

  it("every role can save it; the answer is their own identity with the flags, and it persists", async () => {
    const roles = ["athlete", "coach", "admin", "guardian"] as const;
    const results = await Promise.all(
      roles.map(async (role) => {
        const user = await makeLoginableUser({ role });
        const client = await loginAs(server.baseUrl, user);
        const saved = await client.put("/api/account/language", { language: "es" });
        const me = await client.get("/api/auth/me");
        const [row] = await db.select({ language: users.language }).from(users).where(eq(users.id, user.id));
        return { role, saved, me, row };
      }),
    );
    results.forEach(({ saved, me, row }) => {
      expect(saved.status).toBe(200);
      expect(saved.body.language).toBe("es");
      expect(saved.body.passwordHash).toBeUndefined();
      expect(me.body.language).toBe("es");
      expect(row.language).toBe("es");
    });
    // A self response carries the role flags (every-self-response-carries-the-flags.test.ts):
    // a coach's carries isPrimaryCoach, which only toPublicUserWithSections attaches.
    const coach = results.find((r) => r.role === "coach")!;
    expect(coach.saved.body.isPrimaryCoach).toBe(true);
  });

  it("back to English, and null, are both accepted; anything else is refused", async () => {
    const athlete = await makeLoginableUser({ role: "athlete" });
    const client = await loginAs(server.baseUrl, athlete);
    expect((await client.put("/api/account/language", { language: "en" })).body.language).toBe("en");
    expect((await client.put("/api/account/language", { language: null })).body.language).toBeNull();
    expect((await client.put("/api/account/language", { language: "fr" })).status).toBe(400);
    expect((await client.put("/api/account/language", { language: "es", role: "admin" })).status).toBe(400);
  });

  it("is never written without a session", async () => {
    const anonymous = new TestClient(server.baseUrl);
    expect((await anonymous.put("/api/account/language", { language: "es" })).status).toBe(401);
    expect((await anonymous.post("/api/translate", { texts: ["Hi"], target: "es" })).status).toBe(401);
  });
});

describe("translating what a coach typed", () => {
  it("the route answers one translation per text, in order, and validates its input", async () => {
    const athlete = await makeLoginableUser({ role: "athlete" });
    const client = await loginAs(server.baseUrl, athlete);
    const english = await client.post("/api/translate", { texts: ["Good work today", "Rest Friday"], target: "en" });
    expect(english.status).toBe(200);
    expect(english.body.translations).toEqual(["Good work today", "Rest Friday"]);
    // With no AI key in the test environment the model is unavailable: the answer is null per
    // text (the reader sees the original), never an error.
    const spanish = await client.post("/api/translate", { texts: ["Good work today"], target: "es" });
    expect(spanish.status).toBe(200);
    expect(spanish.body.translations).toHaveLength(1);
    expect((await client.post("/api/translate", { texts: [], target: "es" })).status).toBe(400);
    expect((await client.post("/api/translate", { texts: ["x"], target: "de" })).status).toBe(400);
    expect((await client.post("/api/translate", { texts: ["x".repeat(2001)], target: "es" })).status).toBe(400);
  });

  it("the same note is translated once: the second reader is answered from the cache", async () => {
    let calls = 0;
    const ask: TranslateAsker = async (texts) => {
      calls += 1;
      return texts.map((t) => `ES:${t}`);
    };
    expect(await translateTexts(["Keep your back flat"], "es", ask)).toEqual(["ES:Keep your back flat"]);
    expect(await translateTexts(["Keep your back flat"], "es", ask)).toEqual(["ES:Keep your back flat"]);
    expect(calls).toBe(1);
  });
});
