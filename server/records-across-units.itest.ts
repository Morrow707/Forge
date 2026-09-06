import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import {
  workoutLogEntries,
  workoutLogs,
  workoutSetEntries,
} from "@shared/schema";
import {
  makeAssignedProgram,
  makeAthlete,
  makeCoach,
  makeExercise,
  resetDatabase,
} from "./test-support/fixtures";

// Switching units is not a training event. It used to read as one: every
// comparison keyed or filtered on the unit, so the first set in a new unit
// was measured against an empty history and won.

const LBS_PER_KG = 2.20462;

async function logSet(opts: {
  coachId: number;
  athleteId: number;
  exerciseId: number;
  assignmentId: number;
  programDayId: number;
  date: string;
  reps: number;
  weight: number;
  unit: "lbs" | "kg";
}) {
  const [log] = await db
    .insert(workoutLogs)
    .values({
      assignmentId: opts.assignmentId,
      programDayId: opts.programDayId,
      athleteId: opts.athleteId,
      date: opts.date,
      completed: true,
    })
    .returning();
  const [entry] = await db
    .insert(workoutLogEntries)
    .values({
      workoutLogId: log.id,
      exerciseId: opts.exerciseId,
      weightMode: "numeric",
    })
    .returning();
  await db.insert(workoutSetEntries).values({
    logEntryId: entry.id,
    setNumber: 1,
    reps: String(opts.reps),
    weight: String(opts.weight),
    weightUnit: opts.unit,
    repsCount: opts.reps,
    weightLbs: opts.unit === "kg" ? opts.weight * LBS_PER_KG : opts.weight,
  });
}

async function setup() {
  const coach = await makeCoach();
  const athlete = await makeAthlete();
  const exercise = await makeExercise(coach.id);
  const { assignment, day } = await makeAssignedProgram({
    coachId: coach.id,
    athleteId: athlete.id,
    exerciseIds: [exercise.id],
  });
  return { coach, athlete, exercise, assignmentId: assignment.id, programDayId: day.id };
}

describe("records compare across a unit switch", () => {
  beforeEach(resetDatabase);

  it("does not count a lighter kilogram lift as a record over a heavier pound one", async () => {
    const ctx = await setup();
    // 100 kg is 220.5 lbs, so the later 200 lb set is genuinely lighter.
    await logSet({ ...ctx, coachId: ctx.coach.id, athleteId: ctx.athlete.id, exerciseId: ctx.exercise.id, date: "2026-08-01", reps: 5, weight: 100, unit: "kg" });
    await logSet({ ...ctx, coachId: ctx.coach.id, athleteId: ctx.athlete.id, exerciseId: ctx.exercise.id, date: "2026-08-08", reps: 5, weight: 200, unit: "lbs" });

    expect(await storage.getTotalPrCountForAthlete(ctx.athlete.id)).toBe(1);
  });

  it("counts a genuinely heavier lift in the other unit", async () => {
    const ctx = await setup();
    await logSet({ ...ctx, coachId: ctx.coach.id, athleteId: ctx.athlete.id, exerciseId: ctx.exercise.id, date: "2026-08-01", reps: 5, weight: 200, unit: "lbs" });
    await logSet({ ...ctx, coachId: ctx.coach.id, athleteId: ctx.athlete.id, exerciseId: ctx.exercise.id, date: "2026-08-08", reps: 5, weight: 100, unit: "kg" });

    expect(await storage.getTotalPrCountForAthlete(ctx.athlete.id)).toBe(2);
  });

  it("reports the best lift on one scale, in the athlete's own unit", async () => {
    const ctx = await setup();
    await logSet({ ...ctx, coachId: ctx.coach.id, athleteId: ctx.athlete.id, exerciseId: ctx.exercise.id, date: "2026-08-01", reps: 5, weight: 100, unit: "kg" });
    await logSet({ ...ctx, coachId: ctx.coach.id, athleteId: ctx.athlete.id, exerciseId: ctx.exercise.id, date: "2026-08-08", reps: 5, weight: 200, unit: "lbs" });

    // The 100 kg set is the best. Asked for in pounds it is 220.5; asked
    // for in kilograms it is 100.
    expect(await storage.getBestLiftForExercise(ctx.athlete.id, ctx.exercise.id, "lbs")).toBeCloseTo(220.5, 1);
    expect(await storage.getBestLiftForExercise(ctx.athlete.id, ctx.exercise.id, "kg")).toBeCloseTo(100, 1);
  });

  it("keeps the record list showing the unit the set was logged in", async () => {
    const ctx = await setup();
    await logSet({ ...ctx, coachId: ctx.coach.id, athleteId: ctx.athlete.id, exerciseId: ctx.exercise.id, date: "2026-08-01", reps: 5, weight: 100, unit: "kg" });

    const prs = await storage.getAllPrsForAthlete(ctx.athlete.id);
    // Comparison is normalized; display is not.
    expect(prs[0]?.unit).toBe("kg");
    expect(prs[0]?.weight).toBe(100);
  });
});
