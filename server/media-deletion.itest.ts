import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import {
  problemReports,
  skillAssignments,
  skillDayComments,
  skillProgramDays,
  skillProgramWeeks,
  skillPrograms,
  workoutComments,
} from "@shared/schema";
import { users } from "@shared/schema";
import { hashPassword } from "./auth-utils";
import {
  makeAssignedProgram,
  makeAthlete,
  makeCoach,
  makeExercise,
  makeUploadedFile,
  resetDatabase,
  uploadedFileExists,
} from "./test-support/fixtures";

// Deletion is a claim about bytes, not about columns. Every assertion here
// checks the file on disk, because the whole class of bug this covers is a
// nulled reference with the media still sitting in the uploads volume.

function isoYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function givePassword(userId: number, password: string) {
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(users.id, userId));
}

async function makeSkillDayComment(opts: {
  coachId: number;
  athleteId: number;
  videoUrl?: string | null;
  imageUrl?: string | null;
  createdAt?: Date;
}) {
  const [program] = await db
    .insert(skillPrograms)
    .values({ coachId: opts.coachId, name: "Sprint mechanics" })
    .returning();
  const [week] = await db
    .insert(skillProgramWeeks)
    .values({ programId: program.id, weekNumber: 1 })
    .returning();
  const [day] = await db
    .insert(skillProgramDays)
    .values({ weekId: week.id, dayNumber: 1 })
    .returning();
  const [assignment] = await db
    .insert(skillAssignments)
    .values({
      skillProgramId: program.id,
      athleteId: opts.athleteId,
      coachId: opts.coachId,
      startDate: "2026-01-05",
    })
    .returning();
  const [comment] = await db
    .insert(skillDayComments)
    .values({
      skillAssignmentId: assignment.id,
      skillProgramDayId: day.id,
      authorId: opts.coachId,
      body: "Watch your shin angle here.",
      videoUrl: opts.videoUrl ?? null,
      imageUrl: opts.imageUrl ?? null,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    })
    .returning();
  return comment;
}

async function makeWorkoutComment(opts: {
  coachId: number;
  athleteId: number;
  videoUrl?: string | null;
  imageUrl?: string | null;
  createdAt?: Date;
}) {
  const exercise = await makeExercise(opts.coachId);
  const { assignment, day } = await makeAssignedProgram({
    coachId: opts.coachId,
    athleteId: opts.athleteId,
    exerciseIds: [exercise.id],
  });
  const [comment] = await db
    .insert(workoutComments)
    .values({
      assignmentId: assignment.id,
      programDayId: day.id,
      authorId: opts.coachId,
      body: "Nice lockout.",
      videoUrl: opts.videoUrl ?? null,
      imageUrl: opts.imageUrl ?? null,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    })
    .returning();
  return comment;
}

describe("skill-day comment media is reachable by every deletion path", () => {
  beforeEach(resetDatabase);

  it("deleteAdminVideo removes both files and clears both columns", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const video = await makeUploadedFile(`sdc-video-${Date.now()}.mp4`);
    const image = await makeUploadedFile(`sdc-image-${Date.now()}.png`);
    const comment = await makeSkillDayComment({
      coachId: coach.id,
      athleteId: athlete.id,
      videoUrl: video,
      imageUrl: image,
    });

    const result = await storage.deleteAdminVideo("skillComment", comment.id);

    expect(result).toEqual({ deleted: true, athleteId: athlete.id });
    expect(await uploadedFileExists(video)).toBe(false);
    expect(await uploadedFileExists(image)).toBe(false);
    const [row] = await db
      .select()
      .from(skillDayComments)
      .where(eq(skillDayComments.id, comment.id));
    expect(row.videoUrl).toBeNull();
    expect(row.imageUrl).toBeNull();
  });

  it("account deletion takes the athlete's skill-day comment media with it", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const video = await makeUploadedFile(`sdc-del-${Date.now()}.mp4`);
    await makeSkillDayComment({ coachId: coach.id, athleteId: athlete.id, videoUrl: video });

    // The fixtures write a placeholder hash, and deleteOwnAccount checks
    // the password before it does anything -- so give this account a real
    // one rather than asserting against a delete that silently refused.
    await givePassword(athlete.id, "correct-horse");
    expect(await storage.deleteOwnAccount(athlete.id, "correct-horse")).toEqual({ ok: true });
    expect(await uploadedFileExists(video)).toBe(false);
  });
});

describe("the guardian can see and act on coach-posted media", () => {
  beforeEach(resetDatabase);

  it("lists workout-comment and skill-day-comment media, not just the athlete's own captures", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const commentVideo = await makeUploadedFile(`wc-${Date.now()}.mp4`);
    const skillImage = await makeUploadedFile(`sdc-only-image-${Date.now()}.png`);
    await makeWorkoutComment({ coachId: coach.id, athleteId: athlete.id, videoUrl: commentVideo });
    await makeSkillDayComment({ coachId: coach.id, athleteId: athlete.id, imageUrl: skillImage });

    const videos = await storage.getVideosForAthlete(athlete.id);
    const sources = videos.map((v) => v.source).sort();

    expect(sources).toEqual(["comment", "skillComment"]);
  });

  it("does not leak another athlete's coach-posted media into the list", async () => {
    const coach = await makeCoach();
    const mine = await makeAthlete();
    const theirs = await makeAthlete();
    await makeSkillDayComment({
      coachId: coach.id,
      athleteId: theirs.id,
      videoUrl: await makeUploadedFile(`other-${Date.now()}.mp4`),
    });

    expect(await storage.getVideosForAthlete(mine.id)).toEqual([]);
  });
});

describe("the minor retention window covers coach-posted media", () => {
  beforeEach(resetDatabase);

  it("makes an aged skill-day comment on a Tier 1 athlete eligible", async () => {
    const coach = await makeCoach();
    const child = await makeAthlete({ dateOfBirth: isoYearsAgo(11) });
    const comment = await makeSkillDayComment({
      coachId: coach.id,
      athleteId: child.id,
      videoUrl: await makeUploadedFile(`aged-${Date.now()}.mp4`),
      createdAt: daysAgo(3650),
    });

    const eligible = await storage.getVideosEligibleForRetentionPurge();

    expect(eligible).toContainEqual({
      source: "skillComment",
      id: comment.id,
      tier: "tier1_under13",
    });
  });

  it("leaves an adult athlete's coach-posted media alone however old it is", async () => {
    const coach = await makeCoach();
    const adult = await makeAthlete({ dateOfBirth: isoYearsAgo(25) });
    await makeSkillDayComment({
      coachId: coach.id,
      athleteId: adult.id,
      videoUrl: await makeUploadedFile(`adult-${Date.now()}.mp4`),
      createdAt: daysAgo(3650),
    });

    expect(await storage.getVideosEligibleForRetentionPurge()).toEqual([]);
  });
});

describe("an image-only comment is deletable", () => {
  beforeEach(resetDatabase);

  it("removes a drawn-on still when the comment carries no video", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const image = await makeUploadedFile(`still-only-${Date.now()}.png`);
    const comment = await makeWorkoutComment({
      coachId: coach.id,
      athleteId: athlete.id,
      imageUrl: image,
    });

    const result = await storage.deleteAdminVideo("comment", comment.id);

    expect(result.deleted).toBe(true);
    expect(await uploadedFileExists(image)).toBe(false);
  });
});

describe("problem report screenshots do not outlive the account", () => {
  beforeEach(resetDatabase);

  it("deletes the attached image on account deletion", async () => {
    const coach = await makeCoach();
    const image = await makeUploadedFile(`report-${Date.now()}.png`);
    await db
      .insert(problemReports)
      .values({ userId: coach.id, message: "Camera stuck", imageUrl: image });

    await givePassword(coach.id, "correct-horse");
    expect(await storage.deleteOwnAccount(coach.id, "correct-horse")).toEqual({ ok: true });

    expect(await uploadedFileExists(image)).toBe(false);
  });
});
