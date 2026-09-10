import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { uploadedFiles } from "@shared/schema";
import {
  makeAssignedProgram,
  makeAthlete,
  makeCoach,
  makeExercise,
  makeUploadedFile,
  resetDatabase,
  uploadedFileExists,
} from "./test-support/fixtures";

// A workout save used to unlink every video the log held that the incoming payload did not
// mention. The client omits sets constantly -- a debounced autosave fires from state built
// before the last clip finished attaching, and the payload for the exercise being edited
// carries no rows for the others -- so ordinary logging quietly destroyed footage. A ledger
// walk over the production disk found 56 of 58 recorded uploads gone, with losses interleaved
// minutes apart between successful writes.
//
// Every assertion below is about bytes on disk, not columns, because a nulled reference with
// the file intact and an intact reference with the file gone are different bugs.

async function registerUpload(url: string, uploadedBy: number) {
  await db.insert(uploadedFiles).values({ path: url, uploadedBy });
}

async function setup() {
  const coach = await makeCoach();
  const athlete = await makeAthlete();
  const squat = await makeExercise(coach.id, { name: "Back Squat" });
  const jump = await makeExercise(coach.id, { name: "Box Jump" });
  const program = await makeAssignedProgram({
    coachId: coach.id,
    athleteId: athlete.id,
    exerciseIds: [squat.id, jump.id],
  });
  return { coach, athlete, program };
}

function save(
  athleteId: number,
  program: Awaited<ReturnType<typeof setup>>["program"],
  entries: unknown[],
) {
  return storage.submitWorkoutLog(athleteId, {
    assignmentId: program.assignment.id,
    programDayId: program.day.id,
    date: "2026-01-05",
    completed: false,
    entries,
  } as any);
}

function entry(programExerciseId: number, sets: unknown[]) {
  return { programExerciseId, weightMode: "numeric", weightUnit: "lbs", sets };
}

describe("a workout save only deletes video it was told to replace", () => {
  beforeEach(resetDatabase);

  it("keeps the squat clip when the next save carries only the box jump", async () => {
    const { athlete, program } = await setup();
    const [squatEx, jumpEx] = program.programExercises;

    const clip = await makeUploadedFile(`squat-${Date.now()}.mp4`);
    await registerUpload(clip, athlete.id);

    await save(athlete.id, program, [
      entry(squatEx.id, [{ setNumber: 1, reps: 5, weight: "225", formCheckVideoUrl: clip }]),
    ]);
    expect(await uploadedFileExists(clip)).toBe(true);

    // The box jump tracker saves its own set. Its payload knows nothing about the squat.
    await save(athlete.id, program, [entry(jumpEx.id, [{ setNumber: 1, reps: 3, weight: "0" }])]);

    expect(await uploadedFileExists(clip)).toBe(true);
  });

  it("keeps a clip when a later set of the same exercise is saved without it", async () => {
    const { athlete, program } = await setup();
    const [squatEx] = program.programExercises;

    const clip = await makeUploadedFile(`set1-${Date.now()}.mp4`);
    await registerUpload(clip, athlete.id);

    await save(athlete.id, program, [
      entry(squatEx.id, [{ setNumber: 1, reps: 5, weight: "225", formCheckVideoUrl: clip }]),
    ]);

    // Set 2 logged from state built before set 1's upload attached: set 1 comes back bare.
    await save(athlete.id, program, [
      entry(squatEx.id, [
        { setNumber: 1, reps: 5, weight: "225" },
        { setNumber: 2, reps: 5, weight: "235" },
      ]),
    ]);

    expect(await uploadedFileExists(clip)).toBe(true);
  });

  // The other half of the contract: deleting is still possible, it just has to be asked for.
  it("deletes the file when the athlete taps Remove", async () => {
    const { athlete, program } = await setup();
    const [squatEx] = program.programExercises;

    const clip = await makeUploadedFile(`removed-${Date.now()}.mp4`);
    await registerUpload(clip, athlete.id);

    await save(athlete.id, program, [
      entry(squatEx.id, [{ setNumber: 1, reps: 5, weight: "225", formCheckVideoUrl: clip }]),
    ]);
    await save(athlete.id, program, [
      entry(squatEx.id, [{ setNumber: 1, reps: 5, weight: "225", removeFormCheckVideo: true }]),
    ]);

    expect(await uploadedFileExists(clip)).toBe(false);
  });

  it("deletes the superseded file on a retake", async () => {
    const { athlete, program } = await setup();
    const [squatEx] = program.programExercises;

    const first = await makeUploadedFile(`take1-${Date.now()}.mp4`);
    const second = await makeUploadedFile(`take2-${Date.now()}.mp4`);
    await registerUpload(first, athlete.id);
    await registerUpload(second, athlete.id);

    await save(athlete.id, program, [
      entry(squatEx.id, [{ setNumber: 1, reps: 5, weight: "225", formCheckVideoUrl: first }]),
    ]);
    await save(athlete.id, program, [
      entry(squatEx.id, [{ setNumber: 1, reps: 5, weight: "225", formCheckVideoUrl: second }]),
    ]);

    expect(await uploadedFileExists(first)).toBe(false);
    expect(await uploadedFileExists(second)).toBe(true);
  });

  // The same clip moving between sets inside one payload must not be collected as an orphan.
  it("keeps a clip that moved to a different set number in the same save", async () => {
    const { athlete, program } = await setup();
    const [squatEx] = program.programExercises;

    const clip = await makeUploadedFile(`moved-${Date.now()}.mp4`);
    await registerUpload(clip, athlete.id);

    await save(athlete.id, program, [
      entry(squatEx.id, [{ setNumber: 1, reps: 5, weight: "225", formCheckVideoUrl: clip }]),
    ]);
    await save(athlete.id, program, [
      entry(squatEx.id, [
        { setNumber: 1, reps: 5, weight: "225", removeFormCheckVideo: true },
        { setNumber: 2, reps: 5, weight: "235", formCheckVideoUrl: clip },
      ]),
    ]);

    expect(await uploadedFileExists(clip)).toBe(true);
  });
});
