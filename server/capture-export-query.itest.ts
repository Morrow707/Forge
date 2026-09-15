import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { workoutSetEntries } from "@shared/schema";
import {
  makeAssignedProgram,
  makeAthlete,
  makeCoach,
  makeExercise,
  makeLoggedSetWithVideo,
  resetDatabase,
} from "./test-support/fixtures";

// AN EMPTY TRACE IS NOT A NULL TRACE.
//
// getStoredCapturesForReplay filters on barPathTrace IS NOT NULL, with a comment promising that
// an export of N rows is an export of N usable rows. A capture the tracker could not read is not
// discarded though: the clip is saved for the coach and the row is written with an EMPTY array
// plus a trackingDiagnostics record saying why (see saveEmptyAndWarn in the tracker dialogs).
// An empty array is not null, so every one of those rows passed the filter. A real 29-set export
// arrived with four of them in it, each spending a slot while carrying nothing to replay.
//
// Runs against a real database rather than a mocked query builder because the fix IS the SQL --
// json_array_length on a json column is exactly the kind of statement that typechecks, reads
// correctly, and then fails at runtime against the actual column type.
describe("the replay export's trace filter", () => {
  beforeEach(resetDatabase);

  // A real logged set, then its trace written on top -- the shape the save path produces.
  let uniqueDay = 0;
  async function setWithTrace(trace: unknown) {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const squat = await makeExercise(coach.id, { name: "Back Squat" });
    const assigned = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [squat.id],
    });
    const { set } = await makeLoggedSetWithVideo({
      athleteId: athlete.id,
      assignmentId: assigned.assignment.id,
      programDayId: assigned.day.id,
      exerciseId: squat.id,
      programExerciseId: assigned.programExercises[0].id,
      date: `2026-09-${String(++uniqueDay).padStart(2, "0")}`,
      videoUrl: `/uploads/take-${uniqueDay}.mp4`,
    });
    await db
      .update(workoutSetEntries)
      .set({ barPathTrace: trace as never })
      .where(eq(workoutSetEntries.id, set.id));
    return set;
  }

  it("keeps a set whose trace has points in it", async () => {
    await setWithTrace([{ t: 0, x: 0, y: 0 }, { t: 33, x: 0, y: -20 }]);
    const rows = await storage.getStoredCapturesForReplay(50);
    expect(rows).toHaveLength(1);
  });

  it("drops a set whose capture was refused and saved an empty trace", async () => {
    await setWithTrace([]);
    const rows = await storage.getStoredCapturesForReplay(50);
    expect(rows).toHaveLength(0);
  });

  it("drops a hand-logged set with no trace at all", async () => {
    await setWithTrace(null);
    const rows = await storage.getStoredCapturesForReplay(50);
    expect(rows).toHaveLength(0);
  });

  // The metrics-only shape a two-hundred-set survey pulls. Same filter, same SQL, and worth
  // pinning separately because the column it tests is the one that branch does NOT select.
  it("applies the same filter when the traces themselves are left out", async () => {
    await setWithTrace([]);
    await setWithTrace([{ t: 0, x: 0, y: 0 }, { t: 33, x: 0, y: -20 }]);
    const rows = await storage.getStoredCapturesForReplay(50, { includeTraces: false });
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("barPathTrace");
  });
});
