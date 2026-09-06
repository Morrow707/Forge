import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { goals, users, workoutLogEntries, workoutLogs, workoutSetEntries } from "@shared/schema";
import {
  makeAssignedProgram,
  makeAthlete,
  makeCoach,
  makeExercise,
  resetDatabase,
} from "./test-support/fixtures";

// A goal's progress is compared against a target the athlete typed next to a
// unit they picked. Converting that progress to any OTHER unit compares two
// different scales -- and the comparison writes achievedAt, which by design
// never flips back.

const LBS_PER_KG = 2.20462;

async function logSet(opts: {
  coachId: number;
  athleteId: number;
  exerciseId: number;
  weight: number;
  unit: "lbs" | "kg";
}) {
  const { assignment, day } = await makeAssignedProgram({
    coachId: opts.coachId,
    athleteId: opts.athleteId,
    exerciseIds: [opts.exerciseId],
  });
  const [log] = await db
    .insert(workoutLogs)
    .values({
      assignmentId: assignment.id,
      programDayId: day.id,
      athleteId: opts.athleteId,
      date: "2026-08-01",
      completed: true,
    })
    .returning();
  const [entry] = await db
    .insert(workoutLogEntries)
    .values({ workoutLogId: log.id, exerciseId: opts.exerciseId, weightMode: "numeric" })
    .returning();
  await db.insert(workoutSetEntries).values({
    logEntryId: entry.id,
    setNumber: 1,
    reps: "5",
    weight: String(opts.weight),
    weightUnit: opts.unit,
    repsCount: 5,
    weightLbs: opts.unit === "kg" ? opts.weight * LBS_PER_KG : opts.weight,
  });
}

async function setup(preferred: "lbs" | "kg") {
  const coach = await makeCoach();
  const athlete = await makeAthlete();
  await db.update(users).set({ preferredWeightUnit: preferred }).where(eq(users.id, athlete.id));
  const exercise = await makeExercise(coach.id);
  return { coach, athlete, exercise };
}

describe("goal progress is measured in the goal's own unit", () => {
  beforeEach(resetDatabase);

  it("does not mark a kilogram goal achieved off a pounds conversion", async () => {
    const { coach, athlete, exercise } = await setup("kg");
    await logSet({ coachId: coach.id, athleteId: athlete.id, exerciseId: exercise.id, weight: 100, unit: "kg" });
    await db.insert(goals).values({
      athleteId: athlete.id,
      createdBy: athlete.id,
      type: "exercise",
      exerciseId: exercise.id,
      targetValue: 120,
      targetUnit: "kg",
    });

    const [goal] = await storage.getGoalsForAthlete(athlete.id);

    // 100 kg against a 120 kg target. Read as 220.5 lbs it cleared the bar.
    expect(goal.currentValue).toBeCloseTo(100, 1);
    expect(goal.achieved).toBe(false);
  });

  it("leaves no permanent achievedAt stamp behind", async () => {
    const { coach, athlete, exercise } = await setup("kg");
    await logSet({ coachId: coach.id, athleteId: athlete.id, exerciseId: exercise.id, weight: 100, unit: "kg" });
    await db.insert(goals).values({
      athleteId: athlete.id,
      createdBy: athlete.id,
      type: "exercise",
      exerciseId: exercise.id,
      targetValue: 120,
      targetUnit: "kg",
    });

    await storage.getGoalsForAthlete(athlete.id);
    const [row] = await db.select().from(goals).where(eq(goals.athleteId, athlete.id));
    expect(row.achievedAt).toBeNull();
  });

  it("still reports a genuinely achieved kilogram goal", async () => {
    const { coach, athlete, exercise } = await setup("kg");
    await logSet({ coachId: coach.id, athleteId: athlete.id, exerciseId: exercise.id, weight: 130, unit: "kg" });
    await db.insert(goals).values({
      athleteId: athlete.id,
      createdBy: athlete.id,
      type: "exercise",
      exerciseId: exercise.id,
      targetValue: 120,
      targetUnit: "kg",
    });

    const [goal] = await storage.getGoalsForAthlete(athlete.id);
    expect(goal.achieved).toBe(true);
  });

  it("uses the goal's unit even when the account prefers the other one", async () => {
    // The account preference is deliberately the opposite of the goal's unit:
    // the goal is what the target was typed against.
    const { coach, athlete, exercise } = await setup("lbs");
    await logSet({ coachId: coach.id, athleteId: athlete.id, exerciseId: exercise.id, weight: 100, unit: "kg" });
    await db.insert(goals).values({
      athleteId: athlete.id,
      createdBy: athlete.id,
      type: "exercise",
      exerciseId: exercise.id,
      targetValue: 120,
      targetUnit: "kg",
    });

    const [goal] = await storage.getGoalsForAthlete(athlete.id);
    expect(goal.currentValue).toBeCloseTo(100, 1);
    expect(goal.achieved).toBe(false);
  });

  it("still works for a pounds goal", async () => {
    const { coach, athlete, exercise } = await setup("lbs");
    await logSet({ coachId: coach.id, athleteId: athlete.id, exerciseId: exercise.id, weight: 225, unit: "lbs" });
    await db.insert(goals).values({
      athleteId: athlete.id,
      createdBy: athlete.id,
      type: "exercise",
      exerciseId: exercise.id,
      targetValue: 200,
      targetUnit: "lbs",
    });

    const [goal] = await storage.getGoalsForAthlete(athlete.id);
    expect(goal.currentValue).toBeCloseTo(225, 1);
    expect(goal.achieved).toBe(true);
  });
});
