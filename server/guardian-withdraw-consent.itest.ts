import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { consentRecords, guardianLinks, users, workoutSetEntries } from "@shared/schema";
import { storage } from "./storage";
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

// WITHDRAWING CONSENT IS THE ONE THING A GUARDIAN CAN DESTROY.
//
// Deliberately a different shape from the removal-request table beside it. Asking for one video
// to come down is a request a person answers, because that video is the coach's and the athlete's
// training record as much as it is footage of a child. Withdrawing consent is not a request about
// one artefact -- it is taking back the permission the account stands on, and a permission
// somebody else can refuse to release was never really the parent's.
const isoYearsAgo = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
};

let seq = 0;
async function guardianOf(athleteId: number) {
  const [guardian] = await db
    .insert(users)
    .values({
      email: `g-${Date.now().toString(36)}-${seq++}@example.test`,
      passwordHash: "not-a-real-hash",
      name: "Pat Guardian",
      role: "guardian",
    })
    .returning();
  await db.insert(guardianLinks).values({ athleteId, guardianId: guardian.id });
  return guardian;
}

async function athleteWithVideo(ageYears: number) {
  const coach = await makeCoach();
  const athlete = await makeAthlete({ dateOfBirth: isoYearsAgo(ageYears) });
  const squat = await makeExercise(coach.id, { name: "Back Squat" });
  const assigned = await makeAssignedProgram({
    coachId: coach.id,
    athleteId: athlete.id,
    exerciseIds: [squat.id],
  });
  const videoUrl = await makeUploadedFile(`take-${seq++}.mp4`);
  const { set } = await makeLoggedSetWithVideo({
    athleteId: athlete.id,
    assignmentId: assigned.assignment.id,
    programDayId: assigned.day.id,
    exerciseId: squat.id,
    programExerciseId: assigned.programExercises[0].id,
    date: "2026-09-14",
    videoUrl,
  });
  return { athlete, set, videoUrl };
}

describe("a guardian withdrawing consent", () => {
  beforeEach(resetDatabase);

  it("deletes the child's video file, not just the row's URL", async () => {
    const { athlete, set, videoUrl } = await athleteWithVideo(13);
    const guardian = await guardianOf(athlete.id);
    expect(await uploadedFileExists(videoUrl)).toBe(true);

    const result = await storage.withdrawGuardianConsent({
      guardianId: guardian.id,
      athleteId: athlete.id,
    });
    expect(result.ok).toBe(true);
    expect(await uploadedFileExists(videoUrl)).toBe(false);
    const row = await db.query.workoutSetEntries.findFirst({
      where: eq(workoutSetEntries.id, set.id),
    });
    expect(row?.formCheckVideoUrl).toBeNull();
  });

  // The same rule a retention purge follows. The consent withdrawn is the video and biometric
  // release; the training record is the athlete's and the coach's, and deleting it was never what
  // a parent asked for.
  it("leaves the derived metrics alone", async () => {
    const { athlete, set } = await athleteWithVideo(13);
    await db
      .update(workoutSetEntries)
      .set({ peakVelocityMps: 1.42, romCm: 66 })
      .where(eq(workoutSetEntries.id, set.id));
    const guardian = await guardianOf(athlete.id);
    await storage.withdrawGuardianConsent({ guardianId: guardian.id, athleteId: athlete.id });

    const row = await db.query.workoutSetEntries.findFirst({
      where: eq(workoutSetEntries.id, set.id),
    });
    expect(row?.peakVelocityMps).toBe(1.42);
    expect(row?.romCm).toBe(66);
  });

  // Append-only, like a research withdrawal. The record that a parent consented on one date and
  // withdrew on a later one IS the history; rewriting the original row would destroy it.
  it("writes a dated withdrawal quoting what was withdrawn, keeping the original", async () => {
    const { athlete } = await athleteWithVideo(13);
    const guardian = await guardianOf(athlete.id);
    await storage.logConsentRecord({
      userId: athlete.id,
      consentType: "biometric_waiver",
      documentText: "VIDEO AND BIOMETRIC RELEASE v1",
      givenByUserId: guardian.id,
    });

    await storage.withdrawGuardianConsent({ guardianId: guardian.id, athleteId: athlete.id });
    const rows = await db.query.consentRecords.findMany({
      where: eq(consentRecords.userId, athlete.id),
    });
    expect(rows.some((r) => r.documentText === "VIDEO AND BIOMETRIC RELEASE v1")).toBe(true);
    const withdrawal = rows.find((r) => r.documentText.startsWith("WITHDRAWN "));
    expect(withdrawal).toBeTruthy();
    expect(withdrawal!.documentText).toContain("VIDEO AND BIOMETRIC RELEASE v1");
  });

  // What re-locks the account. The minor gate refuses everything for a minor with no linked
  // guardian, so this returns the child to exactly the state they were in before the claim.
  it("returns the child to the minor gate", async () => {
    const { athlete } = await athleteWithVideo(13);
    const guardian = await guardianOf(athlete.id);
    expect(await storage.athleteGateStatus(athlete.id)).toBe("ok");

    await storage.withdrawGuardianConsent({ guardianId: guardian.id, athleteId: athlete.id });
    expect(await storage.athleteGateStatus(athlete.id)).toBe("needs_guardian");
  });

  // Step 3 deliberately does what removeGuardianLink refuses to do. That guard stops a parent
  // stranding a child by casually stepping away; here locking the account is the point, not a
  // side effect.
  it("succeeds where a plain unlink is refused", async () => {
    const { athlete } = await athleteWithVideo(13);
    const guardian = await guardianOf(athlete.id);
    const link = await db.query.guardianLinks.findFirst({
      where: eq(guardianLinks.athleteId, athlete.id),
    });
    const unlink = await storage.removeGuardianLink(guardian.id, "guardian", link!.id);
    expect(unlink.ok).toBe(false);

    const withdrawal = await storage.withdrawGuardianConsent({
      guardianId: guardian.id,
      athleteId: athlete.id,
    });
    expect(withdrawal.ok).toBe(true);
  });

  it("refuses a guardian who is not linked to this athlete", async () => {
    const { athlete } = await athleteWithVideo(13);
    await guardianOf(athlete.id);
    const other = await athleteWithVideo(13);
    const otherGuardian = await guardianOf(other.athlete.id);

    const result = await storage.withdrawGuardianConsent({
      guardianId: otherGuardian.id,
      athleteId: athlete.id,
    });
    expect(result.ok).toBe(false);
    // And nothing of the other family's was touched.
    expect(await storage.athleteGateStatus(athlete.id)).toBe("ok");
  });
});
