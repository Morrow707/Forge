import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { hashPassword } from "./auth-utils";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { users, workoutLogs, workoutComments } from "@shared/schema";
import {
  makeAssignedProgram,
  makeAthlete,
  makeCoach,
  makeExercise,
  makeLoggedSetWithVideo,
  makeUploadedFile,
  resetDatabase,
  uploadedFileExists,
} from "./test-support/fixtures";

// The two code paths in this app that destroy data on purpose. Neither had
// a single test, which is backwards -- these are the ones where a mistake is
// permanent and the ones a reader is least able to check by eye.

describe("deleteOwnAccount", () => {
  beforeEach(resetDatabase);

  const PASSWORD = "correct horse battery staple";

  async function athleteWithPassword() {
    return makeAthlete({ passwordHash: await hashPassword(PASSWORD) });
  }

  it("refuses a wrong password and deletes nothing", async () => {
    const athlete = await athleteWithPassword();
    const result = await storage.deleteOwnAccount(athlete.id, "not the password");
    expect(result).toEqual({ error: "Incorrect password." });
    expect(await db.select().from(users).where(eq(users.id, athlete.id))).toHaveLength(1);
  });

  it("removes the account and cascades to everything hanging off it", async () => {
    const coach = await makeCoach();
    const athlete = await athleteWithPassword();
    const squat = await makeExercise(coach.id);
    const { day, assignment } = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [squat.id],
    });
    await makeLoggedSetWithVideo({
      athleteId: athlete.id,
      assignmentId: assignment.id,
      programDayId: day.id,
      exerciseId: squat.id,
      date: "2026-01-05",
      videoUrl: await makeUploadedFile(`cascade-${athlete.id}.mp4`),
    });

    expect(await storage.deleteOwnAccount(athlete.id, PASSWORD)).toEqual({ ok: true });
    expect(await db.select().from(users).where(eq(users.id, athlete.id))).toHaveLength(0);
    expect(await db.select().from(workoutLogs).where(eq(workoutLogs.athleteId, athlete.id))).toHaveLength(0);
  });

  it("unlinks the athlete's video files, not just their database rows", async () => {
    const coach = await makeCoach();
    const athlete = await athleteWithPassword();
    const squat = await makeExercise(coach.id);
    const { day, assignment } = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [squat.id],
    });
    const videoUrl = await makeUploadedFile(`athlete-clip-${athlete.id}.mp4`);
    await makeLoggedSetWithVideo({
      athleteId: athlete.id,
      assignmentId: assignment.id,
      programDayId: day.id,
      exerciseId: squat.id,
      date: "2026-01-05",
      videoUrl,
    });

    expect(await uploadedFileExists(videoUrl)).toBe(true);
    await storage.deleteOwnAccount(athlete.id, PASSWORD);
    // A database cascade never touches the filesystem. Asserting on the row
    // alone would pass while the bytes sat on the disk forever.
    expect(await uploadedFileExists(videoUrl)).toBe(false);
  });

  it("unlinks a coach's own comment attachments too", async () => {
    // This one is the regression. deleteOwnAccount cleaned up files only for
    // athletes, on the reasoning that coaches have none of their own. They
    // do: every comment a coach writes can carry a video and a drawn-on
    // still, and author_id cascades from users -- so deleting a coach
    // removed the rows and stranded the files.
    const coach = await makeCoach({ passwordHash: await hashPassword(PASSWORD) });
    const athlete = await makeAthlete();
    const squat = await makeExercise(coach.id);
    const { day, assignment } = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [squat.id],
    });
    const commentVideo = await makeUploadedFile(`coach-comment-${coach.id}.mp4`);
    await db.insert(workoutComments).values({
      assignmentId: assignment.id,
      programDayId: day.id,
      authorId: coach.id,
      body: "watch your knees here",
      videoUrl: commentVideo,
    });

    expect(await uploadedFileExists(commentVideo)).toBe(true);
    expect(await storage.deleteOwnAccount(coach.id, PASSWORD)).toEqual({ ok: true });
    expect(await uploadedFileExists(commentVideo)).toBe(false);
  });
});

describe("video retention cap sweep", () => {
  beforeEach(resetDatabase);

  // A non-beta account with no active trial is the only shape the cap
  // applies to -- see getVideoRetentionLimits. Everything else is
  // deliberately unlimited while billing is still off.
  const CAPPED = { isBetaAccount: false, trialExpiresAt: null, hasVideoStorageAddOn: false };

  async function athleteWithVideos(count: number, opts: { via?: "program" | "corrective" } = {}) {
    const coach = await makeCoach();
    const athlete = await makeAthlete(CAPPED);
    const squat = await makeExercise(coach.id, { name: "Back Squat" });
    const { day, programExercises, assignment } = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [squat.id],
    });
    const urls: string[] = [];
    for (let i = 0; i < count; i++) {
      const url = await makeUploadedFile(`sweep-${athlete.id}-${i}.mp4`);
      urls.push(url);
      await makeLoggedSetWithVideo({
        athleteId: athlete.id,
        assignmentId: assignment.id,
        programDayId: day.id,
        exerciseId: squat.id,
        programExerciseId: programExercises[0].id,
        via: opts.via,
        date: `2026-01-${String(i + 1).padStart(2, "0")}`,
        videoUrl: url,
      });
    }
    return { athlete, urls };
  }

  it("leaves an athlete under the cap alone", async () => {
    await athleteWithVideos(3);
    const { warned, purged } = await storage.sweepVideoRetentionCap();
    expect(warned).toHaveLength(0);
    expect(purged).toBe(0);
  });

  it("warns about the excess once an athlete goes over the cap", async () => {
    const { athlete } = await athleteWithVideos(12); // cap is 10
    const { warned, purged } = await storage.sweepVideoRetentionCap();
    expect(warned).toHaveLength(2);
    expect(warned.every((w) => w.athleteId === athlete.id)).toBe(true);
    // Warning only. Nothing is deleted until the athlete has had the grace
    // window to hit the heart, and the clock does not even start until the
    // notification is confirmed sent.
    expect(purged).toBe(0);
  });

  it("counts videos logged against a corrective, which it used to miss entirely", async () => {
    // The sweep reached the exercise by joining through program_exercises,
    // so a set logged against a corrective -- program_exercise_id null --
    // was invisible to it: never counted toward the cap and never purged.
    // Those videos accumulated with no ceiling at all.
    await athleteWithVideos(12, { via: "corrective" });
    const { warned } = await storage.sweepVideoRetentionCap();
    expect(warned).toHaveLength(2);
  });

  it("never touches a favorited video, however many there are", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete(CAPPED);
    const squat = await makeExercise(coach.id);
    const { day, programExercises, assignment } = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [squat.id],
    });
    for (let i = 0; i < 12; i++) {
      await makeLoggedSetWithVideo({
        athleteId: athlete.id,
        assignmentId: assignment.id,
        programDayId: day.id,
        exerciseId: squat.id,
        programExerciseId: programExercises[0].id,
        date: `2026-02-${String(i + 1).padStart(2, "0")}`,
        videoUrl: await makeUploadedFile(`fav-${athlete.id}-${i}.mp4`),
        favorited: true,
      });
    }
    const { warned, purged } = await storage.sweepVideoRetentionCap();
    expect(warned).toHaveLength(0);
    expect(purged).toBe(0);
  });
});
