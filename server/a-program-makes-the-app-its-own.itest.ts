import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { guardianLinks, users, workoutLogs } from "@shared/schema";
import type { BrandExtras } from "@shared/brand-extras";
import { storage } from "./storage";
import { testOutbox } from "./email";
import { runWeeklyRecaps } from "./weekly-recap-job";
import { db, makeAssignedProgram, makeExercise, resetDatabase } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

// A PROGRAM'S OWN CHECK-IN QUESTIONS, TROPHIES, SEASONS, WELCOME SCREENS, FLYER AND WEEKLY RECAP
// (Scott, 2026-11-19), driven through the real routes on real Postgres. Every program here is
// comped (isBetaAccount), so it has Full Personalization; the plan gate is the same narrowing the
// rest of brand_extras goes through and is covered by full-personalization-follows-the-plan.

const CREATED = 201;
const NO_CONTENT = 204;
const OK = 200;
const NOT_FOUND = 404;
/** The athlete and their parent. */
const ATHLETE_AND_PARENT = 2;
const ISO_DAY = 10;
const today = () => new Date().toISOString().slice(0, ISO_DAY);

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

async function program(extras: BrandExtras) {
  const coach = await makeLoginableUser({ role: "coach", name: "Coach Riley" });
  const athlete = await makeLoginableUser({ role: "athlete", name: "Jordan Reyes" });
  await addToRoster(coach.id, athlete.id);
  await db.update(users).set({ brandTeamName: "Cal Strength", brandPrimaryColor: "#003262", coachCode: `CAL${coach.id}` }).where(eq(users.id, coach.id));
  const coachClient = await loginAs(server.baseUrl, coach);
  const saved = await coachClient.patch("/api/coach/branding/extras", extras);
  expect(saved.status).toBe(OK);
  expect(saved.body.skipped).toEqual([]);
  // Signed in only by the tests that need the athlete: the login limiter has a budget per file.
  return { coach, athlete, coachClient, athleteClient: () => loginAs(server.baseUrl, athlete) };
}

describe("the program's own check-in questions", () => {
  it("are asked, saved apart from the readiness score, and shown to the coach", async () => {
    const { athlete, athleteClient: signIn, coachClient } = await program({
      checkinQuestions: [
        { id: "breakfast", text: "Did you eat breakfast?", kind: "yesno" },
        { id: "energy", text: "Energy today?", kind: "scale" },
      ],
    });
    const athleteClient = await signIn();
    const asked = await athleteClient.get("/api/athlete/program-checkin");
    expect(asked.body.questions.map((q: { id: string }) => q.id)).toEqual(["breakfast", "energy"]);

    const sent = await athleteClient.post("/api/athlete/program-checkin", {
      answers: [
        { questionId: "breakfast", value: "yes" },
        { questionId: "energy", value: "9" }, // not 1-5: set aside
        { questionId: "gone", value: "yes" }, // no such question: set aside
      ],
    });
    expect(sent.status).toBe(CREATED);
    expect(sent.body.saved).toBe(1);

    const seen = await coachClient.get(`/api/coach/roster/${athlete.id}/program-checkin-answers`);
    expect(seen.body).toHaveLength(1);
    expect(seen.body[0]).toMatchObject({ questionText: "Did you eat breakfast?", value: "yes", date: today() });
  });

  it("keeps an answer's wording after the coach rewords the question", async () => {
    const { athlete, athleteClient: signIn, coachClient } = await program({
      checkinQuestions: [{ id: "sleep", text: "Sleep well?", kind: "yesno" }],
    });
    const athleteClient = await signIn();
    await athleteClient.post("/api/athlete/program-checkin", { answers: [{ questionId: "sleep", value: "no" }] });
    await coachClient.patch("/api/coach/branding/extras", { checkinQuestions: [{ id: "sleep", text: "Rested?", kind: "yesno" }] });
    const seen = await coachClient.get(`/api/coach/roster/${athlete.id}/program-checkin-answers`);
    expect(seen.body[0].questionText).toBe("Sleep well?");
  });

  it("are another coach's business only on their own roster", async () => {
    const { athlete } = await program({ checkinQuestions: [{ id: "a", text: "A?", kind: "yesno" }] });
    const outsider = await makeLoginableUser({ role: "coach" });
    const res = await (await loginAs(server.baseUrl, outsider)).get(`/api/coach/roster/${athlete.id}/program-checkin-answers`);
    expect(res.status).toBe(NOT_FOUND);
  });
});

describe("the program's own trophies", () => {
  it("are earned with Forge's counts and stay in the case after the coach removes them", async () => {
    const { coach, athlete, athleteClient: signIn, coachClient } = await program({
      trophies: [{ id: "first", label: "Bear Cub", category: "workout_count", threshold: 1, tier: "gold" }],
    });
    const athleteClient = await signIn();
    const exercise = await makeExercise(coach.id);
    const { assignment, day } = await makeAssignedProgram({ coachId: coach.id, athleteId: athlete.id, exerciseIds: [exercise.id] });
    await db.insert(workoutLogs).values({ assignmentId: assignment.id, programDayId: day.id, athleteId: athlete.id, date: today(), completed: true, completedAt: new Date() });

    const defs = (await athleteClient.get("/api/athlete/program-trophies")).body;
    expect(defs).toEqual([expect.objectContaining({ key: `program:${coach.id}:first`, label: "Bear Cub" })]);
    const earned = (await athleteClient.get("/api/athlete/trophies")).body;
    expect(earned.map((t: { key: string }) => t.key)).toContain(`program:${coach.id}:first`);

    await coachClient.patch("/api/coach/branding/extras", { trophies: null });
    const after = (await athleteClient.get("/api/athlete/trophies")).body;
    expect(after.find((t: { key: string }) => t.key === `program:${coach.id}:first`)?.label).toBe("Bear Cub");
  });
});

describe("a season", () => {
  it("lays its colors and banner over the program's look only between its dates", async () => {
    const day = today();
    const { athlete, athleteClient: signIn, coachClient } = await program({
      seasons: [{ id: "rival", name: "Rivalry week", start: day, end: day, primaryColor: "#B91C1C", secondaryColor: null, banner: "Beat Central!" }],
    });
    const athleteClient = await signIn();
    const during = (await athleteClient.get("/api/branding/me")).body;
    expect(during.brandPrimaryColor).toBe("#B91C1C");
    expect(during.activeSeason).toEqual({ name: "Rivalry week", banner: "Beat Central!" });
    // Emails, push and PDFs read the same function, so they wear the season too.
    expect((await storage.getEffectiveBrandingForUser(athlete.id))?.brandPrimaryColor).toBe("#B91C1C");

    await coachClient.patch("/api/coach/branding/extras", {
      seasons: [{ id: "rival", name: "Rivalry week", start: "2000-01-01", end: "2000-01-07", primaryColor: "#B91C1C", secondaryColor: null, banner: null }],
    });
    const outside = (await athleteClient.get("/api/branding/me")).body;
    expect(outside.brandPrimaryColor).toBe("#003262");
    expect(outside.activeSeason).toBeNull();
  });
});

describe("welcome screens", () => {
  it("are marked seen once", async () => {
    const { athlete, athleteClient: signIn } = await program({ welcomeScreens: [{ title: "Welcome", body: "Lift at 6" }] });
    const athleteClient = await signIn();
    expect((await athleteClient.get("/api/auth/me")).body.programWelcomeSeenAt).toBeNull();
    expect((await athleteClient.post("/api/athlete/program-welcome-seen", {})).status).toBe(NO_CONTENT);
    const first = (await db.select().from(users).where(eq(users.id, athlete.id)))[0].programWelcomeSeenAt;
    expect(first).not.toBeNull();
    await athleteClient.post("/api/athlete/program-welcome-seen", {});
    const second = (await db.select().from(users).where(eq(users.id, athlete.id)))[0].programWelcomeSeenAt;
    expect(second?.getTime()).toBe(first?.getTime());
  });
});

describe("the recruiting flyer", () => {
  it("is a PDF for any coach with a join code", async () => {
    const { coachClient } = await program({});
    const res = await coachClient.get("/api/coach/flyer.pdf");
    expect(res.status).toBe(OK);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect(String(res.body).startsWith("%PDF")).toBe(true);
  });
});

describe("the weekly recap", () => {
  it("is not sent while off, and sent once on its day with only the sections the coach ticked", async () => {
    const weekday = new Date().getUTCDay();
    const { coach, athlete, coachClient } = await program({
      recap: { enabled: false, weekday, includeTotals: true, includeTopPerformers: false, note: "Great week", sendToGuardians: true },
    });
    const guardian = await makeLoginableUser({ role: "guardian" });
    await db.insert(guardianLinks).values({ guardianId: guardian.id, athleteId: athlete.id });

    expect((await runWeeklyRecaps()).sent).toBe(0);

    await coachClient.patch("/api/coach/branding/extras", {
      recap: { enabled: true, weekday, includeTotals: true, includeTopPerformers: false, note: "Great week", sendToGuardians: true },
    });
    const result = await runWeeklyRecaps();
    expect(result.sent).toBe(ATHLETE_AND_PARENT);
    const toAthlete = testOutbox.find((m) => m.to === athlete.email.toLowerCase());
    expect(toAthlete?.subject).toBe("Cal Strength: your week");
    expect(toAthlete?.html).toContain("Great week");
    expect(toAthlete?.html).toContain("workouts completed");
    expect(toAthlete?.html).not.toContain("Most workouts completed");
    expect(testOutbox.some((m) => m.to === guardian.email.toLowerCase())).toBe(true);

    expect((await runWeeklyRecaps()).sent).toBe(0);
    expect((await db.select().from(users).where(eq(users.id, coach.id)))[0].recapLastSentOn).toBe(today());
  });

  it("names top performers by first name and last initial only when the coach ticks it", async () => {
    const weekday = new Date().getUTCDay();
    const { coach, athlete } = await program({
      recap: { enabled: true, weekday, includeTotals: false, includeTopPerformers: true, note: null, sendToGuardians: false },
    });
    const exercise = await makeExercise(coach.id);
    const { assignment, day } = await makeAssignedProgram({ coachId: coach.id, athleteId: athlete.id, exerciseIds: [exercise.id] });
    await db.insert(workoutLogs).values({ assignmentId: assignment.id, programDayId: day.id, athleteId: athlete.id, date: today(), completed: true, completedAt: new Date() });
    await runWeeklyRecaps();
    const html = testOutbox.find((m) => m.to === athlete.email.toLowerCase())?.html ?? "";
    expect(html).toContain("Jordan R. (1)");
    expect(html).not.toContain("Reyes");
  });
});
