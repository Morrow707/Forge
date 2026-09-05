import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { users, guardianLinks, workoutSetEntries } from "@shared/schema";
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

// The four guardian rules against a real database. The source-level tests in
// guardian-rules.test.ts pin how the routes are declared; these pin what the
// queries actually do, which for the removal flow means a file on disk being
// gone or not gone.

function isoYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

async function makeGuardian() {
  const [row] = await db
    .insert(users)
    .values({
      email: `guardian-${Math.random().toString(36).slice(2)}@example.test`,
      passwordHash: "not-a-real-hash",
      name: "Test Guardian",
      role: "guardian",
    })
    .returning();
  return row;
}

describe("rule 1: the minor gate", () => {
  beforeEach(resetDatabase);

  it("blocks a minor with no guardian linked", async () => {
    const athlete = await makeAthlete({ dateOfBirth: isoYearsAgo(15) });
    expect(await storage.isAthleteBlockedPendingGuardian(athlete.id)).toBe(true);
  });

  it("unblocks the moment a guardian is linked", async () => {
    const athlete = await makeAthlete({ dateOfBirth: isoYearsAgo(15) });
    const guardian = await makeGuardian();
    await db.insert(guardianLinks).values({ athleteId: athlete.id, guardianId: guardian.id });
    expect(await storage.isAthleteBlockedPendingGuardian(athlete.id)).toBe(false);
  });

  it("never blocks an adult, linked or not", async () => {
    const athlete = await makeAthlete({ dateOfBirth: isoYearsAgo(22) });
    expect(await storage.isAthleteBlockedPendingGuardian(athlete.id)).toBe(false);
  });

  it("never blocks an athlete whose age it does not know", async () => {
    // Accounts predating the dateOfBirth column. Guessing here would lock
    // out every one of them.
    const athlete = await makeAthlete({ dateOfBirth: null });
    expect(await storage.isAthleteBlockedPendingGuardian(athlete.id)).toBe(false);
  });

  it("will not let a guardian unlink from a minor and lock them out", async () => {
    const athlete = await makeAthlete({ dateOfBirth: isoYearsAgo(15) });
    const guardian = await makeGuardian();
    const [link] = await db
      .insert(guardianLinks)
      .values({ athleteId: athlete.id, guardianId: guardian.id })
      .returning();

    const result = await storage.removeGuardianLink(guardian.id, "guardian", link.id);
    expect(result.ok).toBe(false);
    expect(await storage.isAthleteBlockedPendingGuardian(athlete.id)).toBe(false);
  });

  it("lets a guardian step away once the athlete is an adult", async () => {
    const athlete = await makeAthlete({ dateOfBirth: isoYearsAgo(22) });
    const guardian = await makeGuardian();
    const [link] = await db
      .insert(guardianLinks)
      .values({ athleteId: athlete.id, guardianId: guardian.id })
      .returning();
    expect((await storage.removeGuardianLink(guardian.id, "guardian", link.id)).ok).toBe(true);
  });
});

describe("rules 2 and 4: seeing videos, and asking for one to go", () => {
  beforeEach(resetDatabase);

  async function athleteWithVideo() {
    const coach = await makeCoach();
    const athlete = await makeAthlete({ dateOfBirth: isoYearsAgo(15) });
    const guardian = await makeGuardian();
    await db.insert(guardianLinks).values({ athleteId: athlete.id, guardianId: guardian.id });
    const exercise = await makeExercise(coach.id, { name: "Back Squat" });
    const { day, assignment, programExercises } = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [exercise.id],
    });
    const videoUrl = await makeUploadedFile(`guardian-removal-${Math.random().toString(36).slice(2)}.mp4`);
    const { set } = await makeLoggedSetWithVideo({
      athleteId: athlete.id,
      assignmentId: assignment.id,
      programDayId: day.id,
      exerciseId: exercise.id,
      programExerciseId: programExercises[0].id,
      date: new Date().toISOString().slice(0, 10),
      videoUrl,
    });
    return { athlete, guardian, set, videoUrl };
  }

  it("lists the athlete's videos with a label a parent can recognize", async () => {
    const { athlete } = await athleteWithVideo();
    const videos = await storage.getVideosForAthlete(athlete.id);
    expect(videos).toHaveLength(1);
    expect(videos[0].source).toBe("set");
    expect(videos[0].label).toBe("Back Squat");
  });

  it("shows one athlete nothing of another's", async () => {
    await athleteWithVideo();
    const other = await makeAthlete({ dateOfBirth: isoYearsAgo(15) });
    expect(await storage.getVideosForAthlete(other.id)).toHaveLength(0);
  });

  it("filing a request does not delete anything", async () => {
    const { athlete, guardian, set, videoUrl } = await athleteWithVideo();
    const result = await storage.createMediaRemovalRequest({
      athleteId: athlete.id,
      guardianId: guardian.id,
      source: "set",
      sourceId: set.id,
      label: "Back Squat (today)",
      reason: "Please take this down.",
    });
    expect(result.ok).toBe(true);
    // The whole point of the rule: the parent asked, and nothing happened
    // to the video yet.
    expect(await uploadedFileExists(videoUrl)).toBe(true);
    const [row] = await db
      .select({ url: workoutSetEntries.formCheckVideoUrl })
      .from(workoutSetEntries)
      .where(eq(workoutSetEntries.id, set.id));
    expect(row.url).toBe(videoUrl);
  });

  it("refuses a second open request for the same video", async () => {
    const { athlete, guardian, set } = await athleteWithVideo();
    const args = {
      athleteId: athlete.id,
      guardianId: guardian.id,
      source: "set" as const,
      sourceId: set.id,
      label: "Back Squat (today)",
    };
    expect((await storage.createMediaRemovalRequest(args)).ok).toBe(true);
    expect((await storage.createMediaRemovalRequest(args)).ok).toBe(false);
  });

  it("deletes the file only when an admin approves", async () => {
    const { athlete, guardian, set, videoUrl } = await athleteWithVideo();
    const admin = await makeCoach({ role: "admin" });
    const created = await storage.createMediaRemovalRequest({
      athleteId: athlete.id,
      guardianId: guardian.id,
      source: "set",
      sourceId: set.id,
      label: "Back Squat (today)",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const resolved = await storage.resolveMediaRemovalRequest(
      created.request.id,
      admin.id,
      "approved",
      "Removed as requested.",
    );
    expect(resolved).toEqual({ ok: true, deleted: true });
    expect(await uploadedFileExists(videoUrl)).toBe(false);
    const [row] = await db
      .select({ url: workoutSetEntries.formCheckVideoUrl })
      .from(workoutSetEntries)
      .where(eq(workoutSetEntries.id, set.id));
    expect(row.url).toBeNull();
  });

  it("denying keeps the video", async () => {
    const { athlete, guardian, set, videoUrl } = await athleteWithVideo();
    const admin = await makeCoach({ role: "admin" });
    const created = await storage.createMediaRemovalRequest({
      athleteId: athlete.id,
      guardianId: guardian.id,
      source: "set",
      sourceId: set.id,
      label: "Back Squat (today)",
    });
    if (!created.ok) throw new Error("setup failed");
    const resolved = await storage.resolveMediaRemovalRequest(
      created.request.id,
      admin.id,
      "denied",
      "This is the athlete's own training record.",
    );
    expect(resolved).toEqual({ ok: true, deleted: false });
    expect(await uploadedFileExists(videoUrl)).toBe(true);
  });

  it("answers a request once and only once", async () => {
    const { athlete, guardian, set } = await athleteWithVideo();
    const admin = await makeCoach({ role: "admin" });
    const created = await storage.createMediaRemovalRequest({
      athleteId: athlete.id,
      guardianId: guardian.id,
      source: "set",
      sourceId: set.id,
      label: "Back Squat (today)",
    });
    if (!created.ok) throw new Error("setup failed");
    await storage.resolveMediaRemovalRequest(created.request.id, admin.id, "denied");
    const second = await storage.resolveMediaRemovalRequest(created.request.id, admin.id, "approved");
    expect(second.ok).toBe(false);
  });

  it("drops out of the admin queue once answered", async () => {
    const { athlete, guardian, set } = await athleteWithVideo();
    const admin = await makeCoach({ role: "admin" });
    const created = await storage.createMediaRemovalRequest({
      athleteId: athlete.id,
      guardianId: guardian.id,
      source: "set",
      sourceId: set.id,
      label: "Back Squat (today)",
    });
    if (!created.ok) throw new Error("setup failed");
    expect(await storage.getOpenMediaRemovalRequests()).toHaveLength(1);
    await storage.resolveMediaRemovalRequest(created.request.id, admin.id, "approved");
    expect(await storage.getOpenMediaRemovalRequests()).toHaveLength(0);
    // Still on the guardian's own list, with what came of it.
    const mine = await storage.getMediaRemovalRequestsForAthlete(athlete.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].status).toBe("approved");
  });
});
