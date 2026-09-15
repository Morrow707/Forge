import { describe, it, expect, beforeEach } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { coachAthletes } from "@shared/schema";
import {
  makeAthlete,
  makeCoach,
  makeExercise,
  makeAssignedProgram,
  resetDatabase,
} from "./test-support/fixtures";

/**
 * What one athlete learns about another from a team leaderboard.
 *
 * The leaderboard is scoped to a coach's roster, which sounds like the end of
 * the question and is not, because of how someone gets onto that roster.
 * coachCode is posted publicly -- flyers, a QR link, a team page -- and
 * signing up with it joins the coach's roster immediately, with no approval,
 * since the athlete is the one initiating. So the set of people who can read
 * a team leaderboard is "the team, plus anyone who has seen the poster".
 *
 * That made the leaderboard the largest unauthenticated-ish disclosure on the
 * platform: a hundred children's full names at a named club, each with age,
 * height, body weight, sport and position beside it.
 *
 * These tests fix what a teammate may walk away with. They do not fix the
 * roster seat itself, which is an onboarding decision.
 */
describe("a teammate cannot read a roster off the leaderboard", () => {
  let coachId: number;
  let viewerId: number;
  let exerciseId: number;

  async function logLift(athleteId: number, weight: number) {
    const { assignment, day, programExercises } = await makeAssignedProgram({
      coachId,
      athleteId,
      exerciseIds: [exerciseId],
    });
    await storage.submitWorkoutLog(athleteId, {
      assignmentId: assignment.id,
      programDayId: day.id,
      date: "2026-09-21",
      completed: true,
      entries: [
        {
          programExerciseId: programExercises[0].id,
          weightMode: "numeric" as const,
          weightUnit: "lbs" as const,
          sets: [{ setNumber: 1, reps: "5", weight: String(weight) }],
        },
      ],
    } as never);
  }

  beforeEach(async () => {
    await resetDatabase();
    const coach = await makeCoach({ name: "Public Coach" });
    coachId = coach.id;
    exerciseId = (await makeExercise(coachId, { name: "Back Squat" })).id;

    // The stranger: signed up with a code they saw on a poster.
    const viewer = await makeAthlete({ name: "Opportunist Stranger", sport: "Football" });
    viewerId = viewer.id;
    await db.insert(coachAthletes).values({ coachId, athleteId: viewerId });
    await logLift(viewerId, 185);

    // A real member of the squad, and a minor.
    const teammate = await makeAthlete({
      name: "Priya Raghunathan",
      sport: "Football",
      position: "Safety",
      age: 15,
      heightIn: 68,
      bodyWeightLbs: 154,
    });
    await db.insert(coachAthletes).values({ coachId, athleteId: teammate.id });
    await logLift(teammate.id, 275);
  });

  it("shows a teammate by first name and last initial, never in full", async () => {
    const board = await storage.getLeaderboardForAthleteView(viewerId, exerciseId);
    const other = board!.find((e: any) => !e.isYou)!;

    expect(other.name).toBe("Priya R.");
    expect(JSON.stringify(board)).not.toContain("Raghunathan");
  });

  it("does not hand over a teammate's height or body weight", async () => {
    // The fields that turn a partial name into an identification, and the
    // ones with no business on a leaderboard in the first place.
    const board = await storage.getLeaderboardForAthleteView(viewerId, exerciseId);
    const other = board!.find((e: any) => !e.isYou)! as any;

    expect(other.heightIn).toBeUndefined();
    expect(other.bodyWeightLbs).toBeUndefined();
  });

  it("does not hand over a teammate's user id", async () => {
    // An id is a handle that addresses the same person on other routes, so
    // leaving it here would undo the rest of this by one hop.
    const board = await storage.getLeaderboardForAthleteView(viewerId, exerciseId);
    for (const entry of board as any[]) {
      expect(entry.id).toBeUndefined();
    }
  });

  it("still tells the viewer which row is theirs, and in full", async () => {
    // The feature has to survive the fix. A leaderboard you cannot find
    // yourself on is not one.
    const board = await storage.getLeaderboardForAthleteView(viewerId, exerciseId);
    const mine = board!.filter((e: any) => e.isYou);

    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe("Opportunist Stranger");
    expect(board!.length).toBe(2);
  });

  it("still ranks everyone, so the board is still a board", async () => {
    const board = await storage.getLeaderboardForAthleteView(viewerId, exerciseId);
    const ranks = (board as any[]).map((e) => e.rank).sort((a, b) => a - b);

    // Ranks are zero-based in this codebase.
    expect(ranks).toEqual([0, 1]);
    // The heavier lift ranks first, and the number itself is still shown --
    // this is what an athlete opens the page for.
    const top = (board as any[]).find((e) => e.rank === 0);
    expect(top.estimatedOneRm).toBeGreaterThan(0);
    expect(top.isYou).toBe(false);
  });

  it("leaves the coach's own view untouched", async () => {
    // A coach knows their athletes by name because that is what coaching is.
    const full = await storage.getFullLeaderboardForExercise(coachId, exerciseId);
    const names = full.map((e: any) => e.name);

    expect(names).toContain("Priya Raghunathan");
    expect(full.every((e: any) => typeof e.id === "number")).toBe(true);
  });
});
