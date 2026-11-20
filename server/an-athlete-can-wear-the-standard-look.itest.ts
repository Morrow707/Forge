import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import { storage } from "./storage";
import { db, resetDatabase } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

// AN ATHLETE CAN TURN THEIR PROGRAM'S LOOK OFF (Scott, 2026-11-20: "how does an athlete opt out
// of those colors?"). The switch takes the program's colors, fonts, corners, login photo, exercise
// screen colors and app icon off that athlete's screens; the program's name, logo, words, notes
// and banner stay. Driven through the real routes on real Postgres.

const OK = 200;
const FORBIDDEN = 403;
const BAD_REQUEST = 400;
const NAVY = "#0b2a5b";
const GOLD = "#e8a33d";

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

async function brandedProgram() {
  const coach = await makeLoginableUser({ role: "coach", name: "Coach Riley" });
  const athlete = await makeLoginableUser({ role: "athlete", name: "Jordan Reyes" });
  await addToRoster(coach.id, athlete.id);
  await db
    .update(users)
    .set({
      brandTeamName: "Ridgeview Strength",
      brandPrimaryColor: NAVY,
      brandSecondaryColor: GOLD,
      brandHeadingFont: "bebas",
      brandExtras: {
        coachNote: "Film every top set this week.",
        corners: "round",
        bodyFont: "lato",
        appIcon: "navy",
        celebration: { message: "Ridgeview strong!", color: GOLD },
        terms: { program: { one: "Block", many: "Blocks" } },
      },
    })
    .where(eq(users.id, coach.id));
  return { coach, athlete };
}

describe("an athlete's standard look", () => {
  it("takes the program's look off their screens and keeps its words, then puts it back", async () => {
    const { athlete } = await brandedProgram();
    const client = await loginAs(server.baseUrl, athlete);

    const before = await client.get("/api/branding/me");
    expect(before.body.brandPrimaryColor).toBe(NAVY);
    expect(before.body.brandExtras.appIcon).toBe("navy");

    const on = await client.post("/api/athlete/standard-look", { on: true });
    expect(on.status).toBe(OK);
    expect((await storage.getUser(athlete.id))?.useStandardLook).toBe(true);

    const plain = (await client.get("/api/branding/me")).body;
    expect(plain.brandPrimaryColor).toBeNull();
    expect(plain.brandSecondaryColor).toBeNull();
    expect(plain.brandHeadingFont).toBeNull();
    expect(plain.brandExtras.appIcon).toBeUndefined();
    expect(plain.brandExtras.corners).toBeUndefined();
    expect(plain.brandExtras.bodyFont).toBeUndefined();
    expect(plain.brandExtras.celebration).toEqual({ message: "Ridgeview strong!", color: null });
    // The program's words stay: its name, the coach's note and its own terms.
    expect(plain.brandTeamName).toBe("Ridgeview Strength");
    expect(plain.brandExtras.coachNote).toBe("Film every top set this week.");
    expect(plain.brandExtras.terms.program.one).toBe("Block");

    expect((await client.post("/api/athlete/standard-look", { on: false })).status).toBe(OK);
    expect((await client.get("/api/branding/me")).body.brandPrimaryColor).toBe(NAVY);
  });

  it("changes nothing for anyone else on the program, and the coach still sees the program's look", async () => {
    const { coach, athlete } = await brandedProgram();
    const teammate = await makeLoginableUser({ role: "athlete", name: "Sam Ortiz" });
    await addToRoster(coach.id, teammate.id);
    await db.update(users).set({ useStandardLook: true }).where(eq(users.id, athlete.id));

    expect((await (await loginAs(server.baseUrl, teammate)).get("/api/branding/me")).body.brandPrimaryColor).toBe(NAVY);
    expect((await (await loginAs(server.baseUrl, coach)).get("/api/branding/me")).body.brandPrimaryColor).toBe(NAVY);
  });

  it("is an athlete's switch only, and takes a yes or a no", async () => {
    const { coach, athlete } = await brandedProgram();
    expect((await (await loginAs(server.baseUrl, coach)).post("/api/athlete/standard-look", { on: true })).status).toBe(FORBIDDEN);
    expect((await (await loginAs(server.baseUrl, athlete)).post("/api/athlete/standard-look", { on: "yes" })).status).toBe(BAD_REQUEST);
  });
});
