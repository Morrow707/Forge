/* WEIGHT ROOM MODE (2026-11-21): a shared tablet a coach runs in the weight room, and a gym TV.
 *
 * THE STATION. One iPad, the coach's session, a team picked. Each athlete taps their tile (first
 * name and last initial, nothing else on screen) and logs the sets of THEIR OWN assignment for
 * today. Nobody signs in on the tablet but the coach, so the rules that make that safe live here:
 *  - every read and write is scoped the way every per-athlete coach route is: the team has to be
 *    the coach's (getTeamsForCoach, which is narrowed for an assigned assistant), the athlete has
 *    to be ON that team, and athleteIsInCoachScope has to say yes;
 *  - a parked (off-season) athlete is not on the station at all and a write for one is refused,
 *    the hold's question 3 ("may the coach assign to them") answered the same way;
 *  - the document gate is the athlete's own: when it is enforced and something required is
 *    missing, the tile says what and the save is refused, exactly as the athlete's own workout
 *    screen would refuse them;
 *  - a save goes through storage.submitWorkoutLog, the athlete's own save path, with the
 *    station's typed sets merged over everything the day already holds (weight-room-merge.ts)
 *    and the revision the station read passed through untouched, so a day another device changed
 *    is refused 409 and the station re-reads it -- the rule from the 2026-11-05 day wipe;
 *  - every save writes a weight_room_station_entries row naming the coach, so a day typed on the
 *    tablet can be told from one typed on the athlete's phone;
 *  - there is no camera on the station: it writes reps and load and nothing else, and a set that
 *    was filmed on the athlete's phone is left as the camera recorded it.
 *
 * THE TV. A display link the coach makes per team. The token is the only credential (the TV has
 * no session), it is read-only, scoped to one team, revocable, and only its hash is stored. The
 * boards are HAND-LOGGED numbers only -- the strength leaderboard's estimated 1RM from typed
 * weight and reps, the PR wall, and the week's completion -- and the payload is an allow-list
 * projection, so no camera-derived column can reach a TV: a leaderboard is exactly where an
 * uncalibrated number would be read as a ranking of people. Names are first name and last
 * initial (leaderboardDisplayName), and no athlete id leaves.
 */
import type { Express, Request } from "express";
import rateLimit from "express-rate-limit";
import { randomBytes } from "crypto";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { requireRole } from "./auth";
import { storage, leaderboardDisplayName, StaleWorkoutLogError } from "./storage";
import { comparePasswords } from "./auth-utils";
import { ENFORCEMENT_ENABLED } from "./billing";
import { weightRoomDisplayTokens, weightRoomStationEntries } from "@shared/schema";
import { documentAudienceFor, missingRequiredDocuments, type DocumentStatus } from "@shared/required-documents";
import { hashDisplayToken, mergeStationSets, setWasFilmed, weekWindow, type StoredEntry } from "./weight-room-merge";

const STATUS_CREATED = 201;
const STATUS_NO_CONTENT = 204;
const STATUS_BAD_REQUEST = 400;
const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;
const STATUS_NOT_FOUND = 404;
const STATUS_CONFLICT = 409;
const HTTP = {
  created: STATUS_CREATED,
  noContent: STATUS_NO_CONTENT,
  badRequest: STATUS_BAD_REQUEST,
  unauthorized: STATUS_UNAUTHORIZED,
  forbidden: STATUS_FORBIDDEN,
  notFound: STATUS_NOT_FOUND,
  conflict: STATUS_CONFLICT,
} as const;
const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const ISO_DATE_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 500;
const TOKEN_BYTES = 24;
const LABEL_MAX = 60;
const REPS_MAX_LENGTH = 20;
const WEIGHT_MAX_LENGTH = 20;
const SETS_PER_SAVE_MAX = 200;
const UNLOCK_WINDOW_MINUTES = 15;
const UNLOCK_WINDOW_MS = UNLOCK_WINDOW_MINUTES * MINUTE_MS;
const UNLOCK_ATTEMPTS = 10;
/** How long one TV payload is reused before it is rebuilt. The TV polls every minute. */
export const TV_CACHE_MS = MINUTE_MS;
const TV_EXERCISES_MAX = 6;
const TV_ROWS_PER_BOARD = 8;
const TV_PRS_MAX = 12;
const WEEK_DAYS = 7;

function currentUser(req: Request) {
  return req.user as { id: number; role: string; name: string };
}

/* ---------------------------------------------------------------- scope */

/** The team, when it is one this coach may see (getTeamsForCoach is narrowed for an assigned
 * assistant), the same rule as routes.ts's own assertOwnsTeam. */
export async function assertOwnsTeam(coachId: number, teamId: number) {
  const teams = await storage.getTeamsForCoach(coachId);
  return teams.find((t) => t.id === teamId) ?? null;
}

/** The athletes a station for this team may show: on the team, in the coach's scope, not parked. */
export async function stationAthletes(coachId: number, teamId: number) {
  const team = await assertOwnsTeam(coachId, teamId);
  if (!team) return null;
  const inSeason = new Set((await storage.getRosterForCoach(coachId)).map((a) => a.id));
  const scoped = new Set(await storage.athleteIdsInCoachScope(coachId));
  const athletes = team.members
    .map((m) => m.athlete)
    .filter((a) => a.id !== coachId && inSeason.has(a.id) && scoped.has(a.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { team, athletes };
}

/** Whether this athlete's documents stop them training today, and what is missing. */
export async function documentGate(athleteId: number) {
  const audience = documentAudienceFor({ role: "athlete", hasCoach: true });
  const summary = await storage.externalWaiverSummary(athleteId);
  const statusByKind: Record<string, DocumentStatus> = Object.fromEntries(
    summary.map((line) => [line.kind, line.status as DocumentStatus]),
  );
  const missing = missingRequiredDocuments(audience, statusByKind, { beta: !ENFORCEMENT_ENABLED });
  return { blocked: ENFORCEMENT_ENABLED && missing.length > 0, missing: missing.map((d) => d.label) };
}

/** Today's scheduled (not rest) program days for an athlete, on their own calendar day. */
async function todaysDays(athleteId: number) {
  const today = await storage.todayForAthlete(athleteId);
  const calendar = await storage.getCalendarForAthlete(athleteId, today, today);
  const days = calendar.filter(
    (e): e is Extract<typeof e, { kind: "exercise" }> => e.kind === "exercise" && !(e as { isRestDay?: boolean }).isRestDay,
  );
  return { today, days };
}

/* ---------------------------------------------------------------- station projection */

type DayDetail = NonNullable<Awaited<ReturnType<typeof storage.getWorkoutDayDetail>>>;

export function storedEntriesOf(detail: DayDetail): StoredEntry[] {
  return (detail.log?.entries ?? []).map((e) => ({
    programExerciseId: e.programExerciseId,
    correctiveId: e.correctiveId,
    exerciseId: e.exerciseId,
    weightMode: e.weightMode,
    weightUnit: (e.sets[0] as { weightUnit?: "lbs" | "kg" | null } | undefined)?.weightUnit ?? null,
    rpe: e.rpe,
    notes: e.notes,
    sets: e.sets as unknown as StoredEntry["sets"],
  }));
}

/** What the tile shows: names, the prescription, last time, and what is logged -- never a camera
 * number, which is the athlete's phone's to show with its caveat. */
function projectDay(detail: DayDetail, assignmentId: number, programDayId: number, date: string) {
  const stored = detail.log?.entries ?? [];
  return {
    assignmentId,
    programDayId,
    date,
    title: detail.day.title,
    programName: detail.programName,
    revision: detail.log?.revision ?? null,
    completed: detail.log?.completed ?? false,
    exercises: detail.day.exercises.map((pe) => {
      const entry = stored.find((e) => e.programExerciseId === pe.id);
      return {
        programExerciseId: pe.id,
        name: pe.exercise.name,
        sets: pe.sets,
        reps: pe.reps,
        prescribedWeight: pe.weight ?? null,
        weightMode: (stored.find((e) => e.programExerciseId === pe.id)?.weightMode ?? "numeric") as StoredEntry["weightMode"],
        lastTime: pe.lastPerformance
          ? {
              date: pe.lastPerformance.date,
              sets: pe.lastPerformance.sets,
              reps: pe.lastPerformance.reps,
              weight: pe.lastPerformance.weight,
              weightUnit: pe.lastPerformance.weightUnit,
            }
          : null,
        logged: (entry?.sets ?? [])
          .map((s) => ({
            setNumber: s.setNumber,
            reps: s.reps,
            weight: s.weight,
            weightUnit: (s as { weightUnit?: string | null }).weightUnit ?? null,
            filmed: setWasFilmed(s as unknown as Record<string, unknown>),
          }))
          .sort((a, b) => a.setNumber - b.setNumber),
      };
    }),
  };
}

/* ---------------------------------------------------------------- TV boards */

type TvBoards = {
  teamName: string;
  generatedAt: string;
  weekOf: string;
  topLifts: { exercise: string; rows: { rank: number; name: string; estimatedOneRm: number; weightUnit: string }[] }[];
  prsThisWeek: { name: string; exercise: string; weight: string | null; reps: string | null; weightUnit: string; date: string }[];
  completion: { scheduled: number; completed: number; percent: number | null; everySessionDone: string[] };
};

/** Builds the boards by EXPLICIT projection: every field below is named, so nothing the leaderboard
 * and PR queries happen to return -- ids, heights, body weights, any camera column -- can ride along. */
export async function buildTvBoards(coachId: number, teamId: number): Promise<TvBoards | null> {
  const roster = await stationAthletes(coachId, teamId);
  if (!roster) return null;
  const memberIds = new Set(roster.athletes.map((a) => a.id));
  const today = new Date().toISOString().slice(0, ISO_DATE_LENGTH);
  const week = weekWindow(today);

  const exercises = await storage.getLeaderboardExercisesForCoach(coachId);
  const boards = await Promise.all(
    exercises.map(async (ex) => {
      const full = await storage.getFullLeaderboardForExercise(coachId, ex.id);
      const team = full.filter((r) => memberIds.has(r.id));
      return { exercise: ex.name, team };
    }),
  );
  const topLifts = boards
    .filter((b) => b.team.length > 0)
    .sort((a, b) => b.team.length - a.team.length || a.exercise.localeCompare(b.exercise))
    .slice(0, TV_EXERCISES_MAX)
    .map((b) => ({
      exercise: b.exercise,
      rows: b.team.slice(0, TV_ROWS_PER_BOARD).map((r, i) => ({
        rank: i + 1,
        name: leaderboardDisplayName(r.name),
        estimatedOneRm: r.estimatedOneRm,
        weightUnit: r.weightUnit,
      })),
    }));

  const prs = await storage.getRecentPrsForCoach(coachId, SETS_PER_SAVE_MAX, WEEK_DAYS);
  const prsThisWeek = prs
    .filter((p) => memberIds.has(p.athleteId) && p.date >= week.start)
    .slice(0, TV_PRS_MAX)
    .map((p) => ({
      name: leaderboardDisplayName(p.athleteName),
      exercise: p.exerciseName,
      weight: p.weight,
      reps: p.reps,
      weightUnit: p.weightUnit,
      date: p.date,
    }));

  const perAthlete = await Promise.all(
    roster.athletes.map(async (a) => {
      const calendar = await storage.getCalendarForAthlete(a.id, week.start, week.end);
      const due = calendar.filter((e) => e.kind === "exercise" && !(e as { isRestDay?: boolean }).isRestDay);
      return { name: a.name, scheduled: due.length, completed: due.filter((e) => e.completed).length };
    }),
  );
  const scheduled = perAthlete.reduce((n, a) => n + a.scheduled, 0);
  const completed = perAthlete.reduce((n, a) => n + a.completed, 0);
  const percentScale = 100;
  return {
    teamName: roster.team.name,
    generatedAt: new Date().toISOString(),
    weekOf: week.start,
    topLifts,
    prsThisWeek,
    completion: {
      scheduled,
      completed,
      percent: scheduled === 0 ? null : Math.round((completed / scheduled) * percentScale),
      everySessionDone: perAthlete
        .filter((a) => a.scheduled > 0 && a.completed === a.scheduled)
        .map((a) => leaderboardDisplayName(a.name))
        .sort(),
    },
  };
}

/** Turns off one of THIS coach's display links; another coach's id matches nothing. */
async function revokeDisplayLink(coachId: number, displayId: number) {
  const [row] = await db
    .update(weightRoomDisplayTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(weightRoomDisplayTokens.id, displayId), eq(weightRoomDisplayTokens.coachId, coachId)))
    .returning();
  return row ?? null;
}

const tvCache = new Map<string, { at: number; boards: TvBoards }>();

/* ---------------------------------------------------------------- routes */

const stationSetSchema = z.object({
  programExerciseId: z.number().int().positive(),
  setNumber: z.number().int().positive().max(SETS_PER_SAVE_MAX),
  reps: z.string().trim().max(REPS_MAX_LENGTH).nullable(),
  weight: z.string().trim().max(WEIGHT_MAX_LENGTH).nullable(),
  weightUnit: z.enum(["lbs", "kg"]).default("lbs"),
});
export const stationSaveSchema = z.object({
  assignmentId: z.number().int().positive(),
  programDayId: z.number().int().positive(),
  // An ISO calendar day: "2026-11-21" matches, "2026-11-21T09:00" and "11/21/2026" do not.
  // https://regex101.com/?regex=%5E%5Cd%7B4%7D-%5Cd%7B2%7D-%5Cd%7B2%7D%24&testString=2026-11-21
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  baseRevision: z.number().int().nonnegative().optional(),
  completed: z.boolean().optional(),
  sets: z.array(stationSetSchema).max(SETS_PER_SAVE_MAX),
});

const unlockLimiter = rateLimit({
  windowMs: UNLOCK_WINDOW_MS,
  limit: UNLOCK_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `weight-room-unlock:${(req.user as { id?: number } | undefined)?.id ?? "anon"}`,
  message: { message: "Too many tries. Wait a few minutes and try again." },
});

export function registerWeightRoomRoutes(app: Express) {
  const coachOnly = requireRole("coach");

  app.get("/api/coach/weight-room/teams", coachOnly, async (req, res, next) => {
    try {
      const teams = await storage.getTeamsForCoach(currentUser(req).id);
      res.json(teams.map((t) => ({ id: t.id, name: t.name, memberCount: t.members.length })));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/coach/weight-room/station/:teamId", coachOnly, async (req, res, next) => {
    try {
      const user = currentUser(req);
      const teamId = Number(req.params.teamId);
      if (!(await assertOwnsTeam(user.id, teamId))) return res.status(HTTP.notFound).json({ message: "Team not found" });
      const roster = await stationAthletes(user.id, teamId);
      if (!roster) return res.status(HTTP.notFound).json({ message: "Team not found" });
      const tiles = await Promise.all(
        roster.athletes.map(async (a) => {
          const [gate, { days }] = await Promise.all([documentGate(a.id), todaysDays(a.id)]);
          return {
            athleteId: a.id,
            displayName: leaderboardDisplayName(a.name),
            blocked: gate.blocked ? { missing: gate.missing } : null,
            workoutsToday: days.length,
            completedToday: days.filter((d) => d.completed).length,
          };
        }),
      );
      res.json({ teamId: roster.team.id, teamName: roster.team.name, athletes: tiles });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/coach/weight-room/station/:teamId/athletes/:athleteId", coachOnly, async (req, res, next) => {
    try {
      const user = currentUser(req);
      const teamId = Number(req.params.teamId);
      if (!(await assertOwnsTeam(user.id, teamId))) return res.status(HTTP.notFound).json({ message: "Athlete not found on this team" });
      const athleteId = Number(req.params.athleteId);
      const roster = await stationAthletes(user.id, teamId);
      const athlete = roster?.athletes.find((a) => a.id === athleteId);
      if (!roster || !athlete || !(await storage.athleteIsInCoachScope(user.id, athleteId))) {
        return res.status(HTTP.notFound).json({ message: "Athlete not found on this team" });
      }
      const [gate, { today, days }] = await Promise.all([documentGate(athleteId), todaysDays(athleteId)]);
      const details = await Promise.all(
        days.map(async (d) => {
          const detail = await storage.getWorkoutDayDetail(athleteId, d.assignmentId, d.programDayId, today);
          return detail ? projectDay(detail, d.assignmentId, d.programDayId, today) : null;
        }),
      );
      res.json({
        displayName: leaderboardDisplayName(athlete.name),
        date: today,
        blocked: gate.blocked ? { missing: gate.missing } : null,
        workouts: details.filter((d) => d != null),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/coach/weight-room/station/:teamId/athletes/:athleteId/log", coachOnly, async (req, res, next) => {
    try {
      const user = currentUser(req);
      const teamId = Number(req.params.teamId);
      if (!(await assertOwnsTeam(user.id, teamId))) return res.status(HTTP.notFound).json({ message: "Athlete not found on this team" });
      const athleteId = Number(req.params.athleteId);
      const parsed = stationSaveSchema.safeParse(req.body);
      if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
      const input = parsed.data;

      // SCOPE FIRST, and every refusal reads the same so the station cannot probe who exists.
      const roster = await stationAthletes(user.id, teamId);
      const onStation = roster?.athletes.some((a) => a.id === athleteId) ?? false;
      if (!onStation || !(await storage.athleteIsInCoachScope(user.id, athleteId))) {
        return res.status(HTTP.notFound).json({ message: "Athlete not found on this team" });
      }
      const gate = await documentGate(athleteId);
      if (gate.blocked) {
        return res.status(HTTP.forbidden).json({
          message: `Training is locked until these are on file: ${gate.missing.join(", ")}.`,
          missing: gate.missing,
        });
      }
      const { today, days } = await todaysDays(athleteId);
      if (input.date !== today) {
        return res.status(HTTP.badRequest).json({ message: "A station logs today's workout only." });
      }
      const scheduled = days.some((d) => d.assignmentId === input.assignmentId && d.programDayId === input.programDayId);
      if (!scheduled) return res.status(HTTP.notFound).json({ message: "That workout is not on this athlete's day" });

      const detail = await storage.getWorkoutDayDetail(athleteId, input.assignmentId, input.programDayId, today);
      if (!detail) return res.status(HTTP.notFound).json({ message: "Workout not found" });
      const merged = mergeStationSets(
        storedEntriesOf(detail),
        input.sets,
        detail.day.exercises.map((pe) => ({
          programExerciseId: pe.id,
          exerciseId: pe.exercise.id,
          // A program prescribes no weight mode; a day with nothing logged yet takes plain load.
          weightMode: "numeric" as const,
        })),
      );

      let log;
      try {
        log = await storage.submitWorkoutLog(athleteId, {
          assignmentId: input.assignmentId,
          programDayId: input.programDayId,
          date: today,
          // Never un-completes a day: the station only adds the tick.
          completed: input.completed ?? detail.log?.completed ?? false,
          entries: merged.entries,
          ...(input.baseRevision !== undefined ? { baseRevision: input.baseRevision } : {}),
        });
      } catch (err) {
        if (err instanceof StaleWorkoutLogError) {
          return res.status(HTTP.conflict).json({ message: err.message, currentRevision: err.currentRevision });
        }
        throw err;
      }
      if (!log) return res.status(HTTP.notFound).json({ message: "Assignment not found" });

      const revision = (log as { revision?: number }).revision ?? null;
      await db.insert(weightRoomStationEntries).values({
        coachId: user.id,
        athleteId,
        teamId,
        workoutLogId: (log as { id?: number }).id ?? null,
        assignmentId: input.assignmentId,
        programDayId: input.programDayId,
        date: today,
        revision,
        setsWritten: merged.written,
      });
      // The same after-save checks the athlete's own route runs that a hand-typed set can trip.
      await storage.evaluateAcwrRiskFlag(input.assignmentId, athleteId);
      if (input.completed) await storage.checkAndAwardTrophies(athleteId);
      res.json({ revision, written: merged.written, skippedFilmed: merged.skippedFilmed });
    } catch (err) {
      next(err);
    }
  });

  /** Leaving the station: the coach's own password, nothing else. */
  app.post("/api/coach/weight-room/unlock", coachOnly, unlockLimiter, async (req, res, next) => {
    try {
      const parsed = z.object({ password: z.string().min(1).max(PASSWORD_MAX_LENGTH) }).safeParse(req.body);
      if (!parsed.success) return res.status(HTTP.badRequest).json({ message: "Enter your password." });
      const user = await storage.getUser(currentUser(req).id);
      if (!user || !(await comparePasswords(parsed.data.password, user.passwordHash))) {
        return res.status(HTTP.unauthorized).json({ message: "That password is not right." });
      }
      res.status(HTTP.noContent).end();
    } catch (err) {
      next(err);
    }
  });

  /* ---- display links ---- */

  app.get("/api/coach/weight-room/displays", coachOnly, async (req, res, next) => {
    try {
      const user = currentUser(req);
      const teams = new Map((await storage.getTeamsForCoach(user.id)).map((t) => [t.id, t.name]));
      const rows = await db
        .select()
        .from(weightRoomDisplayTokens)
        .where(and(eq(weightRoomDisplayTokens.coachId, user.id), isNull(weightRoomDisplayTokens.revokedAt)))
        .orderBy(desc(weightRoomDisplayTokens.createdAt));
      res.json(
        rows.map((r) => ({
          id: r.id,
          teamId: r.teamId,
          teamName: teams.get(r.teamId) ?? null,
          label: r.label,
          createdAt: r.createdAt,
          lastSeenAt: r.lastSeenAt,
        })),
      );
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/coach/weight-room/displays", coachOnly, async (req, res, next) => {
    try {
      const user = currentUser(req);
      const parsed = z
        .object({ teamId: z.number().int().positive(), label: z.string().trim().max(LABEL_MAX).optional() })
        .safeParse(req.body);
      if (!parsed.success) return res.status(HTTP.badRequest).json({ message: "Pick a team." });
      if (!(await assertOwnsTeam(user.id, parsed.data.teamId))) {
        return res.status(HTTP.notFound).json({ message: "Team not found" });
      }
      const token = randomBytes(TOKEN_BYTES).toString("base64url");
      const [row] = await db
        .insert(weightRoomDisplayTokens)
        .values({
          coachId: user.id,
          teamId: parsed.data.teamId,
          tokenHash: hashDisplayToken(token),
          label: parsed.data.label || null,
        })
        .returning();
      // The only time the token leaves the server. Lost means revoke and make another.
      res.status(HTTP.created).json({ id: row.id, token, path: `/tv/${token}` });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/coach/weight-room/displays/:id/revoke", coachOnly, async (req, res, next) => {
    try {
      const user = currentUser(req);
      const row = await revokeDisplayLink(user.id, Number(req.params.id));
      if (!row) return res.status(HTTP.notFound).json({ message: "Display link not found" });
      tvCache.delete(row.tokenHash);
      res.status(HTTP.noContent).end();
    } catch (err) {
      next(err);
    }
  });

  /** The TV. No session: the token is the credential. noindex on the response as well as the page. */
  app.get("/api/public/weight-room-tv/:token", async (req, res, next) => {
    try {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.setHeader("Cache-Control", "no-store");
      const tokenHash = hashDisplayToken(String(req.params.token));
      const [row] = await db
        .select()
        .from(weightRoomDisplayTokens)
        .where(and(eq(weightRoomDisplayTokens.tokenHash, tokenHash), isNull(weightRoomDisplayTokens.revokedAt)));
      if (!row) {
        tvCache.delete(tokenHash);
        return res.status(HTTP.notFound).json({ message: "This display link is not active." });
      }
      const cached = tvCache.get(tokenHash);
      if (cached && Date.now() - cached.at < TV_CACHE_MS) return res.json(cached.boards);
      const boards = await buildTvBoards(row.coachId, row.teamId);
      if (!boards) return res.status(HTTP.notFound).json({ message: "This display link is not active." });
      tvCache.set(tokenHash, { at: Date.now(), boards });
      await db.update(weightRoomDisplayTokens).set({ lastSeenAt: new Date() }).where(eq(weightRoomDisplayTokens.id, row.id));
      res.json(boards);
    } catch (err) {
      next(err);
    }
  });
}

/** Test seam: drops every cached TV payload. */
export function clearTvCacheForTests() {
  tvCache.clear();
}
