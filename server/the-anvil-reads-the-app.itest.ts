import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assignments,
  bodyMetrics,
  programWeeks,
  skillAssignments,
  skillProgramDays,
  skillProgramWeeks,
  skillPrograms,
  caraSessions,
  coachAthletes,
  foodLogEntries,
  goniometerReadings,
  importedTestingData,
  injuryHistory,
  programDays,
  programs,
  skillSessionLogs,
  testingResults,
  users,
  wellnessCheckins,
  workoutLogEntries,
  workoutLogs,
  workoutSetEntries,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";
import { fetchAnvilContext, fetchAnvilStateInputs } from "./anvil-state-source";
import { isPresent } from "@shared/anvil-inputs";

/**
 * THE ANVIL'S THIRTEEN QUERIES, AGAINST A REAL DATABASE.
 *
 * `shared/anvil-athlete-state.ts` is pure and fully unit-tested, and that is exactly why it could
 * sit with no caller for a day without anything going red: **a test that supplies the input it is
 * meant to be checking for cannot fail for the input being absent.** This file supplies none of it
 * -- every value below is written as a row and read back through the real SQL.
 *
 * Four things here are only true end to end and each has cost this repo something before:
 *
 *  - **A SKILL SESSION WITH A NULL `skillDayLogId`.** `createSkillSessionLog`'s plain-append
 *    fallback leaves it null, so an INNER join through `skill_day_logs` silently drops those rows.
 *    The favorited-cap sweep of 2026-10-15 hit the identical thing one table over and the mutation
 *    that exposed it passed every other assertion.
 *  - **`coalesce(day.date, created_at::date) between ...` IS SQL, not TypeScript.** A unit test
 *    cannot run it, and it is the one fragment here that is easy to get wrong.
 *  - **A KILOGRAM WEIGH-IN.** `AnvilStateInput` says pounds. The strength percentile's denominator
 *    settled the same question one column over, and a 2.2x step in a trend read for low energy
 *    availability is not a rounding error.
 *  - **A DENSE RANGE.** Every day in the window is present, including the ones with nothing logged,
 *    because "we did not look at that day" and "that day was empty" are two different claims.
 *
 * FIVE MUTATIONS, EACH CAUGHT BY THE RIGHT CASE: the skill join goes INNER; the kilogram weigh-in
 * is not converted; the range emits only its last day; the Health-ever-connected read is bounded by
 * the window (so an account that synced in September reads as never connected); and a tie on the
 * usual phone picks a winner instead of declaring none. **The fifth was NOT caught by the first
 * draft** -- the device case has two takes on one phone and one on another, so no tie, and the tie
 * branch is exactly the one that decides whether an athlete who films on two phones equally has
 * half their history thrown away. It has its own case now.
 */

const TODAY = "2026-11-08";
const YESTERDAY = "2026-11-07";

let athleteId: number;
let coachId: number;
/** One assigned program and one skill program, made once: every case writes LOGS against them. */
let assignmentId: number;
let programDayId: number;
let programId: number;
let skillAssignmentId: number;
let skillProgramDayId: number;

/** One capture, written as the three rows a real one is: a log, an entry, a set. */
async function writeCapture(opts: {
  date: string;
  deviceInfo: unknown;
  diagnostics: unknown;
  meanVelocityMps?: number;
  weightLbs?: number;
  repsCount?: number;
}) {
  const [log] = await db
    .insert(workoutLogs)
    .values({ assignmentId, programDayId, athleteId, date: opts.date, completed: true })
    .returning();
  const [entry] = await db
    .insert(workoutLogEntries)
    .values({ workoutLogId: log.id, rpe: 8, weightMode: "numeric" })
    .returning();
  await db.insert(workoutSetEntries).values({
    logEntryId: entry.id,
    setNumber: 1,
    captureDeviceInfo: opts.deviceInfo as never,
    trackingDiagnostics: opts.diagnostics as never,
    meanVelocityMps: opts.meanVelocityMps ?? 0.74,
    peakVelocityMps: 1.1,
    weightLbs: opts.weightLbs ?? 135,
    repsCount: opts.repsCount ?? 5,
  });
}

beforeAll(async () => {
  await resetDatabase();
  const coach = await makeCoach();
  coachId = coach.id;
  const athlete = await makeAthlete({
    dateOfBirth: "1990-03-04",
    sport: "football",
    position: "linebacker",
    heightIn: 75,
  });
  athleteId = athlete.id;
  await db.insert(coachAthletes).values({ coachId, athleteId });

  const [program] = await db.insert(programs).values({ coachId, name: "Anvil source" }).returning();
  programId = program.id;
  const [week] = await db.insert(programWeeks).values({ programId: program.id, weekNumber: 1 }).returning();
  const [day] = await db
    .insert(programDays)
    .values({ weekId: week.id, dayNumber: 1, title: "Day 1" })
    .returning();
  programDayId = day.id;
  const [assignment] = await db
    .insert(assignments)
    .values({ coachId, athleteId, programId: program.id, startDate: "2026-11-01" })
    .returning();
  assignmentId = assignment.id;

  const [skillProgram] = await db
    .insert(skillPrograms)
    .values({ coachId, name: "Anvil skills" })
    .returning();
  const [skillWeek] = await db
    .insert(skillProgramWeeks)
    .values({ programId: skillProgram.id, weekNumber: 1 })
    .returning();
  const [skillDay] = await db
    .insert(skillProgramDays)
    .values({ weekId: skillWeek.id, dayNumber: 1 })
    .returning();
  skillProgramDayId = skillDay.id;
  const [skillAssignment] = await db
    .insert(skillAssignments)
    .values({ skillProgramId: skillProgram.id, athleteId, coachId, startDate: "2026-11-01" })
    .returning();
  skillAssignmentId = skillAssignment.id;
});

beforeEach(async () => {
  for (const table of [
    wellnessCheckins,
    foodLogEntries,
    bodyMetrics,
    injuryHistory,
    goniometerReadings,
    caraSessions,
    importedTestingData,
    testingResults,
    skillSessionLogs,
  ]) {
    await db.delete(table).where(eq((table as never as { athleteId: never }).athleteId, athleteId as never));
  }
  await db.delete(workoutLogs).where(eq(workoutLogs.athleteId, athleteId));
  await db.update(users).set({ trackingOptOut: false }).where(eq(users.id, athleteId));
  await db.update(coachAthletes).set({ heldAt: null }).where(eq(coachAthletes.athleteId, athleteId));
});

describe("what the Anvil reads off the app, through the real SQL", () => {
  it("reads the day's check-in, capture, food log and weigh-in", async () => {
    await db.insert(wellnessCheckins).values({
      athleteId,
      date: TODAY,
      sleepHours: 5.2,
      soreness: 4,
      stress: 3,
      mentalFocus: 2,
      bodyPainMap: ["left_knee"],
      hrv: 48,
      restingHeartRate: 61,
    });
    await writeCapture({
      date: TODAY,
      deviceInfo: { deviceModel: "iPhone15,2", lens: "wide", activeFormat: "1920x1080" },
      diagnostics: { outcome: "tracked" },
    });
    await db.insert(foodLogEntries).values([
      { athleteId, date: TODAY, description: "oats", caloriesKcal: 400, proteinG: 20, source: "manual" },
      { athleteId, date: TODAY, description: "chicken", caloriesKcal: 600, proteinG: 55, source: "manual" },
    ]);
    // A KILOGRAM WEIGH-IN. The input says pounds and this is the only place the conversion runs.
    await db.insert(bodyMetrics).values({ athleteId, date: TODAY, weight: 93, weightUnit: "kg" });

    const byDate = await fetchAnvilContext(athleteId, TODAY, TODAY);
    const entry = byDate.get(TODAY)!;
    expect(entry).toBeTruthy();
    const r = entry.state.readings;

    expect(r.sleep_hours).toEqual({ value: 5.2 });
    expect(r.soreness).toEqual({ value: 4 });
    expect(r.hrv).toEqual({ value: 48 });
    expect(r.resting_heart_rate).toEqual({ value: 61 });
    expect(r.mean_velocity_mps).toEqual({ value: 0.74 });
    // SUMMED, not the last row. Two meals is the ordinary case and the signal is the day's intake.
    expect(r.calories_kcal).toEqual({ value: 1000 });
    expect(r.protein_g).toEqual({ value: 75 });
    expect(isPresent(r.body_mass) && Math.round(r.body_mass.value as number)).toBe(205);
    // reps x weight, the same volume-load convention every other load path in Forge uses.
    expect(r.training_load).toEqual({ value: 675 });
    expect(r.session_completed).toEqual({ value: true });
    expect(r.body_pain_map).toEqual({ value: ["left_knee"] });
    expect(r.sport).toEqual({ value: "football" });
    expect(r.height_in).toEqual({ value: 75 });

    // AND THE READER'S VIEW CARRIES THEM, which is the half that reaches a screen.
    expect(entry.context.beside.map((b) => b.signalId)).toContain("sleep_hours");
    expect(entry.context.beside.map((b) => b.signalId)).toContain("training_load");
    expect(entry.context.beside.map((b) => b.signalId)).not.toContain("date_of_birth");
  });

  it("reads a skill session whose skillDayLogId is null", async () => {
    // THE PLAIN-APPEND FALLBACK. An INNER join through skill_day_logs drops this row entirely and
    // nothing says so -- the shape the favorited-cap sweep found one table over.
    await db.insert(skillSessionLogs).values({
      skillAssignmentId,
      skillProgramDayId,
      athleteId,
      trackingLevel: "full",
      skillDayLogId: null,
      elapsedSeconds: 4.72,
      wellSequenced: true,
      createdAt: new Date(`${TODAY}T14:00:00Z`),
    });

    const byDate = await fetchAnvilStateInputs(athleteId, TODAY, TODAY);
    expect(byDate.get(TODAY)!.skills).toHaveLength(1);
    expect(byDate.get(TODAY)!.skills[0].elapsedSeconds).toBe(4.72);
  });

  it("carries the most recent testing battery and weigh-in from BEFORE the window", async () => {
    await db.insert(testingResults).values({ athleteId, date: "2026-09-01", fortyYardDash: 4.61 });
    await db.insert(bodyMetrics).values({ athleteId, date: "2026-09-01", weight: 203, weightUnit: "lbs" });

    const byDate = await fetchAnvilContext(athleteId, TODAY, TODAY);
    const r = byDate.get(TODAY)!.state.readings;
    expect(r.forty_yard_dash).toEqual({ value: 4.61 });
    expect(r.body_mass).toEqual({ value: 203 });
  });

  it("says a capture is not comparable when it came off another phone", async () => {
    // Two takes on the usual phone on two earlier days, one on a different phone today. Two days
    // rather than two sets on one day because `workout_log_day_instance_idx` is unique on
    // (assignment, day, date) -- and the modal device is decided by capture count over the
    // sixty-day window, which reaches back past `from`.
    for (const date of ["2026-11-06", YESTERDAY]) {
      await writeCapture({
        date,
        deviceInfo: { deviceModel: "iPhone15,2", lens: "wide", activeFormat: "1920x1080" },
        diagnostics: { outcome: "tracked" },
      });
    }
    await writeCapture({
      date: TODAY,
      deviceInfo: { deviceModel: "iPhone12,1", lens: "wide", activeFormat: "1280x720" },
      diagnostics: { outcome: "tracked" },
    });

    const byDate = await fetchAnvilContext(athleteId, YESTERDAY, TODAY);
    const today = byDate.get(TODAY)!;
    expect(today.state.readings.mean_velocity_mps).toEqual({ absent: "capture_not_comparable" });
    // THE EXPLANATION IS PRESENT WHILE THE NUMBER IS ABSENT. A withheld number whose reason is
    // also withheld is the blank this whole module exists to refuse.
    expect(today.state.readings.capture_device).toEqual({
      value: "iPhone12,1 | wide | 1280x720",
    });
    expect(today.context.fixable.map((f) => f.absent)).toContain("capture_not_comparable");
    expect(byDate.get(YESTERDAY)!.state.readings.mean_velocity_mps).toEqual({ value: 0.74 });
  });

  it("declares no usual phone on a tie, so both takes stay comparable", async () => {
    // AN ATHLETE WHO GENUINELY FILMS ON TWO PHONES EQUALLY HAS NO USUAL PHONE, and saying so is
    // more honest than picking one by sort order -- which would make half their history
    // incomparable for an arbitrary reason. `comparableCaptures` reads a null modal key as
    // "everything passes", the direction that costs the athlete nothing.
    await writeCapture({
      date: YESTERDAY,
      deviceInfo: { deviceModel: "iPhone15,2", lens: "wide", activeFormat: "1920x1080" },
      diagnostics: { outcome: "tracked" },
    });
    await writeCapture({
      date: TODAY,
      deviceInfo: { deviceModel: "iPhone12,1", lens: "wide", activeFormat: "1280x720" },
      diagnostics: { outcome: "tracked" },
      meanVelocityMps: 0.69,
    });

    const inputs = await fetchAnvilStateInputs(athleteId, YESTERDAY, TODAY);
    expect(inputs.get(TODAY)!.modalDeviceKey).toBeNull();
    const byDate = await fetchAnvilContext(athleteId, YESTERDAY, TODAY);
    expect(byDate.get(TODAY)!.state.readings.mean_velocity_mps).toEqual({ value: 0.69 });
    expect(byDate.get(YESTERDAY)!.state.readings.mean_velocity_mps).toEqual({ value: 0.74 });
  });

  it("does not compare a take the pipeline itself refused, and keeps an undiagnosed one", async () => {
    await writeCapture({
      date: TODAY,
      deviceInfo: { deviceModel: "iPhone15,2", lens: "wide", activeFormat: "1920x1080" },
      diagnostics: { outcome: "empty_implausible_scale" },
    });
    let byDate = await fetchAnvilContext(athleteId, TODAY, TODAY);
    expect(byDate.get(TODAY)!.state.readings.mean_velocity_mps).toEqual({
      absent: "capture_not_comparable",
    });

    // A SET WITH NO DIAGNOSTICS AT ALL IS KEPT. Null means a hand-logged set or a camera set from
    // before the blob existed; reading it as a refusal discards the older half of every history.
    await db.delete(workoutLogs).where(eq(workoutLogs.athleteId, athleteId));
    await writeCapture({ date: TODAY, deviceInfo: null, diagnostics: null });
    byDate = await fetchAnvilContext(athleteId, TODAY, TODAY);
    expect(byDate.get(TODAY)!.state.readings.mean_velocity_mps).toEqual({ value: 0.74 });
  });

  it("separates a watch that was never connected from one that was not worn", async () => {
    await db.insert(wellnessCheckins).values({
      athleteId,
      date: TODAY,
      sleepHours: 7,
      soreness: 2,
      stress: 2,
      mentalFocus: 4,
    });
    let byDate = await fetchAnvilContext(athleteId, TODAY, TODAY);
    expect(byDate.get(TODAY)!.state.readings.hrv).toEqual({ absent: "health_not_connected" });
    expect(byDate.get(TODAY)!.context.fixable.map((f) => f.signalId)).toContain("hrv");

    // One Health value anywhere in the history makes it a connected account forever, so today's
    // blank becomes "not worn" rather than "never set up" -- two sentences a coach acts on
    // differently, and one null cannot carry both.
    await db.insert(wellnessCheckins).values({
      athleteId,
      date: "2026-09-01",
      sleepHours: 7,
      soreness: 2,
      stress: 2,
      mentalFocus: 4,
      hrv: 52,
    });
    byDate = await fetchAnvilContext(athleteId, TODAY, TODAY);
    expect(byDate.get(TODAY)!.state.readings.hrv).toEqual({ absent: "no_data" });
    expect(byDate.get(TODAY)!.context.fixable.map((f) => f.signalId)).not.toContain("hrv");
  });

  it("reads an open injury, a restricted joint, measured minutes and an outside instrument", async () => {
    await db.insert(injuryHistory).values([
      { athleteId, bodyPart: "left_knee", occurredOn: "2026-10-01", resolved: false },
      { athleteId, bodyPart: "right_wrist", occurredOn: "2026-05-01", resolved: true, resolvedOn: "2026-06-01" },
    ]);
    await db.insert(goniometerReadings).values({
      athleteId,
      recordedBy: coachId,
      date: "2026-11-01",
      joint: "ankle_left",
      movement: "dorsiflexion",
      angleDegrees: 4,
    });
    await db.insert(caraSessions).values({
      athleteId,
      activityType: "training",
      startedAt: new Date(`${TODAY}T15:00:00Z`),
      endedAt: new Date(`${TODAY}T16:02:00Z`),
    });
    await db.insert(importedTestingData).values({
      athleteId,
      date: TODAY,
      exerciseName: "Back Squat",
      velocityMps: 0.81,
      powerWatts: 1020,
    });

    const r = (await fetchAnvilContext(athleteId, TODAY, TODAY)).get(TODAY)!.state.readings;
    // The resolved one is not an open injury, which is the whole point of reading `resolvedOn`.
    expect(r.injury).toEqual({ value: ["left_knee"] });
    expect(isPresent(r.goniometer_angle)).toBe(true);
    expect(isPresent(r.cara_training_minutes) && Math.round(r.cara_training_minutes.value as number)).toBe(62);
    // THE ONE WITNESS THE CAMERA HAD NO HAND IN PRODUCING, which is Rule #2's argument in the
    // Anvil's terms and the reason `imported_testing_data` was added to the signal list at all.
    expect(r.imported_velocity_mps).toEqual({ value: 0.81 });
    expect(r.imported_power_watts).toEqual({ value: 1020 });
  });

  it("says tracking is opted out rather than reporting a day with no training", async () => {
    await writeCapture({
      date: TODAY,
      deviceInfo: { deviceModel: "iPhone15,2", lens: "wide", activeFormat: "1920x1080" },
      diagnostics: { outcome: "tracked" },
    });
    await db.update(users).set({ trackingOptOut: true }).where(eq(users.id, athleteId));

    const entry = (await fetchAnvilContext(athleteId, TODAY, TODAY)).get(TODAY)!;
    // CONSENT COMES FIRST, which is `captureAbsence`'s stated order: asking "is this the usual
    // phone" of somebody who opted out would answer `no_data` about a consent decision.
    expect(entry.state.readings.mean_velocity_mps).toEqual({ absent: "tracking_opted_out" });
    expect(entry.state.readings.tracking_opt_out).toEqual({ value: true });
    expect(entry.context.fixable.map((f) => f.absent)).toContain("tracking_opted_out");
  });

  it("reports a parked seat, because an off-season hold is not fatigue", async () => {
    await db.update(coachAthletes).set({ heldAt: new Date() }).where(eq(coachAthletes.athleteId, athleteId));
    const r = (await fetchAnvilContext(athleteId, TODAY, TODAY)).get(TODAY)!.state.readings;
    expect(r.seat_is_parked).toEqual({ value: true });
  });

  it("returns a dense range, so a day with nothing logged is present and empty", async () => {
    const from = "2026-11-02";
    const byDate = await fetchAnvilContext(athleteId, from, TODAY);
    expect(byDate.size).toBe(7);
    for (const date of ["2026-11-02", "2026-11-05", TODAY]) {
      const entry = byDate.get(date);
      expect(entry, `${date} is missing, which reads as "we did not look"`).toBeTruthy();
      // EVERY DECLARED SIGNAL HAS AN ENTRY, value or stated absence. Never an absent key.
      expect(Object.keys(entry!.state.readings).length).toBeGreaterThan(40);
      expect(entry!.state.coverage.length).toBeGreaterThan(0);
    }
    expect(byDate.get(TODAY)!.context.beside.map((b) => b.signalId)).not.toContain("sleep_hours");
  });
});
