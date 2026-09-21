import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { workoutLogs, workoutSetEntries } from "@shared/schema";
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
  type TestClient,
} from "./test-support/http-app";

/**
 * "YOU VERSUS YOU" -- the earlier clip of the same lift, offered beside a new one.
 *
 * Phase 4b of docs/video-review-plan.md. The point of the feature is a comparison an athlete
 * can believe: the same person doing the same movement, far enough apart in time that a
 * difference means something. Three properties carry that, and all three are invisible from
 * the outside once they break:
 *
 *  - It is SCOPED. A prior clip is somebody's video, so the coach route resolves the athlete
 *    through getRosterAthleteForCoach like every other per-athlete route, and the athlete
 *    route takes no id at all.
 *  - There is a MINIMUM GAP. Yesterday's set is not a before-and-after; it is the same week.
 *    Offering one would make the feature say something it cannot support.
 *  - An ALIGNABLE clip wins. A clip with a rep breakdown can be lined up rep-for-rep; one
 *    without can only be scrubbed by hand. Given two eligible clips, the more recent one is
 *    not automatically the more useful one.
 *
 * Asked over HTTP for the same reason clip-list-scoping.itest.ts is: the question is what
 * comes back when this person sends this request, and the role gate and the resolver both sit
 * between the caller and the query.
 */
describe("the prior clip offered for a comparison", () => {
  let server: TestServer;
  let athleteId: number;
  let coachClient: TestClient;
  let otherCoachClient: TestClient;
  let athleteClient: TestClient;
  let strangerClient: TestClient;
  let assignmentId: number;
  let programDayId: number;
  let squatId: number;
  let benchId: number;
  let programExerciseIds: number[];

  /**
   * ONE LOGIN PER ACTOR FOR THE WHOLE FILE. loginLimiter allows 15 attempts per IP per
   * fifteen minutes, and every client here connects from 127.0.0.1 -- a login inside each
   * test spends that budget and the file starts failing with 429s that look like
   * authorization bugs. The actors and their program are built once; only the logged sets
   * are cleared between tests, which is the only state any of these cases writes.
   */
  beforeAll(async () => {
    server = await startTestServer();
    await resetDatabase();

    const coach = await makeLoginableUser({ role: "coach" });
    const athlete = await makeLoginableUser({ role: "athlete" });
    const otherCoach = await makeLoginableUser({ role: "coach" });
    const stranger = await makeLoginableUser({ role: "athlete" });
    await addToRoster(coach.id, athlete.id);
    athleteId = athlete.id;

    const squat = await makeExercise(coach.id, { name: "Back Squat" });
    const bench = await makeExercise(coach.id, { name: "Bench Press" });
    squatId = squat.id;
    benchId = bench.id;
    const assigned = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [squat.id, bench.id],
    });
    assignmentId = assigned.assignment.id;
    programDayId = assigned.day.id;
    programExerciseIds = assigned.programExercises.map((p) => p.id);

    coachClient = await loginAs(server.baseUrl, coach);
    otherCoachClient = await loginAs(server.baseUrl, otherCoach);
    athleteClient = await loginAs(server.baseUrl, athlete);
    strangerClient = await loginAs(server.baseUrl, stranger);
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    // The set entries cascade from the log, and nothing else in this file writes.
    await db.delete(workoutLogs);
  });

  async function logSet(exerciseIndex: number, date: string) {
    const videoUrl = await makeUploadedFile(`clip-${date}-${exerciseIndex}.mp4`);
    return makeLoggedSetWithVideo({
      athleteId,
      assignmentId,
      programDayId,
      exerciseId: exerciseIndex === 0 ? squatId : benchId,
      programExerciseId: programExerciseIds[exerciseIndex],
      date,
      videoUrl,
    });
  }

  /** A rep breakdown is what makes a clip alignable; the fixture writes sets without one. */
  async function markAlignable(setId: number) {
    await db
      .update(workoutSetEntries)
      .set({ repBreakdown: [{ repNumber: 1, startT: 0, endT: 1.2 }] })
      .where(eq(workoutSetEntries.id, setId));
  }

  const priorForCoach = (query: string) =>
    coachClient.get(`/api/coach/roster/${athleteId}/clips/prior?${query}`);

  it("offers the athlete's own earlier clip of the same lift", async () => {
    const old = await logSet(0, "2026-06-01");
    await logSet(0, "2026-09-20");

    const res = await priorForCoach("exercise=Back%20Squat&before=2026-09-20");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: old.set.id, source: "set", exerciseName: "Back Squat" });
  });

  it("does not offer a clip of a DIFFERENT lift", async () => {
    // A bench press is not the before picture for a squat. The exercise filter is the whole
    // claim the feature makes.
    await logSet(1, "2026-06-01");

    const res = await priorForCoach("exercise=Back%20Squat&before=2026-09-20");
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("does not offer a clip from inside the minimum gap", async () => {
    await logSet(0, "2026-09-18"); // two days back -- the same week, not a before-and-after

    const res = await priorForCoach("exercise=Back%20Squat&before=2026-09-20");
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("honours a caller-supplied gap", async () => {
    const recent = await logSet(0, "2026-09-18");

    const res = await priorForCoach("exercise=Back%20Squat&before=2026-09-20&minDays=1");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: recent.set.id });
  });

  it("prefers an alignable clip over a more recent one that is not", async () => {
    const alignable = await logSet(0, "2026-03-01");
    await logSet(0, "2026-06-01"); // newer, but no rep breakdown
    await markAlignable(alignable.set.id);

    const res = await priorForCoach("exercise=Back%20Squat&before=2026-09-20");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: alignable.set.id });
  });

  it("answers 200-with-null when there is nothing earlier, never 404", async () => {
    // A 404 is a broken URL, and the UI would have to tell the two apart to decide between
    // hiding a button and reporting a failure. "No earlier clip" is an ordinary answer.
    await logSet(0, "2026-09-20");

    const res = await priorForCoach("exercise=Back%20Squat&before=2026-09-20");
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("refuses a coach who does not have this athlete", async () => {
    await logSet(0, "2026-06-01");

    const res = await otherCoachClient.get(
      `/api/coach/roster/${athleteId}/clips/prior?exercise=Back%20Squat&before=2026-09-20`,
    );
    expect(res.status).toBe(404);
  });

  it("scopes the athlete's own route by the caller, not by a parameter", async () => {
    const old = await logSet(0, "2026-06-01");

    const res = await athleteClient.get(
      "/api/athlete/clips/prior?exercise=Back%20Squat&before=2026-09-20",
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: old.set.id });

    // The route takes no athlete id at all, so this asserts the property from the outside:
    // another athlete gets their own (empty) answer, never this one's clip.
    const theirRes = await strangerClient.get(
      "/api/athlete/clips/prior?exercise=Back%20Squat&before=2026-09-20",
    );
    expect(theirRes.status).toBe(200);
    expect(theirRes.body).toBeNull();
  });

  it("rejects a request with no exercise or no date", async () => {
    expect((await priorForCoach("before=2026-09-20")).status).toBe(400);
    expect((await priorForCoach("exercise=Back%20Squat")).status).toBe(400);
  });

  it("refuses an unauthenticated caller", async () => {
    const res = await fetch(
      `${server.baseUrl}/api/coach/roster/${athleteId}/clips/prior?exercise=Back%20Squat&before=2026-09-20`,
    );
    expect([401, 403]).toContain(res.status);
  });
});
