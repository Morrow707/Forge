/* HARDY THE HAMMER, the server half (2026-11-11). Design: docs/hardy/README.md.
 *
 * Two ways to ask:
 *   - SEARCH, for everyone signed in: dates, lifts, foods and notes in the person's own logs (a
 *     coach: their roster's), each hit linked to the page it lives on. No AI, so no plan gate.
 *   - ASK, in a sentence, answered by Claude from the same logs. Only where Forge already allows
 *     AI help: a coach or admin, or a Free Agent on an AI plan (the caller injects that rule from
 *     routes.ts, which owns it). Never a coached athlete (Scott: athletes are coached by the
 *     staff) and never a minor: an AI answer sends parts of a person's history to the AI
 *     provider, which is docs/hardy/README.md's open question for counsel, so it stays adults-only
 *     until counsel answers.
 * Every question is recorded for the admin report as its kind, Forge's own words it matched and the
 * outcome -- never the question (shared/hardy-vocabulary.ts). */
import type { Express, Request } from "express";
import { createHmac } from "crypto";
import { z } from "zod";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "./db";
import { requireAuth, requireRole } from "./auth";
import { storage } from "./storage";
import { aiEnabled, askClaudeStructured, fastModel } from "./ai";
import {
  exercises,
  foodLogEntries,
  hardyAskDays,
  hardyQuestionEvents,
  users,
  wellnessCheckins,
  workoutLogEntries,
  workoutLogs,
  workoutSetEntries,
} from "@shared/schema";
import { ageInYears } from "@shared/anvil-eligibility";
import {
  HARDY_GROUPS,
  hardyKindOf,
  hardyReport,
  hardyWordsIn,
  type HardyEvent,
  type HardyGroup,
  type HardyOutcome,
} from "@shared/hardy-vocabulary";

type User = { id: number; role: "coach" | "athlete" | "admin" | "guardian"; name: string; email: string };
const currentUser = (req: Request) => req.user as User;

/** Why AI answers are or are not open to this person; decided in routes.ts, which owns the plan rules. */
export type HardyAiAccess = { allowed: true } | { allowed: false; reason: "coached" | "plan" | "minor" | "off" };
export type HardyDeps = { aiAccessFor: (user: User) => Promise<HardyAiAccess> };

const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const TOO_MANY = 429;
const HTTP = { badRequest: BAD_REQUEST, forbidden: FORBIDDEN, tooMany: TOO_MANY };
/** Answers in a sentence one account may ask for in one server day (docs/hardy/README.md). */
export const HARDY_ASKS_PER_DAY = 50;
const DAY_MS = 86_400_000;
const ISO_DATE_LENGTH = 10;
const QUESTION_MAX = 400;
const MAX_HITS = 40;
const MIN_TERM = 3;
const ADULT_YEARS = 18;
const SEARCH_WINDOW_DAYS = 730;
const CONTEXT_SET_DAYS = 180;
const CONTEXT_FOOD_DAYS = 60;
const CONTEXT_MAX_CHARS = 60_000;
const ANSWER_MAX_TOKENS = 900;
const WEEK = 7;
const FOUR_WEEKS = 28;
const REPORT_PERIODS = [WEEK, FOUR_WEEKS] as const;
const YEAR_DIGITS = 4;
const PAD = 2;
const KEY_CHARS = 24;
/** The report reads its period and the one before it. */
const PERIODS_READ = 2;
// An ISO day: "2026-07-14" yes; "2026-7-14" and "14/07/2026" no.
// https://regex101.com/?regex=%5E%5Cd%7B4%7D-%5Cd%7B2%7D-%5Cd%7B2%7D%24&testString=2026-07-14
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isoDaysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, ISO_DATE_LENGTH);

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const STOP = new Set(["what", "when", "did", "the", "and", "for", "with", "my", "show", "find", "day", "days", "was", "have", "how", "much", "many", "last", "ate", "eat", "lift", "lifted", "this", "that", "from", "about", "on", "in"]);

/** A date the query names: "2026-07-14", "July 14", "jul 14 2026". */
export function dateIn(q: string, todayIso: string): string | null {
  // An ISO day anywhere in the query: "bench on 2026-07-14" yes; "2026-7-14" no.
  // https://regex101.com/?regex=%5Cb(%5Cd%7B4%7D)-(%5Cd%7B2%7D)-(%5Cd%7B2%7D)%5Cb&testString=bench%20on%202026-07-14
  const iso = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  // A month name (or its first three letters) then a day, then an optional year: "July 14",
  // "jul 14 2026" yes; "14 July" no. https://regex101.com/?regex=%5Cb(jan%7Cfeb%7Cmar%7Capr%7Cmay%7Cjun%7Cjul%7Caug%7Csep%7Coct%7Cnov%7Cdec)%5Ba-z%5D*%5Cs%2B(%5Cd%7B1%2C2%7D)(%3F%3A%2C%3F%5Cs%2B(%5Cd%7B4%7D))%3F
  const m = q.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:,?\s+(\d{4}))?/);
  if (!m) return null;
  const year = m[3] ?? todayIso.slice(0, YEAR_DIGITS);
  const pad = (n: number) => String(n).padStart(PAD, "0");
  const candidate = `${year}-${pad(MONTHS.indexOf(m[1]) + 1)}-${pad(Number(m[2]))}`;
  // "July 14" with no year means the most recent July 14, not one in the future.
  return !m[3] && candidate > todayIso ? `${Number(year) - 1}${candidate.slice(YEAR_DIGITS)}` : candidate;
}

export type HardyHit = { date: string; athleteId: number; athleteName: string; kind: "workout" | "food" | "checkin"; label: string; href: string };

function dayHref(role: User["role"], viewerId: number, athleteId: number, log: { assignmentId: number | null; programDayId: number | null; date: string }) {
  if (role === "coach" && athleteId !== viewerId) return `/coach/roster/${athleteId}`;
  if (log.assignmentId == null || log.programDayId == null) return role === "athlete" ? "/athlete/calendar" : `/${role}/my`;
  const base = { athlete: "/athlete/day", coach: "/coach/my/day", admin: "/admin/my/day", guardian: "/" }[role];
  return `${base}/${log.assignmentId}/${log.programDayId}/${log.date}`;
}

/** Whose logs this person may search: their own, plus a coach's roster. */
async function searchableAthletes(user: User): Promise<{ id: number; name: string }[]> {
  const self = { id: user.id, name: user.name };
  if (user.role !== "coach") return [self];
  const roster = await storage.getRosterForCoach(user.id);
  return [self, ...roster.map((a) => ({ id: a.id, name: a.name }))];
}

export async function hardySearch(user: User, query: string, todayIso: string): Promise<HardyHit[]> {
  const people = await searchableAthletes(user);
  const ids = people.map((p) => p.id);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const lower = query.toLowerCase();
  // A coach naming an athlete narrows to them.
  const named = user.role === "coach" ? people.filter((p) => p.id !== user.id && lower.includes(p.name.split(" ")[0].toLowerCase())) : [];
  const scope = named.length ? named.map((p) => p.id) : ids;
  const date = dateIn(query, todayIso);
  const weekday = WEEKDAYS.findIndex((d) => lower.includes(d));
  const nameWords = new Set(named.flatMap((p) => p.name.toLowerCase().split(" ")));
  // Drops an ISO date already read above ("2026-07-14" goes, "2026" stays), then splits into
  // letters-only words: "bench, july 14" gives ["bench", "july"].
  // https://regex101.com/?regex=%5B%5Ea-z%5D%2B&testString=bench%2C%20july%2014
  const terms = lower
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .split(/[^a-z]+/)
    .filter((t) => t.length >= MIN_TERM && !STOP.has(t) && !MONTHS.some((mo) => t.startsWith(mo)) && !WEEKDAYS.includes(t) && !nameWords.has(t));
  if (!date && weekday < 0 && terms.length === 0) return [];

  const dateWhere = date ? [eq(workoutLogs.date, date)] : [gte(workoutLogs.date, isoDaysAgo(SEARCH_WINDOW_DAYS))];
  const textWhere = terms.length ? [or(...terms.flatMap((t) => [ilike(exercises.name, `%${t}%`), ilike(workoutLogEntries.notes, `%${t}%`)]))] : [];
  const sets = await db
    .select({ athleteId: workoutLogs.athleteId, date: workoutLogs.date, assignmentId: workoutLogs.assignmentId, programDayId: workoutLogs.programDayId, exercise: exercises.name, notes: workoutLogEntries.notes, weight: workoutSetEntries.weight, reps: workoutSetEntries.reps, unit: workoutSetEntries.weightUnit, speed: workoutSetEntries.meanVelocityMps })
    .from(workoutLogEntries)
    .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
    .leftJoin(exercises, eq(workoutLogEntries.exerciseId, exercises.id))
    .leftJoin(workoutSetEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
    .where(and(inArray(workoutLogs.athleteId, scope), ...dateWhere, ...textWhere))
    .orderBy(desc(workoutLogs.date))
    .limit(MAX_HITS * MAX_HITS);

  const foodDate = date ? [eq(foodLogEntries.date, date)] : [gte(foodLogEntries.date, isoDaysAgo(SEARCH_WINDOW_DAYS))];
  const foodText = terms.length ? [or(...terms.map((t) => ilike(foodLogEntries.description, `%${t}%`)))] : [];
  const foods = terms.length || date
    ? await db
        .select({ athleteId: foodLogEntries.athleteId, date: foodLogEntries.date, description: foodLogEntries.description, kcal: foodLogEntries.caloriesKcal, protein: foodLogEntries.proteinG })
        .from(foodLogEntries)
        .where(and(inArray(foodLogEntries.athleteId, scope), ...foodDate, ...foodText))
        .orderBy(desc(foodLogEntries.date))
        .limit(MAX_HITS)
    : [];

  const onWeekday = (iso: string) => weekday < 0 || new Date(`${iso}T12:00:00Z`).getUTCDay() === weekday;
  // One hit per athlete, day and lift, with that day's sets summarised.
  const groups = new Map<string, typeof sets>();
  sets.filter((s) => onWeekday(s.date)).forEach((s) => {
    const key = `${s.athleteId}|${s.date}|${s.exercise ?? "Exercise"}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  });
  const workoutHits: HardyHit[] = Array.from(groups.values()).map((rows) => {
    const r = rows[0];
    const best = rows.filter((x) => x.weight || x.reps).map((x) => `${x.weight ?? "BW"}${x.weight && x.unit ? ` ${x.unit}` : ""} × ${x.reps ?? "?"}${x.speed != null ? ` (${x.speed} m/s)` : ""}`);
    return {
      date: r.date,
      athleteId: r.athleteId,
      athleteName: nameOf.get(r.athleteId) ?? "",
      kind: "workout",
      label: `${r.exercise ?? "Exercise"}${best.length ? `: ${best.join(", ")}` : ""}${r.notes ? ` · Note: ${r.notes}` : ""}`,
      href: dayHref(user.role, user.id, r.athleteId, r),
    };
  });
  const foodHits: HardyHit[] = foods.filter((f) => onWeekday(f.date)).map((f) => ({
    date: f.date,
    athleteId: f.athleteId,
    athleteName: nameOf.get(f.athleteId) ?? "",
    kind: "food",
    label: `${f.description}${f.kcal != null ? ` · ${f.kcal} kcal` : ""}${f.protein != null ? ` · ${Math.round(f.protein)} g protein` : ""}`,
    href: user.role === "coach" && f.athleteId !== user.id ? `/coach/roster/${f.athleteId}?tab=nutrition` : "/athlete/nutrition",
  }));
  return [...workoutHits, ...foodHits].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, MAX_HITS);
}

/** One athlete's recent history as compact lines, for an AI answer grounded in their own logs. */
export async function historyContext(athleteId: number): Promise<string> {
  const sets = await db
    .select({ date: workoutLogs.date, exercise: exercises.name, setNumber: workoutSetEntries.setNumber, weight: workoutSetEntries.weight, unit: workoutSetEntries.weightUnit, reps: workoutSetEntries.reps, speed: workoutSetEntries.meanVelocityMps, rpe: workoutLogEntries.rpe, notes: workoutLogEntries.notes })
    .from(workoutLogEntries)
    .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
    .leftJoin(exercises, eq(workoutLogEntries.exerciseId, exercises.id))
    .leftJoin(workoutSetEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
    .where(and(eq(workoutLogs.athleteId, athleteId), gte(workoutLogs.date, isoDaysAgo(CONTEXT_SET_DAYS))))
    .orderBy(desc(workoutLogs.date), workoutSetEntries.setNumber);
  const foods = await db
    .select({ date: foodLogEntries.date, meal: foodLogEntries.meal, description: foodLogEntries.description, kcal: foodLogEntries.caloriesKcal, protein: foodLogEntries.proteinG, carbs: foodLogEntries.carbsG, fat: foodLogEntries.fatG })
    .from(foodLogEntries)
    .where(and(eq(foodLogEntries.athleteId, athleteId), gte(foodLogEntries.date, isoDaysAgo(CONTEXT_FOOD_DAYS))))
    .orderBy(desc(foodLogEntries.date));
  const checkins = await db
    .select({ date: wellnessCheckins.date, sleep: wellnessCheckins.sleepHours, soreness: wellnessCheckins.soreness, stress: wellnessCheckins.stress })
    .from(wellnessCheckins)
    .where(and(eq(wellnessCheckins.athleteId, athleteId), gte(wellnessCheckins.date, isoDaysAgo(CONTEXT_FOOD_DAYS))))
    .orderBy(desc(wellnessCheckins.date));
  const byLift = new Map<string, string[]>();
  sets.forEach((s) => {
    const key = `${s.date} ${s.exercise ?? "Exercise"}${s.rpe ? ` (RPE ${s.rpe})` : ""}${s.notes ? ` [note: ${s.notes}]` : ""}`;
    const set = s.weight || s.reps ? `${s.weight ?? "BW"}${s.weight && s.unit ? s.unit : ""}x${s.reps ?? "?"}${s.speed != null ? `@${s.speed}m/s` : ""}` : "";
    byLift.set(key, [...(byLift.get(key) ?? []), set].filter(Boolean));
  });
  const lines = [
    "WORKOUTS (date lift: sets as weight x reps, @ camera bar speed):",
    ...Array.from(byLift, ([k, v]) => `${k}: ${v.join(", ")}`),
    "FOOD LOG (date meal: food, kcal, protein/carbs/fat g):",
    ...foods.map((f) => `${f.date} ${f.meal ?? ""}: ${f.description}, ${f.kcal ?? "?"} kcal, ${f.protein ?? "?"}/${f.carbs ?? "?"}/${f.fat ?? "?"}`),
    "CHECK-INS (date: sleep hours, soreness 1-5, stress 1-5):",
    ...checkins.map((c) => `${c.date}: ${c.sleep}h, soreness ${c.soreness}, stress ${c.stress}`),
  ];
  return lines.join("\n").slice(0, CONTEXT_MAX_CHARS);
}

type AiAnswer = { answer: string; found: boolean; medical: boolean; date?: string };
const answerTool = {
  name: "answer",
  description: "Answer the person's question from their logs.",
  input_schema: {
    type: "object",
    properties: {
      answer: { type: "string", description: "1 to 4 plain sentences. Name the date and entry each fact came from." },
      found: { type: "boolean", description: "False when the logs do not hold what was asked." },
      medical: { type: "boolean", description: "True when the question is about pain, injury or a medical condition." },
      date: { type: "string", description: "The single most relevant day, YYYY-MM-DD, when there is one." },
    },
    required: ["answer", "found", "medical"],
  },
};

function hardySystem(user: User, subject: string, today: string) {
  return `You are Hardy, the assistant inside Forge, a training app. Today is ${today}.
You are answering ${user.role === "coach" ? `a coach about their athlete ${subject}` : `${subject} about their own training`}.
Rules:
1. Every number, date, food and lift comes from the logs below. Never guess or invent one. If the logs do not hold it, say "I couldn't find that in the logs" and set found to false.
2. Name the date (and the entry) each fact came from. 1 to 4 short plain sentences, no markdown, no emoji.
3. Bar speeds (m/s) are camera readings that are not fully calibrated yet; say so when you quote one.
4. Describe patterns as observations ("came after"), never as causes.
5. For pain, injury or anything medical: say to see a doctor or athletic trainer, set medical to true, and give no other advice about it.
6. Brief training or nutrition advice is fine when asked, grounded in these logs. Never change anything: you can only answer.`;
}

const askSchema = z.object({ question: z.string().trim().min(1).max(QUESTION_MAX), today: z.string().length(ISO_DATE_LENGTH).optional() });
const searchSchema = z.object({ q: z.string().trim().min(1).max(QUESTION_MAX), today: z.string().length(ISO_DATE_LENGTH).optional() });

async function groupOf(user: User): Promise<HardyGroup> {
  if (user.role === "coach") return "Coaches";
  if (user.role === "admin") return "Admins";
  return (await storage.getCoachesForAthlete(user.id)).length ? "Coached athletes" : "Free Agents";
}

/** A keyed hash of the account id: lets the report count different people, maps back to nobody. */
function askerKey(userId: number): string {
  return createHmac("sha256", `${process.env.SESSION_SECRET ?? "forge"}:hardy-report`).update(String(userId)).digest("hex").slice(0, KEY_CHARS);
}

export async function recordQuestion(user: User, question: string, outcome: HardyOutcome, today: string) {
  try {
    await db.insert(hardyQuestionEvents).values({ day: today, askerKey: askerKey(user.id), userGroup: await groupOf(user), kind: hardyKindOf(question), words: hardyWordsIn(question), outcome });
  } catch (err) {
    // Counting a question must never fail the answer.
    console.warn("[hardy] could not record a question for the report:", err instanceof Error ? err.message : err);
  }
}

/** Counts one answer-in-a-sentence against today's limit and says whether it may run.
 *
 * ONE STATEMENT, so fifty questions sent at once cannot all read "49 so far". AWAITED and never
 * caught: a limit that a failed write lets through is not a limit, so a question that cannot be
 * counted does not reach the model. The day is the SERVER's, never the `today` the phone sends,
 * which is the athlete's own calendar and theirs to set. */
export async function takeHardyAsk(userId: number, day: string = isoDaysAgo(0)): Promise<{ allowed: boolean; asked: number }> {
  const [row] = await db
    .insert(hardyAskDays)
    .values({ askerKey: askerKey(userId), day, asks: 1 })
    .onConflictDoUpdate({ target: [hardyAskDays.askerKey, hardyAskDays.day], set: { asks: sql`${hardyAskDays.asks} + 1` } })
    .returning({ asks: hardyAskDays.asks });
  return { allowed: row.asks <= HARDY_ASKS_PER_DAY, asked: row.asks };
}

export const HARDY_LIMIT_MESSAGE = `That's ${HARDY_ASKS_PER_DAY} questions today, which is the daily limit. Search still finds anything you've logged, and asking opens again tomorrow.`;

/** Adults only for AI answers; an athlete with no date of birth is not known to be an adult. */
export async function isKnownAdult(userId: number, role: User["role"], today: string) {
  const [row] = await db.select({ dob: users.dateOfBirth }).from(users).where(eq(users.id, userId));
  if (!row?.dob) return role === "coach" || role === "admin";
  const age = ageInYears(row.dob, today);
  return age != null && age >= ADULT_YEARS;
}

const REFUSAL: Record<Exclude<HardyAiAccess, { allowed: true }>["reason"], { outcome: HardyOutcome; message: string }> = {
  coached: { outcome: "coach", message: "Asking in a sentence isn't part of a coached athlete's account; your coach handles the training calls. Search still finds anything you've logged." },
  plan: { outcome: "plan", message: "Asking in a sentence is part of AI Coach. On your plan, Search finds anything you've logged." },
  minor: { outcome: "plan", message: "Asking in a sentence is for adult accounts. Search finds anything you've logged." },
  off: { outcome: "missed", message: "Hardy's answers aren't switched on here yet. Search finds anything you've logged." },
};

export function registerHardyRoutes(app: Express, deps: HardyDeps): void {
  app.get("/api/hardy/access", requireAuth, async (req, res) => {
    const user = currentUser(req);
    if (user.role === "guardian") return res.json({ search: false, ask: false });
    const access = aiEnabled ? await deps.aiAccessFor(user) : ({ allowed: false, reason: "off" } as const);
    res.json({ search: true, ask: access.allowed, why: access.allowed ? null : REFUSAL[access.reason].message });
  });

  app.get("/api/hardy/search", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success || user.role === "guardian") return res.status(HTTP.badRequest).json({ message: "Type something to search for." });
    const today = parsed.data.today ?? isoDaysAgo(0);
    const hits = await hardySearch(user, parsed.data.q, today);
    void recordQuestion(user, parsed.data.q, hits.length ? "answered" : "missed", today);
    res.json({ hits });
  });

  app.post("/api/hardy/ask", requireAuth, async (req, res) => {
    const user = currentUser(req);
    const parsed = askSchema.safeParse(req.body);
    if (!parsed.success) return res.status(HTTP.badRequest).json({ message: parsed.error.issues[0]?.message });
    const today = parsed.data.today ?? isoDaysAgo(0);
    const access = aiEnabled ? await deps.aiAccessFor(user) : ({ allowed: false, reason: "off" } as const);
    if (!access.allowed) {
      void recordQuestion(user, parsed.data.question, REFUSAL[access.reason].outcome, today);
      return res.status(HTTP.forbidden).json({ message: REFUSAL[access.reason].message });
    }
    const people = await searchableAthletes(user);
    const lower = parsed.data.question.toLowerCase();
    const named = user.role === "coach" ? people.find((p) => p.id !== user.id && lower.includes(p.name.split(" ")[0].toLowerCase())) : undefined;
    if (user.role === "coach" && !named && people.length > 1) {
      void recordQuestion(user, parsed.data.question, "missed", today);
      return res.json({ answer: `Name the athlete you mean, for example "${people[1].name.split(" ")[0]}'s heaviest squat".`, found: false });
    }
    // The limit is taken here, after every refusal and reply that costs nothing, and before the
    // logs are read or the model is asked.
    if (!(await takeHardyAsk(user.id)).allowed) return res.status(HTTP.tooMany).json({ message: HARDY_LIMIT_MESSAGE });
    const subject = named ?? { id: user.id, name: user.name };
    const context = await historyContext(subject.id);
    const result = await askClaudeStructured<AiAnswer>(
      hardySystem(user, subject.name, today),
      `LOGS FOR ${subject.name}:\n${context}\n\nQUESTION: ${parsed.data.question}`,
      answerTool,
      { model: fastModel, maxTokens: ANSWER_MAX_TOKENS, feature: "hardy" },
    );
    if (!result?.answer) {
      void recordQuestion(user, parsed.data.question, "missed", today);
      return res.json({ answer: "I couldn't answer that just now. Search still finds anything logged.", found: false });
    }
    const found: HardyOutcome = result.found ? "answered" : "missed";
    void recordQuestion(user, parsed.data.question, result.medical ? "medical" : found, today);
    let link: string | null = null;
    if (result.date && ISO_DAY.test(result.date)) {
      const [log] = await db
        .select({ assignmentId: workoutLogs.assignmentId, programDayId: workoutLogs.programDayId, date: workoutLogs.date })
        .from(workoutLogs)
        .where(and(eq(workoutLogs.athleteId, subject.id), eq(workoutLogs.date, result.date)));
      link = log ? dayHref(user.role, user.id, subject.id, log) : null;
    }
    res.json({ answer: result.answer, found: result.found, date: result.date ?? null, link });
  });

  // ---- the admin report: what people ask Hardy, counts only, every row behind a floor ----
  app.get("/api/admin/hardy-usage", requireRole("admin"), async (req, res) => {
    const days = REPORT_PERIODS.find((d) => String(d) === req.query.days) ?? REPORT_PERIODS[1];
    const group = typeof req.query.group === "string" && (HARDY_GROUPS as readonly string[]).includes(req.query.group) ? req.query.group : null;
    const from = isoDaysAgo(days * PERIODS_READ - 1);
    const rows = await db
      .select()
      .from(hardyQuestionEvents)
      .where(and(gte(hardyQuestionEvents.day, from), lte(hardyQuestionEvents.day, isoDaysAgo(0)), ...(group ? [eq(hardyQuestionEvents.userGroup, group)] : [])));
    const cut = isoDaysAgo(days - 1);
    const events = rows as HardyEvent[];
    res.json({ days, group, ...hardyReport(events.filter((e) => e.day >= cut), events.filter((e) => e.day < cut)) });
  });
}
