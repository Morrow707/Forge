import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { users, coachAthletes, assignmentCorrectives } from "@shared/schema";
import {
  makeAssignedProgram,
  makeAthlete,
  makeCoach,
  makeExercise,
  resetDatabase,
} from "./test-support/fixtures";

// getDayBriefingForCoach was rewritten from four queries per athlete to three
// in total (see its own comment, and scripts/perf-roster.ts for the numbers).
// Speed is not the risk in that change -- correctness is. The per-athlete
// version fetched each athlete's correctives with their own assignment id in
// the WHERE clause; the batched version fetches by program day and splits
// them up in memory, so the failure mode to rule out is one athlete's
// correctives showing on another athlete's card.
describe("the coach's day briefing", () => {
  beforeEach(resetDatabase);

  const TODAY = new Date().toISOString().slice(0, 10);

  async function board(athleteCount: number) {
    const coach = await makeCoach();
    const squat = await makeExercise(coach.id, { name: "Back Squat" });
    const bench = await makeExercise(coach.id, { name: "Bench Press" });
    const corrective = await makeExercise(coach.id, { name: "Band Pull-Apart" });

    const built = [];
    for (let i = 0; i < athleteCount; i++) {
      const athlete = await makeAthlete({ name: `Athlete ${i}` });
      await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: athlete.id });
      const program = await makeAssignedProgram({
        coachId: coach.id,
        athleteId: athlete.id,
        exerciseIds: [squat.id, bench.id],
        startDate: TODAY,
      });
      built.push({ athlete, program });
    }
    return { coach, squat, bench, corrective, built };
  }

  it("lists every athlete on the roster with their day's exercises", async () => {
    const { coach, built } = await board(3);
    const briefing = await storage.getDayBriefingForCoach(coach.id, TODAY);

    expect(briefing).toHaveLength(3);
    for (const row of briefing) {
      expect(row.entries).toHaveLength(1);
      expect(row.entries[0].exercises.map((e) => e.name)).toEqual(["Back Squat", "Bench Press"]);
    }
    expect(briefing.map((r) => r.athleteId).sort()).toEqual(
      built.map((b) => b.athlete.id).sort(),
    );
  });

  it("keeps one athlete's correctives off another athlete's card", async () => {
    // The whole reason this file exists. Both athletes are on the same
    // program day id; only the first has a corrective on it.
    const { coach, corrective, built } = await board(2);
    await db.insert(assignmentCorrectives).values({
      assignmentId: built[0].program.assignment.id,
      programDayId: built[0].program.day.id,
      exerciseId: corrective.id,
      orderIndex: 0,
      sets: 2,
      reps: "15",
    });

    const briefing = await storage.getDayBriefingForCoach(coach.id, TODAY);
    const first = briefing.find((r) => r.athleteId === built[0].athlete.id)!;
    const second = briefing.find((r) => r.athleteId === built[1].athlete.id)!;

    expect(first.entries[0].correctives).toEqual(["Band Pull-Apart"]);
    expect(second.entries[0].correctives).toEqual([]);
  });

  it("preserves corrective order within an athlete's day", async () => {
    const { coach, corrective, squat, built } = await board(1);
    await db.insert(assignmentCorrectives).values([
      {
        assignmentId: built[0].program.assignment.id,
        programDayId: built[0].program.day.id,
        exerciseId: squat.id,
        orderIndex: 1,
        sets: 1,
        reps: "5",
      },
      {
        assignmentId: built[0].program.assignment.id,
        programDayId: built[0].program.day.id,
        exerciseId: corrective.id,
        orderIndex: 0,
        sets: 2,
        reps: "15",
      },
    ]);

    const [row] = await storage.getDayBriefingForCoach(coach.id, TODAY);
    expect(row.entries[0].correctives).toEqual(["Band Pull-Apart", "Back Squat"]);
  });

  it("shows nothing for a coach with an empty roster", async () => {
    const coach = await makeCoach();
    expect(await storage.getDayBriefingForCoach(coach.id, TODAY)).toEqual([]);
  });

  it("includes an athlete with no session scheduled today", async () => {
    // A rest day and an off day both still belong on the board -- the coach
    // is looking at who is training, which includes who is not.
    const { coach, built } = await board(2);
    const other = await makeAthlete({ name: "Unscheduled" });
    await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: other.id });

    const briefing = await storage.getDayBriefingForCoach(coach.id, TODAY);
    expect(briefing).toHaveLength(3);
    const unscheduled = briefing.find((r) => r.athleteId === other.id)!;
    expect(unscheduled.entries).toEqual([]);
    expect(briefing.filter((r) => r.entries.length === 1)).toHaveLength(built.length);
  });

  it("does not leak another coach's athletes onto the board", async () => {
    const { coach } = await board(2);
    const otherCoach = await makeCoach();
    const otherExercise = await makeExercise(otherCoach.id, { name: "Their Lift" });
    const theirAthlete = await makeAthlete({ name: "Not Yours" });
    await db.insert(coachAthletes).values({ coachId: otherCoach.id, athleteId: theirAthlete.id });
    await makeAssignedProgram({
      coachId: otherCoach.id,
      athleteId: theirAthlete.id,
      exerciseIds: [otherExercise.id],
      startDate: TODAY,
    });

    const briefing = await storage.getDayBriefingForCoach(coach.id, TODAY);
    expect(briefing).toHaveLength(2);
    expect(briefing.map((r) => r.athleteName)).not.toContain("Not Yours");
  });

  it("costs the same number of queries whatever the roster size", async () => {
    // The regression this rewrite exists to prevent: the old shape was four
    // queries per athlete, which is invisible on a two-athlete test database
    // and 1,216 queries on a 300-athlete program.
    const { pool } = await import("./db");
    async function countFor(athleteCount: number) {
      await resetDatabase();
      const { coach } = await board(athleteCount);
      const real = pool.query.bind(pool);
      let n = 0;
      (pool as any).query = (...args: unknown[]) => {
        n += 1;
        return (real as any)(...args);
      };
      try {
        await storage.getDayBriefingForCoach(coach.id, TODAY);
      } finally {
        (pool as any).query = real;
      }
      return n;
    }
    const small = await countFor(2);
    const larger = await countFor(12);
    expect(larger).toBe(small);
  });
});
