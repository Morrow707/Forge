import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { assignmentCorrectives, videoReviews, workoutLogs, programDays } from "@shared/schema";
import {
  resetDatabase,
  makeExercise,
  makeAssignedProgram,
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
 * FROM A REVIEW TO THE ATHLETE'S NEXT SESSION -- Phase 4b of docs/video-review-plan.md.
 *
 * Two things here are worth a test, and the first is a DEVIATION from the plan that must not
 * be quietly reverted:
 *
 *  - The drill is written to `assignment_correctives`, not to `program_exercises`. A program
 *    day is shared by every athlete on that program, so the plan's route would have given the
 *    whole squad a corrective prescribed for one person's knee. Nothing about the shared
 *    template may change.
 *  - "Next" means the athlete's next UNLOGGED training day, not the next calendar date.
 *    Somebody a week behind should get the drill on the session they actually do next, not on
 *    one that has already gone by.
 */
describe("adding a corrective from a review", () => {
  let server: TestServer;
  let coach: TestClient;
  let otherCoach: TestClient;
  let coachId: number;
  let athleteId: number;
  let exerciseId: number;
  let reviewId: number;
  let assignmentId: number;
  let dayIds: number[];

  beforeAll(async () => {
    server = await startTestServer();
    await resetDatabase();
    const coachUser = await makeLoginableUser({ role: "coach" });
    const otherCoachUser = await makeLoginableUser({ role: "coach" });
    const athleteUser = await makeLoginableUser({ role: "athlete" });
    await addToRoster(coachUser.id, athleteUser.id);
    coachId = coachUser.id;
    athleteId = athleteUser.id;
    // ONE LOGIN PER ACTOR -- loginLimiter allows 15 per IP per fifteen minutes.
    coach = await loginAs(server.baseUrl, coachUser);
    otherCoach = await loginAs(server.baseUrl, otherCoachUser);
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await db.delete(assignmentCorrectives);
    await db.delete(workoutLogs);
    await db.delete(videoReviews);

    const exercise = await makeExercise(coachId, { name: "Goblet Squat" });
    exerciseId = exercise.id;
    const assigned = await makeAssignedProgram({
      coachId,
      athleteId,
      exerciseIds: [exercise.id],
    });
    assignmentId = assigned.assignment.id;
    // The fixture builds one day; a second is needed to ask what "next" means once the first
    // has been logged.
    await db
      .insert(programDays)
      .values({ weekId: assigned.week.id, dayNumber: 2, title: "Day 2" });
    // Scoped to THIS run's week: programs from earlier tests are still in the table, and an
    // unscoped read here silently asserts against another test's days.
    dayIds = (
      await db
        .select({ id: programDays.id })
        .from(programDays)
        .where(eq(programDays.weekId, assigned.week.id))
        .orderBy(programDays.dayNumber)
    ).map((d) => d.id);

    const review = await coach.post("/api/coach/video-reviews", {
      athleteId,
      title: "Squat check",
      leftClip: { videoUrl: "/uploads/x.mp4", source: "set", label: "Back Squat" },
    });
    expect(review.status).toBe(201);
    reviewId = review.body.id;
  });

  it("puts the drill on the athlete's next training day, as a corrective", async () => {
    const res = await coach.post(`/api/coach/video-reviews/${reviewId}/corrective`, {
      exerciseId,
      sets: 2,
      reps: "8",
      notes: "Slow eccentric, from the review",
    });
    expect(res.status).toBe(201);
    expect(res.body.programDayId).toBe(dayIds[0]);
    expect(res.body.corrective).toMatchObject({
      assignmentId,
      exerciseId,
      sets: 2,
      reps: "8",
      sourceReviewId: reviewId,
    });
  });

  it("never touches the shared program day", async () => {
    // THE deviation from the plan. program_exercises is the template every athlete on this
    // program reads; a drill for one person's knee must not appear in all of their sessions.
    const before = await db.query.programExercises.findMany();
    await coach.post(`/api/coach/video-reviews/${reviewId}/corrective`, { exerciseId });
    const after = await db.query.programExercises.findMany();
    expect(after).toEqual(before);
  });

  it("skips a day the athlete has already logged", async () => {
    await db.insert(workoutLogs).values({
      assignmentId,
      programDayId: dayIds[0],
      athleteId,
      date: "2026-09-01",
      completed: true,
    });
    const res = await coach.post(`/api/coach/video-reviews/${reviewId}/corrective`, { exerciseId });
    expect(res.status).toBe(201);
    expect(res.body.programDayId).toBe(dayIds[1]);
  });

  it("says so rather than writing onto a past session when every day is logged", async () => {
    for (const id of dayIds) {
      await db.insert(workoutLogs).values({
        assignmentId,
        programDayId: id,
        athleteId,
        date: "2026-09-01",
        completed: true,
      });
    }
    const res = await coach.post(`/api/coach/video-reviews/${reviewId}/corrective`, { exerciseId });
    expect(res.status).toBe(409);
    expect(await db.select().from(assignmentCorrectives)).toEqual([]);
  });

  it("refuses a coach who does not own the review", async () => {
    const res = await otherCoach.post(`/api/coach/video-reviews/${reviewId}/corrective`, {
      exerciseId,
    });
    expect(res.status).toBe(404);
    expect(await db.select().from(assignmentCorrectives)).toEqual([]);
  });

  it("keeps the prescribed drill when the review is deleted", async () => {
    // SET NULL, not CASCADE. A coach tidying up their reviews must not silently remove work
    // the athlete has been told to do.
    await coach.post(`/api/coach/video-reviews/${reviewId}/corrective`, { exerciseId });
    await db.delete(videoReviews).where(eq(videoReviews.id, reviewId));
    const rows = await db.select().from(assignmentCorrectives);
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceReviewId).toBeNull();
  });

  it("rejects a malformed request", async () => {
    expect((await coach.post(`/api/coach/video-reviews/${reviewId}/corrective`, {})).status).toBe(400);
    expect(
      (await coach.post(`/api/coach/video-reviews/${reviewId}/corrective`, { exerciseId, sets: 0 }))
        .status,
    ).toBe(400);
  });
});
