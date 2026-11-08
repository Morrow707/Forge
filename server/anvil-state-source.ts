import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import {
  bodyMetrics,
  caraSessions,
  coachAthletes,
  foodLogEntries,
  goniometerReadings,
  importedTestingData,
  injuryHistory,
  skillDayLogs,
  skillSessionLogs,
  testingResults,
  users,
  wellnessCheckins,
  workoutLogEntries,
  workoutLogs,
  workoutSetEntries,
} from "@shared/schema";
import { classifyGoniometerReading } from "@shared/goniometer";
import {
  assembleAnvilState,
  type AnvilAthleteState,
  type AnvilStateInput,
  type CaptureRow,
  type SkillRow,
} from "@shared/anvil-athlete-state";
import { dayContextFrom, type AnvilDayContext } from "@shared/anvil-day-context";
import { captureDeviceKeyFrom, captureWasRefused } from "@shared/anvil-capture-identity";
import { db } from "./db";

/**
 * THE ROWS THE ANVIL READS, FETCHED. THIS IS THE CALLER THAT DID NOT EXIST.
 *
 * `shared/anvil-inputs.ts` declares fifty-three signals across thirteen of Forge's tables and
 * `shared/anvil-athlete-state.ts` maps rows onto them. Both shipped 2026-11-07 with full unit
 * coverage and **no caller**: a grep for `assembleAnvilState` across `server/`, `client/` and
 * `shared/` found its own declaration and two comments. So every one of those signals reached
 * nothing, and the reading an athlete and a coach saw was the Anvil's own four tasks alone.
 *
 * That was defensible for exactly one day. `assembleAnvilState`'s own docblock gives the reason --
 * "a route nothing calls is dead code that looks live ... The Anvil has no product code yet, so
 * there is nothing to call a route" -- and the Anvil's client shipped in build 718, which is the
 * moment that sentence stopped being true. Worse, the agreement an adult ticks says in words that
 * Forge reads their logged sets, filmed lifts, sleep, soreness and food log beside the check. A
 * consent document is the last place a promise the code does not keep belongs.
 *
 * ONE PASS PER ATHLETE OVER A RANGE, NOT ONE PER DAY. Thirteen range queries build every day in
 * the window; the alternative is thirteen per day, which on a 28-day roster print is a few
 * thousand. Everything is grouped in memory afterwards, which is what lets the "most recent on or
 * before this date" signals (testing, body mass, a restricted joint) be answered for every day
 * from one read.
 *
 * IT FETCHES AND DERIVES AND DECIDES NOTHING. Admissibility is `assembleAnvilState`'s
 * (`captureAbsence`, `comparableCaptures`), the channels' arithmetic is the `shared/anvil-*`
 * modules', and the only claim anywhere in the Anvil is `weeklyVerdict`'s. What this file owns is
 * two derivations the pure mapping deliberately refused, both because they read a blob whose
 * shape is the capture pipeline's business: the device key and whether the pipeline trusted a take.
 */

/**
 * How far back the "usual phone" is decided over.
 *
 * Sixty days rather than the window being printed, because a coach printing one week must not get
 * a different comparability answer from a coach printing four. It is a window and not the whole
 * history on purpose: an athlete who changed phones in March should not have every take since
 * measured against the old one.
 */
export const ANVIL_DEVICE_WINDOW_DAYS = 60;

/** `2026-11-08` minus n days, as ISO. */
function shiftIso(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** The most recent entry at or before `date` in a list already sorted oldest-first. */
function latestOnOrBefore<T extends { date: string }>(rows: readonly T[], date: string): T | null {
  let found: T | null = null;
  for (const row of rows) {
    if (row.date > date) break;
    found = row;
  }
  return found;
}

/**
 * Every day in `[from, to]` for one athlete, each one a complete `AnvilStateInput`.
 *
 * Keyed by ISO date and dense: a day with nothing logged is still present, carrying the athlete's
 * profile and a stated absence for every signal, because "we did not look at that day" and "that
 * day was empty" are two different claims and a missing key cannot tell them apart.
 */
export async function fetchAnvilStateInputs(
  athleteId: number,
  from: string,
  to: string,
): Promise<Map<string, AnvilStateInput>> {
  const deviceFrom = shiftIso(from, -ANVIL_DEVICE_WINDOW_DAYS);

  const [
    athleteRow,
    checkins,
    healthEver,
    captureRows,
    deviceRows,
    skillRows,
    testingRows,
    nutritionRows,
    bodyMassRows,
    injuryRows,
    goniometerRows,
    caraRows,
    logRows,
    importedRows,
    parkedSeats,
  ] = await Promise.all([
    db
      .select({
        dateOfBirth: users.dateOfBirth,
        gender: users.gender,
        sport: users.sport,
        position: users.position,
        seasonPhase: users.seasonPhase,
        heightIn: users.heightIn,
        trackingOptOut: users.trackingOptOut,
      })
      .from(users)
      .where(eq(users.id, athleteId))
      .limit(1),

    db
      .select()
      .from(wellnessCheckins)
      .where(
        and(
          eq(wellnessCheckins.athleteId, athleteId),
          gte(wellnessCheckins.date, from),
          lte(wellnessCheckins.date, to),
        ),
      ),

    // HAS APPLE HEALTH EVER SENT THIS ACCOUNT ANYTHING, over the whole history and not the window.
    // It separates "the strap was not worn today" from "this athlete is on the web and Health was
    // never connected" -- two blanks that call for different things from a coach, and the one
    // distinction a single null cannot carry. Bounded by nothing on purpose: a week with no Health
    // values on an account that synced in September is still a connected account.
    db
      .select({ id: wellnessCheckins.id })
      .from(wellnessCheckins)
      .where(
        and(
          eq(wellnessCheckins.athleteId, athleteId),
          sql`(${wellnessCheckins.hrv} is not null
            or ${wellnessCheckins.restingHeartRate} is not null
            or ${wellnessCheckins.respiratoryRate} is not null
            or ${wellnessCheckins.heartRateRecovery} is not null
            or ${wellnessCheckins.bodyMass} is not null)`,
        ),
      )
      .limit(1),

    capturesBetween(athleteId, from, to),
    capturesBetween(athleteId, deviceFrom, to),

    db
      .select({
        dayDate: skillDayLogs.date,
        createdAt: skillSessionLogs.createdAt,
        elapsedSeconds: skillSessionLogs.elapsedSeconds,
        distanceYards: skillSessionLogs.distanceYards,
        wellSequenced: skillSessionLogs.wellSequenced,
        hipShoulderSeparationDeg: skillSessionLogs.hipShoulderSeparationDeg,
        peakWristSpeedMps: skillSessionLogs.peakWristSpeedMps,
      })
      .from(skillSessionLogs)
      // LEFT, and filtered on the SESSION's own athlete id rather than the day log's.
      // `skillDayLogId` is nullable -- `createSkillSessionLog`'s plain-append fallback leaves it
      // null -- so an inner join would silently drop every capture that took that path, which is
      // the bug CLAUDE.md records one table over in the favorited-cap sweep.
      .leftJoin(skillDayLogs, eq(skillSessionLogs.skillDayLogId, skillDayLogs.id))
      .where(
        and(
          eq(skillSessionLogs.athleteId, athleteId),
          sql`coalesce(${skillDayLogs.date}, (${skillSessionLogs.createdAt})::date) between ${from} and ${to}`,
        ),
      ),

    db
      .select()
      .from(testingResults)
      .where(and(eq(testingResults.athleteId, athleteId), lte(testingResults.date, to)))
      .orderBy(testingResults.date),

    db
      .select({
        date: foodLogEntries.date,
        caloriesKcal: foodLogEntries.caloriesKcal,
        proteinG: foodLogEntries.proteinG,
        ironMg: foodLogEntries.ironMg,
        vitaminB12Mcg: foodLogEntries.vitaminB12Mcg,
        vitaminDMcg: foodLogEntries.vitaminDMcg,
      })
      .from(foodLogEntries)
      .where(
        and(eq(foodLogEntries.athleteId, athleteId), gte(foodLogEntries.date, from), lte(foodLogEntries.date, to)),
      ),

    db
      .select({ date: bodyMetrics.date, weight: bodyMetrics.weight, weightUnit: bodyMetrics.weightUnit })
      .from(bodyMetrics)
      .where(and(eq(bodyMetrics.athleteId, athleteId), lte(bodyMetrics.date, to)))
      .orderBy(bodyMetrics.date),

    db
      .select({
        bodyPart: injuryHistory.bodyPart,
        occurredOn: injuryHistory.occurredOn,
        resolved: injuryHistory.resolved,
        resolvedOn: injuryHistory.resolvedOn,
      })
      .from(injuryHistory)
      .where(and(eq(injuryHistory.athleteId, athleteId), lte(injuryHistory.occurredOn, to))),

    db
      .select({
        date: goniometerReadings.date,
        joint: goniometerReadings.joint,
        movement: goniometerReadings.movement,
        angleDegrees: goniometerReadings.angleDegrees,
      })
      .from(goniometerReadings)
      .where(and(eq(goniometerReadings.athleteId, athleteId), lte(goniometerReadings.date, to)))
      .orderBy(goniometerReadings.date),

    // CLOSED sessions only. An open session has no measured length yet, and counting one as zero
    // minutes would report an athlete who is training right now as having trained not at all.
    db
      .select({ startedAt: caraSessions.startedAt, endedAt: caraSessions.endedAt })
      .from(caraSessions)
      .where(and(eq(caraSessions.athleteId, athleteId), isNotNull(caraSessions.endedAt))),

    db
      .select({ date: workoutLogs.date, completed: workoutLogs.completed })
      .from(workoutLogs)
      .where(and(eq(workoutLogs.athleteId, athleteId), gte(workoutLogs.date, from), lte(workoutLogs.date, to))),

    db
      .select({
        date: importedTestingData.date,
        velocityMps: importedTestingData.velocityMps,
        powerWatts: importedTestingData.powerWatts,
      })
      .from(importedTestingData)
      .where(
        and(
          eq(importedTestingData.athleteId, athleteId),
          gte(importedTestingData.date, from),
          lte(importedTestingData.date, to),
        ),
      ),

    db
      .select({ heldAt: coachAthletes.heldAt })
      .from(coachAthletes)
      .where(and(eq(coachAthletes.athleteId, athleteId), isNotNull(coachAthletes.heldAt)))
      .limit(1),
  ]);

  const athlete = athleteRow[0] ?? null;

  // THE USUAL PHONE: the key that carried the most captures over the sixty-day window. A tie goes
  // to nobody (null), which makes every capture comparable rather than picking a winner by sort
  // order -- an athlete who genuinely films on two phones equally has no usual phone, and saying
  // so is more honest than declaring one.
  const deviceCounts = new Map<string, number>();
  for (const c of deviceRows) {
    if (c.deviceKey == null) continue;
    deviceCounts.set(c.deviceKey, (deviceCounts.get(c.deviceKey) ?? 0) + 1);
  }
  let modalDeviceKey: string | null = null;
  let best = 0;
  let tied = false;
  for (const [key, count] of deviceCounts) {
    if (count > best) {
      best = count;
      modalDeviceKey = key;
      tied = false;
    } else if (count === best) {
      tied = true;
    }
  }
  if (tied) modalDeviceKey = null;

  const checkinByDate = new Map(checkins.map((c) => [c.date, c]));
  const completedByDate = new Map(logRows.map((l) => [l.date, l.completed]));

  const capturesByDate = new Map<string, SourcedCapture[]>();
  for (const c of captureRows) push(capturesByDate, c.date, c);

  const skillsByDate = new Map<string, SkillRow[]>();
  for (const s of skillRows) {
    const date = s.dayDate ?? s.createdAt.toISOString().slice(0, 10);
    push(skillsByDate, date, {
      date,
      elapsedSeconds: s.elapsedSeconds,
      distanceYards: s.distanceYards,
      wellSequenced: s.wellSequenced,
      hipShoulderSeparationDeg: s.hipShoulderSeparationDeg,
      peakWristSpeedMps: s.peakWristSpeedMps,
    });
  }

  const nutritionByDate = new Map<
    string,
    { caloriesKcal: number; proteinG: number; ironMg: number; vitaminB12Mcg: number; vitaminDMcg: number }
  >();
  for (const row of nutritionRows) {
    const t =
      nutritionByDate.get(row.date) ??
      { caloriesKcal: 0, proteinG: 0, ironMg: 0, vitaminB12Mcg: 0, vitaminDMcg: 0 };
    t.caloriesKcal += row.caloriesKcal ?? 0;
    t.proteinG += row.proteinG ?? 0;
    t.ironMg += row.ironMg ?? 0;
    t.vitaminB12Mcg += row.vitaminB12Mcg ?? 0;
    t.vitaminDMcg += row.vitaminDMcg ?? 0;
    nutritionByDate.set(row.date, t);
  }

  const caraMinutesByDate = new Map<string, number>();
  for (const s of caraRows) {
    if (!s.endedAt) continue;
    const date = s.startedAt.toISOString().slice(0, 10);
    if (date < from || date > to) continue;
    const minutes = (s.endedAt.getTime() - s.startedAt.getTime()) / 60_000;
    if (!Number.isFinite(minutes) || minutes <= 0) continue;
    caraMinutesByDate.set(date, (caraMinutesByDate.get(date) ?? 0) + minutes);
  }

  const importedByDate = new Map<string, { v: number[]; p: number[] }>();
  for (const row of importedRows) {
    const t = importedByDate.get(row.date) ?? { v: [], p: [] };
    if (row.velocityMps != null) t.v.push(row.velocityMps);
    if (row.powerWatts != null) t.p.push(row.powerWatts);
    importedByDate.set(row.date, t);
  }

  // A RESTRICTED JOINT, classified by the same function the goniometer screens use. The coach's
  // own confirmed baseline is NOT read here: `classifyGoniometerReading` takes it as an override
  // and resolving one per joint is a second query whose answer only ever narrows this signal, so
  // the population normal is the conservative reading until somebody wants the baseline too.
  const restrictedReadings = goniometerRows
    .filter((r) => classifyGoniometerReading(r.joint, r.movement, r.angleDegrees) === "restricted")
    .map((r) => ({ date: r.date, angleDegrees: r.angleDegrees }));

  const inputs = new Map<string, AnvilStateInput>();
  for (let date = from; date <= to; date = shiftIso(date, 1)) {
    const w = checkinByDate.get(date) ?? null;
    const nutrition = nutritionByDate.get(date) ?? null;
    const imported = importedByDate.get(date);
    const captures = capturesByDate.get(date) ?? [];
    const bodyMass = latestOnOrBefore(bodyMassRows, date);
    const testing = latestOnOrBefore(testingRows, date);
    const restricted = latestOnOrBefore(restrictedReadings, date);

    inputs.set(date, {
      date,
      athlete: {
        dateOfBirth: athlete?.dateOfBirth ?? null,
        gender: athlete?.gender ?? null,
        sport: athlete?.sport ?? null,
        position: athlete?.position ?? null,
        seasonPhase: athlete?.seasonPhase ?? null,
        heightIn: athlete?.heightIn ?? null,
        trackingOptOut: athlete?.trackingOptOut ?? false,
      },
      wellness: w
        ? {
            date: w.date,
            sleepHours: w.sleepHours,
            soreness: w.soreness,
            stress: w.stress,
            hydration: w.hydration,
            mentalFocus: w.mentalFocus,
            bodyPainMap: w.bodyPainMap ?? null,
            restingHeartRate: w.restingHeartRate,
            hrv: w.hrv,
            respiratoryRate: w.respiratoryRate,
            bodyMass: w.bodyMass,
            heartRateRecovery: w.heartRateRecovery,
          }
        : null,
      healthEverConnected: healthEver.length > 0,
      captures,
      modalDeviceKey,
      skills: skillsByDate.get(date) ?? [],
      testing: testing
        ? {
            date: testing.date,
            fortyYardDash: testing.fortyYardDash,
            verticalJumpIn: testing.verticalJumpIn,
            broadJumpIn: testing.broadJumpIn,
            proAgilitySeconds: testing.proAgilitySeconds,
            threeConeSeconds: testing.threeConeSeconds,
            benchMaxLbs: testing.benchMaxLbs,
            squatMaxLbs: testing.squatMaxLbs,
            deadliftMaxLbs: testing.deadliftMaxLbs,
          }
        : null,
      nutrition,
      // NORMALISED TO POUNDS HERE, because `AnvilStateInput` says pounds and a kilogram weigh-in
      // compared against a pound one is a 2.2x step in a trend read for low energy availability.
      // The same argument the strength percentile's denominator settled, one column over.
      bodyMassLbs: bodyMass ? (bodyMass.weightUnit === "kg" ? bodyMass.weight * 2.20462 : bodyMass.weight) : null,
      openInjuries: injuryRows
        .filter((i) => i.occurredOn <= date && (!i.resolved || i.resolvedOn == null || i.resolvedOn >= date))
        .map((i) => i.bodyPart),
      restrictedJointAngleDeg: restricted?.angleDegrees ?? null,
      caraTrainingMinutes: caraMinutesByDate.get(date) ?? null,
      // VOLUME LOAD, the same reps x weight convention every other load path in Forge uses
      // (`getDailyLoadSeriesForAthlete`, the ACWR series, the analytics chart). A bodyweight or
      // band set contributes zero, which is that convention's stated limitation and not a new one.
      trainingLoad: dayLoad(captures),
      sessionCompleted: completedByDate.get(date) ?? null,
      importedVelocityMps: imported && imported.v.length > 0 ? mean(imported.v) : null,
      importedPowerWatts: imported && imported.p.length > 0 ? mean(imported.p) : null,
      seatIsParked: parkedSeats.length > 0,
    });
  }
  return inputs;
}

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Null rather than zero when nothing numeric was logged: no sets and a bodyweight-only day are
 * both "no volume load", and reporting zero would put a number on a day that produced none. */
function dayLoad(captures: readonly SourcedCapture[]): number | null {
  let total = 0;
  let any = false;
  for (const c of captures) {
    if (c.loadLbs == null || c.reps == null) continue;
    any = true;
    total += c.loadLbs * c.reps;
  }
  return any ? total : null;
}

/** One flattened capture, plus the two load columns `dayLoad` needs and the state input does not. */
type SourcedCapture = CaptureRow & { loadLbs: number | null; reps: number | null };

async function capturesBetween(athleteId: number, from: string, to: string): Promise<SourcedCapture[]> {
  const rows = await db
    .select({
      date: workoutLogs.date,
      exerciseId: workoutLogEntries.exerciseId,
      setNumber: workoutSetEntries.setNumber,
      captureDeviceInfo: workoutSetEntries.captureDeviceInfo,
      trackingDiagnostics: workoutSetEntries.trackingDiagnostics,
      velocityLossPercent: workoutSetEntries.velocityLossPercent,
      meanVelocityMps: workoutSetEntries.meanVelocityMps,
      peakVelocityMps: workoutSetEntries.peakVelocityMps,
      meanPowerWatts: workoutSetEntries.meanPowerWatts,
      jumpBreakdown: workoutSetEntries.jumpBreakdown,
      jumpHeightCm: workoutSetEntries.jumpHeightCm,
      reactiveStrengthIndex: workoutSetEntries.reactiveStrengthIndex,
      groundContactSeconds: workoutSetEntries.groundContactSeconds,
      rpe: workoutLogEntries.rpe,
      weightLbs: workoutSetEntries.weightLbs,
      repsCount: workoutSetEntries.repsCount,
    })
    .from(workoutSetEntries)
    .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
    .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
    .where(and(eq(workoutLogs.athleteId, athleteId), gte(workoutLogs.date, from), lte(workoutLogs.date, to)));

  return rows.map((r) => ({
    date: r.date,
    exerciseId: r.exerciseId,
    setNumber: r.setNumber,
    deviceKey: captureDeviceKeyFrom(r.captureDeviceInfo),
    refusedByPipeline: captureWasRefused(r.trackingDiagnostics),
    velocityLossPercent: r.velocityLossPercent,
    meanVelocityMps: r.meanVelocityMps,
    peakVelocityMps: r.peakVelocityMps,
    meanPowerWatts: r.meanPowerWatts,
    // EVERY JUMP IN THE SET, not the best one. `meanOrNull`'s comment is the whole reason the
    // input carries a list: Claudino et al. 2017 finds the MEAN of a session's countermovement
    // jumps detects neuromuscular fatigue where the maximum does not, because fatigue widens the
    // spread before it lowers the ceiling. The set-level `jumpHeightCm` is Forge's own best-jump
    // number and is the fallback only when the per-rep breakdown is absent.
    jumpHeightsCm: jumpHeightsFrom(r.jumpBreakdown, r.jumpHeightCm),
    reactiveStrengthIndex: r.reactiveStrengthIndex,
    groundContactSeconds: r.groundContactSeconds,
    rpe: r.rpe,
    loadLbs: r.weightLbs,
    reps: r.repsCount,
  }));
}

function jumpHeightsFrom(breakdown: unknown, setBest: number | null): number[] | null {
  if (Array.isArray(breakdown)) {
    const heights = breakdown
      .map((rep) => (rep && typeof rep === "object" ? (rep as Record<string, unknown>).heightCm : null))
      .filter((h): h is number => typeof h === "number" && Number.isFinite(h));
    if (heights.length > 0) return heights;
  }
  return setBest == null ? null : [setBest];
}

/**
 * One athlete's days in a range, each as the state record and the reader's view of it.
 *
 * The state record is kept beside the context on purpose: the context is what a screen and a page
 * render, and the record is what a later channel will be computed from. Dropping the record here
 * would make the slow channel's eventual wiring a second fetch of the same thirteen tables.
 */
export async function fetchAnvilContext(
  athleteId: number,
  from: string,
  to: string,
): Promise<Map<string, { state: AnvilAthleteState; context: AnvilDayContext }>> {
  const inputs = await fetchAnvilStateInputs(athleteId, from, to);
  const out = new Map<string, { state: AnvilAthleteState; context: AnvilDayContext }>();
  for (const [date, input] of inputs) {
    const state = assembleAnvilState(input);
    out.set(date, { state, context: dayContextFrom(state) });
  }
  return out;
}
