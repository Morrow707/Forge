import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  resetDatabase,
  makeExercise,
  makeAssignedProgram,
  makeLoggedSetWithVideo,
  makeUploadedFile,
} from "./test-support/fixtures";
import {
  startTestServer,
  makeLoginableUser,
  addToRoster,
  loginAs,
  type TestServer,
} from "./test-support/http-app";

/**
 * WHOSE FOOTAGE A CLIP PICKER MAY LIST.
 *
 * Phase 1 of docs/video-review-plan.md puts a clip picker in front of a coach and lets them
 * choose any clip for either side of a comparison. That is a new way to ASK for video, and the
 * footage in question is very often a minor's.
 *
 * The routes scope through getRosterAthleteForCoach, the same resolver every other per-athlete
 * coach route uses -- which is also what makes them per-team narrowed. That is the right design
 * and it is exactly the kind of thing that stays right only while something checks it: a future
 * hand-rolled query here, or a widened resolver, breaks the scoping silently and the only
 * symptom is a coach seeing a name in a picker they should not have.
 *
 * Asked over HTTP rather than against storage, because the question is not "does the query
 * filter" but "what comes back when this person sends this request" -- middleware order, role
 * gates and the resolver all sit between the two.
 */
describe("clip lists are scoped to the caller's own athletes", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(resetDatabase);

  /** One coach with one athlete who has one clip, plus an unrelated coach and athlete. */
  async function setup() {
    const coach = await makeLoginableUser({ role: "coach" });
    const athlete = await makeLoginableUser({ role: "athlete" });
    const otherCoach = await makeLoginableUser({ role: "coach" });
    const otherAthlete = await makeLoginableUser({ role: "athlete" });
    await addToRoster(coach.id, athlete.id);
    await addToRoster(otherCoach.id, otherAthlete.id);

    const exercise = await makeExercise(coach.id, { name: "Back Squat" });
    const assigned = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [exercise.id],
    });
    const videoUrl = await makeUploadedFile("squat.mp4");
    await makeLoggedSetWithVideo({
      athleteId: athlete.id,
      assignmentId: assigned.assignment.id,
      programDayId: assigned.day.id,
      exerciseId: exercise.id,
      programExerciseId: assigned.programExercises[0].id,
      date: "2026-09-20",
      videoUrl,
    });
    return { coach, athlete, otherCoach, otherAthlete };
  }

  it("gives a coach their own athlete's clips", async () => {
    const { coach, athlete } = await setup();
    const client = await loginAs(server.baseUrl, coach);
    const res = await client.get(`/api/coach/roster/${athlete.id}/clips`);
    expect(res.status).toBe(200);
    const clips = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(clips)).toBe(true);
    expect(clips).toHaveLength(1);
    expect(clips[0].exerciseName).toBe("Back Squat");
    expect(clips[0].videoUrl).toBeTruthy();
  });

  it("does NOT list another coach's athlete", async () => {
    const { athlete, otherCoach } = await setup();
    const client = await loginAs(server.baseUrl, otherCoach);
    const res = await client.get(`/api/coach/roster/${athlete.id}/clips`);
    // 404, not 403: a coach learning that an athlete id EXISTS but is not theirs is itself a
    // disclosure, and every other per-athlete coach route answers the same way.
    expect(res.status).toBe(404);
  });

  it("does NOT hand over another athlete's saved skeleton", async () => {
    // The frames route is the one that returns the biometric identifier -- joint coordinates
    // derived from video of a person. It resolves the athlete the same way, and a reader who
    // fixed the list route and forgot this one would leak the more sensitive half.
    const { athlete, otherCoach } = await setup();
    const client = await loginAs(server.baseUrl, otherCoach);
    const res = await client.get(`/api/coach/roster/${athlete.id}/clips/1/frames`);
    expect(res.status).toBe(404);
  });

  it("gives an athlete only their own clips", async () => {
    const { athlete, otherAthlete } = await setup();
    const mine = await loginAs(server.baseUrl, athlete);
    const theirs = await loginAs(server.baseUrl, otherAthlete);

    const minesRes = await mine.get("/api/athlete/clips");
    expect(minesRes.status).toBe(200);
    expect(minesRes.body).toHaveLength(1);

    // The route takes no athlete id at all -- it scopes by the caller. This asserts that
    // property from the outside: a different athlete gets their own (empty) list, never a
    // shared one.
    const theirsRes = await theirs.get("/api/athlete/clips");
    expect(theirsRes.status).toBe(200);
    expect(theirsRes.body).toEqual([]);
  });

  it("refuses an unauthenticated caller", async () => {
    const { athlete } = await setup();
    const res = await fetch(`${server.baseUrl}/api/coach/roster/${athlete.id}/clips`);
    expect([401, 403]).toContain(res.status);
  });

  it("never ships skeleton frames in a list payload", async () => {
    // ~450 frames of 33 landmarks per clip. Shipping them with the list would make the picker
    // slow in proportion to how much an athlete has trained, and would hand a coach every
    // clip's biometric data to render a dropdown. hasSkeletonFrames is the flag; the frames
    // come from the per-clip route once a clip is actually chosen.
    const { coach, athlete } = await setup();
    const client = await loginAs(server.baseUrl, coach);
    const res = await client.get(`/api/coach/roster/${athlete.id}/clips`);
    // Serialised back so the assertion is about what crossed the wire, not about the shape a
    // reader happens to destructure.
    expect(JSON.stringify(res.body)).not.toContain("skeletonFrames");
    expect((res.body as Array<Record<string, unknown>>)[0]).toHaveProperty("hasSkeletonFrames");
  });
});
