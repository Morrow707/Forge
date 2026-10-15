import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { coachAthletes, workoutLogs, workoutLogEntries, workoutSetEntries } from "@shared/schema";
import { makeAssignedProgram, makeAthlete, makeCoach, makeExercise, resetDatabase } from "./test-support/fixtures";

/**
 * AUTOREGULATION REACHES A FREE AGENT'S DAY AND NEVER A COACHED ATHLETE'S (2026-10-15).
 *
 * Scott: "lets have it auto regulate for the free agent classes, not the athletes as they are
 * controlled by the coach." The pure rule is in shared/autoregulation.ts; this proves the gate
 * on real rows: the same program, the same check-in, the same last session -- the only
 * difference between the two cases is a row in coach_athletes.
 */
const DATE = "2026-01-05";
const YESTERDAY = "2026-01-04";

async function setup() {
  const coach = await makeCoach();
  const athlete = await makeAthlete();
  const squat = await makeExercise(coach.id, { name: "Back Squat" });
  const program = await makeAssignedProgram({
    coachId: coach.id,
    athleteId: athlete.id,
    exerciseIds: [squat.id],
    startDate: DATE,
  });
  // Last time: 200 at RPE 6, so a green day should suggest 205.
  const [log] = await db
    .insert(workoutLogs)
    .values({ athleteId: athlete.id, assignmentId: program.assignment.id, programDayId: program.day.id, date: YESTERDAY })
    .returning();
  const [entry] = await db
    .insert(workoutLogEntries)
    .values({
      workoutLogId: log.id,
      programExerciseId: program.programExercises[0].id,
      exerciseId: squat.id,
      rpe: 6,
      weightMode: "numeric",
    })
    .returning();
  await db.insert(workoutSetEntries).values({ logEntryId: entry.id, setNumber: 1, reps: "5", weight: "200", weightUnit: "lbs" });
  return { coach, athlete, squat, ...program };
}

const checkIn = (athleteId: number, good: boolean) =>
  storage.upsertWellnessCheckin(athleteId, DATE, {
    sleepHours: good ? 8 : 4,
    soreness: good ? 1 : 5,
    stress: good ? 1 : 5,
    hydration: good ? 5 : 1,
    mentalFocus: good ? 5 : 1,
    bodyPainMap: [],
  });

const slotFor = async (s: Awaited<ReturnType<typeof setup>>) => {
  const detail = (await storage.getWorkoutDayDetail(s.athlete.id, s.assignment.id, s.day.id, DATE)) as any;
  return detail.day.exercises.find((e: any) => e.id === s.programExercises[0].id);
};

describe("autoregulation on the workout day", () => {
  beforeEach(resetDatabase);

  it("a Free Agent with a green check-in and an easy last session is offered 2.5% more", async () => {
    const s = await setup();
    await checkIn(s.athlete.id, true);
    const slot = await slotFor(s);
    expect(slot.autoregulation?.rule).toBe("green_easy");
    expect(slot.autoregulation?.suggestedWeight).toBe(205);
    // The prescription itself is untouched: it is a suggestion beside it.
    expect(slot.weight).toBe(s.programExercises[0].weight);
    expect(slot.sets).toBe(s.programExercises[0].sets);
  });

  it("a red check-in offers 10% off", async () => {
    const s = await setup();
    await checkIn(s.athlete.id, false);
    const slot = await slotFor(s);
    expect(slot.autoregulation?.rule).toBe("red");
    expect(slot.autoregulation?.suggestedWeight).toBe(180);
  });

  it("no check-in today means no suggestion", async () => {
    const s = await setup();
    const slot = await slotFor(s);
    expect(slot.autoregulation).toBeNull();
  });

  it("the SAME athlete, once coached, gets nothing: the coach's numbers are the coach's", async () => {
    const s = await setup();
    await checkIn(s.athlete.id, true);
    await db.insert(coachAthletes).values({ coachId: s.coach.id, athleteId: s.athlete.id });
    const slot = await slotFor(s);
    expect(slot.autoregulation).toBeNull();
    // And the existing last-session suggestion is still there for them, as it always was.
    expect(slot.lastPerformance?.suggestion).not.toBeNull();
  });
});
