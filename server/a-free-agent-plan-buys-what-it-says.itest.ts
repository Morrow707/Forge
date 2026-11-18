import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { programChatMessages } from "@shared/schema";
import { storage } from "./storage";
import {
  db,
  makeAssignedProgram,
  makeExercise,
  makeLoggedSetWithVideo,
  resetDatabase,
} from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

// THE FOUR FREE AGENT BUGS FROM THE 2026-11-17 PLAN AUDIT, driven through the real routes:
//
// 1. The goal picker asked the athlete's COACH for "lifts with history", so a Free Agent (no
//    coach) always got an empty list and could not set a lift goal at all.
// 2. The AI form check answered only for an AI-built program, so on a Forge template or a
//    hand-built program the $19.99 plan's headline feature refused every take.
// 3. Extra Video Storage could be bought on a plan that cannot film.
// (4. The upgrade page's storage card -- client-side, pinned in the client scan.)

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

const OK = 200;
const NOT_FOUND = 404;
const FORBIDDEN = 403;
const FIRST_NON_SUCCESS = 300;

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const take = { exerciseName: "Back Squat", images: [{ mediaType: "image/png", data: ONE_PIXEL_PNG }] };

async function freeAgent(tier: "basic" | "ai_coach" | "ai_coach_video") {
  const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
  await storage.updateFreeAgentBilling(athlete.id, { freeAgentTier: tier });
  return { athlete, client: await loginAs(server.baseUrl, athlete) };
}

describe("the goal picker for a Free Agent", () => {
  it("lists the lifts the athlete logged on their own days", async () => {
    const { athlete, client } = await freeAgent("basic");
    const lift = await makeExercise(athlete.id, { name: "Back Squat" });
    const untouched = await makeExercise(athlete.id, { name: "Never Logged" });
    // A self-assigned program: the athlete is its own coach on the assignment.
    const { assignment, day, programExercises } = await makeAssignedProgram({
      coachId: athlete.id,
      athleteId: athlete.id,
      exerciseIds: [lift.id, untouched.id],
    });
    await makeLoggedSetWithVideo({
      athleteId: athlete.id,
      assignmentId: assignment.id,
      programDayId: day.id,
      exerciseId: lift.id,
      programExerciseId: programExercises[0].id,
      date: "2026-11-10",
      videoUrl: "/uploads/form-videos/goal-picker.mp4",
    });

    const res = await client.get("/api/athlete/exercises-with-history");
    expect(res.status).toBe(OK);
    const names = (res.body as Array<{ name: string }>).map((e) => e.name);
    expect(names).toEqual(["Back Squat"]);
  });
});

describe("the AI form check on any program the athlete trains from", () => {
  it("answers on a program somebody else wrote that is on their calendar, and keeps nothing in that program's chat", async () => {
    const { athlete, client } = await freeAgent("ai_coach_video");
    const forge = await makeLoginableUser({ role: "admin" });
    const lift = await makeExercise(forge.id, { name: "Back Squat" });
    const { program } = await makeAssignedProgram({ coachId: forge.id, athleteId: athlete.id, exerciseIds: [lift.id] });

    const res = await client.post(`/api/athlete/programs/${program.id}/form-check`, take);
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(FIRST_NON_SUCCESS);
    // A Forge program is shared by every athlete who took it, so its chat is never written to.
    const rows = await db.select().from(programChatMessages).where(eq(programChatMessages.programId, program.id));
    expect(rows).toHaveLength(0);
  });

  it("answers on a program the athlete built by hand", async () => {
    const { athlete, client } = await freeAgent("ai_coach_video");
    const lift = await makeExercise(athlete.id, { name: "Back Squat" });
    const { program } = await makeAssignedProgram({ coachId: athlete.id, athleteId: athlete.id, exerciseIds: [lift.id] });

    const res = await client.post(`/api/athlete/programs/${program.id}/form-check`, take);
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(FIRST_NON_SUCCESS);
  });

  it("refuses a program that is neither theirs nor on their calendar", async () => {
    const { client } = await freeAgent("ai_coach_video");
    const stranger = await makeLoginableUser({ role: "athlete" });
    const lift = await makeExercise(stranger.id);
    const { program } = await makeAssignedProgram({ coachId: stranger.id, athleteId: stranger.id, exerciseIds: [lift.id] });

    const res = await client.post(`/api/athlete/programs/${program.id}/form-check`, take);
    expect(res.status).toBe(NOT_FOUND);
  });
});

describe("Extra Video Storage", () => {
  it.each(["basic", "ai_coach"] as const)("is refused to %s, which cannot film", async (tier) => {
    const { client } = await freeAgent(tier);
    const res = await client.post("/api/billing/checkout/free-agent-add-on", { addOnId: "video_storage" });
    expect(res.status, JSON.stringify(res.body)).toBe(FORBIDDEN);
    // The refusal names the plan that films: matches "goes with the AI Coach + Video plan",
    // rejects "goes with the AI Coach plan". https://regex101.com/?regex=AI%20Coach%20%5C%2B%20Video
    expect(res.body.message).toMatch(/AI Coach \+ Video/);
  });

  it("is not refused for that reason on the plan that films", async () => {
    const { client } = await freeAgent("ai_coach_video");
    const res = await client.post("/api/billing/checkout/free-agent-add-on", { addOnId: "video_storage" });
    expect(res.status).not.toBe(FORBIDDEN);
  });
});
