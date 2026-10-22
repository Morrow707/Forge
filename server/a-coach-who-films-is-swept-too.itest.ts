/**
 * THE THREE RETENTION PATHS COVER EVERY ROLE THAT FILMS, NOT JUST THE ATHLETE.
 *
 * Added 2026-10-22, out of the role-conditional survey (docs/role-conditional-survey-2026-10-22.md),
 * which listed this as one finding in three places and left it because each one changes what
 * gets DELETED and so wanted its own commit and its own itest. This is that itest.
 *
 * `cameraAccessFor` grants the camera to a coach and an admin by role alone -- see
 * shared/roles-that-film-their-own-training.ts, written when an admin's three filmed lifts lost
 * every trace in silence. So a coach or admin accumulates exactly what an athlete does: set
 * clips under form-videos, skeleton traces under set-traces/<id>/, workout_set_entries rows.
 * All three retention paths were keyed on the WORD "athlete":
 *
 *   1. deleteUserRecord's athlete branch -- so a coach's own training files stayed on the
 *      mounted disk after the row and everything that cascades from it were gone. Permanent,
 *      unreachable, and in the one directory a retention promise is made about.
 *   2. sweepVideoRetentionCap -- the cap the $9.99 add-on RAISES, so an account that could buy
 *      the add-on was never subject to the thing it buys.
 *   3. sweepStaleAccountVideos -- a coach who stopped using Forge a year ago kept every clip.
 *
 * AND ONE CONSEQUENCE OF FIXING 2 AND 3 THAT HAD TO BE FIXED WITH THEM. The warning says "tap
 * the heart within 7 days to keep it" and the grace clock starts on DELIVERY, so an unopenable
 * link makes the warning a silent deletion with a notice attached. Every own-training route is
 * declared for exactly ONE role (`<ProtectedRoute role="athlete">` etc.), so the link is built
 * from the account's own role now -- shared/own-training-routes.ts, and the `link` assertions
 * below are what prove it end to end rather than from the source.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { storage } from "./storage";
import {
  resetDatabase,
  makeCoach,
  makeAthlete,
  makeExercise,
  makeAssignedProgram,
  makeLoggedSetWithVideo,
  makeUploadedFile,
  uploadedFileExists,
} from "./test-support/fixtures";
import { workoutSetEntries, workoutLogEntries, workoutLogs } from "@shared/schema";
import { eq } from "drizzle-orm";

// The only shape the cap applies to: not beta, no trial, no add-on. Everything else is
// deliberately unlimited -- see resolveVideoRetentionLimits.
const CAPPED = { isBetaAccount: false, trialExpiresAt: null, hasVideoStorageAddOn: false };

/** One account filming its OWN training: the assignment's athleteId is the account itself,
 *  which is what "Add to My Calendar" produces for a coach and what /coach/my/day opens. */
async function filmsOwnTraining(opts: {
  role: "athlete" | "coach" | "admin";
  count: number;
  exerciseName?: string;
}) {
  const libraryOwner = await makeCoach();
  const account =
    opts.role === "athlete"
      ? await makeAthlete(CAPPED)
      : await makeCoach({ ...CAPPED, role: opts.role });
  const lift = await makeExercise(libraryOwner.id, { name: opts.exerciseName ?? "Back Squat" });
  const { day, programExercises, assignment } = await makeAssignedProgram({
    coachId: libraryOwner.id,
    athleteId: account.id,
    exerciseIds: [lift.id],
  });
  const urls: string[] = [];
  for (let i = 0; i < opts.count; i++) {
    const url = await makeUploadedFile(`own-${account.id}-${i}.mp4`);
    urls.push(url);
    await makeLoggedSetWithVideo({
      athleteId: account.id,
      assignmentId: assignment.id,
      programDayId: day.id,
      exerciseId: lift.id,
      programExerciseId: programExercises[0].id,
      date: `2026-03-${String(i + 1).padStart(2, "0")}`,
      videoUrl: url,
    });
  }
  return { account, assignment, day, urls };
}

describe("the video cap covers every role that films", () => {
  beforeEach(resetDatabase);

  // The finding itself. Reverting sweepVideoRetentionCap's predicate to
  // eq(users.role, "athlete") turns both of these red and leaves the athlete case green,
  // which is what made the bug invisible.
  it("warns a COACH who is over the cap on their own training", async () => {
    const { account } = await filmsOwnTraining({ role: "coach", count: 12 });
    const { warned, purged } = await storage.sweepVideoRetentionCap();
    expect(warned).toHaveLength(2); // cap is 10
    expect(warned.every((w) => w.athleteId === account.id)).toBe(true);
    expect(purged).toBe(0); // warning only; the grace window has not elapsed
  });

  it("warns an ADMIN who is over the cap on their own training", async () => {
    const { account } = await filmsOwnTraining({ role: "admin", count: 12 });
    const { warned } = await storage.sweepVideoRetentionCap();
    expect(warned).toHaveLength(2);
    expect(warned.every((w) => w.athleteId === account.id)).toBe(true);
  });

  it("leaves a coach UNDER the cap alone, exactly as it does an athlete", async () => {
    await filmsOwnTraining({ role: "coach", count: 3 });
    const { warned, purged } = await storage.sweepVideoRetentionCap();
    expect(warned).toHaveLength(0);
    expect(purged).toBe(0);
  });

  // A GUARDIAN films nothing and must not be swept -- the widening is to the filming set, not
  // to every role. Without this the fix would read as "drop the role check", which is a
  // different and wrong change.
  it("never sweeps a guardian", async () => {
    const libraryOwner = await makeCoach();
    const guardian = await makeCoach({ ...CAPPED, role: "guardian" });
    const lift = await makeExercise(libraryOwner.id);
    const { day, programExercises, assignment } = await makeAssignedProgram({
      coachId: libraryOwner.id,
      athleteId: guardian.id,
      exerciseIds: [lift.id],
    });
    for (let i = 0; i < 12; i++) {
      await makeLoggedSetWithVideo({
        athleteId: guardian.id,
        assignmentId: assignment.id,
        programDayId: day.id,
        exerciseId: lift.id,
        programExerciseId: programExercises[0].id,
        date: `2026-04-${String(i + 1).padStart(2, "0")}`,
        videoUrl: await makeUploadedFile(`guardian-${guardian.id}-${i}.mp4`),
      });
    }
    const { warned } = await storage.sweepVideoRetentionCap();
    expect(warned).toHaveLength(0);
  });
});

describe("the warning links somewhere the reader can actually open", () => {
  beforeEach(resetDatabase);

  // The half that makes the widening safe rather than cruel. /athlete/day/... is
  // `<ProtectedRoute role="athlete">`, so a coach handed it is refused -- and the seven-day
  // clock has already started. Mutation-tested: hardcoding the athlete path back reds the
  // coach and admin cases and leaves the athlete one green.
  // Asserted over EVERY warning rather than warned[0]: which two of the twelve are the excess
  // is the sweep's own eviction order, and this case is about the link, not the order.
  for (const [role, prefix] of [
    ["athlete", "/athlete/day"],
    ["coach", "/coach/my/day"],
    ["admin", "/admin/my/day"],
  ] as const) {
    it(`a ${role} is linked to ${prefix}/...`, async () => {
      const { assignment, day } = await filmsOwnTraining({ role, count: 12 });
      const { warned } = await storage.sweepVideoRetentionCap();
      expect(warned.length).toBeGreaterThan(0);
      for (const w of warned) {
        expect(w.link).toMatch(
          new RegExp(`^${prefix}/${assignment.id}/${day.id}/2026-03-\\d\\d$`),
        );
      }
    });
  }
});

describe("deleting an account that filmed its own training takes the files with it", () => {
  beforeEach(resetDatabase);

  // deleteUserRecord had an if/else and a coach who films is BOTH halves: their own training
  // files AND the comment media they authored about somebody else's. Reverting it to the
  // exclusive branches leaves the clip on disk and reds this.
  for (const role of ["coach", "admin"] as const) {
    it(`a ${role}'s own set clip is deleted with the account`, async () => {
      const { account, urls } = await filmsOwnTraining({ role, count: 2 });
      expect(await uploadedFileExists(urls[0])).toBe(true);
      expect(await uploadedFileExists(urls[1])).toBe(true);

      await storage.deleteUserRecord(account.id);

      expect(await uploadedFileExists(urls[0])).toBe(false);
      expect(await uploadedFileExists(urls[1])).toBe(false);
    });
  }

  // The branch that already worked, kept so a future edit cannot fix one half by breaking the
  // other -- which is exactly what narrowing the second branch to coach-or-admin would have
  // done to a guardian.
  it("an athlete's own set clip is still deleted with the account", async () => {
    const { account, urls } = await filmsOwnTraining({ role: "athlete", count: 1 });
    expect(await uploadedFileExists(urls[0])).toBe(true);
    await storage.deleteUserRecord(account.id);
    expect(await uploadedFileExists(urls[0])).toBe(false);
  });

  // Proof the rows really were there to begin with, so a green test above cannot be a fixture
  // that quietly wrote nothing.
  it("the coach really had set rows before the delete", async () => {
    const { account } = await filmsOwnTraining({ role: "coach", count: 2 });
    const rows = await db
      .select({ id: workoutSetEntries.id })
      .from(workoutSetEntries)
      .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
      .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
      .where(eq(workoutLogs.athleteId, account.id));
    expect(rows).toHaveLength(2);
  });
});
