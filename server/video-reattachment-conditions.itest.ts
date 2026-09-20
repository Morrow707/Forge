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
} from "./test-support/fixtures";

/** attachVideoToLoggedSet RETURNS false FOR FIVE DIFFERENT REASONS AND SAYS WHICH FOR NONE.
 *
 * A clip filmed with no Wi-Fi is queued on disk and uploaded later, addressed by
 * (assignmentId, programDayId, date, programExerciseId, setNumber) -- the set row has no stable
 * id, because every autosave deletes and reinserts it. When that address does not resolve, the
 * server answers { attached: false }, the client drops the clip into a 20-entry localStorage
 * list nobody reads, and nothing anywhere says a video went missing.
 *
 * These tests pin each condition so a future change to the matching rule has to state which of
 * them it is changing. They deliberately do NOT assert the rule is correct -- condition 3 (the
 * date) is a live design question.
 *
 * Since 2026-09-20 the function answers with WHICH condition declined it (see
 * UNATTACHED_VIDEO_CAUSES) and the route records that on unattached_video_uploads. The row-id
 * path that runs before the tuple is covered in video-reattach-by-row-id.itest.ts; every case
 * here sends no row id, so it exercises the tuple exactly as before. */

async function registerUpload(url: string, uploadedBy: number) {
  await db.insert(uploadedFiles).values({ path: url, uploadedBy });
}

const DAY = "2026-09-18";

async function setup() {
  const coach = await makeCoach();
  const athlete = await makeAthlete();
  const bench = await makeExercise(coach.id, { name: "Bench Press" });
  const program = await makeAssignedProgram({
    coachId: coach.id,
    athleteId: athlete.id,
    exerciseIds: [bench.id],
  });
  return { coach, athlete, program };
}

async function logDay(
  athleteId: number,
  program: Awaited<ReturnType<typeof setup>>["program"],
  date: string,
  sets: unknown[] = [{ setNumber: 1, reps: "10", weight: "135" }],
) {
  return storage.submitWorkoutLog(athleteId, {
    assignmentId: program.assignment.id,
    programDayId: program.day.id,
    date,
    completed: false,
    entries: [
      {
        programExerciseId: program.programExercises[0].id,
        weightMode: "numeric",
        weightUnit: "lbs",
        sets,
      },
    ],
  } as any);
}

async function attach(
  athleteId: number,
  program: Awaited<ReturnType<typeof setup>>["program"],
  clip: string,
  overrides: Partial<{ date: string; setNumber: number; assignmentId: number; programExerciseId: number }> = {},
) {
  return storage.attachVideoToLoggedSet(athleteId, {
    assignmentId: overrides.assignmentId ?? program.assignment.id,
    programDayId: program.day.id,
    date: overrides.date ?? DAY,
    programExerciseId: overrides.programExerciseId ?? program.programExercises[0].id,
    setNumber: overrides.setNumber ?? 1,
    videoUrl: clip,
  });
}

describe("reattaching a deferred clip", () => {
  beforeEach(resetDatabase);

  it("attaches when every part of the address resolves", async () => {
    const { athlete, program } = await setup();
    const clip = await makeUploadedFile(`bench-${Date.now()}.mp4`);
    await registerUpload(clip, athlete.id);
    await logDay(athlete.id, program, DAY);
    expect(await attach(athlete.id, program, clip)).toEqual({ attached: true, via: "tuple" });
  });

  // HYPOTHESIS 29, THE MIDNIGHT CASE. The clip names the day it was filmed under; the log row
  // exists under the day the athlete was actually training on when it saved. One set filmed at
  // 23:58 and flushed after midnight (or, identically, a day whose log was saved under the next
  // date) leaves the clip addressed to a date with no log row.
  it("returns false, silently, when no log exists for the clip's date", async () => {
    const { athlete, program } = await setup();
    const clip = await makeUploadedFile(`bench-${Date.now()}.mp4`);
    await registerUpload(clip, athlete.id);
    await logDay(athlete.id, program, "2026-09-19"); // saved under the NEXT day
    expect(await attach(athlete.id, program, clip, { date: DAY })).toEqual({ attached: false, cause: "no_log_for_date" });
    // And it is not merely unattached to THAT set -- the clip reaches no set at all.
    expect(await attach(athlete.id, program, clip, { date: "2026-09-17" })).toEqual({ attached: false, cause: "no_log_for_date" });
  });

  it("returns false when the file is not this athlete's upload", async () => {
    const { athlete, program } = await setup();
    const stranger = await makeAthlete();
    const clip = await makeUploadedFile(`bench-${Date.now()}.mp4`);
    await registerUpload(clip, stranger.id);
    await logDay(athlete.id, program, DAY);
    expect(await attach(athlete.id, program, clip)).toEqual({ attached: false, cause: "not_your_upload" });
  });

  it("returns false when the assignment is not this athlete's", async () => {
    const { athlete, program } = await setup();
    const clip = await makeUploadedFile(`bench-${Date.now()}.mp4`);
    await registerUpload(clip, athlete.id);
    await logDay(athlete.id, program, DAY);
    expect(await attach(athlete.id, program, clip, { assignmentId: program.assignment.id + 9999 })).toEqual({
      attached: false,
      cause: "assignment_not_yours",
    });
  });

  it("returns false when the day's log holds no entry for that exercise", async () => {
    const { athlete, program } = await setup();
    const clip = await makeUploadedFile(`bench-${Date.now()}.mp4`);
    await registerUpload(clip, athlete.id);
    await logDay(athlete.id, program, DAY);
    expect(
      await attach(athlete.id, program, clip, { programExerciseId: program.programExercises[0].id + 9999 }),
    ).toEqual({ attached: false, cause: "exercise_not_logged" });
  });

  it("returns false when that set already carries a video", async () => {
    const { athlete, program } = await setup();
    const first = await makeUploadedFile(`bench-a-${Date.now()}.mp4`);
    const second = await makeUploadedFile(`bench-b-${Date.now()}.mp4`);
    await registerUpload(first, athlete.id);
    await registerUpload(second, athlete.id);
    await logDay(athlete.id, program, DAY);
    expect((await attach(athlete.id, program, first)).attached).toBe(true);
    expect(await attach(athlete.id, program, second)).toEqual({ attached: false, cause: "set_already_has_video" });
  });

  it("returns false when the set number was never logged", async () => {
    const { athlete, program } = await setup();
    const clip = await makeUploadedFile(`bench-${Date.now()}.mp4`);
    await registerUpload(clip, athlete.id);
    await logDay(athlete.id, program, DAY);
    expect(await attach(athlete.id, program, clip, { setNumber: 4 })).toEqual({ attached: false, cause: "set_not_logged" });
  });
});
