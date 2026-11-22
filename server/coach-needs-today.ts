/* "NEEDS YOU TODAY", THE SERVER HALF (2026-11-22). The rules and the sentences are in
 * shared/coach-needs-today.ts; this file only counts.
 *
 * Scope is the coach's ordinary scope and nothing new: the roster comes from
 * storage.getRosterForCoach (already narrowed to a staff coach's teams, already without parked
 * athletes), the teams from storage.getTeamsForCoach (narrowed the same way), and the messages
 * from the coach's own threads, which are one coach and one athlete by construction. */
import type { Express, Request } from "express";
import { z } from "zod";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "./db";
import { requireRole } from "./auth";
import { storage } from "./storage";
import { documentGate } from "./weight-room";
import { unreadForCoach } from "./coach-messages";
import { assignments, programs, weightRoomSheetPrints, weightRoomSheetUploads } from "@shared/schema";
import { isIsoDate, mondayOf, weekDates } from "@shared/attendance";
import { shiftIsoDate } from "@shared/athlete-day";
import { isReturnToTrainingProgram } from "@shared/season-plan";
import type { NeedsYouToday } from "@shared/coach-needs-today";

const BAD_REQUEST = 400;
const ISO_DATE_LENGTH = 10;
/** A printed sheet stays "waiting" for a week after the day it was printed for. */
const SHEET_LOOKBACK_DAYS = 6;
const LAST_DAY_OF_WEEK = 6;

type Me = { id: number };
const currentUser = (req: Request) => req.user as Me;
const todayIso = () => new Date().toISOString().slice(0, ISO_DATE_LENGTH);

async function sheetsWaiting(teamIds: number[], date: string): Promise<NeedsYouToday["sheetsWaiting"]> {
  if (teamIds.length === 0) return { count: 0, teamIds: [] };
  const since = shiftIsoDate(date, -SHEET_LOOKBACK_DAYS);
  const inWindow = (col: typeof weightRoomSheetPrints.date | typeof weightRoomSheetUploads.date) => and(gte(col, since), lte(col, date));
  const [prints, uploads] = await Promise.all([
    db
      .selectDistinct({ teamId: weightRoomSheetPrints.teamId, date: weightRoomSheetPrints.date, programDayId: weightRoomSheetPrints.programDayId })
      .from(weightRoomSheetPrints)
      .where(and(inArray(weightRoomSheetPrints.teamId, teamIds), inWindow(weightRoomSheetPrints.date))),
    db
      .select({ teamId: weightRoomSheetUploads.teamId, date: weightRoomSheetUploads.date, programDayId: weightRoomSheetUploads.programDayId })
      .from(weightRoomSheetUploads)
      .where(and(inArray(weightRoomSheetUploads.teamId, teamIds), inWindow(weightRoomSheetUploads.date))),
  ]);
  // An upload with no program day logged the team's day as a whole, so it settles every print of it.
  const logged = new Set(uploads.map((u) => `${u.teamId}:${u.date}:${u.programDayId ?? "any"}`));
  const waiting = prints.filter(
    (p) => !logged.has(`${p.teamId}:${p.date}:${p.programDayId}`) && !logged.has(`${p.teamId}:${p.date}:any`),
  );
  return { count: waiting.length, teamIds: Array.from(new Set(waiting.map((p) => p.teamId))) };
}

async function missingDocuments(athleteIds: number[]): Promise<NeedsYouToday["missingDocuments"]> {
  const gates = await Promise.all(athleteIds.map((id) => documentGate(id)));
  const missing = athleteIds.filter((_, i) => gates[i].missing.length > 0);
  return { count: missing.length, athleteIds: missing };
}

async function returningFromInjury(
  coachId: number,
  roster: Array<{ id: number; name: string }>,
  date: string,
): Promise<NeedsYouToday["returningFromInjury"]> {
  if (roster.length === 0) return { count: 0, athletes: [] };
  const monday = mondayOf(date);
  const sunday = weekDates(monday)[LAST_DAY_OF_WEEK];
  const staff = await storage.getEffectiveCoachIds(coachId);
  const rows = await db
    .select({ athleteId: assignments.athleteId, startDate: assignments.startDate, purposes: programs.purposes })
    .from(assignments)
    .innerJoin(programs, eq(programs.id, assignments.programId))
    .where(
      and(
        inArray(assignments.athleteId, roster.map((a) => a.id)),
        inArray(assignments.coachId, staff),
        gte(assignments.startDate, monday),
        lte(assignments.startDate, sunday),
      ),
    );
  const names = new Map(roster.map((a) => [a.id, a.name]));
  const firstStart = rows
    .filter((r) => isReturnToTrainingProgram(r))
    .reduce((acc, r) => {
      const prior = acc.get(r.athleteId);
      return prior && prior <= r.startDate ? acc : acc.set(r.athleteId, r.startDate);
    }, new Map<number, string>());
  const athletes = Array.from(firstStart.entries())
    .map(([athleteId, startDate]) => ({ athleteId, name: names.get(athleteId) ?? "Athlete", startDate }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name));
  return { count: athletes.length, athletes };
}

/** The four counts for one coach on one date. */
export async function needsYouToday(coachId: number, date: string): Promise<NeedsYouToday> {
  const [rosterRows, teams, unread] = await Promise.all([
    storage.getRosterForCoach(coachId),
    storage.getTeamsForCoach(coachId),
    unreadForCoach(coachId),
  ]);
  const roster = Array.from(new Map(rosterRows.filter((a) => a.id !== coachId).map((a) => [a.id, { id: a.id, name: a.name }])).values());
  const [sheets, documents, injury] = await Promise.all([
    sheetsWaiting(teams.map((t) => t.id), date),
    missingDocuments(roster.map((a) => a.id)),
    returningFromInjury(coachId, roster, date),
  ]);
  const unreadIds = Array.from(unread.keys());
  return {
    date,
    sheetsWaiting: sheets,
    unreadMessages: { count: Array.from(unread.values()).reduce((a, b) => a + b, 0), athleteIds: unreadIds },
    missingDocuments: documents,
    returningFromInjury: injury,
  };
}

const query = z.object({ date: z.string().refine(isIsoDate, { message: "Send a date as YYYY-MM-DD." }).optional() });

export function registerCoachNeedsTodayRoutes(app: Express): void {
  app.get("/api/coach/needs-you-today", requireRole("coach"), async (req, res) => {
    const parsed = query.safeParse(req.query);
    if (!parsed.success) return res.status(BAD_REQUEST).json({ message: parsed.error.issues[0]?.message });
    res.json(await needsYouToday(currentUser(req).id, parsed.data.date ?? todayIso()));
  });
}
