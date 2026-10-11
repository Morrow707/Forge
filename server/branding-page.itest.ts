import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testOutbox } from "./email";
import { resetDatabase } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, TestClient, type TestServer } from "./test-support/http-app";

/** The Branding page (2026-10-03), through the real routes: the program's address is one per
 * program and the rest of the look reaches the athlete and the public page; every email the
 * program sends wears its colours; the coach can send themselves a test. */

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

const BEARS = {
  teamName: "Cal Bears",
  primaryColor: "#003262",
  secondaryColor: "#FDB515",
  backgroundHue: 215,
  backgroundStrength: 2,
  headingFont: "oswald",
  slug: "cal-bears",
  senderName: "Cal Strength",
};

describe("a program without Full Personalization", () => {
  it("saving only the gated fields is a read, not a hung request", async () => {
    // Found 2026-10-11 on the first integration run with every account billed: the route strips
    // every field the entitlements do not cover, the patch arrived empty, drizzle threw "No values
    // to set" past the route, and the request hung until the test timed out.
    const paying = await makeLoginableUser({ role: "coach", isBetaAccount: false });
    const c = await loginAs(server.baseUrl, paying);
    const res = await c.patch("/api/coach/branding", { slug: "nobody-paid-for-this", senderName: "Nope" });
    expect(res.status).toBe(200);
    expect(res.body.brandSlug).toBeNull();
    expect(res.body.brandSenderName).toBeNull();
  });
});

describe("the program's address", () => {
  it("is one per program: a second coach asking for the same slug gets a 409", async () => {
    const a = await makeLoginableUser({ role: "coach" });
    const b = await makeLoginableUser({ role: "coach" });
    const ca = await loginAs(server.baseUrl, a);
    const cb = await loginAs(server.baseUrl, b);
    expect((await ca.patch("/api/coach/branding", { slug: "cal-bears" })).status).toBe(200);
    const taken = await cb.patch("/api/coach/branding", { slug: "CAL-BEARS" });
    expect(taken.status).toBe(409);
    // Re-saving your own is fine.
    expect((await ca.patch("/api/coach/branding", { slug: "cal-bears" })).status).toBe(200);
  });

  it("is refused when it is not a slug", async () => {
    const a = await makeLoginableUser({ role: "coach" });
    const ca = await loginAs(server.baseUrl, a);
    expect((await ca.patch("/api/coach/branding", { slug: "cal bears!" })).status).toBe(400);
  });

  it("opens the public page, with the rest of the look", async () => {
    const a = await makeLoginableUser({ role: "coach" });
    const ca = await loginAs(server.baseUrl, a);
    expect((await ca.patch("/api/coach/branding", BEARS)).status).toBe(200);
    const page = await new TestClient(server.baseUrl).get("/api/public/team/cal-bears");
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({
      teamName: "Cal Bears",
      primaryColor: "#003262",
      backgroundHue: 215,
      backgroundStrength: 2,
      headingFont: "oswald",
    });
  });
});

describe("the athlete wears the whole look", () => {
  it("GET /api/branding/me carries hue, strength, font, slug and sender for an athlete on the roster", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const athlete = await makeLoginableUser({ role: "athlete" });
    await addToRoster(coach.id, athlete.id);
    const cc = await loginAs(server.baseUrl, coach);
    expect((await cc.patch("/api/coach/branding", BEARS)).status).toBe(200);
    const ca = await loginAs(server.baseUrl, athlete);
    const me = await ca.get("/api/branding/me");
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      brandTeamName: "Cal Bears",
      brandBackgroundHue: 215,
      brandBackgroundStrength: 2,
      brandHeadingFont: "oswald",
      brandSlug: "cal-bears",
      brandSenderName: "Cal Strength",
    });
  });
});

describe("emails wear the program", () => {
  it("the coach's test send is branded and signed via Forge", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const cc = await loginAs(server.baseUrl, coach);
    expect((await cc.patch("/api/coach/branding", BEARS)).status).toBe(200);
    testOutbox.length = 0;
    const res = await cc.post("/api/coach/branding/test-email", {});
    expect(res.status).toBe(200);
    const mail = testOutbox.find((m) => m.subject === "Welcome to Forge");
    expect(mail).toBeDefined();
    expect(mail!.to).toBe(coach.email);
    expect(mail!.html).toContain("background:#003262");
    expect(mail!.html).toContain("Cal Bears");
    expect(mail!.html).toContain("Powered by Forge");
    expect(mail!.from).toBe("Cal Strength via Forge <onboarding@resend.dev>");
  });

  it("a password reset for an athlete on the program arrives in its colours; a Free Agent's does not", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const athlete = await makeLoginableUser({ role: "athlete" });
    const free = await makeLoginableUser({ role: "athlete" });
    await addToRoster(coach.id, athlete.id);
    const cc = await loginAs(server.baseUrl, coach);
    expect((await cc.patch("/api/coach/branding", BEARS)).status).toBe(200);
    testOutbox.length = 0;
    const anon = new TestClient(server.baseUrl);
    expect((await anon.post("/api/auth/request-password-reset", { email: athlete.email })).status).toBe(200);
    expect((await anon.post("/api/auth/request-password-reset", { email: free.email })).status).toBe(200);
    const forAthlete = testOutbox.find((m) => m.to === athlete.email);
    const forFree = testOutbox.find((m) => m.to === free.email);
    expect(forAthlete?.html).toContain("background:#003262");
    expect(forFree?.html).toContain("background:#F65B23");
    expect(forFree?.from).toBe("Forge <onboarding@resend.dev>");
  });
});
