import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { workoutLogs } from "@shared/schema";
import { storage } from "../storage";

type SubmitWorkoutLogInput = Parameters<typeof storage.submitWorkoutLog>[1];

/**
 * Saves a day the way a live screen does: claiming the revision the stored day holds NOW.
 *
 * Until 2026-11-05 a save with no `baseRevision` at all was accepted against any day, on the
 * reasoning that it came from an older client. It did not -- it came from a screen that had
 * hydrated from a cached, log-less picture of the day, and it replaced three filmed sets with
 * three empty exercises (see submitWorkoutLog's comment on the check). So the server refuses a
 * claim-less save once a log exists, and every integration test that re-saves a day has to
 * say which revision it is saving over, exactly as the workout screen does. This is the one
 * place that lookup lives, so a test about file deletion or trace retention reads as being
 * about that and not about revision plumbing.
 *
 * A first save of a day finds no log and sends no claim, which is what a first save is.
 */
export async function submitLogAtCurrentRevision(athleteId: number, input: SubmitWorkoutLogInput) {
  const log = await db.query.workoutLogs.findFirst({
    where: and(
      eq(workoutLogs.assignmentId, input.assignmentId),
      eq(workoutLogs.programDayId, input.programDayId),
      eq(workoutLogs.date, input.date),
    ),
  });
  return storage.submitWorkoutLog(athleteId, log ? { ...input, baseRevision: log.revision } : input);
}
