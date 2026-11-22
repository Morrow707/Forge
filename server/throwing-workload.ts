/* THROWING WORKLOAD AND THE YEAR-ROUND NOTE, THE SERVER HALF (2026-11-22). Rules in
 * shared/throwing-workload.ts and shared/single-sport-year.ts.
 *
 *   GET /api/coach/roster/:athleteId/throwing          weekly pitches and innings, Forge's notes.
 *   GET /api/coach/roster/:athleteId/single-sport-note the year-round single-sport note, or null.
 *   GET /api/coach/throwing-notes                      the Today card's notes, the in-season roster.
 *
 * All coach-only and scoped like every per-athlete coach route (athleteIsInCoachScope; an athlete
 * outside it is a 404). Nothing here is sent to the athlete, nothing blocks, nothing is a camera
 * number: pitches are the reps an athlete or coach typed.
 */
import type { Express, Request } from "express";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { requireRole } from "./auth";
import { storage } from "./storage";
import { assignments, exercises, programWeeks, programs, workoutLogEntries, workoutLogs, workoutSetEntries } from "@shared/schema";
import {
  THROWING_EXERCISE_NAMES,
  THROWING_GUIDE_TEXT,
  YEAR_DAYS,
  inningsInLastYear,
  pitchesFromReps,
  throwingDays,
  throwingNotes,
  throwingWeeks,
  type ThrowingSet,
} from "@shared/throwing-workload";
import { singleSportNote, type AssignedSpan } from "@shared/single-sport-year";

const NOT_FOUND = 404;
const ISO_DATE_LENGTH = 10;

type Me = { id: number };
const currentUser = (req: Request) => req.user as Me;
const todayIso = () => new Date().toISOString().slice(0, ISO_DATE_LENGTH);
function daysAgo(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, ISO_DATE_LENGTH);
}

const lowerNames = THROWING_EXERCISE_NAMES.map((n) => n.toLowerCase());

/** Every logged set of the three throwing exercises for these athletes since `since`, by athlete. */
async function throwingSetsFor(athleteIds: readonly number[], since: string): Promise<Map<number, ThrowingSet[]>> {
  const out = new Map<number, ThrowingSet[]>();
  if (athleteIds.length === 0) return out;
  const rows = await db
    .select({
      athleteId: workoutLogs.athleteId,
      date: workoutLogs.date,
      name: exercises.name,
      reps: workoutSetEntries.reps,
    })
    .from(workoutSetEntries)
    .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
    .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
    .innerJoin(exercises, eq(workoutLogEntries.exerciseId, exercises.id))
    .where(
      and(
        inArray(workoutLogs.athleteId, [...athleteIds]),
        gte(workoutLogs.date, since),
        inArray(sql`lower(${exercises.name})`, lowerNames),
      ),
    );
  rows.forEach((r) => {
    const list = out.get(r.athleteId) ?? [];
    list.push({ date: String(r.date), exerciseName: r.name, reps: pitchesFromReps(r.reps) });
    out.set(r.athleteId, list);
  });
  return out;
}

/** The spans of the athlete's assignments in the window, with their programs' sport tags. */
/** Every assignment of the athlete; singleSportNote keeps only the months inside its window. */
async function assignedSpans(athleteId: number): Promise<AssignedSpan[]> {
  const rows = await db
    .select({
      programId: assignments.programId,
      startDate: assignments.startDate,
      durationWeeks: assignments.durationWeeks,
      dateOverrides: assignments.dateOverrides,
      sport: programs.sport,
    })
    .from(assignments)
    .innerJoin(programs, eq(assignments.programId, programs.id))
    .where(eq(assignments.athleteId, athleteId));
  if (rows.length === 0) return [];
  const weekRows = await db
    .select({ programId: programWeeks.programId, weeks: sql<number>`count(*)::int` })
    .from(programWeeks)
    .where(inArray(programWeeks.programId, Array.from(new Set(rows.map((r) => r.programId)))))
    .groupBy(programWeeks.programId);
  const weeks = new Map(weekRows.map((w) => [w.programId, Number(w.weeks)]));
  return rows
    .map((r) => {
      const overrides = Object.values(r.dateOverrides ?? {}).filter((d) => typeof d === "string").sort();
      return {
        sport: r.sport,
        startDate: String(r.startDate),
        totalWeeks: Math.max(1, weeks.get(r.programId) ?? 1) * Math.max(1, r.durationWeeks),
        latestOverride: overrides.length > 0 ? overrides[overrides.length - 1] : null,
      };
    });
}

export function registerThrowingWorkloadRoutes(app: Express) {
  app.get("/api/coach/roster/:athleteId/throwing", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const athleteId = Number(req.params.athleteId);
    if (!Number.isInteger(athleteId) || !(await storage.athleteIsInCoachScope(user.id, athleteId)) || athleteId === user.id) {
      return res.status(NOT_FOUND).json({ message: "Athlete not found" });
    }
    const today = todayIso();
    const sets = (await throwingSetsFor([athleteId], daysAgo(today, YEAR_DAYS))).get(athleteId) ?? [];
    const days = throwingDays(sets);
    res.json({
      weeks: throwingWeeks(days, today),
      inningsLastYear: inningsInLastYear(days, today),
      notes: throwingNotes(days, today),
      guide: THROWING_GUIDE_TEXT,
      hasAny: days.length > 0,
    });
  });

  app.get("/api/coach/roster/:athleteId/single-sport-note", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const athleteId = Number(req.params.athleteId);
    if (!Number.isInteger(athleteId) || !(await storage.athleteIsInCoachScope(user.id, athleteId)) || athleteId === user.id) {
      return res.status(NOT_FOUND).json({ message: "Athlete not found" });
    }
    const today = todayIso();
    const spans = await assignedSpans(athleteId);
    res.json({ note: singleSportNote(spans, today) });
  });

  app.get("/api/coach/throwing-notes", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    // The in-season roster, already narrowed to a staff coach's teams and without parked seats.
    const roster = await storage.getRosterForCoach(user.id);
    const today = todayIso();
    const byAthlete = await throwingSetsFor(roster.map((a) => a.id), daysAgo(today, YEAR_DAYS));
    const athletes = roster
      .map((a) => ({ athleteId: a.id, name: a.name, notes: throwingNotes(throwingDays(byAthlete.get(a.id) ?? []), today) }))
      .filter((a) => a.notes.length > 0);
    res.json({ athletes });
  });
}
