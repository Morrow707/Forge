/* SEASON SETUP, THE SERVER HALF (2026-11-22). Rules in shared/season-plan.ts.
 *
 * Three routes:
 *   POST /api/season-setup/context   what the step needs to draw: each program's tags and length,
 *                                    each in-scope athlete's profile position and whether they may
 *                                    tick their own clearance (never an age), and the team-gender
 *                                    SUGGESTION (never anybody's own gender).
 *   POST /api/coach/season-assignments   assign one or several programs, each with its own start
 *                                    date, and record the setup on every assignment it made.
 *   POST /api/my/season-assignments  the same for the caller's own calendar (coach, admin, Free Agent).
 *   GET  /api/assignments/:id/restrictions   the clinician's restrictions for the day screens.
 *   GET  /api/season-setup/games     the games already on the caller's calendar (shared/season-games.ts),
 *                                    so the step can offer the first and last game. It reads through
 *                                    calendarEventsFor, the calendar screen's own read, so it sees
 *                                    exactly what the caller's calendar shows and nothing more: a
 *                                    coach's own events and imports, and their teams'. An athlete's
 *                                    personal event is never on a coach's calendar and so never here.
 *
 * What it REUSES rather than re-solves: every assignment is made by storage.createAssignment, the
 * same call the ordinary assign route makes, so the minor-needs-a-guardian check and the parked-seat
 * check run exactly as they always have. Scope is storage.getRosterForCoachIncludingHeld, which is
 * already narrowed to a staff coach's teams (a narrowed coach cannot reach past them here either).
 *
 * The ONE requirement: a program tagged return_to_training needs the clinician clearance ticked,
 * by the coach, or by an adult for themselves. Everything else is a suggestion and blocks nothing.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { requireAuth, requireRole } from "./auth";
import { storage } from "./storage";
import { assignmentSeasonSetups, programWeeks, teamMembers, users } from "@shared/schema";
import { calendarEventsFor } from "./calendar-events";
import { GAME_LOOKAHEAD_DAYS, isGameEvent, summarizeSeasonGames } from "@shared/season-games";
import { PROGRAM_SEASON_PHASES, normalizePosition } from "@shared/exercise-tags";
import { ageFromDateOfBirth } from "@shared/privacy-tiers";
import {
  ADULT_AGE,
  MAX_PROGRAM_REPEATS,
  MAX_RESTRICTIONS_LENGTH,
  RETURN_TO_TRAINING_MINOR_SELF,
  TEAM_GENDERS,
  isIsoDay,
  isReturnToTrainingProgram,
  restrictionsLine,
  suggestTeamGender,
} from "@shared/season-plan";

const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CREATED = 201;
const HTTP = { badRequest: BAD_REQUEST, forbidden: FORBIDDEN, notFound: NOT_FOUND, created: CREATED } as const;
/** The most programs one season plan assigns at once. */
const MAX_PLAN_PROGRAMS = 12;
/** The most programs the context read describes at once (a coach's whole library list). */
const MAX_CONTEXT_PROGRAMS = 300;
/** The most athletes one call names. */
const MAX_ATHLETES = 500;
/** The longest a position may be. */
const MAX_POSITION_LENGTH = 40;

type Me = { id: number; role: "coach" | "athlete" | "admin" | "guardian" };
const currentUser = (req: Request) => req.user as Me;

const isoDay = z.string().refine(isIsoDay, { message: "Send a date as YYYY-MM-DD." });

const gamesQuerySchema = z.object({
  /** The caller's own today, so the window starts on their day rather than the server's. */
  start: isoDay.optional(),
  /** Comma-separated athlete ids (coach mode): only games on those athletes' teams, or on no team. */
  athleteIds: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n > 0)
        .slice(0, MAX_ATHLETES),
    ),
});

/** One game as the step receives it. A timed imported game carries its instant, so the client
 * can put it on the caller's own day rather than the UTC one. */
export type SeasonGameRow = { date: string; startsAt: string | null; allDay: boolean; title: string; source: "forge" | "imported" };

const ISO_DATE_LENGTH = 10;
const MS_PER_DAY = 86_400_000;
const addDaysIso = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, ISO_DATE_LENGTH);

/**
 * The games on the caller's calendar from `start` for a year. For a coach naming athletes, a team
 * event counts only when it is on a team one of those athletes is on; an event on no team (the
 * coach's own, or a calendar they pasted in for themselves) always counts.
 */
export async function seasonGamesFor(user: Me, start: string, athleteIds: readonly number[]): Promise<SeasonGameRow[]> {
  if (user.role === "guardian") return [];
  const events = await calendarEventsFor(user, start, addDaysIso(start, GAME_LOOKAHEAD_DAYS));
  let teamFilter: Set<number> | null = null;
  if (user.role === "coach" && athleteIds.length > 0) {
    const inScope = await coachAssignableIds(user.id);
    const ids = athleteIds.filter((id) => inScope.has(id));
    const rows = ids.length > 0 ? await db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(inArray(teamMembers.athleteId, ids)) : [];
    teamFilter = new Set(rows.map((r) => r.teamId));
  }
  return events
    .filter((e) => e.teamId == null || !teamFilter || teamFilter.has(e.teamId))
    .filter((e) => isGameEvent({ source: e.source, label: e.label, customLabel: e.customLabel, title: e.title }))
    .map((e) => ({ date: e.date, startsAt: e.startsAt, allDay: e.allDay, title: e.title, source: e.source }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const contextSchema = z.object({
  programIds: z.array(z.number().int().positive()).max(MAX_CONTEXT_PROGRAMS).default([]),
  athleteIds: z.array(z.number().int().positive()).max(MAX_ATHLETES).default([]),
});

const clearanceSchema = z.object({
  confirmed: z.literal(true),
  restrictions: z.string().max(MAX_RESTRICTIONS_LENGTH).optional().nullable(),
});

const planProgramSchema = z.object({
  programId: z.number().int().positive(),
  startDate: isoDay,
  durationWeeks: z.number().int().min(1).max(MAX_PROGRAM_REPEATS).default(1),
  dateOverrides: z.record(z.string(), z.string()).optional(),
  seasonPhase: z.enum(PROGRAM_SEASON_PHASES).optional().nullable(),
  clearance: clearanceSchema.optional().nullable(),
});

const setupCommon = {
  programs: z.array(planProgramSchema).min(1).max(MAX_PLAN_PROGRAMS),
  teamGender: z.enum(TEAM_GENDERS).optional().nullable(),
  firstGameDate: isoDay.optional().nullable(),
  lastGameDate: isoDay.optional().nullable(),
};

export const coachSeasonAssignSchema = z.object({
  ...setupCommon,
  athletes: z
    .array(
      z.object({
        athleteId: z.number().int().positive(),
        correctivesEnabled: z.boolean().default(true),
        position: z.string().max(MAX_POSITION_LENGTH).optional().nullable(),
      }),
    )
    .min(1)
    .max(MAX_ATHLETES),
});

export const selfSeasonAssignSchema = z.object({
  ...setupCommon,
  position: z.string().max(MAX_POSITION_LENGTH).optional().nullable(),
  correctivesEnabled: z.boolean().default(true),
});

type ProgramTags = {
  id: number;
  name: string;
  sport: string | null;
  seasonPhase: string | null;
  positions: string[];
  purposes: string[];
  weekCount: number;
  returnToTraining: boolean;
};

async function weekCounts(programIds: readonly number[]): Promise<Map<number, number>> {
  if (programIds.length === 0) return new Map();
  const rows = await db
    .select({ programId: programWeeks.programId, weeks: sql<number>`count(*)::int` })
    .from(programWeeks)
    .where(inArray(programWeeks.programId, [...programIds]))
    .groupBy(programWeeks.programId);
  return new Map(rows.map((r) => [r.programId, Number(r.weeks)]));
}

/** The programs the caller may use, with the tags the step reads. Unusable ids are left out. */
async function usablePrograms(viewerId: number, programIds: readonly number[]): Promise<ProgramTags[]> {
  const unique = Array.from(new Set(programIds));
  const found = await Promise.all(unique.map((id) => storage.getProgramIfUsableByCoach(viewerId, id)));
  const programs = found.filter((p): p is NonNullable<typeof p> => !!p);
  const weeks = await weekCounts(programs.map((p) => p.id));
  return programs.map((p) => ({
    id: p.id,
    name: p.name,
    sport: p.sport ?? null,
    seasonPhase: p.seasonPhase ?? null,
    positions: p.positions ?? [],
    purposes: p.purposes ?? [],
    weekCount: Math.max(1, weeks.get(p.id) ?? 1),
    returnToTraining: isReturnToTrainingProgram(p),
  }));
}

type AthleteFacts = { id: number; position: string | null; age: number | null; gender: string | null };

async function athleteFacts(ids: readonly number[]): Promise<AthleteFacts[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: users.id, position: users.position, dateOfBirth: users.dateOfBirth, gender: users.gender })
    .from(users)
    .where(inArray(users.id, [...ids]));
  return rows.map((r) => ({
    id: r.id,
    position: r.position ?? null,
    age: r.dateOfBirth ? ageFromDateOfBirth(r.dateOfBirth) : null,
    gender: r.gender ?? null,
  }));
}

/** The ids a coach may assign to: their roster (parked seats included, so the hold names itself), narrowed to their teams. */
async function coachAssignableIds(coachId: number): Promise<Set<number>> {
  const roster = await storage.getRosterForCoachIncludingHeld(coachId);
  return new Set(roster.map((a) => a.id));
}

function refuse(res: Response, status: number, message: string) {
  res.status(status).json({ message });
}

/** The programs in a plan that need a clearance and have none, by name. */
function missingClearance(plan: z.infer<typeof planProgramSchema>[], programs: Map<number, ProgramTags>): string[] {
  return plan
    .filter((p) => programs.get(p.programId)?.returnToTraining && !p.clearance?.confirmed)
    .map((p) => programs.get(p.programId)?.name ?? "A program");
}

type SetupFor = {
  position: string | null;
  teamGender: string | null;
  seasonPhase: string | null;
  firstGameDate: string | null;
  lastGameDate: string | null;
  clearance: { byId: number; restrictions: string | null } | null;
};

async function recordSetups(rows: { assignmentId: number; setup: SetupFor }[]) {
  if (rows.length === 0) return;
  const now = new Date();
  await db
    .insert(assignmentSeasonSetups)
    .values(
      rows.map(({ assignmentId, setup }) => ({
        assignmentId,
        position: setup.position,
        teamGender: setup.teamGender,
        seasonPhase: setup.seasonPhase,
        firstGameDate: setup.firstGameDate,
        lastGameDate: setup.lastGameDate,
        clearanceConfirmedById: setup.clearance?.byId ?? null,
        clearanceConfirmedAt: setup.clearance ? now : null,
        clearanceRestrictions: setup.clearance?.restrictions?.trim() || null,
      })),
    )
    .onConflictDoNothing();
}

const cleanPosition = (p: string | null | undefined) => {
  const v = p ? normalizePosition(p) : "";
  return v.length > 0 ? v : null;
};

/** The clinician restrictions on one assignment, if the viewer may see that assignment. */
export async function restrictionsForAssignment(viewer: Me, assignmentId: number): Promise<string | null | undefined> {
  const full = await storage.getAssignmentFull(assignmentId);
  if (!full) return undefined;
  const own = full.assignment.athleteId === viewer.id;
  const asCoach = !own && viewer.role === "coach" && !!(await storage.getAssignmentForCoach(viewer.id, assignmentId));
  if (!own && !asCoach) return undefined;
  const [row] = await db
    .select({ restrictions: assignmentSeasonSetups.clearanceRestrictions })
    .from(assignmentSeasonSetups)
    .where(eq(assignmentSeasonSetups.assignmentId, assignmentId));
  return row?.restrictions ?? null;
}

async function viewerIsFreeAgentOrStaff(user: Me): Promise<boolean> {
  if (user.role === "coach" || user.role === "admin") return true;
  if (user.role !== "athlete") return false;
  const coaches = await storage.getCoachesForAthlete(user.id);
  return coaches.length === 0;
}

export function registerSeasonSetupRoutes(app: Express) {
  app.post("/api/season-setup/context", requireAuth, async (req, res) => {
    const user = currentUser(req);
    if (!(await viewerIsFreeAgentOrStaff(user))) return refuse(res, HTTP.forbidden, "Your coach sets up your programs.");
    const parsed = contextSchema.safeParse(req.body);
    if (!parsed.success) return refuse(res, HTTP.badRequest, parsed.error.issues[0]?.message ?? "Bad request");
    const programs = await usablePrograms(user.id, parsed.data.programIds);

    // A coach describes their own in-scope athletes; everybody else describes themselves.
    const inScope = user.role === "coach" ? await coachAssignableIds(user.id) : new Set<number>();
    const ids = user.role === "coach" ? parsed.data.athleteIds.filter((id) => inScope.has(id)) : [user.id];
    const facts = await athleteFacts(ids);
    res.json({
      programs,
      athletes: facts.map((f) => ({
        id: f.id,
        position: f.position,
        // Only "may tick their own clearance", never the age itself.
        adult: f.age != null && f.age >= ADULT_AGE,
      })),
      suggestedTeamGender: user.role === "coach" ? suggestTeamGender(facts.map((f) => f.gender)) : null,
    });
  });

  app.post("/api/coach/season-assignments", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const parsed = coachSeasonAssignSchema.safeParse(req.body);
    if (!parsed.success) return refuse(res, HTTP.badRequest, parsed.error.issues[0]?.message ?? "Bad request");
    const body = parsed.data;
    const programs = new Map((await usablePrograms(user.id, body.programs.map((p) => p.programId))).map((p) => [p.id, p]));
    if (body.programs.some((p) => !programs.has(p.programId))) return refuse(res, HTTP.notFound, "Program not found");
    const allowed = await coachAssignableIds(user.id);
    if (body.athletes.some((a) => !allowed.has(a.athleteId))) return refuse(res, HTTP.badRequest, "Athlete not on your roster");
    const missing = missingClearance(body.programs, programs);
    if (missing.length > 0) {
      return refuse(res, HTTP.badRequest, `${missing.join(", ")}: a return-to-training program needs the clinician clearance ticked.`);
    }

    const athletes = body.athletes.map((a) => ({ athleteId: a.athleteId, correctivesEnabled: a.correctivesEnabled }));
    const positionOf = new Map(body.athletes.map((a) => [a.athleteId, cleanPosition(a.position)]));
    const created: { id: number; athleteId: number; programId: number; correctivesEnabled: boolean }[] = [];
    const setups: { assignmentId: number; setup: SetupFor }[] = [];
    // Sequential on purpose: createAssignment checks every athlete before inserting, so a refused
    // athlete stops the plan at the first program rather than half-assigning a later one.
    await body.programs.reduce(async (prev, p) => {
      await prev;
      const result = await storage.createAssignment(user.id, p.programId, athletes, p.startDate, p.dateOverrides, p.durationWeeks);
      result.created.forEach((row) => {
        created.push({ id: row.id, athleteId: row.athleteId, programId: row.programId, correctivesEnabled: row.correctivesEnabled });
        setups.push({
          assignmentId: row.id,
          setup: {
            position: positionOf.get(row.athleteId) ?? null,
            teamGender: body.teamGender ?? null,
            seasonPhase: p.seasonPhase ?? null,
            firstGameDate: body.firstGameDate ?? null,
            lastGameDate: body.lastGameDate ?? null,
            clearance: p.clearance?.confirmed ? { byId: user.id, restrictions: p.clearance.restrictions ?? null } : null,
          },
        });
      });
    }, Promise.resolve());
    await recordSetups(setups);
    res.status(HTTP.created).json({ created });
  });

  app.post("/api/my/season-assignments", requireAuth, async (req, res) => {
    const user = currentUser(req);
    if (!(await viewerIsFreeAgentOrStaff(user))) return refuse(res, HTTP.forbidden, "Your coach sets up your programs.");
    const parsed = selfSeasonAssignSchema.safeParse(req.body);
    if (!parsed.success) return refuse(res, HTTP.badRequest, parsed.error.issues[0]?.message ?? "Bad request");
    const body = parsed.data;
    const programs = new Map((await usablePrograms(user.id, body.programs.map((p) => p.programId))).map((p) => [p.id, p]));
    if (body.programs.some((p) => !programs.has(p.programId))) return refuse(res, HTTP.notFound, "Program not found");
    const missing = missingClearance(body.programs, programs);
    if (missing.length > 0) {
      return refuse(res, HTTP.badRequest, `${missing.join(", ")}: a return-to-training program needs the clinician clearance ticked.`);
    }
    const needsAdult = body.programs.some((p) => programs.get(p.programId)?.returnToTraining);
    if (needsAdult && user.role === "athlete") {
      const [me] = await athleteFacts([user.id]);
      if (!me || me.age == null || me.age < ADULT_AGE) return refuse(res, HTTP.forbidden, RETURN_TO_TRAINING_MINOR_SELF);
    }

    const created: { id: number; athleteId: number; programId: number }[] = [];
    const setups: { assignmentId: number; setup: SetupFor }[] = [];
    await body.programs.reduce(async (prev, p) => {
      await prev;
      const result = await storage.createAssignment(
        user.id,
        p.programId,
        [{ athleteId: user.id, correctivesEnabled: body.correctivesEnabled }],
        p.startDate,
        p.dateOverrides,
        p.durationWeeks,
      );
      result.created.forEach((row) => {
        created.push({ id: row.id, athleteId: row.athleteId, programId: row.programId });
        setups.push({
          assignmentId: row.id,
          setup: {
            position: cleanPosition(body.position),
            teamGender: body.teamGender ?? null,
            seasonPhase: p.seasonPhase ?? null,
            firstGameDate: body.firstGameDate ?? null,
            lastGameDate: body.lastGameDate ?? null,
            clearance: p.clearance?.confirmed ? { byId: user.id, restrictions: p.clearance.restrictions ?? null } : null,
          },
        });
      });
    }, Promise.resolve());
    await recordSetups(setups);
    res.status(HTTP.created).json({ created });
  });

  app.get("/api/season-setup/games", requireAuth, async (req, res) => {
    const user = currentUser(req);
    if (!(await viewerIsFreeAgentOrStaff(user))) return refuse(res, HTTP.forbidden, "Your coach sets up your programs.");
    const parsed = gamesQuerySchema.safeParse(req.query);
    if (!parsed.success) return refuse(res, HTTP.badRequest, parsed.error.issues[0]?.message ?? "Bad request");
    const start = parsed.data.start ?? new Date().toISOString().slice(0, ISO_DATE_LENGTH);
    const games = await seasonGamesFor(user, start, parsed.data.athleteIds);
    // The summary on the server's dates; the step recomputes it on the reader's own days.
    const summary = summarizeSeasonGames(games.map((g) => ({ date: g.date, title: g.title })));
    res.json({ games, firstGameDate: summary.firstGameDate, lastGameDate: summary.lastGameDate, count: summary.games.length, laterGames: summary.laterGames });
  });

  app.get("/api/assignments/:id/restrictions", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return refuse(res, HTTP.badRequest, "Bad assignment id");
    const restrictions = await restrictionsForAssignment(currentUser(req), id);
    if (restrictions === undefined) return refuse(res, HTTP.notFound, "Assignment not found");
    res.json({ restrictions, line: restrictionsLine(restrictions) });
  });
}

/**
 * The guard the ordinary assign routes call: a return-to-training program goes through the season
 * setup step, where the clearance is ticked. Returns true when it answered the request.
 */
export async function refusedReturnToTrainingWithoutSetup(viewerId: number, programId: number, res: Response): Promise<boolean> {
  const program = await storage.getProgramIfUsableByCoach(viewerId, programId);
  if (!program || !isReturnToTrainingProgram(program)) return false;
  refuse(
    res,
    HTTP.badRequest,
    "This is a return-to-training program. Add it from the program list's Assign or Add to calendar, where the clinician clearance is ticked.",
  );
  return true;
}
