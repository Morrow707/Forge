/* VELOCITY ZONES, the server half (2026-11-11). The rules are in shared/velocity-zones.ts; this file
 * reads and writes `velocity_zones` and reads camera speeds off logged sets.
 *
 * Who may set a zone:
 *   - a coach, for any athlete in their scope (athleteIsInCoachScope, the same check every
 *     per-athlete coach route makes), or for a whole team they hold;
 *   - a Free Agent, a coach or an admin, for THEMSELVES;
 *   - never a coached athlete for themselves. Their coach makes the call (Scott: coached athletes
 *     are coached by the staff), so a coached athlete reads their zones and cannot write them.
 * Suggestions (shared/velocity-zones.ts weightSuggestion) are offered to a Free Agent only. */
import type { Express, Request } from "express";
import { z } from "zod";
import { and, desc, eq, gte, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "./db";
import { requireAuth, requireRole } from "./auth";
import { storage } from "./storage";
import {
  exercises,
  teamMembers,
  velocityZones,
  workoutLogEntries,
  workoutLogs,
  workoutSetEntries,
} from "@shared/schema";
import {
  MAX_ZONE_MPS,
  VELOCITY_GOALS,
  coachFlag,
  inZonePercent,
  isValidZone,
  type FirstSet,
} from "@shared/velocity-zones";

function currentUser(req: Request) {
  return req.user as { id: number; role: "coach" | "athlete" | "admin" | "guardian"; name: string; email: string };
}

const HTTP = { noContent: 204, badRequest: 400, forbidden: 403, notFound: 404 } as const;
const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
/** Weeks of history on the coach's athlete tab. */
const TREND_WEEKS = 6;
/** Earlier sessions read for a Free Agent's suggestion (the rule uses the newest three). */
const FIRST_SET_SESSIONS = 6;
const NOTE_MAX = 300;
const ISO_DATE_LENGTH = 10;

const goalIds = VELOCITY_GOALS.map((g) => g.id) as [string, ...string[]];
export const zoneInputSchema = z
  .object({
    lowMps: z.coerce.number().min(0).max(MAX_ZONE_MPS),
    highMps: z.coerce.number().min(0).max(MAX_ZONE_MPS),
    goal: z.enum(goalIds).nullable().optional(),
    note: z.string().trim().max(NOTE_MAX).nullable().optional(),
  })
  .refine((v) => isValidZone(v), { message: "The low speed has to be below the high speed." });

const isoDaysAgo = (days: number): string => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, ISO_DATE_LENGTH);

/** Camera speeds on logged sets, newest day first and each day's sets in order. */
async function cameraSpeeds(athleteIds: number[], exerciseIds: number[] | null, sinceIso: string | null) {
  if (athleteIds.length === 0) return [];
  const where = [
    inArray(workoutLogs.athleteId, athleteIds),
    isNotNull(workoutSetEntries.meanVelocityMps),
    ...(exerciseIds ? [inArray(workoutLogEntries.exerciseId, exerciseIds)] : []),
    ...(sinceIso ? [gte(workoutLogs.date, sinceIso)] : []),
  ];
  return db
    .select({
      athleteId: workoutLogs.athleteId,
      exerciseId: workoutLogEntries.exerciseId,
      date: workoutLogs.date,
      setNumber: workoutSetEntries.setNumber,
      weight: workoutSetEntries.weight,
      speed: workoutSetEntries.meanVelocityMps,
    })
    .from(workoutSetEntries)
    .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
    .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
    .where(and(...where))
    .orderBy(desc(workoutLogs.date), workoutSetEntries.setNumber);
}

async function zonesFor(athleteId: number) {
  return db
    .select({
      exerciseId: velocityZones.exerciseId,
      exerciseName: exercises.name,
      lowMps: velocityZones.lowMps,
      highMps: velocityZones.highMps,
      goal: velocityZones.goal,
      note: velocityZones.note,
      setByUserId: velocityZones.setByUserId,
      updatedAt: velocityZones.updatedAt,
    })
    .from(velocityZones)
    .innerJoin(exercises, eq(velocityZones.exerciseId, exercises.id))
    .where(eq(velocityZones.athleteId, athleteId))
    .orderBy(exercises.name);
}

export async function saveZone(athleteId: number, exerciseId: number, setBy: number, input: z.infer<typeof zoneInputSchema>) {
  const values = { lowMps: input.lowMps, highMps: input.highMps, goal: input.goal ?? null, note: input.note || null, setByUserId: setBy, updatedAt: new Date() };
  const [row] = await db
    .insert(velocityZones)
    .values({ athleteId, exerciseId, ...values })
    .onConflictDoUpdate({ target: [velocityZones.athleteId, velocityZones.exerciseId], set: values })
    .returning();
  return row;
}

async function exerciseExists(exerciseId: number) {
  const [row] = await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.id, exerciseId));
  return !!row;
}

/** Lifts a coach can pick a zone for: the ones the camera can film (videoEligible not false). */
async function liftOptions() {
  return db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(and(eq(exercises.isForgeOfficial, true), ne(exercises.videoEligible, false)))
    .orderBy(exercises.name);
}

/** May this person set their OWN zones: anyone but a coached athlete. */
async function setsOwnZones(user: { id: number; role: string }) {
  if (user.role === "coach" || user.role === "admin") return true;
  if (user.role !== "athlete") return false;
  return (await storage.getCoachesForAthlete(user.id)).length === 0;
}

function firstSetsByExercise(rows: Awaited<ReturnType<typeof cameraSpeeds>>, todayIso: string) {
  // Rows are newest day first and in set order within a day, so the first row seen for a lift on a
  // day is that day's first set.
  const firsts = rows
    .filter((r) => r.exerciseId != null && r.speed != null && r.date < todayIso)
    .filter((r, i, all) => all.findIndex((o) => o.exerciseId === r.exerciseId && o.date === r.date) === i);
  return firsts.reduce<Record<number, FirstSet[]>>((out, r) => {
    const list = (out[r.exerciseId as number] ??= []);
    if (list.length < FIRST_SET_SESSIONS) list.push({ date: r.date, load: r.weight, speedMps: r.speed as number });
    return out;
  }, {});
}

const idParam = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export function registerVelocityZoneRoutes(app: Express): void {
  // ---- the signed-in person's own zones (the workout page reads these for every role) ----
  app.get("/api/me/velocity-zones", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const canEdit = await setsOwnZones(user);
    const zones = await zonesFor(user.id);
    const freeAgent = user.role === "athlete" && canEdit;
    const today = typeof req.query.today === "string" && req.query.today.length === ISO_DATE_LENGTH ? req.query.today : isoDaysAgo(0);
    const firstSets = freeAgent && zones.length
      ? firstSetsByExercise(await cameraSpeeds([user.id], zones.map((z) => z.exerciseId), null), today)
      : {};
    res.json({
      canEdit,
      suggestions: freeAgent,
      zones: zones.map((z) => ({ ...z, setBy: z.setByUserId === user.id ? "self" : "coach" })),
      firstSets,
    });
  });

  app.put("/api/me/velocity-zones/:exerciseId", requireAuth, async (req, res) => {
    const user = currentUser(req);
    if (!(await setsOwnZones(user))) return res.status(HTTP.forbidden).json({ message: "Your coach sets your zones." });
    const exerciseId = idParam(req.params.exerciseId);
    const parsed = zoneInputSchema.safeParse(req.body);
    if (!exerciseId || !(await exerciseExists(exerciseId))) return res.status(HTTP.notFound).json({ message: "Exercise not found" });
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    res.json(await saveZone(user.id, exerciseId, user.id, parsed.data));
  });

  app.delete("/api/me/velocity-zones/:exerciseId", requireAuth, async (req, res) => {
    const user = currentUser(req);
    if (!(await setsOwnZones(user))) return res.status(HTTP.forbidden).json({ message: "Your coach sets your zones." });
    const exerciseId = idParam(req.params.exerciseId);
    if (!exerciseId) return res.status(HTTP.notFound).json({ message: "Exercise not found" });
    await db.delete(velocityZones).where(and(eq(velocityZones.athleteId, user.id), eq(velocityZones.exerciseId, exerciseId)));
    res.status(HTTP.noContent).end();
  });

  // ---- a coach, for one athlete: the "Bar Speed" tab ----
  app.get("/api/coach/roster/:athleteId/velocity-zones", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const athleteId = idParam(req.params.athleteId);
    if (!athleteId || !(await storage.athleteIsInCoachScope(user.id, athleteId))) return res.status(HTTP.notFound).json({ message: "Athlete not found" });
    const zones = await zonesFor(athleteId);
    const since = isoDaysAgo(TREND_WEEKS * WEEK_DAYS);
    const speeds = zones.length ? await cameraSpeeds([athleteId], zones.map((z) => z.exerciseId), since) : [];
    const now = Date.now();
    const trend = Object.fromEntries(
      zones.map((z) => {
        const weeks = Array.from({ length: TREND_WEEKS }, (_, i) => {
          const end = now - (TREND_WEEKS - 1 - i) * WEEK_DAYS * DAY_MS;
          const startIso = new Date(end - WEEK_DAYS * DAY_MS).toISOString().slice(0, ISO_DATE_LENGTH);
          const endIso = new Date(end).toISOString().slice(0, ISO_DATE_LENGTH);
          const inWeek = speeds.filter((s) => s.exerciseId === z.exerciseId && s.speed != null && s.date > startIso && s.date <= endIso).map((s) => s.speed as number);
          return { weekEnding: endIso, sets: inWeek.length, inZonePercent: inZonePercent(inWeek, z) };
        });
        return [z.exerciseId, weeks];
      }),
    );
    res.json({ zones, trend, liftOptions: await liftOptions(), goals: VELOCITY_GOALS });
  });

  app.put("/api/coach/roster/:athleteId/velocity-zones/:exerciseId", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const athleteId = idParam(req.params.athleteId);
    const exerciseId = idParam(req.params.exerciseId);
    if (!athleteId || !(await storage.athleteIsInCoachScope(user.id, athleteId))) return res.status(HTTP.notFound).json({ message: "Athlete not found" });
    if (!exerciseId || !(await exerciseExists(exerciseId))) return res.status(HTTP.notFound).json({ message: "Exercise not found" });
    const parsed = zoneInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    res.json(await saveZone(athleteId, exerciseId, user.id, parsed.data));
  });

  app.delete("/api/coach/roster/:athleteId/velocity-zones/:exerciseId", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const athleteId = idParam(req.params.athleteId);
    const exerciseId = idParam(req.params.exerciseId);
    if (!athleteId || !(await storage.athleteIsInCoachScope(user.id, athleteId))) return res.status(HTTP.notFound).json({ message: "Athlete not found" });
    if (!exerciseId) return res.status(HTTP.notFound).json({ message: "Exercise not found" });
    await db.delete(velocityZones).where(and(eq(velocityZones.athleteId, athleteId), eq(velocityZones.exerciseId, exerciseId)));
    res.status(HTTP.noContent).end();
  });

  // ---- a coach, for a whole team: "Apply to <team>" ----
  app.post("/api/coach/teams/:teamId/velocity-zones/:exerciseId", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const teamId = idParam(req.params.teamId);
    const exerciseId = idParam(req.params.exerciseId);
    const teams = await storage.getTeamsForCoach(user.id);
    if (!teamId || !teams.some((t) => t.id === teamId)) return res.status(HTTP.notFound).json({ message: "Team not found" });
    if (!exerciseId || !(await exerciseExists(exerciseId))) return res.status(HTTP.notFound).json({ message: "Exercise not found" });
    const parsed = zoneInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    const members = await db.select({ athleteId: teamMembers.athleteId }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
    const inScope = new Set(await storage.athleteIdsInCoachScope(user.id));
    const targets = members.map((m) => m.athleteId).filter((id) => inScope.has(id));
    await Promise.all(targets.map((athleteId) => saveZone(athleteId, exerciseId, user.id, parsed.data)));
    res.json({ applied: targets.length });
  });

  // ---- the coach's dashboard card: only the athletes worth a look this week ----
  app.get("/api/coach/bar-speed-week", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const roster = await storage.getRosterForCoach(user.id);
    const ids = roster.map((a) => a.id);
    if (ids.length === 0) return res.json({ flagged: [], inZone: 0, withZones: 0 });
    const zones = await db
      .select({ athleteId: velocityZones.athleteId, exerciseId: velocityZones.exerciseId, exerciseName: exercises.name, lowMps: velocityZones.lowMps, highMps: velocityZones.highMps })
      .from(velocityZones)
      .innerJoin(exercises, eq(velocityZones.exerciseId, exercises.id))
      .where(inArray(velocityZones.athleteId, ids));
    const speeds = zones.length ? await cameraSpeeds(ids, Array.from(new Set(zones.map((z) => z.exerciseId))), isoDaysAgo(WEEK_DAYS)) : [];
    const nameById = new Map(roster.map((a) => [a.id, a.name]));
    const read = zones
      .map((z) => {
        const mine = speeds.filter((s) => s.athleteId === z.athleteId && s.exerciseId === z.exerciseId && s.speed != null);
        // Each session's sets in set order: the query is newest day first, set order within a day.
        const days = Array.from(new Set(mine.map((s) => s.date))).map((d) => mine.filter((s) => s.date === d).map((s) => s.speed as number));
        return { z, filmed: mine.length > 0, flag: mine.length ? coachFlag(days, z) : null };
      })
      .filter((r) => r.filmed);
    const flagged = read
      .filter((r) => r.flag)
      .map(({ z, flag }) => ({ athleteId: z.athleteId, athleteName: nameById.get(z.athleteId) ?? "Athlete", exerciseName: z.exerciseName, lowMps: z.lowMps, highMps: z.highMps, ...flag! }));
    const inZone = read.length - flagged.length;
    const withSets = read.length;
    const rank = { drop: 0, slow: 1, fast: 2 } as const;
    flagged.sort((a, b) => rank[a.kind] - rank[b.kind]);
    res.json({ flagged, inZone, withZones: withSets });
  });
}
