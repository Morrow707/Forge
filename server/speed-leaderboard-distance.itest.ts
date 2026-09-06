import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import {
  skillAssignments,
  skillExercises,
  skillProgramDays,
  skillProgramExercises,
  skillProgramWeeks,
  skillPrograms,
  skillSessionLogs,
} from "@shared/schema";
import { coachAthletes } from "@shared/schema";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

// A 10, a 40 and a 60 are three different events. Ranking every sprint for a
// drill on elapsed seconds alone put whoever ran the shortest distance on top
// of a board that looked like one event.

async function scaffold(coachId: number) {
  const [drill] = await db
    .insert(skillExercises)
    .values({ coachId, name: "Sprint", sports: ["football"], skillType: "Footwork" })
    .returning();
  const [program] = await db.insert(skillPrograms).values({ coachId, name: "Speed" }).returning();
  const [week] = await db.insert(skillProgramWeeks).values({ programId: program.id, weekNumber: 1 }).returning();
  const [day] = await db.insert(skillProgramDays).values({ weekId: week.id, dayNumber: 1, title: "D1" }).returning();
  const [pe] = await db
    .insert(skillProgramExercises)
    .values({ dayId: day.id, skillExerciseId: drill.id, orderIndex: 0, sets: 1, reps: "1", trackingLevel: "sprint" })
    .returning();
  return { drill, program, pe, day };
}

async function runSprint(opts: {
  coachId: number;
  athleteId: number;
  programId: number;
  peId: number;
  dayId: number;
  seconds: number;
  yards: number;
}) {
  const [assignment] = await db
    .insert(skillAssignments)
    .values({
      skillProgramId: opts.programId,
      athleteId: opts.athleteId,
      coachId: opts.coachId,
      startDate: "2026-01-05",
    })
    .returning();
  await db.insert(skillSessionLogs).values({
    skillAssignmentId: assignment.id,
    skillProgramDayId: opts.dayId,
    skillProgramExerciseId: opts.peId,
    athleteId: opts.athleteId,
    trackingLevel: "sprint",
    elapsedSeconds: opts.seconds,
    distanceYards: opts.yards,
  });
}

describe("the speed leaderboard is one board per distance", () => {
  beforeEach(resetDatabase);

  it("does not rank a 10-yard time against a 40-yard time", async () => {
    const coach = await makeCoach();
    const short = await makeAthlete({ name: "Short" });
    const long = await makeAthlete({ name: "Long" });
    for (const a of [short, long]) {
      await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: a.id });
    }
    const { drill, program, pe, day } = await scaffold(coach.id);

    // A slow 10 and a fast 40. On one mixed board the 10 wins outright.
    await runSprint({ coachId: coach.id, athleteId: short.id, programId: program.id, peId: pe.id, dayId: day.id, seconds: 2.0, yards: 10 });
    await runSprint({ coachId: coach.id, athleteId: long.id, programId: program.id, peId: pe.id, dayId: day.id, seconds: 4.5, yards: 40 });

    const distances = await storage.getSpeedLeaderboardDistancesForExercise(coach.id, drill.id);
    expect(distances).toEqual([10, 40]);

    const tens = await storage.getSpeedLeaderboardForExercise(coach.id, drill.id, 10);
    expect(tens.map((r) => r.id)).toEqual([short.id]);

    const forties = await storage.getSpeedLeaderboardForExercise(coach.id, drill.id, 40);
    expect(forties.map((r) => r.id)).toEqual([long.id]);
  });

  it("ranks within one distance by time", async () => {
    const coach = await makeCoach();
    const quick = await makeAthlete({ name: "Quick" });
    const slower = await makeAthlete({ name: "Slower" });
    for (const a of [quick, slower]) {
      await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: a.id });
    }
    const { drill, program, pe, day } = await scaffold(coach.id);

    await runSprint({ coachId: coach.id, athleteId: quick.id, programId: program.id, peId: pe.id, dayId: day.id, seconds: 4.4, yards: 40 });
    await runSprint({ coachId: coach.id, athleteId: slower.id, programId: program.id, peId: pe.id, dayId: day.id, seconds: 4.9, yards: 40 });
    // A blistering 10 that must not gatecrash the 40 board.
    await runSprint({ coachId: coach.id, athleteId: slower.id, programId: program.id, peId: pe.id, dayId: day.id, seconds: 1.5, yards: 10 });

    const forties = await storage.getSpeedLeaderboardForExercise(coach.id, drill.id, 40);
    expect(forties.map((r) => r.id)).toEqual([quick.id, slower.id]);
    expect(forties[0].elapsedSeconds).toBeCloseTo(4.4, 2);
    // Slower's best on the 40 board is their 40, not their 10.
    expect(forties[1].elapsedSeconds).toBeCloseTo(4.9, 2);
  });
});
