import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { assignmentExerciseRegressions } from "@shared/schema";
import {
  makeAssignedProgram,
  makeAthlete,
  makeCoach,
  makeExercise,
  resetDatabase,
} from "./test-support/fixtures";

// "THIS IS TOO HARD" HAS TO SURVIVE THE DIALOG CLOSING.
//
// regressExerciseForAthlete's docblock says the lowered prescription is recorded and
// visible to the coach, because an athlete quietly training lighter for six weeks is
// a coaching problem the coach never learns about. It recorded nothing: the AI answer
// was returned to the caller and dropped. These cover the two halves of the plumbing
// that made it real -- the athlete's day reading back the lowered numbers, and the
// coach's list of what was asked for.
//
// The model call itself is not exercised here (it needs ANTHROPIC_API_KEY and would
// be a different test); the row it writes is inserted directly, which is exactly the
// seam that was missing.

const DATE = "2026-01-05";

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
  return { coach, athlete, squat, ...program };
}

async function recordRegression(opts: {
  assignmentId: number;
  programDayId: number;
  programExerciseId: number;
  date?: string;
  athleteNote?: string | null;
}) {
  await db.insert(assignmentExerciseRegressions).values({
    assignmentId: opts.assignmentId,
    programDayId: opts.programDayId,
    programExerciseId: opts.programExerciseId,
    date: opts.date ?? DATE,
    sets: 2,
    reps: "5",
    loadHint: "drop to the empty bar",
    summary: "Same squat, lighter today.",
    athleteNote: opts.athleteNote ?? "knee felt off warming up",
  });
}

describe("a recorded regression reaches the athlete's day", () => {
  beforeEach(resetDatabase);

  it("lowers the prescription and carries the coach's original numbers", async () => {
    const s = await setup();
    const pe = s.programExercises[0];
    await recordRegression({
      assignmentId: s.assignment.id,
      programDayId: s.day.id,
      programExerciseId: pe.id,
    });

    const detail = (await storage.getWorkoutDayDetail(
      s.athlete.id,
      s.assignment.id,
      s.day.id,
      DATE,
    )) as any;
    const slot = detail.day.exercises.find((e: any) => e.id === pe.id);
    expect(slot.sets).toBe(2);
    expect(slot.reps).toBe("5");
    expect(slot.regression).toMatchObject({
      prescribedSets: 3,
      sets: 2,
      loadHint: "drop to the empty bar",
      athleteNote: "knee felt off warming up",
    });
  });

  it("leaves a different date's day as prescribed", async () => {
    const s = await setup();
    const pe = s.programExercises[0];
    await recordRegression({
      assignmentId: s.assignment.id,
      programDayId: s.day.id,
      programExerciseId: pe.id,
      date: "2026-01-12",
    });

    const detail = (await storage.getWorkoutDayDetail(
      s.athlete.id,
      s.assignment.id,
      s.day.id,
      DATE,
    )) as any;
    const slot = detail.day.exercises.find((e: any) => e.id === pe.id);
    expect(slot.sets).toBe(3);
    expect(slot.regression).toBeNull();
  });
});

describe("the coach can see what was asked for", () => {
  beforeEach(resetDatabase);

  it("lists the regression with its exercise and the prescription it replaced", async () => {
    const s = await setup();
    await recordRegression({
      assignmentId: s.assignment.id,
      programDayId: s.day.id,
      programExerciseId: s.programExercises[0].id,
    });

    const rows = await storage.getExerciseRegressionsForAthlete(s.athlete.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      exerciseName: "Back Squat",
      prescribedSets: 3,
      prescribedReps: "5",
      sets: 2,
      athleteNote: "knee felt off warming up",
    });
  });

  it("never returns another athlete's regressions", async () => {
    const s = await setup();
    await recordRegression({
      assignmentId: s.assignment.id,
      programDayId: s.day.id,
      programExerciseId: s.programExercises[0].id,
    });
    const other = await makeAthlete();
    expect(await storage.getExerciseRegressionsForAthlete(other.id)).toHaveLength(0);
  });
});
