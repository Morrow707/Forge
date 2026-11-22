/* "WHO TRAINED TODAY" AND ATTENDANCE, THE SERVER HALF (2026-11-21). Rules in shared/attendance.ts.
 *
 * What it REUSES rather than re-solves: the schedule comes from storage.getCalendarForCoach (the
 * same read the calendar, its Today tab and the "Next 3 days" card use, so recurring assignment
 * dates and date overrides are solved in one place), and the roster from storage.getRosterForCoach,
 * which is already narrowed to a staff coach's teams and already leaves parked (held) athletes out.
 * The only new read is the workout log's STARTED state, which the calendar flattens to "not
 * completed".
 *
 * Decisions, so nobody re-derives them:
 *   - A mark belongs to the PROGRAM (the primary coach), one per athlete per day. An assistant's
 *     mark and the head coach's are the same row.
 *   - Scope is the coach's ordinary scope (athleteIsInCoachScope). An athlete outside it is a 404,
 *     like every other per-athlete coach route.
 *   - A parked (held) athlete is not on the Today list and cannot be marked (409 naming the hold);
 *     their earlier marks are kept and the week view still shows them, flagged "on hold".
 *   - Nothing here is a camera number. */
import type { Express, Request } from "express";
import { z } from "zod";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "./db";
import { requireRole } from "./auth";
import { storage } from "./storage";
import { attendanceRecords, workoutLogs } from "@shared/schema";
import { sumWarmupCompletions, warmupFactsFor } from "./program-day-warmup";
import { warmupRatePercent, type WarmupCompletion } from "@shared/program-day-warmup";
import {
  ATTENDANCE_STATUSES,
  dayStatus,
  isIsoDate,
  mondayOf,
  weekDates,
  type AttendanceStatus,
  type AttendanceWeek,
  type SessionStatus,
} from "@shared/attendance";

const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const CONFLICT = 409;
const HTTP = { badRequest: BAD_REQUEST, notFound: NOT_FOUND, conflict: CONFLICT } as const;
const ISO_DATE_LENGTH = 10;

type Me = { id: number; role: "coach" | "athlete" | "admin" | "guardian"; name: string };
const currentUser = (req: Request) => req.user as Me;
const todayIso = () => new Date().toISOString().slice(0, ISO_DATE_LENGTH);

const isoDate = z.string().refine(isIsoDate, { message: "Send a date as YYYY-MM-DD." });

export const markAttendanceSchema = z.object({
  date: isoDate,
  athleteId: z.coerce.number().int().positive(),
  status: z.enum(ATTENDANCE_STATUSES).nullable(),
  teamId: z.coerce.number().int().positive().nullable().optional(),
});

export const markAllPresentSchema = z.object({
  date: isoDate,
  teamId: z.coerce.number().int().positive().nullable().optional(),
});

type RosterAthlete = { id: number; name: string };

/** The coach's active roster, deduplicated (a staff can hold two links to one athlete), optionally
 * narrowed to one of their teams. Null when the team is not one this coach can see. */
async function activeRoster(coachId: number, teamId: number | null | undefined): Promise<{
  athletes: RosterAthlete[];
  teams: Array<{ id: number; name: string; memberIds: number[] }>;
} | null> {
  const [roster, teamRows] = await Promise.all([storage.getRosterForCoach(coachId), storage.getTeamsForCoach(coachId)]);
  const teams = teamRows.map((t) => ({ id: t.id, name: t.name, memberIds: t.members.map((m) => m.athleteId) }));
  const byId = new Map<number, RosterAthlete>();
  roster.forEach((a) => byId.set(a.id, { id: a.id, name: a.name }));
  let athletes = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (teamId != null) {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return null;
    const members = new Set(team.memberIds);
    athletes = athletes.filter((a) => members.has(a.id));
  }
  return { athletes, teams };
}

/** Sessions per athlete per date over a range, from the coach's calendar plus the log's started
 * state. Rest days are not sessions. */
async function sessionsInRange(coachId: number, start: string, end: string, athleteIds: number[]) {
  const out = new Map<string, Array<{ title: string; status: SessionStatus }>>();
  if (athleteIds.length === 0) return { sessions: out, warmups: new Map<string, WarmupCompletion>() };
  const wanted = new Set(athleteIds);
  const [entries, logs] = await Promise.all([
    storage.getCalendarForCoach(coachId, start, end),
    db
      .select({
        athleteId: workoutLogs.athleteId,
        assignmentId: workoutLogs.assignmentId,
        programDayId: workoutLogs.programDayId,
        date: workoutLogs.date,
        completed: workoutLogs.completed,
      })
      .from(workoutLogs)
      .where(and(inArray(workoutLogs.athleteId, athleteIds), gte(workoutLogs.date, start), lte(workoutLogs.date, end))),
  ]);
  const startedKeys = new Set(logs.filter((l) => !l.completed).map((l) => `${l.assignmentId}:${l.programDayId}:${l.date}`));
  const statusOf = (e: (typeof entries)[number]): SessionStatus => {
    if (e.completed) return "completed";
    const started = e.kind === "exercise" && startedKeys.has(`${e.assignmentId}:${e.programDayId}:${e.date}`);
    return started ? "started" : "not_started";
  };
  const sessionEntries = entries.filter((e) => e.athleteId != null && wanted.has(e.athleteId) && !e.isRestDay);
  sessionEntries.forEach((e) => {
    const key = `${e.athleteId}:${e.date}`;
    out.set(key, [...(out.get(key) ?? []), { title: e.title, status: statusOf(e) }]);
  });
  // The warm-up mark (2026-11-22): per athlete-day, sessions with a warm-up and how many were ticked.
  const warmups = await warmupFactsFor(
    sessionEntries
      .filter((e) => e.kind === "exercise" && e.assignmentId != null && e.programDayId != null)
      .map((e) => ({ athleteId: e.athleteId as number, assignmentId: e.assignmentId as number, programDayId: e.programDayId as number, date: e.date })),
  );
  return { sessions: out, warmups };
}

async function marksInRange(programCoachId: number, athleteIds: number[], start: string, end: string) {
  if (athleteIds.length === 0) return new Map<string, AttendanceStatus>();
  const rows = await db
    .select({ athleteId: attendanceRecords.athleteId, date: attendanceRecords.date, status: attendanceRecords.status })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.programCoachId, programCoachId),
        inArray(attendanceRecords.athleteId, athleteIds),
        gte(attendanceRecords.date, start),
        lte(attendanceRecords.date, end),
      ),
    );
  return new Map(rows.map((r) => [`${r.athleteId}:${r.date}`, r.status as AttendanceStatus]));
}

export async function todayForCoach(coachId: number, date: string, teamId: number | null | undefined) {
  const roster = await activeRoster(coachId, teamId);
  if (!roster) return null;
  const ids = roster.athletes.map((a) => a.id);
  const programCoachId = await storage.getPrimaryCoachId(coachId);
  const [{ sessions, warmups }, marks] = await Promise.all([
    sessionsInRange(coachId, date, date, ids),
    marksInRange(programCoachId, ids, date, date),
  ]);
  const athletes = roster.athletes.map((a) => {
    const list = sessions.get(`${a.id}:${date}`) ?? [];
    return {
      // Null when none of today's sessions has a warm-up; otherwise done of with-warm-up.
      warmup: warmups.get(`${a.id}:${date}`) ?? null,
      athleteId: a.id,
      name: a.name,
      teamIds: roster.teams.filter((t) => t.memberIds.includes(a.id)).map((t) => t.id),
      sessions: list,
      status: dayStatus(list.map((s) => s.status)),
      attendance: marks.get(`${a.id}:${date}`) ?? null,
    };
  });
  const assigned = athletes.filter((a) => a.status !== "nothing_assigned");
  return {
    date,
    teamId: teamId ?? null,
    teams: roster.teams.map((t) => ({ id: t.id, name: t.name })),
    counts: {
      assigned: assigned.length,
      completed: assigned.filter((a) => a.status === "completed").length,
      started: assigned.filter((a) => a.status === "started").length,
      notStarted: assigned.filter((a) => a.status === "not_started").length,
    },
    athletes,
  };
}

export async function weekForCoach(coachId: number, anyDateInWeek: string, teamId: number | null | undefined): Promise<AttendanceWeek | null> {
  const roster = await activeRoster(coachId, teamId);
  if (!roster) return null;
  const start = mondayOf(anyDateInWeek);
  const dates = weekDates(start);
  const end = dates[dates.length - 1];
  const programCoachId = await storage.getPrimaryCoachId(coachId);
  // A parked athlete is off the active roster; their marks from this week are kept and shown.
  const scope = new Set(await storage.athleteIdsInCoachScope(coachId));
  const withHeld = await storage.getRosterForCoachIncludingHeld(coachId);
  const activeIds = new Set(roster.athletes.map((a) => a.id));
  const teamMembers = teamId != null ? new Set(roster.teams.find((t) => t.id === teamId)?.memberIds ?? []) : null;
  const heldCandidates = new Map<number, RosterAthlete>();
  withHeld
    .filter((a) => !activeIds.has(a.id) && scope.has(a.id) && (teamMembers === null || teamMembers.has(a.id)))
    .forEach((a) => heldCandidates.set(a.id, { id: a.id, name: a.name }));
  const heldMarks = await marksInRange(programCoachId, [...heldCandidates.keys()], start, end);
  const heldWithMarks = [...heldCandidates.values()].filter((a) => dates.some((d) => heldMarks.has(`${a.id}:${d}`)));
  const everyone = [...roster.athletes, ...heldWithMarks];
  const ids = everyone.map((a) => a.id);
  const [{ sessions, warmups }, marks] = await Promise.all([
    sessionsInRange(coachId, start, end, ids),
    marksInRange(programCoachId, ids, start, end),
  ]);
  const warmupOf = (athleteId: number) => sumWarmupCompletions(dates.map((d) => warmups.get(`${athleteId}:${d}`) ?? { withWarmup: 0, done: 0 }));
  const team = sumWarmupCompletions(everyone.map((a) => warmupOf(a.id)));
  return {
    start,
    dates,
    warmupTeam: { ...team, ratePercent: warmupRatePercent(team) },
    athletes: everyone.map((a) => ({
      athleteId: a.id,
      name: a.name,
      held: !activeIds.has(a.id),
      warmup: warmupOf(a.id),
      days: dates.map((date) => {
        const list = sessions.get(`${a.id}:${date}`) ?? [];
        return {
          date,
          attendance: marks.get(`${a.id}:${date}`) ?? null,
          assigned: list.length,
          completed: list.filter((s) => s.status === "completed").length,
        };
      }),
    })),
  };
}

/** Writes or clears one mark. Returns an error sentence and status, or null on success. */
export async function markAttendance(
  coachId: number,
  input: z.infer<typeof markAttendanceSchema>,
): Promise<{ status: number; message: string } | null> {
  if (input.athleteId === coachId || !(await storage.athleteIsInCoachScope(coachId, input.athleteId))) {
    return { status: HTTP.notFound, message: "Athlete not found." };
  }
  const active = await storage.getRosterForCoach(coachId);
  const athlete = active.find((a) => a.id === input.athleteId);
  if (!athlete) {
    const withHeld = await storage.getRosterForCoachIncludingHeld(coachId);
    const held = withHeld.find((a) => a.id === input.athleteId);
    if (held) {
      return {
        status: HTTP.conflict,
        message: `${held.name} is on hold for the off season. Lift the hold on their profile to mark attendance; their earlier marks are kept.`,
      };
    }
    return { status: HTTP.notFound, message: "Athlete not found." };
  }
  const programCoachId = await storage.getPrimaryCoachId(coachId);
  const where = and(
    eq(attendanceRecords.programCoachId, programCoachId),
    eq(attendanceRecords.athleteId, input.athleteId),
    eq(attendanceRecords.date, input.date),
  );
  if (input.status === null) {
    await db.delete(attendanceRecords).where(where);
    return null;
  }
  await db
    .insert(attendanceRecords)
    .values({
      programCoachId,
      athleteId: input.athleteId,
      date: input.date,
      status: input.status,
      teamId: input.teamId ?? null,
      markedByCoachId: coachId,
    })
    .onConflictDoUpdate({
      target: [attendanceRecords.programCoachId, attendanceRecords.athleteId, attendanceRecords.date],
      set: { status: input.status, teamId: input.teamId ?? null, markedByCoachId: coachId, updatedAt: new Date() },
    });
  return null;
}

/** "Mark all present": every athlete on the (team-narrowed) active list with NO mark yet. An
 * absent or excused mark already made is never overwritten by the bulk button. */
export async function markAllPresent(coachId: number, date: string, teamId: number | null | undefined): Promise<number | null> {
  const roster = await activeRoster(coachId, teamId);
  if (!roster) return null;
  const ids = roster.athletes.map((a) => a.id);
  if (ids.length === 0) return 0;
  const programCoachId = await storage.getPrimaryCoachId(coachId);
  const rows = await db
    .insert(attendanceRecords)
    .values(
      ids.map((athleteId) => ({
        programCoachId,
        athleteId,
        date,
        status: "present",
        teamId: teamId ?? null,
        markedByCoachId: coachId,
      })),
    )
    .onConflictDoNothing({ target: [attendanceRecords.programCoachId, attendanceRecords.athleteId, attendanceRecords.date] })
    .returning({ id: attendanceRecords.id });
  return rows.length;
}

const teamQuery = z.object({
  date: isoDate.optional(),
  teamId: z.coerce.number().int().positive().optional(),
});

export function registerAttendanceRoutes(app: Express): void {
  app.get("/api/coach/attendance/today", requireRole("coach"), async (req, res) => {
    const parsed = teamQuery.safeParse(req.query);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    const today = await todayForCoach(currentUser(req).id, parsed.data.date ?? todayIso(), parsed.data.teamId);
    if (!today) return res.status(HTTP.notFound).json({ message: "Team not found." });
    res.json(today);
  });

  app.get("/api/coach/attendance/week", requireRole("coach"), async (req, res) => {
    const parsed = teamQuery.safeParse(req.query);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    const week = await weekForCoach(currentUser(req).id, parsed.data.date ?? todayIso(), parsed.data.teamId);
    if (!week) return res.status(HTTP.notFound).json({ message: "Team not found." });
    res.json(week);
  });

  app.put("/api/coach/attendance", requireRole("coach"), async (req, res) => {
    const parsed = markAttendanceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    const refusal = await markAttendance(currentUser(req).id, parsed.data);
    if (refusal) return res.status(refusal.status).json({ message: refusal.message });
    res.json({ ok: true });
  });

  app.post("/api/coach/attendance/mark-all-present", requireRole("coach"), async (req, res) => {
    const parsed = markAllPresentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    const marked = await markAllPresent(currentUser(req).id, parsed.data.date, parsed.data.teamId);
    if (marked === null) return res.status(HTTP.notFound).json({ message: "Team not found." });
    res.json({ marked });
  });
}
