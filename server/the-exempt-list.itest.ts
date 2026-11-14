import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "@shared/schema";
import { makeAthlete, resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";
import { storage } from "./storage";
import { freeAgentPlanRequired } from "./free-agent-plan";

/**
 * Scott, 2026-11-14: "can we put that email on an exempt list? Give them full access to the app,
 * no subscription necessary, never need to pay." Made-up addresses throughout.
 */
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

describe("the exempt list", () => {

  it("an admin lists an existing account's address and it stops needing a plan", async () => {
    const athlete = await makeAthlete({ isBetaAccount: false });
    const [row] = await db.select().from(users).where(eq(users.id, athlete.id));
    const admin = await makeLoginableUser({ role: "admin" });
    const client = await loginAs(server.baseUrl, admin);

    const added = await client.post("/api/admin/exempt-emails", { email: `  ${row.email.toUpperCase()} ` });
    expect(added.status).toBe(201);
    expect(added.body.accountFound).toBe(true);
    const [after] = await db.select().from(users).where(eq(users.id, athlete.id));
    expect(after.isBetaAccount).toBe(true);
    expect(await freeAgentPlanRequired({ id: after.id, role: after.role })).toBe(false);

    const list = await client.get("/api/admin/exempt-emails");
    expect(list.body).toHaveLength(1);
    expect(list.body[0].accountRole).toBe("athlete");
    expect(list.body[0].accountExempt).toBe(true);

    // Twice is not an error and not two entries.
    expect((await client.post("/api/admin/exempt-emails", { email: row.email })).status).toBe(201);
    expect((await client.get("/api/admin/exempt-emails")).body).toHaveLength(1);

    const removed = await client.delete(`/api/admin/exempt-emails/${list.body[0].id}`);
    expect(removed.status).toBe(200);
    const [back] = await db.select().from(users).where(eq(users.id, athlete.id));
    expect(back.isBetaAccount).toBe(false);
    expect((await client.get("/api/admin/exempt-emails")).body).toHaveLength(0);
  });

  it("an address listed before it has an account is exempt from the moment it signs up", async () => {
    await storage.addExemptEmail("Not.Yet@Example.test", 0);
    const made = await storage.createUser({
      email: "not.yet@example.test",
      name: "Not Yet",
      role: "athlete",
      passwordHash: "x.y",
    } as Parameters<typeof storage.createUser>[0]);
    expect(made.isBetaAccount).toBe(true);
    const other = await storage.createUser({
      email: "somebody.else@example.test",
      name: "Somebody Else",
      role: "athlete",
      passwordHash: "x.y",
    } as Parameters<typeof storage.createUser>[0]);
    expect(other.isBetaAccount).toBe(false);
  });

  it("only an admin can read or change the list, and a non-address is refused", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const asCoach = await loginAs(server.baseUrl, coach);
    expect((await asCoach.get("/api/admin/exempt-emails")).status).toBe(403);
    expect((await asCoach.post("/api/admin/exempt-emails", { email: "a@b.test" })).status).toBe(403);
    const admin = await makeLoginableUser({ role: "admin" });
    const asAdmin = await loginAs(server.baseUrl, admin);
    expect((await asAdmin.post("/api/admin/exempt-emails", { email: "not an address" })).status).toBe(400);
    expect((await asAdmin.delete("/api/admin/exempt-emails/999999")).status).toBe(404);
  });
});
