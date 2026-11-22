/* CALENDAR EVENTS AND CALENDAR SYNC, the server half (2026-11-22). The vocabulary is in
 * shared/calendar-events.ts; the reader for a pasted calendar is server/ics-parse.ts and the safe
 * fetch is server/calendar-fetch.ts.
 *
 * Who may add an event:
 *   - anybody with a calendar (an athlete, coached or a Free Agent, a coach, an admin) for
 *     THEMSELVES; a personal event is only ever on its creator's calendar;
 *   - a coach for a team they can see (storage.getTeamsForCoach, which is already narrowed for a
 *     staff coach assigned to teams, so a narrowed coach can only target their own teams). A team
 *     event shows on every athlete who is a member of that team, a held athlete included (a hold
 *     keeps the team membership), and on the coaches who can see the team.
 *   - never a guardian (a guardian has no calendar of their own).
 * Who may change or delete one: its creator, or for a team event the team's primary coach.
 *
 * An event is never training: nothing here writes an assignment, a completion or attendance, and
 * nothing that counts workouts reads these tables.
 *
 * A pasted calendar: the address is fetched under calendar-fetch.ts's rules, stored ENCRYPTED and
 * never returned (the screen shows the host only), refreshed every few hours by
 * calendar-import-job.ts and on demand, and shown read-only. A coach may share one to a team.
 * Imported events never leave Forge again: the outbound feed reads Forge events only. */
import type { Express, Request } from "express";
import { z } from "zod";
import { and, eq, gte, inArray, lte, or } from "drizzle-orm";
import { db } from "./db";
import { requireAuth } from "./auth";
import { storage } from "./storage";
import { calendarEvents, calendarImportEvents, calendarImports, teamMembers, teams } from "@shared/schema";
import {
  CALENDAR_EVENT_COLOR_IDS,
  CALENDAR_EVENT_LABEL_IDS,
  DEFAULT_IMPORT_COLOR,
  EVENT_CUSTOM_LABEL_MAX,
  EVENT_LOCATION_MAX,
  EVENT_NOTE_MAX,
  EVENT_TITLE_MAX,
  IMPORT_NAME_MAX,
  IMPORT_URL_MAX,
  ISO_DATE_RE,
  MAX_IMPORTS_PER_USER,
  TIME_OF_DAY_RE,
  type CalendarEventItem,
} from "@shared/calendar-events";
import { decryptField, encryptField } from "./field-encryption";
import { CalendarFetchError, fetchCalendarText, normalizeCalendarUrl, type CalendarFetchDeps } from "./calendar-fetch";
import { IcsParseError, parseIcsCalendar } from "./ics-parse";
import type { IcsEvent } from "./ics";

type Role = "coach" | "athlete" | "admin" | "guardian";
type Reader = { id: number; role: Role };

function currentUser(req: Request) {
  return req.user as { id: number; role: Role; name: string; email: string };
}

const CREATED = 201;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const TOO_MANY = 429;
const HTTP = { created: CREATED, noContent: NO_CONTENT, badRequest: BAD_REQUEST, forbidden: FORBIDDEN, notFound: NOT_FOUND, tooMany: TOO_MANY } as const;
const DAY_MS = 86_400_000;
const ISO_DATE_LENGTH = 10;
/** How far back and ahead an imported calendar is read. */
export const IMPORT_WINDOW_PAST_DAYS = 30;
export const IMPORT_WINDOW_FUTURE_DAYS = 365;
/** Events kept from one imported calendar; past this the read says it stopped. */
export const IMPORT_MAX_EVENTS = 3000;
/** "Refresh now" more often than this answers with a sentence instead of another fetch. */
const MANUAL_REFRESH_MIN_MS = 60_000;
/** Inserts per statement when an imported calendar is replaced. */
const INSERT_CHUNK = 500;
/** The widest range one read of the calendar may ask for (a month view is six weeks). */
const MAX_RANGE_DAYS = 400;

const isoAddDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, ISO_DATE_LENGTH);
const todayIso = () => new Date().toISOString().slice(0, ISO_DATE_LENGTH);

/* Test seam: the itest swaps in a fake resolver and transport, so no test touches the network. */
let fetchDeps: CalendarFetchDeps = {};
export function setCalendarFetchDepsForTest(deps: CalendarFetchDeps): void {
  fetchDeps = deps;
}

const isoDate = z.string().regex(ISO_DATE_RE, "Pick a date.");
const timeOfDay = z
  .string()
  .regex(TIME_OF_DAY_RE, "Times look like 15:30.")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

export const eventInputSchema = z
  .object({
    title: z.string().trim().min(1, "Give the event a title.").max(EVENT_TITLE_MAX),
    label: z.enum(CALENDAR_EVENT_LABEL_IDS),
    customLabel: z.string().trim().max(EVENT_CUSTOM_LABEL_MAX).nullable().optional(),
    color: z.enum(CALENDAR_EVENT_COLOR_IDS),
    date: isoDate,
    startTime: timeOfDay,
    endTime: timeOfDay,
    location: z.string().trim().max(EVENT_LOCATION_MAX).nullable().optional(),
    note: z.string().trim().max(EVENT_NOTE_MAX).nullable().optional(),
    teamId: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => !v.endTime || !!v.startTime, { message: "Add a start time before an end time.", path: ["endTime"] })
  .refine((v) => !v.endTime || !v.startTime || v.endTime > v.startTime, { message: "The end time has to be after the start time.", path: ["endTime"] });
type EventInput = z.infer<typeof eventInputSchema>;

const importInputSchema = z.object({
  url: z.string().trim().min(1, "Paste the calendar's address.").max(IMPORT_URL_MAX),
  name: z.string().trim().max(IMPORT_NAME_MAX).nullable().optional(),
  color: z.enum(CALENDAR_EVENT_COLOR_IDS).optional(),
  teamId: z.number().int().positive().nullable().optional(),
});
const importPatchSchema = z.object({
  name: z.string().trim().min(1).max(IMPORT_NAME_MAX).optional(),
  color: z.enum(CALENDAR_EVENT_COLOR_IDS).optional(),
  teamId: z.number().int().positive().nullable().optional(),
});

const rangeSchema = z.object({ start: isoDate, end: isoDate }).refine((r) => r.start <= r.end && Date.parse(r.end) - Date.parse(r.start) <= MAX_RANGE_DAYS * DAY_MS, {
  message: "That date range is too wide.",
});

/** The teams whose events reach this reader: an athlete's memberships, a coach's visible teams. */
async function readerTeamIds(reader: Reader): Promise<number[]> {
  if (reader.role === "coach") return (await storage.getTeamsForCoach(reader.id)).map((t) => t.id);
  if (reader.role === "athlete") {
    const rows = await db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.athleteId, reader.id));
    return rows.map((r) => r.teamId);
  }
  return [];
}

/** The teams a coach may put an event on or share a calendar to. Only coaches have any. */
export async function targetableTeams(reader: Reader): Promise<{ id: number; name: string }[]> {
  if (reader.role !== "coach") return [];
  return (await storage.getTeamsForCoach(reader.id)).map((t) => ({ id: t.id, name: t.name }));
}

/** May this reader change or delete this event: its creator, or the team's primary coach. */
async function mayEditCalendarEvent(reader: Reader, ev: { createdBy: number; teamId: number | null }): Promise<boolean> {
  if (ev.createdBy === reader.id) return true;
  if (ev.teamId === null || reader.role !== "coach") return false;
  const [team] = await db.select({ coachId: teams.coachId }).from(teams).where(eq(teams.id, ev.teamId));
  if (!team) return false;
  return (await storage.getPrimaryCoachId(team.coachId)) === reader.id;
}

/** Forge events this reader sees in a range: their own, and their teams'. */
async function forgeEventRows(reader: Reader, start: string, end: string) {
  const teamIds = await readerTeamIds(reader);
  // Everything they created (a personal event, or a team event they put up) and their teams'.
  const whose = teamIds.length > 0 ? or(eq(calendarEvents.createdBy, reader.id), inArray(calendarEvents.teamId, teamIds)) : eq(calendarEvents.createdBy, reader.id);
  return db
    .select({ event: calendarEvents, teamName: teams.name })
    .from(calendarEvents)
    .leftJoin(teams, eq(calendarEvents.teamId, teams.id))
    .where(and(whose, gte(calendarEvents.date, start), lte(calendarEvents.date, end)))
    .orderBy(calendarEvents.date, calendarEvents.startTime);
}

async function teamPrimaries(teamIds: number[]): Promise<Map<number, number>> {
  if (teamIds.length === 0) return new Map();
  const rows = await db.select({ id: teams.id, coachId: teams.coachId }).from(teams).where(inArray(teams.id, teamIds));
  const pairs = await Promise.all(rows.map(async (r) => [r.id, await storage.getPrimaryCoachId(r.coachId)] as const));
  return new Map(pairs);
}

export async function calendarEventsFor(reader: Reader, start: string, end: string): Promise<CalendarEventItem[]> {
  const rows = await forgeEventRows(reader, start, end);
  const primaries = reader.role === "coach" ? await teamPrimaries(Array.from(new Set(rows.map((r) => r.event.teamId).filter((t): t is number => t !== null)))) : new Map<number, number>();
  const forge: CalendarEventItem[] = rows.map(({ event: e, teamName }) => ({
    key: `forge-${e.id}`,
    source: "forge",
    id: e.id,
    title: e.title,
    label: e.label,
    customLabel: e.customLabel,
    color: e.color,
    date: e.date,
    startTime: e.startTime,
    endTime: e.endTime,
    startsAt: null,
    endsAt: null,
    allDay: !e.startTime,
    location: e.location,
    note: e.note,
    teamId: e.teamId,
    teamName: teamName ?? null,
    calendarName: null,
    canEdit: e.createdBy === reader.id || (e.teamId !== null && primaries.get(e.teamId) === reader.id),
  }));

  const teamIds = await readerTeamIds(reader);
  const imports = await db
    .select()
    .from(calendarImports)
    .where(teamIds.length > 0 ? or(eq(calendarImports.ownerId, reader.id), inArray(calendarImports.teamId, teamIds)) : eq(calendarImports.ownerId, reader.id));
  if (imports.length === 0) return forge;
  const byId = new Map(imports.map((i) => [i.id, i]));
  // An instant's UTC date can be a day either side of the reader's own; the client draws the day.
  const rowsImported = await db
    .select()
    .from(calendarImportEvents)
    .where(and(inArray(calendarImportEvents.importId, imports.map((i) => i.id)), gte(calendarImportEvents.date, isoAddDays(start, -1)), lte(calendarImportEvents.date, isoAddDays(end, 1))))
    .orderBy(calendarImportEvents.date);
  const imported: CalendarEventItem[] = rowsImported.map((r) => {
    const cal = byId.get(r.importId)!;
    return {
      key: `import-${r.importId}-${r.id}`,
      source: "imported",
      id: r.id,
      title: r.title,
      label: "other",
      customLabel: null,
      color: cal.color,
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
      startsAt: r.startsAt ? r.startsAt.toISOString() : null,
      endsAt: r.endsAt ? r.endsAt.toISOString() : null,
      allDay: r.allDay,
      location: r.location,
      note: r.note,
      teamId: cal.teamId,
      teamName: null,
      calendarName: cal.name,
      canEdit: false,
    };
  });
  return [...forge, ...imported];
}

/** The Forge events for the outbound subscribe feed. Imported events are never re-exported. */
export async function forgeEventsForFeed(
  reader: Reader,
  start: string,
  end: string,
  options: { includePersonal: boolean } = { includePersonal: true },
): Promise<IcsEvent[]> {
  const rows = await forgeEventRows(reader, start, end);
  // A coached athlete's coach holds a copy of this feed's link (the roster's "export this athlete's
  // calendar"), so the athlete's own personal events stay out of it: team events and training only.
  const kept = options.includePersonal ? rows : rows.filter(({ event: e }) => e.teamId != null);
  return kept.map(({ event: e, teamName }) => ({
    uid: `forge-event${e.id}`,
    date: e.date,
    summary: e.title,
    description: [teamName, e.note].filter(Boolean).join("\n") || undefined,
    location: e.location ?? undefined,
    startTime: e.startTime,
    endTime: e.endTime,
  }));
}

function eventValues(input: EventInput) {
  return {
    title: input.title,
    label: input.label,
    customLabel: input.customLabel || null,
    color: input.color,
    date: input.date,
    startTime: input.startTime || null,
    endTime: input.startTime ? input.endTime || null : null,
    location: input.location || null,
    note: input.note || null,
    teamId: input.teamId ?? null,
  };
}

/** A team a coach may target, or a sentence why not. Null team (a personal event) is always fine. */
async function checkTeam(reader: Reader, teamId: number | null | undefined): Promise<string | null> {
  if (teamId == null) return null;
  if (reader.role !== "coach") return "Only a coach can put an event on a team.";
  const allowed = (await targetableTeams(reader)).map((t) => t.id);
  return allowed.includes(teamId) ? null : "You can only add events to teams you coach.";
}

/* ---------------- Imported calendars ---------------- */

type RefreshResult = { ok: true; eventCount: number; note: string | null } | { ok: false; message: string };

function readNote(skipped: { unsupportedRule: number; truncated: boolean; malformed: number }): string | null {
  const parts: string[] = [];
  if (skipped.unsupportedRule > 0) parts.push(`${skipped.unsupportedRule} repeating event${skipped.unsupportedRule === 1 ? " repeats" : "s repeat"} monthly or yearly and only the first date is shown`);
  if (skipped.malformed > 0) parts.push(`${skipped.malformed} event${skipped.malformed === 1 ? "" : "s"} could not be read`);
  if (skipped.truncated) parts.push(`only the first ${IMPORT_MAX_EVENTS} events are shown`);
  return parts.length > 0 ? `${parts.join("; ")}.` : null;
}

/** Fetches and parses one address. Never throws; a failure is a sentence. */
async function readCalendar(url: string) {
  try {
    const { text } = await fetchCalendarText(url, fetchDeps);
    const today = todayIso();
    const parsed = parseIcsCalendar(text, { start: isoAddDays(today, -IMPORT_WINDOW_PAST_DAYS), end: isoAddDays(today, IMPORT_WINDOW_FUTURE_DAYS), maxEvents: IMPORT_MAX_EVENTS });
    return { ok: true as const, parsed };
  } catch (err) {
    if (err instanceof CalendarFetchError || err instanceof IcsParseError) return { ok: false as const, message: err.message };
    console.error("[calendar-import] read failed:", err instanceof Error ? err.message : err);
    return { ok: false as const, message: "Couldn't read that calendar. Check the address and try again." };
  }
}

async function replaceImportedEvents(importId: number, events: ReturnType<typeof parseIcsCalendar>["events"]) {
  await db.transaction(async (tx) => {
    await tx.delete(calendarImportEvents).where(eq(calendarImportEvents.importId, importId));
    const values = events.map((e) => ({
      importId,
      instanceKey: e.instanceKey,
      title: e.title,
      date: e.date,
      allDay: e.allDay,
      startTime: e.startTime,
      endTime: e.endTime,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      location: e.location,
      note: e.note,
    }));
    const chunks = Array.from({ length: Math.ceil(values.length / INSERT_CHUNK) }, (_v, i) => values.slice(i * INSERT_CHUNK, (i + 1) * INSERT_CHUNK));
    await chunks.reduce<Promise<void>>(async (prev, chunk) => {
      await prev;
      await tx.insert(calendarImportEvents).values(chunk);
    }, Promise.resolve());
  });
}

/** Re-reads one imported calendar. On a failure the events it had are KEPT and the sentence is
 * stored for the screen, so a calendar that is briefly down does not empty somebody's week. */
export async function refreshImport(importId: number): Promise<RefreshResult> {
  const [row] = await db.select().from(calendarImports).where(eq(calendarImports.id, importId));
  if (!row) return { ok: false, message: "Calendar not found." };
  const url = decryptField(row.urlEncrypted);
  if (!url) return { ok: false, message: "Calendar not found." };
  const read = await readCalendar(url);
  if (!read.ok) {
    await db.update(calendarImports).set({ lastError: read.message, lastFetchedAt: new Date() }).where(eq(calendarImports.id, importId));
    return { ok: false, message: read.message };
  }
  await replaceImportedEvents(importId, read.parsed.events);
  const note = readNote(read.parsed.skipped);
  await db
    .update(calendarImports)
    .set({ lastError: null, lastNote: note, lastFetchedAt: new Date(), eventCount: read.parsed.events.length })
    .where(eq(calendarImports.id, importId));
  return { ok: true, eventCount: read.parsed.events.length, note };
}

/** Every imported calendar, one after another. For the scheduled job. */
export async function refreshAllImports(): Promise<{ calendars: number; failed: number }> {
  const rows = await db.select({ id: calendarImports.id }).from(calendarImports);
  const results = await rows.reduce<Promise<RefreshResult[]>>(async (prev, r) => [...(await prev), await refreshImport(r.id)], Promise.resolve([]));
  return { calendars: rows.length, failed: results.filter((r) => !r.ok).length };
}

/** What the screen may know about an imported calendar: never the address. */
function publicImport(row: typeof calendarImports.$inferSelect, teamName: string | null) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    host: row.urlHost,
    teamId: row.teamId,
    teamName,
    eventCount: row.eventCount,
    lastFetchedAt: row.lastFetchedAt ? row.lastFetchedAt.toISOString() : null,
    lastError: row.lastError,
    lastNote: row.lastNote,
  };
}

async function getCalendarImportForOwner(reader: Reader, id: number) {
  const [row] = await db.select().from(calendarImports).where(and(eq(calendarImports.id, id), eq(calendarImports.ownerId, reader.id)));
  return row ?? null;
}

export function registerCalendarEventRoutes(app: Express): void {
  /** A guardian has no calendar of their own to add to. */
  const refuseGuardian = (role: Role) => role === "guardian";

  app.get("/api/calendar-events", requireAuth, async (req, res) => {
    const user = currentUser(req);
    if (refuseGuardian(user.role)) return res.json([]);
    const parsed = rangeSchema.safeParse(req.query);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    res.json(await calendarEventsFor(user, parsed.data.start, parsed.data.end));
  });

  app.get("/api/calendar-events/teams", requireAuth, async (req, res) => {
    res.json(await targetableTeams(currentUser(req)));
  });

  app.post("/api/calendar-events", requireAuth, async (req, res) => {
    const user = currentUser(req);
    if (refuseGuardian(user.role)) return res.status(HTTP.forbidden).json({ message: "Events are added from an athlete's or a coach's calendar." });
    const parsed = eventInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    const teamProblem = await checkTeam(user, parsed.data.teamId);
    if (teamProblem) return res.status(HTTP.forbidden).json({ message: teamProblem });
    const [row] = await db.insert(calendarEvents).values({ ...eventValues(parsed.data), createdBy: user.id }).returning();
    res.status(HTTP.created).json(row);
  });

  app.patch("/api/calendar-events/:id", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const [existing] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id));
    if (!existing || !(await mayEditCalendarEvent(user, existing))) return res.status(HTTP.notFound).json({ message: "Event not found" });
    const parsed = eventInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    const nextTeam = parsed.data.teamId === undefined ? existing.teamId : parsed.data.teamId;
    if (nextTeam !== existing.teamId) {
      const teamProblem = await checkTeam(user, nextTeam);
      if (teamProblem) return res.status(HTTP.forbidden).json({ message: teamProblem });
    }
    const [row] = await db
      .update(calendarEvents)
      .set({ ...eventValues({ ...parsed.data, teamId: nextTeam }), updatedAt: new Date() })
      .where(eq(calendarEvents.id, id))
      .returning();
    res.json(row);
  });

  app.delete("/api/calendar-events/:id", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const id = Number(req.params.id);
    const [existing] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id));
    if (!existing || !(await mayEditCalendarEvent(user, existing))) return res.status(HTTP.notFound).json({ message: "Event not found" });
    await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
    res.status(HTTP.noContent).end();
  });

  app.get("/api/calendar-imports", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const rows = await db
      .select({ row: calendarImports, teamName: teams.name })
      .from(calendarImports)
      .leftJoin(teams, eq(calendarImports.teamId, teams.id))
      .where(eq(calendarImports.ownerId, user.id))
      .orderBy(calendarImports.createdAt);
    res.json(rows.map((r) => publicImport(r.row, r.teamName ?? null)));
  });

  app.post("/api/calendar-imports", requireAuth, async (req, res) => {
    const user = currentUser(req);
    if (refuseGuardian(user.role)) return res.status(HTTP.forbidden).json({ message: "Calendars are added from an athlete's or a coach's calendar." });
    const parsed = importInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    const teamProblem = await checkTeam(user, parsed.data.teamId);
    if (teamProblem) return res.status(HTTP.forbidden).json({ message: teamProblem });
    const existing = await db.select({ id: calendarImports.id }).from(calendarImports).where(eq(calendarImports.ownerId, user.id));
    if (existing.length >= MAX_IMPORTS_PER_USER) {
      return res.status(HTTP.badRequest).json({ message: `You can show up to ${MAX_IMPORTS_PER_USER} calendars. Remove one to add another.` });
    }
    let url: URL;
    try {
      url = normalizeCalendarUrl(parsed.data.url);
    } catch (err) {
      return res.status(HTTP.badRequest).json({ message: err instanceof Error ? err.message : "That address can't be added." });
    }
    // Read it BEFORE saving, so a wrong address is a sentence now rather than an empty calendar.
    const read = await readCalendar(url.toString());
    if (!read.ok) return res.status(HTTP.badRequest).json({ message: read.message });
    const name = parsed.data.name?.trim() || read.parsed.calendarName || url.hostname;
    const [row] = await db
      .insert(calendarImports)
      .values({
        ownerId: user.id,
        teamId: parsed.data.teamId ?? null,
        name: name.slice(0, IMPORT_NAME_MAX),
        color: parsed.data.color ?? DEFAULT_IMPORT_COLOR,
        urlEncrypted: encryptField(url.toString()),
        urlHost: url.hostname,
        lastFetchedAt: new Date(),
        eventCount: read.parsed.events.length,
        lastNote: readNote(read.parsed.skipped),
      })
      .returning();
    await replaceImportedEvents(row.id, read.parsed.events);
    res.status(HTTP.created).json(publicImport(row, null));
  });

  app.patch("/api/calendar-imports/:id", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const row = await getCalendarImportForOwner(user, Number(req.params.id));
    if (!row) return res.status(HTTP.notFound).json({ message: "Calendar not found" });
    const parsed = importPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    if (parsed.data.teamId !== undefined && parsed.data.teamId !== row.teamId) {
      const teamProblem = await checkTeam(user, parsed.data.teamId);
      if (teamProblem) return res.status(HTTP.forbidden).json({ message: teamProblem });
    }
    const [updated] = await db
      .update(calendarImports)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
        ...(parsed.data.teamId !== undefined ? { teamId: parsed.data.teamId } : {}),
      })
      .where(eq(calendarImports.id, row.id))
      .returning();
    res.json(publicImport(updated, null));
  });

  app.post("/api/calendar-imports/:id/refresh", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const row = await getCalendarImportForOwner(user, Number(req.params.id));
    if (!row) return res.status(HTTP.notFound).json({ message: "Calendar not found" });
    if (row.lastFetchedAt && Date.now() - row.lastFetchedAt.getTime() < MANUAL_REFRESH_MIN_MS) {
      return res.status(HTTP.tooMany).json({ message: "That calendar was just refreshed. Try again in a minute." });
    }
    const result = await refreshImport(row.id);
    if (!result.ok) return res.status(HTTP.badRequest).json({ message: result.message });
    res.json(result);
  });

  app.delete("/api/calendar-imports/:id", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const row = await getCalendarImportForOwner(user, Number(req.params.id));
    if (!row) return res.status(HTTP.notFound).json({ message: "Calendar not found" });
    await db.delete(calendarImports).where(eq(calendarImports.id, row.id));
    res.status(HTTP.noContent).end();
  });
}
