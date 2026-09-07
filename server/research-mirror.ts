import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { formatISO, parseISO, startOfWeek } from "date-fns";
import { db } from "./db";
import {
  exercises,
  injuryHistory,
  researchSubjectInjuries,
  researchSubjectSets,
  researchSubjects,
  users,
  workoutLogEntries,
  workoutLogs,
  workoutSetEntries,
} from "@shared/schema";
import { normalizeInjuryRegion, normalizeInjurySide } from "@shared/injury-taxonomy";
import { derivePrivacyTier } from "@shared/privacy-tiers";

/**
 * Keeping the research mirror in step with the accounts that consented to be
 * in it.
 *
 * This module is the ONLY place that reads a live athlete row and writes a
 * research subject row. Nothing downstream -- not the cohort query, not the
 * PDF builder, not the route -- ever sees both. That separation is the whole
 * point of the mirror; see the researchSubjects comment in shared/schema.ts
 * for why an export pipeline that de-identifies on the way out is weaker
 * than one that reads from a store with no identity in it.
 *
 * Three operations, and the third is the one that is easy to get wrong:
 *
 *   syncResearchSubject   copy or refresh one consenting athlete
 *   syncAllResearchSubjects  reconcile the whole mirror, run nightly
 *   removeResearchSubject reverse it, on withdrawal or deletion
 *
 * Reconciling is not just "copy the consenting athletes". It also has to
 * remove subjects whose athlete has since withdrawn, opted out of tracking,
 * stopped being an athlete, or deleted their account -- otherwise consent
 * withdrawal quietly fails to reach the next extract, which is the failure
 * this whole design exists to prevent.
 */

/** Rule 3 of the archive's copying rules: dates land on the Sunday of their week. */
const week = (d: string | Date) =>
  formatISO(startOfWeek(typeof d === "string" ? parseISO(d) : d, { weekStartsOn: 0 }), {
    representation: "date",
  });

/**
 * The one condition that decides membership. Opt-IN research consent AND not
 * opted out of tracking: the two answer different questions and an athlete
 * has to be on the right side of both.
 */
const eligible = () =>
  and(
    eq(users.role, "athlete"),
    eq(users.trackingOptOut, false),
    eq(users.researchDataConsent, true),
  );

/** Deletes a subject and everything hanging off it. Safe to call for a subject that isn't there. */
async function deleteSubjectRows(subjectId: string) {
  await db.delete(researchSubjectSets).where(eq(researchSubjectSets.subjectId, subjectId));
  await db.delete(researchSubjectInjuries).where(eq(researchSubjectInjuries.subjectId, subjectId));
  await db.delete(researchSubjects).where(eq(researchSubjects.subjectId, subjectId));
}

/**
 * Removes an account from the mirror.
 *
 * Called on withdrawal, on a tracking opt-out, and before an account is
 * deleted. Clearing users.researchSubjectId is not bookkeeping: leaving a
 * stale uuid there would make a later re-consent reuse the same subject id,
 * which would let two extracts taken a year apart be joined on it.
 */
export async function removeResearchSubject(athleteId: number): Promise<boolean> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, athleteId),
    columns: { researchSubjectId: true },
  });
  if (!row?.researchSubjectId) return false;
  await deleteSubjectRows(row.researchSubjectId);
  await db.update(users).set({ researchSubjectId: null }).where(eq(users.id, athleteId));
  return true;
}

/**
 * Copies or refreshes one consenting athlete into the mirror.
 *
 * Returns the subject id, or null when the athlete is not eligible -- in
 * which case any existing subject row is removed first, so calling this after
 * a consent change is enough on its own to make the mirror correct.
 *
 * A refresh replaces the subject's child rows rather than appending to them.
 * Appending would double every set each night, and reconciling row by row
 * would need a stable per-set identifier in the mirror, which is exactly the
 * kind of join key that should not exist here.
 */
export async function syncResearchSubject(athleteId: number): Promise<string | null> {
  const athlete = await db.query.users.findFirst({ where: eq(users.id, athleteId) });
  if (
    !athlete ||
    athlete.role !== "athlete" ||
    athlete.trackingOptOut ||
    !athlete.researchDataConsent
  ) {
    await removeResearchSubject(athleteId);
    return null;
  }

  const subjectId = athlete.researchSubjectId ?? randomUUID();

  const isMinor = athlete.dateOfBirth
    ? derivePrivacyTier(athlete.dateOfBirth) !== "tier3_adult_18plus"
    : // No date of birth on file is treated as a minor, the same safe
      // assumption getResearchDataConsent makes.
      true;

  const subjectRow = {
    subjectId,
    age: athlete.age,
    gender: athlete.gender,
    sport: athlete.sport,
    position: athlete.position,
    heightIn: athlete.heightIn,
    bodyWeightLbs: athlete.bodyWeightLbs,
    seasonPhase: athlete.seasonPhase,
    fortyYardDash: athlete.fortyYardDash,
    verticalJumpIn: athlete.verticalJumpIn,
    broadJumpIn: athlete.broadJumpIn,
    proAgilitySeconds: athlete.proAgilitySeconds,
    benchMaxLbs: athlete.benchMaxLbs,
    squatMaxLbs: athlete.squatMaxLbs,
    deadliftMaxLbs: athlete.deadliftMaxLbs,
    isMinor,
    accountCreatedWeek: athlete.createdAt ? week(athlete.createdAt) : null,
    syncedAt: new Date(),
  };

  await db
    .insert(researchSubjects)
    .values(subjectRow)
    .onConflictDoUpdate({ target: researchSubjects.subjectId, set: subjectRow });

  await db.delete(researchSubjectSets).where(eq(researchSubjectSets.subjectId, subjectId));
  await db.delete(researchSubjectInjuries).where(eq(researchSubjectInjuries.subjectId, subjectId));

  const setRows = await db
    .select({
      exerciseName: exercises.name,
      completedAt: workoutLogs.completedAt,
      date: workoutLogs.date,
      peakVelocityMps: workoutSetEntries.peakVelocityMps,
      meanVelocityMps: workoutSetEntries.meanVelocityMps,
      romCm: workoutSetEntries.romCm,
      peakPowerWatts: workoutSetEntries.peakPowerWatts,
      jumpHeightCm: workoutSetEntries.jumpHeightCm,
      kbSwingPeakSpeedMps: workoutSetEntries.kbSwingPeakSpeedMps,
      medBallPeakSpeedMps: workoutSetEntries.medBallPeakSpeedMps,
      horizontalLoadAvgSpeedYardsPerSec: workoutSetEntries.horizontalLoadAvgSpeedYardsPerSec,
      trustScorePct: workoutSetEntries.trustScorePct,
    })
    .from(workoutSetEntries)
    .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
    .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
    .innerJoin(exercises, eq(workoutLogEntries.exerciseId, exercises.id))
    .where(eq(workoutLogs.athleteId, athleteId));

  if (setRows.length > 0) {
    await db.insert(researchSubjectSets).values(
      setRows.map((r) => ({
        subjectId,
        week: week(r.completedAt ?? r.date),
        exerciseName: r.exerciseName,
        peakVelocityMps: r.peakVelocityMps,
        meanVelocityMps: r.meanVelocityMps,
        romCm: r.romCm,
        peakPowerWatts: r.peakPowerWatts,
        jumpHeightCm: r.jumpHeightCm,
        kbSwingPeakSpeedMps: r.kbSwingPeakSpeedMps,
        medBallPeakSpeedMps: r.medBallPeakSpeedMps,
        horizontalLoadAvgSpeedYardsPerSec: r.horizontalLoadAvgSpeedYardsPerSec,
        trustScorePct: r.trustScorePct,
      })),
    );
  }

  const injuries = await db
    .select()
    .from(injuryHistory)
    .where(eq(injuryHistory.athleteId, athleteId));

  if (injuries.length > 0) {
    await db.insert(researchSubjectInjuries).values(
      injuries.map((i) => ({
        subjectId,
        // Normalised here, once, so the mirror never holds the free text the
        // athlete typed. The stored bodyRegion is preferred where it exists
        // because a coach may have corrected the inferred guess.
        region: i.bodyRegion ?? normalizeInjuryRegion(i.bodyPart),
        side: normalizeInjurySide(i.bodyPart),
        resolved: i.resolved,
        week: i.occurredOn ? week(i.occurredOn) : null,
      })),
    );
  }

  if (athlete.researchSubjectId !== subjectId) {
    await db.update(users).set({ researchSubjectId: subjectId }).where(eq(users.id, athleteId));
  }

  return subjectId;
}

/**
 * Reconciles the whole mirror against current consent.
 *
 * Both directions, and the removal direction is the one that matters: an
 * athlete who withdrew last night has to be gone from the mirror before the
 * next extract is built, and a mirror that only ever adds would keep them.
 * Orphans -- subject rows whose account was deleted outright, so nothing
 * points at them any more -- are swept too.
 */
export async function syncAllResearchSubjects(): Promise<{
  synced: number;
  removed: number;
}> {
  const consenting = await db.select({ id: users.id }).from(users).where(eligible());

  let synced = 0;
  for (const row of consenting) {
    if (await syncResearchSubject(row.id)) synced += 1;
  }

  // Everything currently in the mirror, against everything that should be.
  const present = await db.select({ subjectId: researchSubjects.subjectId }).from(researchSubjects);
  const claimed = await db
    .select({ researchSubjectId: users.researchSubjectId })
    .from(users)
    .where(eligible());
  const keep = new Set(claimed.map((c) => c.researchSubjectId).filter((v): v is string => !!v));

  const stale = present.map((p) => p.subjectId).filter((id) => !keep.has(id));
  for (const subjectId of stale) await deleteSubjectRows(subjectId);

  // A user row that still points at a subject it should not have. Deleting
  // the subject rows above does not clear the pointer, and a stale pointer
  // would be reused on re-consent.
  if (stale.length > 0) {
    await db
      .update(users)
      .set({ researchSubjectId: null })
      .where(inArray(users.researchSubjectId, stale));
  }

  return { synced, removed: stale.length };
}
