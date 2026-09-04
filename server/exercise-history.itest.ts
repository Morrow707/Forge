import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import {
  makeAssignedProgram,
  makeAthlete,
  makeCoach,
  makeExercise,
  resetDatabase,
} from "./test-support/fixtures";

// The regression this file exists for: a coach editing a program day used to
// silently delete their athlete's history from every analytics read.
//
// updateProgramDay replaces a day's whole program_exercises row set on every
// save, even for exercises the edit did not touch, and that foreign key is
// ON DELETE SET NULL -- so every historical workout_log_entries row for the
// day loses its link. Sixteen reads resolved which exercise a set belonged
// to by joining live through program_exercises, so all of them dropped those
// sets: personal records, both leaderboards, load and ACWR, the progress
// summary, coach analytics, and the video retention sweeps.
//
// The fix was to resolve identity through workoutLogEntries.exerciseId, the
// snapshot written at submission time. This is the test that would have
// caught the original bug, and the one that stops it coming back the next
// time somebody reaches for the convenient join.
describe("exercise history survives a program-day edit", () => {
  beforeEach(resetDatabase);

  it("still finds a logged set after the coach edits the day it was logged on", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const squat = await makeExercise(coach.id, { name: "Back Squat" });
    const { day, programExercises, assignment } = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [squat.id],
    });

    await storage.submitWorkoutLog(athlete.id, {
      assignmentId: assignment.id,
      programDayId: day.id,
      date: "2026-01-05",
      completed: true,
      entries: [
        {
          programExerciseId: programExercises[0].id,
          weightMode: "numeric",
          weightUnit: "lbs",
          sets: [{ setNumber: 1, reps: "5", weight: "225" }],
        },
      ],
    } as any);

    const before = await storage.getExerciseHistoryForAthlete(athlete.id, squat.id);
    expect(before).toHaveLength(1);

    // The edit that used to erase it. Note it does not touch the squat --
    // it only renames the day -- which is what made the original bug so
    // hard to attribute: the exercise the coach edited was fine, and an
    // unrelated one lost its history.
    await storage.updateProgramDay(
      day.id,
      {
        title: "Renamed Day",
        isRestDay: false,
        exercises: [{ exerciseId: squat.id, orderIndex: 0, sets: 3, reps: "5" }],
      } as any,
      coach.id,
    );

    const after = await storage.getExerciseHistoryForAthlete(athlete.id, squat.id);
    expect(after).toHaveLength(1);
    expect(Number(after[0].weight)).toBe(225);
  });

  it("keeps the set attributed to the right exercise even after a program-day edit", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const squat = await makeExercise(coach.id, { name: "Back Squat" });
    const bench = await makeExercise(coach.id, { name: "Bench Press" });
    const { day, programExercises, assignment } = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [squat.id],
    });

    await storage.submitWorkoutLog(athlete.id, {
      assignmentId: assignment.id,
      programDayId: day.id,
      date: "2026-01-05",
      completed: true,
      entries: [
        {
          programExerciseId: programExercises[0].id,
          weightMode: "numeric",
          weightUnit: "lbs",
          sets: [{ setNumber: 1, reps: "5", weight: "225" }],
        },
      ],
    } as any);

    // The coach swaps the day's exercise entirely. The logged squat set must
    // stay a squat set -- resolving through the live join would have
    // relabelled it as a bench press, which is worse than losing it.
    await storage.updateProgramDay(
      day.id,
      {
        title: "Day 1",
        isRestDay: false,
        exercises: [{ exerciseId: bench.id, orderIndex: 0, sets: 3, reps: "5" }],
      } as any,
      coach.id,
    );

    expect(await storage.getExerciseHistoryForAthlete(athlete.id, squat.id)).toHaveLength(1);
    expect(await storage.getExerciseHistoryForAthlete(athlete.id, bench.id)).toHaveLength(0);
  });
});
