import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { db } from "./db";
import { programExercises, submitWorkoutLogSchema, workoutLogEntries, workoutLogs, workoutSetEntries } from "@shared/schema";
import { formatTrackingReport } from "./tracking-report";
import { makeAssignedProgram, makeAthlete, makeCoach, makeExercise, resetDatabase } from "./test-support/fixtures";
import { submitLogAtCurrentRevision } from "./test-support/save-at-current-revision";

/* EVERY SET OF A UNILATERAL EXERCISE IS FILMED ONE SIDE AT A TIME, AND THE SIDE SURVIVES THE SAVE.
 *
 * Scott, 2026-11-06: "every set, every rep, every unilateral exercise needs to have a way to film
 * both sides separately." One set ROW per side (shared/unilateral-sides.ts), carrying `side`. The
 * scan in client/src/lib/a-unilateral-set-carries-its-side.test.ts reads the path; this drives it
 * on real Postgres: the parse keeps the side, the insert writes it, the day's read-back and the
 * admin export carry it, the report prints it, a re-save keeps it, and a bilateral lift and an
 * older client both store null -- never a guessed side. */
describe("a unilateral set keeps its side", () => {
  beforeEach(resetDatabase);

  async function setup(laterality: "unilateral" | "bilateral") {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const row = await makeExercise(coach.id, { name: `Single-Arm Dumbbell Row ${laterality}`, equipment: "Dumbbell", laterality });
    const assigned = await makeAssignedProgram({ coachId: coach.id, athleteId: athlete.id, exerciseIds: [row.id] });
    const [pe] = await db
      .update(programExercises)
      .set({ trackingLevel: "bar_path" })
      .where(eq(programExercises.id, assigned.programExercises[0].id))
      .returning();
    return { athlete, assigned, pe };
  }

  // The smallest diagnostics blob the save schema accepts, with the trace naming the declared side.
  const diagnostics = (declaredSide: "left" | "right") => ({
    outcome: "tracked" as const,
    message: null,
    recording: { frameCount: 600, trackedFrameCount: 590, elapsedSeconds: 20 },
    bodyPose: { framesTotal: 600, framesWithBody: 590, avgWristConfidence: 0.8 },
    objectDetection: { framesWithLeftImplement: 0, framesWithRightImplement: 300, avgImplementConfidence: 0.6 },
    trace: { points: 580, repsFound: 8, velocityRejections: 0, unilateralWorkingHand: declaredSide, barPointFromWorkingHand: 580, declaredSide, workingHandDisagreesWithDeclaredSide: false },
  });

  const payload = (ctx: Awaited<ReturnType<typeof setup>>, sets: object[]) => ({
    assignmentId: ctx.assigned.assignment.id,
    programDayId: ctx.assigned.day.id,
    date: "2026-11-06",
    completed: true,
    entries: [{ programExerciseId: ctx.pe.id, weightMode: "numeric" as const, weightUnit: "lbs" as const, sets }],
  });

  async function storedSets(athleteId: number) {
    const [log] = await db.select().from(workoutLogs).where(eq(workoutLogs.athleteId, athleteId));
    const [entry] = await db.select().from(workoutLogEntries).where(eq(workoutLogEntries.workoutLogId, log.id));
    return db.select().from(workoutSetEntries).where(eq(workoutSetEntries.logEntryId, entry.id)).orderBy(workoutSetEntries.setNumber);
  }

  it("writes each side's row, reads them back on the day, and the diagnostics name the declared side", async () => {
    const ctx = await setup("unilateral");
    const parsed = submitWorkoutLogSchema.parse(
      payload(ctx, [
        { setNumber: 1, side: "left", reps: "8", weight: "70", trackingDiagnostics: diagnostics("left") },
        { setNumber: 2, side: "right", reps: "7", weight: "70", trackingDiagnostics: diagnostics("right") },
      ]),
    );
    // The parse keeps the side (a zod object strips what it does not declare, silently).
    expect(parsed.entries[0].sets.map((s) => s.side)).toEqual(["left", "right"]);
    await storage.submitWorkoutLog(ctx.athlete.id, parsed as never);

    const rows = await storedSets(ctx.athlete.id);
    expect(rows.map((r) => [r.setNumber, r.side, r.reps])).toEqual([[1, "left", "8"], [2, "right", "7"]]);
    expect((rows[1].trackingDiagnostics as any).trace.declaredSide).toBe("right");

    const detail = await storage.getWorkoutDayDetail(ctx.athlete.id, ctx.assigned.assignment.id, ctx.assigned.day.id, "2026-11-06");
    const sets = (detail as any).log.entries[0].sets as { setNumber: number; side: string | null }[];
    expect(sets.map((s) => [s.setNumber, s.side])).toEqual([[1, "left"], [2, "right"]]);
  });

  it("the admin export carries the side and the report prints it", async () => {
    const ctx = await setup("unilateral");
    await storage.submitWorkoutLog(
      ctx.athlete.id,
      submitWorkoutLogSchema.parse(payload(ctx, [{ setNumber: 1, side: "left", reps: "8", weight: "70", trackingDiagnostics: diagnostics("left") }])) as never,
    );
    const exported = await storage.getRecentTrackedSetsForAdmin(20);
    expect(exported).toHaveLength(1);
    expect(exported[0].side).toBe("left");
    expect(formatTrackingReport(exported)).toMatch(/\(set 1, left side, 8 reps/);
  });

  it("a re-save keeps the side, and a bilateral lift or an older client stores null", async () => {
    const ctx = await setup("unilateral");
    await storage.submitWorkoutLog(
      ctx.athlete.id,
      submitWorkoutLogSchema.parse(payload(ctx, [{ setNumber: 1, side: "left", reps: "8", weight: "70" }, { setNumber: 2, side: "right", reps: "8", weight: "70" }])) as never,
    );
    // The athlete edits a rep count; the side rides along as every other field does.
    await submitLogAtCurrentRevision(
      ctx.athlete.id,
      submitWorkoutLogSchema.parse(payload(ctx, [{ setNumber: 1, side: "left", reps: "9", weight: "70" }, { setNumber: 2, side: "right", reps: "8", weight: "70" }])) as never,
    );
    expect((await storedSets(ctx.athlete.id)).map((r) => [r.side, r.reps])).toEqual([["left", "9"], ["right", "8"]]);

    // An older client sends no side at all: stored null, never a guess.
    const old = await setup("unilateral");
    await storage.submitWorkoutLog(old.athlete.id, submitWorkoutLogSchema.parse(payload(old, [{ setNumber: 1, reps: "8", weight: "70" }])) as never);
    expect((await storedSets(old.athlete.id))[0].side).toBeNull();

    // A bilateral lift has no side.
    const bench = await setup("bilateral");
    await storage.submitWorkoutLog(bench.athlete.id, submitWorkoutLogSchema.parse(payload(bench, [{ setNumber: 1, reps: "8", weight: "135" }])) as never);
    expect((await storedSets(bench.athlete.id))[0].side).toBeNull();
  });
});
