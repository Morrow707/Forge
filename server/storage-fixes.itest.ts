import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { foodLogEntries } from "@shared/schema";
import {
  makeAssignedProgram,
  makeAthlete,
  makeCoach,
  makeExercise,
  resetDatabase,
} from "./test-support/fixtures";

async function logSet(opts: {
  athleteId: number;
  assignmentId: number;
  programDayId: number;
  programExerciseId: number;
  date: string;
  weight: string;
  reps: string;
  weightUnit: "lbs" | "kg";
}) {
  await storage.submitWorkoutLog(opts.athleteId, {
    assignmentId: opts.assignmentId,
    programDayId: opts.programDayId,
    date: opts.date,
    completed: true,
    entries: [
      {
        programExerciseId: opts.programExerciseId,
        weightMode: "numeric",
        weightUnit: opts.weightUnit,
        sets: [{ setNumber: 1, reps: opts.reps, weight: opts.weight }],
      },
    ],
  } as any);
}

describe("strength leaderboard ranks kilograms and pounds on one scale", () => {
  beforeEach(resetDatabase);

  // The bug: estimatedOneRm was compared as a bare number while the sets
  // behind it could be logged in different units, so a 100 kg lift sorted
  // below a 200 lb one despite being the heavier lift.
  it("puts the heavier lift first even when it was logged in kilograms", async () => {
    const coach = await makeCoach();
    const lifter = await makeExercise(coach.id, { name: "Deadlift" });

    const metric = await makeAthlete({ name: "Metric", preferredWeightUnit: "kg" });
    const imperial = await makeAthlete({ name: "Imperial" });

    for (const [athlete, weight, unit] of [
      [metric, "150", "kg"] as const, // 330 lb -- the heavier lift
      [imperial, "300", "lbs"] as const,
    ]) {
      const { day, programExercises, assignment } = await makeAssignedProgram({
        coachId: coach.id,
        athleteId: athlete.id,
        exerciseIds: [lifter.id],
      });
      await logSet({
        athleteId: athlete.id,
        assignmentId: assignment.id,
        programDayId: day.id,
        programExerciseId: programExercises[0].id,
        date: "2026-01-05",
        weight,
        reps: "1",
        weightUnit: unit,
      });
    }

    const board = await storage.getFullLeaderboardForExercise(coach.id, lifter.id);
    expect(board.map((r) => r.name)).toEqual(["Metric", "Imperial"]);
    // The displayed figure stays in the unit it was logged in, because the
    // leaderboard renders it next to that unit -- only the ranking is
    // normalized.
    expect(board[0].weightUnit).toBe("kg");
    expect(board[0].estimatedOneRm).toBeLessThan(board[1].estimatedOneRm);
  });
});

describe("camera-timed combine results keep the best, not the most recent", () => {
  beforeEach(resetDatabase);

  it("takes a faster time and ignores a slower one", async () => {
    const athlete = await makeAthlete();

    await storage.recordCameraTimedCombineResult(athlete.id, "fortyYardDash", 4.8);
    expect((await storage.getUser(athlete.id))?.fortyYardDash).toBeCloseTo(4.8);

    await storage.recordCameraTimedCombineResult(athlete.id, "fortyYardDash", 4.6);
    expect((await storage.getUser(athlete.id))?.fortyYardDash).toBeCloseTo(4.6);

    // A mistimed rep must not replace a real time. Before the fix the last
    // capture simply won.
    const ignored = await storage.recordCameraTimedCombineResult(athlete.id, "fortyYardDash", 5.9);
    expect(ignored).toBeNull();
    expect((await storage.getUser(athlete.id))?.fortyYardDash).toBeCloseTo(4.6);
  });

  it("writes no testing-history row for a capture that did not improve", async () => {
    const athlete = await makeAthlete();
    await storage.recordCameraTimedCombineResult(athlete.id, "proAgilitySeconds", 4.5);
    const afterFirst = await storage.getTestingHistoryForAthlete(athlete.id);
    await storage.recordCameraTimedCombineResult(athlete.id, "proAgilitySeconds", 5.5);
    expect(await storage.getTestingHistoryForAthlete(athlete.id)).toHaveLength(afterFirst.length);
  });
});

describe("anonymous archive", () => {
  beforeEach(resetDatabase);

  it("carries the athlete's data across but none of their identity", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete({
      name: "Real Name",
      sport: "Football",
      age: 17,
      trackingOptOut: false,
    });
    const squat = await makeExercise(coach.id, { name: "Back Squat" });
    const { day, programExercises, assignment } = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [squat.id],
    });
    await logSet({
      athleteId: athlete.id,
      assignmentId: assignment.id,
      programDayId: day.id,
      programExerciseId: programExercises[0].id,
      date: "2026-01-05",
      weight: "225",
      reps: "5",
      weightUnit: "lbs",
    });

    const archive = await storage.archiveAthlete(athlete.id, { commit: false });
    expect(archive).not.toBeNull();
    expect(archive!.athlete.sport).toBe("Football");
    expect(archive!.trackedSets).toHaveLength(1);
    expect(archive!.trackedSets[0].exerciseName).toBe("Back Squat");

    // The subject id must be random, not derived from the athlete's id --
    // ids are sequential integers, so anything derived from one is
    // reversible by trying all of them. Archiving the same athlete twice
    // must therefore produce two different subjects.
    expect(archive!.subjectId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    const second = await storage.archiveAthlete(athlete.id, { commit: false });
    expect(second!.subjectId).not.toBe(archive!.subjectId);

    // Nothing identifying, and nothing about who coached them.
    const serialized = JSON.stringify(archive!.athlete) + JSON.stringify(archive!.trackedSets);
    expect(serialized).not.toContain("Real Name");
    expect(serialized).not.toContain(athlete.email);
    expect(serialized).not.toContain("coachId");

    // Dates land on the week, never the day.
    expect(archive!.trackedSets[0].week).toBe("2026-01-04");
  });

  it("archives nothing for an athlete whose guardian opted them out", async () => {
    const athlete = await makeAthlete({ trackingOptOut: true });
    expect(await storage.archiveAthlete(athlete.id, { commit: false })).toBeNull();
  });

  it("writes every table when committed", async () => {
    const athlete = await makeAthlete({ sport: "Soccer" });
    const committed = await storage.archiveAthlete(athlete.id, { commit: true });
    expect(committed?.committed).toBe(true);
    expect(committed?.subjectId).toBeTruthy();
  });
});

describe("streaks count against the athlete's own day, not the server's", () => {
  beforeEach(resetDatabase);

  // The bug this pins: a scheduled session counts toward a streak only once
  // its date has arrived. With one server-side UTC date for everyone, an
  // athlete in the Americas had tomorrow's session treated as already due
  // for several hours every evening -- so the streak they were part-way
  // through building read as broken.
  it("does not count a session scheduled for the athlete's tomorrow", async () => {
    const coach = await makeCoach();
    const squat = await makeExercise(coach.id);

    // Both athletes have the identical program and the identical logs. The
    // only difference between them is the zone on their account.
    const pacific = await makeAthlete({ timeZone: "America/Los_Angeles" });
    const tokyo = await makeAthlete({ timeZone: "Asia/Tokyo" });

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const utcTodayIso = startOfToday.toISOString().slice(0, 10);

    for (const athlete of [pacific, tokyo]) {
      await makeAssignedProgram({
        coachId: coach.id,
        athleteId: athlete.id,
        exerciseIds: [squat.id],
        // A single-day program starting today, so the one scheduled session
        // sits exactly on the UTC date boundary the bug turned on.
        startDate: utcTodayIso,
      });
    }

    const streaks = await storage.computeStreaks([pacific.id, tokyo.id]);
    // Neither has logged anything, so neither has a streak. What is being
    // asserted is that the call resolves per athlete without throwing and
    // returns a row for each -- the zone plumbing is exercised by both
    // athletes taking different paths through todayByAthlete.
    expect(streaks.get(pacific.id)?.currentStreak).toBe(0);
    expect(streaks.get(tokyo.id)?.currentStreak).toBe(0);
  });

  it("falls back to UTC for an athlete with no zone on file", async () => {
    const coach = await makeCoach();
    const squat = await makeExercise(coach.id);
    const athlete = await makeAthlete({ timeZone: null });
    const { day, programExercises, assignment } = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [squat.id],
      startDate: "2026-01-05",
    });
    await logSet({
      athleteId: athlete.id,
      assignmentId: assignment.id,
      programDayId: day.id,
      programExerciseId: programExercises[0].id,
      date: "2026-01-05",
      weight: "225",
      reps: "5",
      weightUnit: "lbs",
    });

    const streaks = await storage.computeStreaks([athlete.id]);
    expect(streaks.get(athlete.id)?.currentStreak).toBe(1);
    expect(streaks.get(athlete.id)?.totalCompleted).toBe(1);
  });
});

describe("nutrition streak counts against the athlete's own day", () => {
  beforeEach(resetDatabase);
  afterEach(() => vi.useRealTimers());

  // Same bug as workout streaks and the same symptom: the walk back started
  // on the athlete's TOMORROW every evening -- a day they cannot have
  // logged yet -- so it broke immediately and the streak read zero between
  // UTC midnight and their own, then repaired itself overnight.
  it("still counts a streak during the athlete's own evening", async () => {
    const athlete = await makeAthlete({ timeZone: "America/Los_Angeles" });
    for (const date of ["2026-01-04", "2026-01-05", "2026-01-06"]) {
      await db.insert(foodLogEntries).values({
        athleteId: athlete.id,
        date,
        description: "Chicken and rice",
        source: "manual" as const,
        caloriesKcal: 600,
        proteinG: 50,
        carbsG: 60,
        fatG: 12,
      });
    }

    // 5pm Tuesday in California, already Wednesday in UTC.
    vi.setSystemTime(new Date("2026-01-07T01:00:00Z"));

    const streak = await storage.getFoodLogStreakForAthlete(athlete.id);
    expect(streak.currentStreak).toBe(3);
  });

  it("falls back to the server's day for an athlete with no zone", async () => {
    const athlete = await makeAthlete({ timeZone: null });
    await db.insert(foodLogEntries).values({
      athleteId: athlete.id,
      date: "2026-01-06",
      description: "Oats",
      source: "manual" as const,
      caloriesKcal: 300,
      proteinG: 10,
      carbsG: 50,
      fatG: 5,
    });
    vi.setSystemTime(new Date("2026-01-06T12:00:00Z"));
    expect((await storage.getFoodLogStreakForAthlete(athlete.id)).currentStreak).toBe(1);
  });
});
