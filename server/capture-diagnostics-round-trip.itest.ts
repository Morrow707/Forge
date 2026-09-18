import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import {
  programExercises,
  submitWorkoutLogSchema,
  workoutLogEntries,
  workoutLogs,
  workoutSetEntries,
} from "@shared/schema";
import {
  makeAssignedProgram,
  makeAthlete,
  makeCoach,
  makeExercise,
  resetDatabase,
} from "./test-support/fixtures";

// THE FAILED CAPTURE FROM WEDNESDAY, ALL THE WAY THROUGH.
//
// Two guards already exist for this pipeline and both are text scans:
// client/src/lib/refused-capture-survives.test.ts reads the tracker dialogs and checks each
// catch hands the metrics up; shared/tracking-diagnostics-roundtrip.test.ts derives the client's
// field list and checks each name is declared in the zod object. Both are worth having -- they
// catch the two ways this has actually broken -- but neither one runs a single line of the
// pipeline. Between the dialog and the admin report sit the submission schema's parse, the
// insert, a json column, and a WHERE clause, and nothing exercised that path end to end.
//
// So this is the missing half: a take that FAILED, submitted through the same parse the HTTP
// route uses, and then read back out of the report an admin actually opens. If a diagnostics
// blob can leave the phone and not arrive on that page, one of these fails.
//
// Runs against a real database because the two remaining ways this breaks are both database
// facts -- a json column round-tripping a nested object, and getRecentTrackedSetsForAdmin's
// membership test -- and mocking either would be asserting against the mock.
describe("a capture that failed reaches the admin tracking report", () => {
  beforeEach(resetDatabase);

  async function setup() {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const bench = await makeExercise(coach.id, { name: "Bench Press" });
    const assigned = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [bench.id],
    });
    // The exercise has to actually be camera-tracked, or the athlete would never have been
    // offered Record & Analyze in the first place. makeAssignedProgram leaves the column at its
    // 'none' default, which is right for the fixture and wrong for this test.
    const [pe] = await db
      .update(programExercises)
      .set({ trackingLevel: "bar_path" })
      .where(eq(programExercises.id, assigned.programExercises[0].id))
      .returning();
    return { athlete, assigned, pe };
  }

  // The shape saveEmptyAndWarn produces: no metrics worth keeping, a message saying why, and
  // the reps it DID count off a scale it could not trust.
  const refusedTake = {
    outcome: "empty_no_clean_read" as const,
    message: "Couldn't get a clean read of the bar. The clip is saved for your coach.",
    scaleFree: {
      repCount: 8,
      concentricSeconds: 1.1,
      eccentricSeconds: 1.9,
      velocityLossPercent: 14.2,
    },
    recording: { frameCount: 900, trackedFrameCount: 874, elapsedSeconds: 30.1 },
    bodyPose: { framesTotal: 900, framesWithBody: 874, avgWristConfidence: 0.71 },
    objectDetection: {
      framesWithLeftImplement: 0,
      framesWithRightImplement: 0,
      avgImplementConfidence: null,
    },
    trace: { points: 0, repsFound: 0, velocityRejections: 41 },
  };

  const payload = (ctx: Awaited<ReturnType<typeof setup>>) => ({
    assignmentId: ctx.assigned.assignment.id,
    programDayId: ctx.assigned.day.id,
    date: "2026-09-16",
    completed: true,
    entries: [
      {
        programExerciseId: ctx.pe.id,
        weightMode: "numeric" as const,
        weightUnit: "lbs" as const,
        sets: [
          {
            setNumber: 1,
            reps: "8",
            weight: "185",
            trackingDiagnostics: refusedTake,
          },
        ],
      },
    ],
  });

  it("survives the submission schema's parse", () => {
    // The zod object strips what it does not declare, silently and with no error anywhere.
    // That is how the scale-source fields were lost, and then scaleFree after them -- both
    // times the client was sending them and the insert was dropping them. The parse is the
    // exact step where that happens, so assert on its OUTPUT rather than on the input we wrote.
    const parsed = submitWorkoutLogSchema.parse(payload({
      assigned: { assignment: { id: 1 }, day: { id: 1 } },
      pe: { id: 1 },
    } as never));
    const diagnostics = parsed.entries[0].sets[0].trackingDiagnostics;
    expect(diagnostics).toBeTruthy();
    expect(diagnostics?.outcome).toBe("empty_no_clean_read");
    expect(diagnostics?.message).toContain("saved for your coach");
    // The field whose loss reported a 31-rep bench press as "tracking only found 0".
    expect(diagnostics?.scaleFree?.repCount).toBe(8);
    expect(diagnostics?.scaleFree?.velocityLossPercent).toBeCloseTo(14.2);
    // And the counts that say WHY -- the body tracked fine, the bar was never found.
    expect(diagnostics?.bodyPose.framesWithBody).toBe(874);
    expect(diagnostics?.objectDetection.framesWithLeftImplement).toBe(0);
    expect(diagnostics?.trace?.velocityRejections).toBe(41);
  });

  it("is stored on the set, not just accepted", async () => {
    const ctx = await setup();
    await storage.submitWorkoutLog(
      ctx.athlete.id,
      submitWorkoutLogSchema.parse(payload(ctx)) as never,
    );

    const [log] = await db
      .select()
      .from(workoutLogs)
      .where(eq(workoutLogs.athleteId, ctx.athlete.id));
    const [entry] = await db
      .select()
      .from(workoutLogEntries)
      .where(eq(workoutLogEntries.workoutLogId, log.id));
    const sets = await db
      .select()
      .from(workoutSetEntries)
      .where(eq(workoutSetEntries.logEntryId, entry.id));

    expect(sets).toHaveLength(1);
    // A failed capture is still a logged set: the reps and weight the athlete typed are the
    // athlete's own record and never depended on the camera working.
    expect(sets[0].reps).toBe("8");
    const stored = sets[0].trackingDiagnostics as typeof refusedTake | null;
    expect(stored, "the blob is the only account of what went wrong").toBeTruthy();
    // Read back through the json column, nesting intact.
    expect(stored?.outcome).toBe("empty_no_clean_read");
    expect(stored?.scaleFree?.repCount).toBe(8);
    expect(stored?.objectDetection.framesWithLeftImplement).toBe(0);
  });

  it("appears in getRecentTrackedSetsForAdmin", async () => {
    const ctx = await setup();
    await storage.submitWorkoutLog(
      ctx.athlete.id,
      submitWorkoutLogSchema.parse(payload(ctx)) as never,
    );

    const entries = await storage.getRecentTrackedSetsForAdmin(50);
    // Membership is any camera-derived column, and for this take the diagnostics blob is the
    // ONLY one -- every metric came back empty. That is the whole point: the report exists to
    // explain failures, so the take that produced nothing but an explanation has to be in it.
    expect(entries).toHaveLength(1);
    expect(entries[0].trackingDiagnostics).toBeTruthy();
    expect((entries[0].trackingDiagnostics as typeof refusedTake).outcome).toBe(
      "empty_no_clean_read",
    );
    // No name and no user id leave this query -- buildEntries turns the id into a per-report
    // pseudonym. Asserted here because this is the one place the report's rows are built.
    expect(entries[0]).not.toHaveProperty("name");
  });

  it("is still there after the coach turns tracking off on that exercise", async () => {
    // FOUND BY THIS FILE, NOT BY REASONING ABOUT IT.
    //
    // trackingLevel is live and editable, and turning it off is precisely what a coach does
    // after a few takes come back unusable. The report's membership test used to also require
    // the program row to say tracking was ON, so that click removed every past capture on the
    // exercise from the page -- the failed ones that prompted it first among them. The takes
    // worth reading about were the takes it hid.
    const ctx = await setup();
    await storage.submitWorkoutLog(
      ctx.athlete.id,
      submitWorkoutLogSchema.parse(payload(ctx)) as never,
    );
    expect(await storage.getRecentTrackedSetsForAdmin(50)).toHaveLength(1);

    await db
      .update(programExercises)
      .set({ trackingLevel: "none" })
      .where(eq(programExercises.id, ctx.pe.id));

    const after = await storage.getRecentTrackedSetsForAdmin(50);
    expect(after, "the capture happened; a later program edit cannot un-happen it").toHaveLength(1);
    expect((after[0].trackingDiagnostics as typeof refusedTake).outcome).toBe(
      "empty_no_clean_read",
    );
  });

  it("does not sweep in a set that was logged by hand", async () => {
    // The other half of the membership test, and the reason it cannot simply be "every set on a
    // tracked exercise": an athlete who types reps and weight without ever tapping Record leaves
    // every camera column null and must stay out, or the report fills with untouched sets and
    // stops being readable.
    const ctx = await setup();
    const byHand = payload(ctx);
    delete (byHand.entries[0].sets[0] as { trackingDiagnostics?: unknown }).trackingDiagnostics;
    await storage.submitWorkoutLog(
      ctx.athlete.id,
      submitWorkoutLogSchema.parse(byHand) as never,
    );

    expect(await storage.getRecentTrackedSetsForAdmin(50)).toEqual([]);
  });
});
