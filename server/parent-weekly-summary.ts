/* THE WEEKLY PARENT SUMMARY (2026-11-21). Scott said yes to a weekly email to the parent of a
 * minor: the week's assigned sessions, how many were completed, attendance where the coach marked
 * it, and hand-logged personal records. The job that sends it is parent-weekly-summary-job.ts; this
 * file decides who gets one, builds it, records it, and serves the guardian's on/off switch.
 *
 * WHO, and every rule is a refusal that sends nothing:
 *   - only to the account on a `guardian_links` row for that child, never anyone else;
 *   - only for a child known to be UNDER 18 on the last day of the week (a real date of birth; no
 *     date of birth is not a known minor, so nothing is sent). An adult's training is their own;
 *   - only while the child has an ACTIVE coach seat. This is the program's report to the parent, so
 *     a Free Agent minor (no program) and a child whose every seat is parked for the off season
 *     (held) get none: a held athlete's leftover assignments would read "0 of 3 completed" about a
 *     season the coach has paused. The guardian dashboard still shows their training either way;
 *   - not for a week with nothing assigned;
 *   - not when this guardian switched it off for this child (on by default);
 *   - once per guardian per child per week: the send row is CLAIMED before the send and released if
 *     the send fails, so a rerun the same week never doubles and an outage retries.
 *
 * WHAT IT NEVER CARRIES: a camera number. Personal records are the `isPr` flag on a set, which is
 * computed from the weight and reps the athlete TYPED (submitWorkoutLog), so they need no accuracy
 * caveat; every camera-derived column is left out on purpose. */
import type { Express, Request } from "express";
import { z } from "zod";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "./db";
import { requireGuardianAccess } from "./auth";
import { storage } from "./storage";
import { sendEmail } from "./email";
import {
  SEND_WINDOW_DAYS,
  buildParentWeeklySummaryEmail,
  isKnownMinorOn,
  lastCompletedWeek,
  type WeeklySummary,
} from "./parent-weekly-summary-email";
import {
  attendanceRecords,
  coachAthletes,
  exercises,
  guardianLinks,
  guardianWeeklySummaryOptOuts,
  guardianWeeklySummarySends,
  users,
  workoutLogEntries,
  workoutLogs,
  workoutSetEntries,
} from "@shared/schema";
import { weekDates, type AttendanceStatus } from "@shared/attendance";
import { sumWarmupCompletions, warmupFactsFor } from "./program-day-warmup";

const ISO_DATE_LENGTH = 10;
export { SEND_WINDOW_DAYS, buildParentWeeklySummaryEmail, isKnownMinorOn, lastCompletedWeek, type WeeklySummary };

async function hasActiveCoachSeat(athleteId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: coachAthletes.id })
    .from(coachAthletes)
    .where(and(eq(coachAthletes.athleteId, athleteId), isNull(coachAthletes.heldAt)))
    .limit(1);
  return !!row;
}

async function isOptedOut(guardianId: number, athleteId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: guardianWeeklySummaryOptOuts.id })
    .from(guardianWeeklySummaryOptOuts)
    .where(and(eq(guardianWeeklySummaryOptOuts.guardianId, guardianId), eq(guardianWeeklySummaryOptOuts.athleteId, athleteId)))
    .limit(1);
  return !!row;
}

/** Everything the email says, read for one child and one week. */
export async function readWeeklySummary(athlete: { id: number; name: string }, weekStart: string): Promise<WeeklySummary> {
  const dates = weekDates(weekStart);
  const weekEnd = dates[dates.length - 1];
  const [calendar, marks, prRows] = await Promise.all([
    storage.getCalendarForAthlete(athlete.id, weekStart, weekEnd),
    db
      .select({ date: attendanceRecords.date, status: attendanceRecords.status })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.athleteId, athlete.id), gte(attendanceRecords.date, weekStart), lte(attendanceRecords.date, weekEnd))),
    db
      .select({
        date: workoutLogs.date,
        exercise: exercises.name,
        weight: workoutSetEntries.weight,
        unit: workoutSetEntries.weightUnit,
        reps: workoutSetEntries.reps,
      })
      .from(workoutSetEntries)
      .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
      .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
      .innerJoin(exercises, eq(workoutLogEntries.exerciseId, exercises.id))
      .where(
        and(
          eq(workoutLogs.athleteId, athlete.id),
          eq(workoutSetEntries.isPr, true),
          gte(workoutLogs.date, weekStart),
          lte(workoutLogs.date, weekEnd),
        ),
      )
      .orderBy(workoutLogs.date),
  ]);
  // One mark per day: an athlete is rarely in two programs, and a day counted twice would overstate it.
  const markByDate = new Map<string, AttendanceStatus>();
  marks.forEach((m) => {
    if (!markByDate.has(m.date)) markByDate.set(m.date, m.status as AttendanceStatus);
  });
  const attendance = [...markByDate.values()].reduce<Partial<Record<AttendanceStatus, number>>>(
    (acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }),
    {},
  );
  const warmups = await warmupFactsFor(
    calendar
      .filter((e) => !e.isRestDay && e.kind === "exercise" && e.assignmentId != null && e.programDayId != null)
      .map((e) => ({ athleteId: athlete.id, assignmentId: e.assignmentId as number, programDayId: e.programDayId as number, date: e.date })),
  );
  return {
    athleteName: athlete.name,
    weekStart,
    weekEnd,
    warmup: sumWarmupCompletions(warmups.values()),
    sessions: calendar
      .filter((e) => !e.isRestDay)
      .map((e) => ({ date: e.date, title: e.title, completed: e.completed }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    attendance,
    prs: prRows.map((r) => ({ date: r.date, exercise: r.exercise, weight: r.weight, unit: r.unit, reps: r.reps })),
  };
}

export type SummaryOutcome =
  | "sent"
  | "already_sent"
  | "send_failed"
  | "no_guardian_email"
  | "not_a_known_minor"
  | "no_active_coach"
  | "opted_out"
  | "nothing_assigned";

type Link = {
  guardianId: number;
  guardianEmail: string | null;
  athleteId: number;
  athleteName: string;
  athleteRole: string;
  athleteDateOfBirth: string | null;
};

async function summaryFor(link: Link, weekStart: string, weekEnd: string): Promise<SummaryOutcome> {
  if (!link.guardianEmail) return "no_guardian_email";
  if (link.athleteRole !== "athlete" || !isKnownMinorOn(link.athleteDateOfBirth, weekEnd)) return "not_a_known_minor";
  if (await isOptedOut(link.guardianId, link.athleteId)) return "opted_out";
  if (!(await hasActiveCoachSeat(link.athleteId))) return "no_active_coach";
  const summary = await readWeeklySummary({ id: link.athleteId, name: link.athleteName }, weekStart);
  if (summary.sessions.length === 0) return "nothing_assigned";
  // THE DOUBLE-SEND GUARD: claim the week before sending. A second run finds the row and stops.
  const claimed = await db
    .insert(guardianWeeklySummarySends)
    .values({ guardianId: link.guardianId, athleteId: link.athleteId, weekStart })
    .onConflictDoNothing({
      target: [guardianWeeklySummarySends.guardianId, guardianWeeklySummarySends.athleteId, guardianWeeklySummarySends.weekStart],
    })
    .returning({ id: guardianWeeklySummarySends.id });
  if (claimed.length === 0) return "already_sent";
  const email = buildParentWeeklySummaryEmail(summary);
  const result = await sendEmail({ to: link.guardianEmail, subject: email.subject, html: email.html, brandForUserId: link.athleteId });
  if (!result.sent) {
    await db.delete(guardianWeeklySummarySends).where(eq(guardianWeeklySummarySends.id, claimed[0].id));
    return "send_failed";
  }
  return "sent";
}

/** One pass over every guardian link. Sequential on purpose: a large platform never opens hundreds
 * of sends at once (the weekly recap's reasoning). */
export async function runParentWeeklySummaries(now: Date = new Date()): Promise<Partial<Record<SummaryOutcome | "outside_window", number>>> {
  const { weekStart, weekEnd, daysSinceEnd } = lastCompletedWeek(now);
  if (daysSinceEnd > SEND_WINDOW_DAYS) return { outside_window: 1 };
  const guardian = db
    .select({ id: users.id, email: users.email })
    .from(users)
    .as("guardian");
  const links: Link[] = await db
    .select({
      guardianId: guardianLinks.guardianId,
      guardianEmail: guardian.email,
      athleteId: users.id,
      athleteName: users.name,
      athleteRole: users.role,
      athleteDateOfBirth: users.dateOfBirth,
    })
    .from(guardianLinks)
    .innerJoin(users, eq(guardianLinks.athleteId, users.id))
    .innerJoin(guardian, eq(guardianLinks.guardianId, guardian.id));
  return links.reduce<Promise<Partial<Record<SummaryOutcome, number>>>>(async (prev, link) => {
    const tally = await prev;
    const outcome = await summaryFor(link, weekStart, weekEnd);
    return { ...tally, [outcome]: (tally[outcome] ?? 0) + 1 };
  }, Promise.resolve({}));
}

/** Why a guardian's switch would or would not produce an email, for the dashboard's wording. */
async function eligibility(athlete: { id: number; dateOfBirth: string | null }): Promise<"eligible" | "adult" | "no_active_coach"> {
  const today = new Date().toISOString().slice(0, ISO_DATE_LENGTH);
  if (!isKnownMinorOn(athlete.dateOfBirth, today)) return "adult";
  return (await hasActiveCoachSeat(athlete.id)) ? "eligible" : "no_active_coach";
}

const NOT_FOUND = 404;
const BAD_REQUEST = 400;
type Me = { id: number };
const currentUser = (req: Request) => req.user as Me;
const toggleSchema = z.object({ enabled: z.boolean() });

export function registerParentWeeklySummaryRoutes(app: Express): void {
  app.get("/api/guardian/athletes/:athleteId/weekly-summary", requireGuardianAccess, async (req, res) => {
    const user = currentUser(req);
    const athlete = await storage.getAthleteForGuardianScoped(user.id, Number(req.params.athleteId));
    if (!athlete) return res.status(NOT_FOUND).json({ message: "No athlete linked to this account." });
    const [optedOut, status] = await Promise.all([isOptedOut(user.id, athlete.id), eligibility(athlete)]);
    res.json({ enabled: !optedOut, status });
  });

  app.put("/api/guardian/athletes/:athleteId/weekly-summary", requireGuardianAccess, async (req, res) => {
    const user = currentUser(req);
    const athlete = await storage.getAthleteForGuardianScoped(user.id, Number(req.params.athleteId));
    if (!athlete) return res.status(NOT_FOUND).json({ message: "No athlete linked to this account." });
    const parsed = toggleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(BAD_REQUEST).json({ message: "Send enabled: true or false." });
    if (parsed.data.enabled) {
      await db
        .delete(guardianWeeklySummaryOptOuts)
        .where(and(eq(guardianWeeklySummaryOptOuts.guardianId, user.id), eq(guardianWeeklySummaryOptOuts.athleteId, athlete.id)));
    } else {
      await db
        .insert(guardianWeeklySummaryOptOuts)
        .values({ guardianId: user.id, athleteId: athlete.id })
        .onConflictDoNothing({ target: [guardianWeeklySummaryOptOuts.guardianId, guardianWeeklySummaryOptOuts.athleteId] });
    }
    res.json({ enabled: parsed.data.enabled });
  });
}

