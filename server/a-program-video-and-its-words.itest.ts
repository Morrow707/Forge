import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { coachStaff } from "@shared/schema";
import { storage } from "./storage";
import { sendEmail, testOutbox } from "./email";
import { db, makeAssignedProgram, makeExercise, resetDatabase } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

// A PROGRAM'S OWN DEMO VIDEO ON A FORGE EXERCISE, AND ITS OWN WORDS OUTSIDE THE APP (Scott,
// 2026-11-19: "yes to 5 and 10"), on real Postgres through the real routes.

const OK = 200;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const LINK = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const FORGE_LINK = "https://www.youtube.com/watch?v=forgeforge1";

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

async function program() {
  const coach = await makeLoginableUser({ role: "coach" });
  const athlete = await makeLoginableUser({ role: "athlete" });
  await addToRoster(coach.id, athlete.id);
  // A Forge exercise is one Forge's library owner made (storage.withOwnership).
  const library = await makeLoginableUser({ role: "admin" });
  const forge = await makeExercise(library.id, { name: "Back Squat", isForgeOfficial: true, videoUrl: FORGE_LINK });
  const own = await makeExercise(coach.id, { name: "Coach's Squat", isForgeOfficial: false });
  const { assignment, day } = await makeAssignedProgram({ coachId: coach.id, athleteId: athlete.id, exerciseIds: [forge.id] });
  const dayVideo = async (athleteId = athlete.id) => {
    const detail = await storage.getWorkoutDayDetail(athleteId, assignment.id, day.id, "2026-01-05");
    return detail?.day.exercises[0].exercise.videoUrl;
  };
  return { coach, athlete, forge, own, dayVideo, client: await loginAs(server.baseUrl, coach) };
}

describe("a program's own demo video", () => {
  it("replaces Forge's video on its athletes' workout only, and comes off again", async () => {
    const { client, forge, dayVideo } = await program();
    expect(await dayVideo()).toBe(FORGE_LINK);
    const set = await client.put(`/api/coach/exercises/${forge.id}/program-video`, { videoUrl: LINK });
    expect(set.status).toBe(OK);
    expect(await dayVideo()).toBe(LINK);
    expect((await client.get(`/api/coach/exercises/${forge.id}/program-video`)).body.videoUrl).toBe(LINK);
    // The exercise itself is untouched: it is still Forge's, with Forge's video.
    expect((await storage.getExerciseDetail(forge.id, forge.coachId))?.videoUrl).toBe(FORGE_LINK);

    expect((await client.delete(`/api/coach/exercises/${forge.id}/program-video`)).status).toBe(NO_CONTENT);
    expect(await dayVideo()).toBe(FORGE_LINK);
  });

  it("is not shown to another program's athletes", async () => {
    const first = await program();
    await first.client.put(`/api/coach/exercises/${first.forge.id}/program-video`, { videoUrl: LINK });
    const otherCoach = await makeLoginableUser({ role: "coach" });
    const other = await makeLoginableUser({ role: "athlete" });
    await addToRoster(otherCoach.id, other.id);
    const { assignment, day } = await makeAssignedProgram({ coachId: otherCoach.id, athleteId: other.id, exerciseIds: [first.forge.id] });
    const detail = await storage.getWorkoutDayDetail(other.id, assignment.id, day.id, "2026-01-05");
    expect(detail?.day.exercises[0].exercise.videoUrl).toBe(FORGE_LINK);
  });

  it("goes on Forge exercises only, takes a web link only, and is the head coach's to set", async () => {
    const { coach, client, forge, own } = await program();
    expect((await client.put(`/api/coach/exercises/${own.id}/program-video`, { videoUrl: LINK })).status).toBe(NOT_FOUND);
    expect((await client.put(`/api/coach/exercises/${forge.id}/program-video`, { videoUrl: "javascript:alert(1)" })).status).toBe(BAD_REQUEST);
    const assistant = await makeLoginableUser({ role: "coach" });
    await db.insert(coachStaff).values({ primaryCoachId: coach.id, staffCoachId: assistant.id });
    const staffClient = await loginAs(server.baseUrl, assistant);
    expect((await staffClient.put(`/api/coach/exercises/${forge.id}/program-video`, { videoUrl: LINK })).status).toBe(FORBIDDEN);
  });
});

describe("the program's words outside the app", () => {
  it("rename the words in an email's subject and text, and never in a legal notice", async () => {
    const { client, athlete } = await program();
    await client.patch("/api/coach/branding/extras", { terms: { program: { one: "Block", many: "Blocks" } } });
    await sendEmail({ to: athlete.email, subject: "Your new program", html: "<p>Your program is ready.</p>", brandForUserId: athlete.id });
    await sendEmail({ to: athlete.email, subject: "Notice about your program", html: "<p>This program notice is legal text.</p>", brandForUserId: athlete.id, programWords: false });
    const renamed = testOutbox.find((m) => m.subject === "Your new block");
    expect(renamed?.html).toContain("Your block is ready.");
    const legal = testOutbox.find((m) => m.subject === "Notice about your program");
    expect(legal?.html).toContain("This program notice is legal text.");
  });
});
