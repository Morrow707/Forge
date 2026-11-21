import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { coachAthletes, coachStaff, users } from "@shared/schema";
import { makeAthlete, resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";
import { storage } from "./storage";
import { freeAgentPlanRequired } from "./free-agent-plan";
import { waitForEmailTo } from "./test-support/wait-for-email";

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

  // 2026-11-21: the person is told when they are added and when they are removed, the list row
  // says what the account still pays for, and an exempt account cannot start a card checkout.
  it("emails the person on add and on remove, shows what they still pay for, and refuses their checkout", async () => {
    const buyer = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
    const admin = await makeLoginableUser({ role: "admin" });
    const adminClient = await loginAs(server.baseUrl, admin);

    const added = await adminClient.post("/api/admin/exempt-emails", { email: buyer.email });
    expect(added.status).toBe(201);
    expect(added.body.emailed).toBe(true);
    expect(added.body.billing.cancelled).toEqual([]);
    const covered = await waitForEmailTo(buyer.email, "Your Forge account is covered");
    expect(covered.html).toContain("do not need to pick a plan or pay");

    const list = await adminClient.get("/api/admin/exempt-emails");
    expect(list.body[0].paying).toEqual({ card: false, appStore: false });
    expect(list.body[0].accountId).toBeUndefined();

    const buyerClient = await loginAs(server.baseUrl, buyer);
    const me = await buyerClient.get("/api/auth/me");
    expect(me.body.planCoveredByForge).toBe(true);
    const checkout = await buyerClient.post("/api/billing/checkout/free-agent-tier", { tier: "basic" });
    expect(checkout.status).toBe(409);
    expect(checkout.body.coveredByForge).toBe(true);

    const removed = await adminClient.delete(`/api/admin/exempt-emails/${list.body[0].id}`);
    expect(removed.body.emailed).toBe(true);
    const ended = await waitForEmailTo(buyer.email, "Your Forge account now needs a plan");
    expect(ended.html).toContain("Nothing has been removed");
    expect((await buyerClient.get("/api/auth/me")).body.planCoveredByForge).toBe(false);
  });

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

  // 2026-11-15: an assistant coach on the list was refused the camera, skill recording, the coach
  // AI tools and Coaches Corner whenever the head coach had no plan, because those read the
  // PRIMARY's row only. The comp opens the assistant's OWN tools; the roster's camera still
  // follows the program's plan, so it reaches no athlete.
  it("an assistant coach on the list gets their own tools, and their athletes do not", async () => {
    const head = await makeLoginableUser({ role: "coach", isBetaAccount: false });
    const assistant = await makeLoginableUser({ role: "coach", isBetaAccount: false });
    await db.insert(coachStaff).values({ primaryCoachId: head.id, staffCoachId: assistant.id });
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
    await db.insert(coachAthletes).values({ coachId: assistant.id, athleteId: athlete.id });
    const asAssistant = await loginAs(server.baseUrl, assistant);
    const asAthlete = await loginAs(server.baseUrl, athlete);

    // The premise: unpaid program, nothing open for either of them.
    expect((await asAssistant.get("/api/athlete/camera-access")).body.allowed).toBe(false);
    expect((await asAssistant.get("/api/coach/entitlements")).body.planActive).toBe(false);
    expect((await asAthlete.get("/api/athlete/camera-access")).body.allowed).toBe(false);

    const [row] = await db.select().from(users).where(eq(users.id, assistant.id));
    const admin = await makeLoginableUser({ role: "admin" });
    const asAdmin = await loginAs(server.baseUrl, admin);
    expect((await asAdmin.post("/api/admin/exempt-emails", { email: row.email })).status).toBe(201);

    expect((await asAssistant.get("/api/athlete/camera-access")).body.allowed).toBe(true);
    expect((await asAssistant.get("/api/athlete/skills-access")).body.canRecord).toBe(true);
    const ent = (await asAssistant.get("/api/coach/entitlements")).body;
    expect(ent.planActive).toBe(true);
    expect(ent.coachesCorner.unlocked).toBe(true);
    const draft = await asAssistant.post("/api/coach/programs/ai-draft", { prompt: "three day strength" });
    expect(draft.status, JSON.stringify(draft.body)).not.toBe(403);

    // The athlete's camera follows the program's plan, and the program still has none.
    expect((await asAthlete.get("/api/athlete/camera-access")).body.allowed).toBe(false);
    // And the head coach is not comped by the assistant's entry.
    const asHead = await loginAs(server.baseUrl, head);
    expect((await asHead.get("/api/coach/entitlements")).body.planActive).toBe(false);
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
