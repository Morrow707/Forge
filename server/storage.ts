import { db } from "./db";
import {
  users,
  coachAthletes,
  teams,
  teamMembers,
  exercises,
  programs,
  programWeeks,
  programDays,
  programExercises,
  assignments,
  assignmentCorrectives,
  workoutLogs,
  workoutLogEntries,
  workoutSetEntries,
  workoutComments,
  exerciseSubmissions,
  exerciseReports,
  notifications,
  passwordResetTokens,
  pushSubscriptions,
  teamPosts,
  bodyMetrics,
  testingResults,
  goals,
  wellnessCheckins,
  readinessBriefings,
  athleteDigests,
  coachDigests,
  athleteChatMessages,
  programChatMessages,
  type InsertUser,
} from "@shared/schema";
import type {
  ProgramStructureInput,
  SubmitWorkoutLogInput,
  UpdateProgramDayInput,
  UpdateCorrectivesInput,
  UpdateAssignmentInput,
  UpdatePreferencesInput,
  UpdateProfileInput,
  UpdateNotificationPrefsInput,
  CreateWorkoutCommentInput,
  CreateExerciseReportInput,
  CreateBodyMetricInput,
  TestingMetric,
  CreateGoalInput,
} from "@shared/schema";
import { TESTING_METRICS, testingMetricLowerIsBetter } from "@shared/testing-metrics";
import { computeReadiness } from "@shared/wellness";
import { askClaude, askClaudeStructured, askClaudeVision, aiEnabled } from "./ai";
import { eq, and, inArray, asc, desc, lt, gte, gt, isNull, sql } from "drizzle-orm";
import {
  generateCoachCode,
  generateResetToken,
  hashResetToken,
  generateCalendarToken,
} from "./auth-utils";
import { addDays, parseISO, formatISO, isWithinInterval, startOfWeek } from "date-fns";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return initials || "?";
}

type RecentWorkoutLog = {
  date: string;
  entries: {
    weightMode: "numeric" | "bodyweight" | "band" | "box";
    rpe: number | null;
    programExercise: { exerciseId: number } | null;
    corrective: { exerciseId: number } | null;
    sets: {
      reps: string | null;
      weight: string | null;
      weightUnit: "lbs" | "kg" | null;
      bandColor: string | null;
      boxHeight: string | null;
      boxHeightUnit: "in" | "m" | null;
    }[];
  }[];
};

// Pure/synchronous -- scans an already-fetched batch of logs (see
// storage.getRecentWorkoutLogsForAthlete) for one exercise's history. Split
// out from the DB fetch so a day with N exercises/correctives can reuse a
// single shared fetch instead of running the same query N times and
// filtering in memory each time.
function extractPerformanceHistory(logs: RecentWorkoutLog[], exerciseId: number) {
  type SetHistoryPoint = {
    date: string;
    reps: string;
    weight: string | null;
    weightMode: "numeric" | "bodyweight" | "band" | "box";
    weightUnit: "lbs" | "kg" | null;
    bandColor: string | null;
    boxHeight: string | null;
    boxHeightUnit: "in" | "m" | null;
    rpe: number | null;
  };
  let lastPerformance: {
    date: string;
    sets: number;
    reps: string | null;
    weight: string | null;
    weightMode: "numeric" | "bodyweight" | "band" | "box";
    weightUnit: "lbs" | "kg" | null;
    bandColor: string | null;
    boxHeight: string | null;
    boxHeightUnit: "in" | "m" | null;
    rpe: number | null;
    suggestion: { text: string; suggestedWeight: number | null } | null;
  } | null = null;
  const setHistory: SetHistoryPoint[] = [];

  outer: for (const log of logs) {
    for (const entry of log.entries) {
      const entryExerciseId = entry.programExercise?.exerciseId ?? entry.corrective?.exerciseId;
      if (entryExerciseId !== exerciseId || entry.sets.length === 0) continue;

      if (!lastPerformance) {
        const weight = entry.sets[0]?.weight ?? null;
        lastPerformance = {
          date: log.date,
          sets: entry.sets.length,
          reps: entry.sets[0]?.reps ?? null,
          weight,
          weightMode: entry.weightMode,
          weightUnit: entry.sets[0]?.weightUnit ?? null,
          bandColor: entry.sets[0]?.bandColor ?? null,
          boxHeight: entry.sets[0]?.boxHeight ?? null,
          boxHeightUnit: entry.sets[0]?.boxHeightUnit ?? null,
          rpe: entry.rpe,
          suggestion: storage.suggestNextLoad(entry.rpe, weight, entry.weightMode),
        };
      }

      for (const set of entry.sets) {
        if (!set.reps) continue;
        setHistory.push({
          date: log.date,
          reps: set.reps,
          weight: set.weight,
          weightMode: entry.weightMode,
          weightUnit: set.weightUnit,
          bandColor: set.bandColor,
          boxHeight: set.boxHeight,
          boxHeightUnit: set.boxHeightUnit,
          rpe: entry.rpe,
        });
        if (setHistory.length >= 200) break outer;
      }
    }
  }

  return { lastPerformance, setHistory };
}

const TESTING_FIELDS = [
  "fortyYardDash",
  "verticalJumpIn",
  "broadJumpIn",
  "proAgilitySeconds",
  "benchMaxLbs",
  "squatMaxLbs",
  "deadliftMaxLbs",
] as const;

// A program day's calendar date is normally the rigid "every 7 days from
// startDate" grid -- but a coach can move any individual occurrence (game,
// travel, extra rest) via dateOverrides, keyed by program_day_id. Falls
// back to the grid whenever a day has no override.
function resolveAssignmentDate(
  assignment: { startDate: string; dateOverrides?: Record<string, string> | null },
  weekNumber: number,
  dayNumber: number,
  programDayId: number,
): Date {
  const override = assignment.dateOverrides?.[String(programDayId)];
  if (override) return parseISO(override);
  const offset = (weekNumber - 1) * 7 + (dayNumber - 1);
  return addDays(parseISO(assignment.startDate), offset);
}

// A coach can run multiple assignments/programs for the same athlete at
// once. When two or more land on the same date, the most recently assigned
// program wins outright -- assigning a new program is meant to replace
// whatever was previously scheduled for that day, rest day or not -- and
// every other entry sharing that date is dropped entirely.
function reconcileOverlappingAssignments<
  T extends { isRestDay: boolean; assignmentId: number },
>(
  entries: T[],
  keyFor: (entry: T) => string,
  createdAtByAssignment: Map<number, Date>,
): T[] {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const key = keyFor(entry);
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }

  const result: T[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      result.push(list[0]);
      continue;
    }
    let winner = list[0];
    let winnerCreatedAt = createdAtByAssignment.get(winner.assignmentId) ?? new Date(0);
    for (const entry of list.slice(1)) {
      const createdAt = createdAtByAssignment.get(entry.assignmentId) ?? new Date(0);
      if (createdAt > winnerCreatedAt) {
        winner = entry;
        winnerCreatedAt = createdAt;
      }
    }
    result.push(winner);
  }
  return result;
}

export const storage = {
  // ---------- Users ----------
  async getUser(id: number) {
    return db.query.users.findFirst({ where: eq(users.id, id) });
  },

  async getUserByEmail(email: string) {
    return db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });
  },

  async getUserByCoachCode(code: string) {
    return db.query.users.findFirst({
      where: eq(users.coachCode, code.toUpperCase()),
    });
  },

  async getUserByCalendarToken(token: string) {
    return db.query.users.findFirst({ where: eq(users.calendarToken, token) });
  },

  async getOrCreateCalendarToken(userId: number) {
    const user = await this.getUser(userId);
    if (user?.calendarToken) return user.calendarToken;
    let token = generateCalendarToken();
    while (await this.getUserByCalendarToken(token)) token = generateCalendarToken();
    await db.update(users).set({ calendarToken: token }).where(eq(users.id, userId));
    return token;
  },

  async createUser(data: Omit<InsertUser, "coachCode">) {
    const values: InsertUser = { ...data, email: data.email.toLowerCase() };
    if (data.role === "coach") {
      let code = generateCoachCode();
      // ensure uniqueness
      while (await this.getUserByCoachCode(code)) {
        code = generateCoachCode();
      }
      values.coachCode = code;
    }
    const [user] = await db.insert(users).values(values).returning();
    return user;
  },

  async updateUserPreferences(userId: number, input: UpdatePreferencesInput) {
    const [row] = await db
      .update(users)
      .set({ preferredWeightUnit: input.preferredWeightUnit })
      .where(eq(users.id, userId))
      .returning();
    return row;
  },

  // Used both for an athlete editing their own bio fields and for a coach
  // editing an athlete on their roster -- callers are responsible for
  // verifying the target user is one the requester may edit. Also captures
  // a dated testing_results snapshot whenever any testing/combine number
  // actually changes, so team trends have real history to plot without a
  // separate "log a testing day" form -- re-saving unchanged values (the
  // form always resends the full set) never creates a phantom entry.
  async updateUserProfile(userId: number, input: UpdateProfileInput) {
    const before = await db.query.users.findFirst({ where: eq(users.id, userId) });
    const [row] = await db.update(users).set(input).where(eq(users.id, userId)).returning();

    const testingChanged = TESTING_FIELDS.some(
      (field) => field in input && input[field] !== before?.[field],
    );
    if (testingChanged) {
      const today = new Date().toISOString().slice(0, 10);
      const snapshot = Object.fromEntries(TESTING_FIELDS.map((f) => [f, row[f]])) as Record<
        (typeof TESTING_FIELDS)[number],
        number | null
      >;
      await db
        .insert(testingResults)
        .values({ athleteId: userId, date: today, ...snapshot })
        .onConflictDoUpdate({
          target: [testingResults.athleteId, testingResults.date],
          set: snapshot,
        });
    }

    return row;
  },

  async setUserRole(userId: number, role: "coach" | "athlete" | "admin") {
    const [row] = await db.update(users).set({ role }).where(eq(users.id, userId)).returning();
    return row;
  },

  async linkAthleteToCoach(coachId: number, athleteId: number) {
    const existing = await db.query.coachAthletes.findFirst({
      where: and(
        eq(coachAthletes.coachId, coachId),
        eq(coachAthletes.athleteId, athleteId),
      ),
    });
    if (existing) return existing;
    const [row] = await db
      .insert(coachAthletes)
      .values({ coachId, athleteId })
      .returning();
    return row;
  },

  async getRosterForCoach(coachId: number) {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        createdAt: users.createdAt,
        age: users.age,
        heightIn: users.heightIn,
        bodyWeightLbs: users.bodyWeightLbs,
        sport: users.sport,
        position: users.position,
        healthStatus: users.healthStatus,
        fortyYardDash: users.fortyYardDash,
        verticalJumpIn: users.verticalJumpIn,
        broadJumpIn: users.broadJumpIn,
        proAgilitySeconds: users.proAgilitySeconds,
        benchMaxLbs: users.benchMaxLbs,
        squatMaxLbs: users.squatMaxLbs,
        deadliftMaxLbs: users.deadliftMaxLbs,
      })
      .from(coachAthletes)
      .innerJoin(users, eq(coachAthletes.athleteId, users.id))
      .where(eq(coachAthletes.coachId, coachId))
      .orderBy(asc(users.name));
    return rows;
  },

  // Single roster athlete's full profile, scoped to this coach -- returns
  // null if the athlete isn't on the coach's roster so callers can 404.
  async getRosterAthleteForCoach(coachId: number, athleteId: number) {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        createdAt: users.createdAt,
        age: users.age,
        heightIn: users.heightIn,
        bodyWeightLbs: users.bodyWeightLbs,
        sport: users.sport,
        position: users.position,
        healthStatus: users.healthStatus,
        fortyYardDash: users.fortyYardDash,
        verticalJumpIn: users.verticalJumpIn,
        broadJumpIn: users.broadJumpIn,
        proAgilitySeconds: users.proAgilitySeconds,
        benchMaxLbs: users.benchMaxLbs,
        squatMaxLbs: users.squatMaxLbs,
        deadliftMaxLbs: users.deadliftMaxLbs,
      })
      .from(coachAthletes)
      .innerJoin(users, eq(coachAthletes.athleteId, users.id))
      .where(and(eq(coachAthletes.coachId, coachId), eq(coachAthletes.athleteId, athleteId)));
    return rows[0] ?? null;
  },

  // Coach-only toggle -- 404s (via null) if the athlete isn't on this
  // coach's roster, so a coach can never flip a status on someone else's.
  async updateAthleteHealthStatus(
    coachId: number,
    athleteId: number,
    healthStatus: "healthy" | "hurt",
  ) {
    const onRoster = await this.getRosterAthleteForCoach(coachId, athleteId);
    if (!onRoster) return null;
    const [updated] = await db
      .update(users)
      .set({ healthStatus })
      .where(eq(users.id, athleteId))
      .returning({ id: users.id, healthStatus: users.healthStatus });
    return updated;
  },

  async getCoachesForAthlete(athleteId: number) {
    const rows = await db
      .select({ id: users.id, name: users.name, coachCode: users.coachCode })
      .from(coachAthletes)
      .innerJoin(users, eq(coachAthletes.coachId, users.id))
      .where(eq(coachAthletes.athleteId, athleteId));
    return rows;
  },

  // ---------- Body metrics (weight/composition over time, no photos) ----------
  async getBodyMetricsForAthlete(athleteId: number) {
    return db.query.bodyMetrics.findMany({
      where: eq(bodyMetrics.athleteId, athleteId),
      orderBy: asc(bodyMetrics.date),
    });
  },

  async createBodyMetric(athleteId: number, input: CreateBodyMetricInput) {
    const [row] = await db
      .insert(bodyMetrics)
      .values({
        athleteId,
        date: input.date,
        weight: input.weight,
        weightUnit: input.weightUnit,
        bodyFatPercent: input.bodyFatPercent ?? null,
        notes: input.notes || null,
      })
      .returning();
    return row;
  },

  // Scoped to athleteId so an athlete can only ever delete their own entry.
  async deleteBodyMetric(athleteId: number, id: number) {
    await db
      .delete(bodyMetrics)
      .where(and(eq(bodyMetrics.id, id), eq(bodyMetrics.athleteId, athleteId)));
  },

  // ---------- Testing/combine history ----------
  // Snapshots are written automatically by updateUserProfile above; this is
  // just the read side.
  async getTestingHistoryForAthlete(athleteId: number) {
    return db.query.testingResults.findMany({
      where: eq(testingResults.athleteId, athleteId),
      orderBy: asc(testingResults.date),
    });
  },

  // One line per athlete per testing date for the whole roster, for a
  // single chosen metric -- the coach-only "team trends" chart plots this
  // directly, one series per athlete.
  async getTeamTestingTrends(coachId: number, metric: TestingMetric) {
    const roster = await this.getRosterForCoach(coachId);
    if (roster.length === 0) return [];
    const athleteIds = roster.map((a) => a.id);
    const nameById = new Map(roster.map((a) => [a.id, a.name]));

    const rows = await db.query.testingResults.findMany({
      where: inArray(testingResults.athleteId, athleteIds),
      orderBy: asc(testingResults.date),
    });

    return rows
      .filter((r) => r[metric] != null)
      .map((r) => ({
        athleteId: r.athleteId,
        athleteName: nameById.get(r.athleteId) ?? "Unknown",
        date: r.date,
        value: r[metric] as number,
      }));
  },

  // ---------- Goals ----------
  // The heaviest weight this athlete has ever logged for an exercise,
  // regardless of rep count -- a simple, transparent "current best" for
  // comparing against a flat weight goal, not a 1RM estimate.
  async getBestLiftForExercise(athleteId: number, exerciseId: number) {
    const rows = await db
      .select({
        weight: workoutSetEntries.weight,
        weightMode: workoutLogEntries.weightMode,
      })
      .from(workoutSetEntries)
      .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
      .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
      .innerJoin(assignments, eq(workoutLogs.assignmentId, assignments.id))
      .innerJoin(programExercises, eq(workoutLogEntries.programExerciseId, programExercises.id))
      .where(
        and(
          eq(assignments.athleteId, athleteId),
          eq(programExercises.exerciseId, exerciseId),
          eq(workoutLogEntries.weightMode, "numeric"),
        ),
      );

    let best: number | null = null;
    for (const r of rows) {
      const w = parseFloat(r.weight ?? "");
      if (!Number.isNaN(w) && (best === null || w > best)) best = w;
    }
    return best;
  },

  async createGoal(athleteId: number, createdBy: number, input: CreateGoalInput) {
    const [row] = await db
      .insert(goals)
      .values({
        athleteId,
        createdBy,
        type: input.type,
        exerciseId: input.type === "exercise" ? input.exerciseId : null,
        testingMetric: input.type === "testing" ? input.testingMetric : null,
        targetValue: input.targetValue,
        targetUnit: input.targetUnit,
        targetDate: input.targetDate ?? null,
      })
      .returning();
    return row;
  },

  // Progress toward each goal is computed fresh here rather than stored, so
  // it can never drift out of sync with the athlete's actual lift history or
  // current testing numbers.
  async getGoalsForAthlete(athleteId: number) {
    const rows = await db.query.goals.findMany({
      where: eq(goals.athleteId, athleteId),
      orderBy: desc(goals.createdAt),
    });
    const exerciseIds = rows.map((g) => g.exerciseId).filter((id): id is number => id != null);
    const exerciseNameById = new Map<number, string>();
    if (exerciseIds.length > 0) {
      const exerciseRows = await db.query.exercises.findMany({
        where: inArray(exercises.id, exerciseIds),
      });
      for (const e of exerciseRows) exerciseNameById.set(e.id, e.name);
    }
    const athlete =
      rows.some((g) => g.type === "testing") &&
      (await db.query.users.findFirst({ where: eq(users.id, athleteId) }));

    return Promise.all(
      rows.map(async (g) => {
        let currentValue: number | null = null;
        let exerciseName: string | null = null;
        if (g.type === "exercise" && g.exerciseId != null) {
          currentValue = await this.getBestLiftForExercise(athleteId, g.exerciseId);
          exerciseName = exerciseNameById.get(g.exerciseId) ?? null;
        } else if (g.type === "testing" && g.testingMetric && athlete) {
          const value = (athlete as any)[g.testingMetric];
          currentValue = typeof value === "number" ? value : null;
        }

        const lowerIsBetter = g.type === "testing" && g.testingMetric
          ? testingMetricLowerIsBetter(g.testingMetric)
          : false;
        const achieved =
          currentValue != null &&
          (lowerIsBetter ? currentValue <= g.targetValue : currentValue >= g.targetValue);

        return {
          id: g.id,
          type: g.type,
          exerciseId: g.exerciseId,
          exerciseName,
          testingMetric: g.testingMetric,
          targetValue: g.targetValue,
          targetUnit: g.targetUnit,
          targetDate: g.targetDate,
          createdAt: g.createdAt,
          currentValue,
          achieved,
        };
      }),
    );
  },

  async deleteGoal(athleteId: number, goalId: number) {
    await db.delete(goals).where(and(eq(goals.id, goalId), eq(goals.athleteId, athleteId)));
  },

  // Grounded in the athlete's actual historical trend for this exercise/
  // metric -- extrapolates from real numbers rather than picking a generic
  // round target. Returns null if there's no history to extrapolate from,
  // or AI isn't configured; the goal form just doesn't offer a suggestion.
  async suggestGoalTarget(
    athleteId: number,
    input: { type: "exercise"; exerciseId: number } | { type: "testing"; testingMetric: string },
  ): Promise<{ targetValue: number; timeframeWeeks: number; rationale: string } | null> {
    let label: string;
    let trendDescription: string;

    if (input.type === "exercise") {
      const exercise = await db.query.exercises.findFirst({
        where: eq(exercises.id, input.exerciseId),
      });
      if (!exercise) return null;
      label = exercise.name;

      const cutoff = formatISO(addDays(new Date(), 1), { representation: "date" });
      const logs = await this.getRecentWorkoutLogsForAthlete(athleteId, cutoff);
      const { setHistory } = extractPerformanceHistory(logs, input.exerciseId);

      const bestByDate = new Map<string, number>();
      for (const s of setHistory) {
        const w = parseFloat(s.weight ?? "");
        if (Number.isNaN(w)) continue;
        const prev = bestByDate.get(s.date);
        if (prev == null || w > prev) bestByDate.set(s.date, w);
      }
      const points = [...bestByDate.entries()].sort(([a], [b]) => a.localeCompare(b));
      if (points.length === 0) return null;
      trendDescription = points.map(([date, w]) => `${date}: ${w}`).join(", ");
    } else {
      const history = await this.getTestingHistoryForAthlete(athleteId);
      const points = history
        .filter((h) => (h as any)[input.testingMetric] != null)
        .map((h) => `${h.date}: ${(h as any)[input.testingMetric]}`);
      if (points.length === 0) return null;
      label = input.testingMetric;
      trendDescription = points.join(", ");
    }

    const tool = {
      name: "suggest_goal_target",
      description:
        "Suggest a realistic goal target value and timeframe based on an athlete's historical trend.",
      input_schema: {
        type: "object",
        properties: {
          targetValue: {
            type: "number",
            description: "Suggested target value, in the same unit as the historical data given",
          },
          timeframeWeeks: {
            type: "integer",
            description: "Realistic number of weeks to reach the target",
          },
          rationale: {
            type: "string",
            description: "One short sentence explaining the suggestion",
          },
        },
        required: ["targetValue", "timeframeWeeks", "rationale"],
      },
    };

    const prompt = `Athlete's historical progression for "${label}" (date: value), oldest first:
${trendDescription}

Based on this athlete's actual rate of improvement, suggest a realistic target value and a realistic number of weeks to reach it. Extrapolate from their real trend -- don't just add an arbitrary round number. If there's only one data point, suggest a modest, achievable increase rather than guessing at a large jump.`;

    return askClaudeStructured(
      "You are a strength and conditioning coach's assistant helping set a realistic athlete goal. Ground every suggestion strictly in the historical numbers you're given -- never invent data you weren't given.",
      prompt,
      tool,
      { maxTokens: 300 },
    );
  },

  // ---------- Wellness check-ins ----------
  async upsertWellnessCheckin(
    athleteId: number,
    date: string,
    input: { sleepHours: number; soreness: number; stress: number },
  ) {
    const [row] = await db
      .insert(wellnessCheckins)
      .values({ athleteId, date, ...input })
      .onConflictDoUpdate({
        target: [wellnessCheckins.athleteId, wellnessCheckins.date],
        set: input,
      })
      .returning();
    return row;
  },

  async getWellnessCheckin(athleteId: number, date: string) {
    return db.query.wellnessCheckins.findFirst({
      where: and(eq(wellnessCheckins.athleteId, athleteId), eq(wellnessCheckins.date, date)),
    });
  },

  async getWellnessHistoryForAthlete(athleteId: number, limit = 14) {
    return db.query.wellnessCheckins.findMany({
      where: eq(wellnessCheckins.athleteId, athleteId),
      orderBy: desc(wellnessCheckins.date),
      limit,
    });
  },

  // Today's snapshot for every roster athlete who has already checked in --
  // an athlete with no row for the date is simply absent from the result,
  // kept distinct from a real low score.
  async getRosterWellnessToday(coachId: number, date: string) {
    const rows = await db
      .select({
        athleteId: wellnessCheckins.athleteId,
        sleepHours: wellnessCheckins.sleepHours,
        soreness: wellnessCheckins.soreness,
        stress: wellnessCheckins.stress,
      })
      .from(coachAthletes)
      .innerJoin(wellnessCheckins, eq(wellnessCheckins.athleteId, coachAthletes.athleteId))
      .where(and(eq(coachAthletes.coachId, coachId), eq(wellnessCheckins.date, date)));
    return rows;
  },

  // Cached once generated (see readinessBriefings in schema.ts) -- a day's
  // check-in and RPE history don't change after the fact, so there's
  // nothing to gain from re-asking Claude on every view.
  async getReadinessBriefing(athleteId: number, date: string) {
    return db.query.readinessBriefings.findFirst({
      where: and(eq(readinessBriefings.athleteId, athleteId), eq(readinessBriefings.date, date)),
    });
  },

  // Grounded only in this athlete's own wellness check-in and recent RPE
  // history -- never invents exercise specifics it wasn't given. Returns
  // null (no row written) if there's no wellness check-in yet for this date
  // or AI isn't configured, so the caller can just render nothing.
  async generateReadinessBriefing(athleteId: number, date: string) {
    const wellness = await this.getWellnessCheckin(athleteId, date);
    if (!wellness) return null;

    const recentLogs = await this.getRecentWorkoutLogsForAthlete(athleteId, date);
    const recentRpes: number[] = [];
    outer: for (const log of recentLogs) {
      for (const entry of log.entries) {
        if (entry.rpe != null) recentRpes.push(entry.rpe);
        if (recentRpes.length >= 10) break outer;
      }
    }

    const { level } = computeReadiness(wellness);
    const prompt = `Athlete readiness snapshot for today:
- Sleep last night: ${wellness.sleepHours} hours
- Soreness (1=none, 5=very sore): ${wellness.soreness}/5
- Stress (1=calm, 5=very stressed): ${wellness.stress}/5
- Computed overall readiness: ${level}
- Most recent logged RPEs, newest first (out of 10, higher = harder effort): ${
      recentRpes.length > 0 ? recentRpes.join(", ") : "no recent RPE data logged"
    }

Write ONE short note (1-2 sentences, plain language, talking directly to the athlete as "you") on how to approach today's training given their recovery state and recent training stress. Be specific and direct, not generic filler. Do not mention or invent specific exercises, weights, or sets -- you were not given today's workout. No preamble or sign-off, just the note itself.`;

    const text = await askClaude(
      "You are a concise, expert strength and conditioning coach's assistant. You write short, direct, athlete-facing readiness notes grounded only in the data you're given -- never invent data, never give medical advice, never diagnose. If soreness or stress data suggests something concerning, tell the athlete to flag it with their coach rather than offering a workaround.",
      [{ role: "user", content: prompt }],
      { maxTokens: 200 },
    );
    if (!text) return null;

    const [row] = await db
      .insert(readinessBriefings)
      .values({ athleteId, date, briefing: text.trim() })
      .onConflictDoUpdate({
        target: [readinessBriefings.athleteId, readinessBriefings.date],
        set: { briefing: text.trim() },
      })
      .returning();
    return row;
  },

  async getOrCreateReadinessBriefing(athleteId: number, date: string) {
    const existing = await this.getReadinessBriefing(athleteId, date);
    if (existing) return existing;
    return this.generateReadinessBriefing(athleteId, date);
  },

  // ---------- Weekly AI digests ----------
  async getAthleteDigest(athleteId: number, weekStart: string) {
    return db.query.athleteDigests.findFirst({
      where: and(eq(athleteDigests.athleteId, athleteId), eq(athleteDigests.weekStart, weekStart)),
    });
  },

  async generateAthleteDigest(athleteId: number, weekStart: string) {
    const [summary, streak, wellnessHistory] = await Promise.all([
      this.getAthleteProgressSummary(athleteId),
      this.getStreakForAthlete(athleteId),
      this.getWellnessHistoryForAthlete(athleteId, 7),
    ]);
    if (summary.totalWorkoutsCompleted === 0) return null;

    const cutoff = formatISO(addDays(new Date(), 1), { representation: "date" });
    const logs = await this.getRecentWorkoutLogsForAthlete(athleteId, cutoff);
    const recentRpes: number[] = [];
    outer: for (const log of logs) {
      for (const entry of log.entries) {
        if (entry.rpe != null) recentRpes.push(entry.rpe);
        if (recentRpes.length >= 10) break outer;
      }
    }

    const wellnessSummary =
      wellnessHistory.length > 0
        ? wellnessHistory
            .map((w) => `${w.date}: sleep ${w.sleepHours}h, soreness ${w.soreness}/5, stress ${w.stress}/5`)
            .join("; ")
        : "no wellness check-ins logged recently";
    const prSummary =
      summary.recentPRs.length > 0
        ? summary.recentPRs
            .slice(0, 5)
            .map((pr) => `${pr.exerciseName} ${pr.weight}${pr.unit} x ${pr.reps} on ${pr.date}`)
            .join("; ")
        : "no new PRs recently";

    const prompt = `Athlete's training data for their weekly summary:
- Total workouts completed all-time: ${summary.totalWorkoutsCompleted}
- Workouts this month: ${summary.workoutsThisMonth}
- Current streak: ${streak.currentStreak} days, ${streak.totalCompleted} total workouts completed
- Recent PRs (most recent first): ${prSummary}
- Recent RPE history (most recent first, out of 10, higher = harder effort): ${
      recentRpes.length > 0 ? recentRpes.join(", ") : "none logged recently"
    }
- Recent wellness check-ins: ${wellnessSummary}

Write a short (2-4 sentence) plain-language weekly training summary for this athlete, highlighting real trends from the data above -- progress, effort trend, recovery trend. Be specific and reference actual numbers where relevant. Talk directly to the athlete as "you". No preamble or sign-off, just the summary itself.`;

    const text = await askClaude(
      "You are a concise, encouraging strength and conditioning coach's assistant writing a weekly training summary. Ground everything strictly in the data given -- never invent numbers, exercises, or events you weren't told about.",
      [{ role: "user", content: prompt }],
      { maxTokens: 300 },
    );
    if (!text) return null;

    const [row] = await db
      .insert(athleteDigests)
      .values({ athleteId, weekStart, digest: text.trim() })
      .onConflictDoUpdate({
        target: [athleteDigests.athleteId, athleteDigests.weekStart],
        set: { digest: text.trim() },
      })
      .returning();
    return row;
  },

  // Generated lazily on first view each week rather than on a fixed
  // schedule (no cron in this app) -- isNew tells the route whether to also
  // fire a notification, so that only happens on the one request that
  // actually triggered generation, not every subsequent cache hit.
  async getOrCreateAthleteDigest(
    athleteId: number,
  ): Promise<{ digest: (typeof athleteDigests.$inferSelect) | null; isNew: boolean }> {
    const weekStart = formatISO(startOfWeek(new Date(), { weekStartsOn: 1 }), {
      representation: "date",
    });
    const existing = await this.getAthleteDigest(athleteId, weekStart);
    if (existing) return { digest: existing, isNew: false };
    const generated = await this.generateAthleteDigest(athleteId, weekStart);
    return { digest: generated, isNew: generated != null };
  },

  async getCoachDigest(coachId: number, weekStart: string) {
    return db.query.coachDigests.findFirst({
      where: and(eq(coachDigests.coachId, coachId), eq(coachDigests.weekStart, weekStart)),
    });
  },

  async generateCoachDigest(coachId: number, weekStart: string) {
    const roster = await this.getRosterForCoach(coachId);
    if (roster.length === 0) return null;

    const weekEnd = formatISO(addDays(parseISO(weekStart), 7), { representation: "date" });

    const [workoutCounts, wellnessRows] = await Promise.all([
      db
        .select({ athleteId: workoutLogs.athleteId, count: sql<number>`count(*)::int` })
        .from(workoutLogs)
        .innerJoin(coachAthletes, eq(coachAthletes.athleteId, workoutLogs.athleteId))
        .where(
          and(
            eq(coachAthletes.coachId, coachId),
            eq(workoutLogs.completed, true),
            gte(workoutLogs.date, weekStart),
            lt(workoutLogs.date, weekEnd),
          ),
        )
        .groupBy(workoutLogs.athleteId),
      db
        .select({
          athleteId: wellnessCheckins.athleteId,
          sleepHours: wellnessCheckins.sleepHours,
          soreness: wellnessCheckins.soreness,
          stress: wellnessCheckins.stress,
        })
        .from(wellnessCheckins)
        .innerJoin(coachAthletes, eq(coachAthletes.athleteId, wellnessCheckins.athleteId))
        .where(
          and(
            eq(coachAthletes.coachId, coachId),
            gte(wellnessCheckins.date, weekStart),
            lt(wellnessCheckins.date, weekEnd),
          ),
        ),
    ]);

    const workoutsByAthlete = new Map(workoutCounts.map((r) => [r.athleteId, r.count]));
    const totalWorkouts = workoutCounts.reduce((sum, r) => sum + r.count, 0);

    const redDaysByAthlete = new Map<number, number>();
    for (const w of wellnessRows) {
      if (computeReadiness(w).level === "red") {
        redDaysByAthlete.set(w.athleteId, (redDaysByAthlete.get(w.athleteId) ?? 0) + 1);
      }
    }

    // One progress-summary lookup per roster athlete to pull this week's PRs
    // -- fine as a per-athlete loop since this only ever runs once per coach
    // per week (cached after), never on a hot request path.
    const prsByAthlete = await Promise.all(
      roster.map(async (a) => {
        const summary = await this.getAthleteProgressSummary(a.id);
        const thisWeek = summary.recentPRs.filter(
          (pr) => pr.date >= weekStart && pr.date < weekEnd,
        );
        return { athlete: a, prs: thisWeek };
      }),
    );

    if (totalWorkouts === 0 && wellnessRows.length === 0) return null;

    const noWorkoutsNames = roster
      .filter((a) => !workoutsByAthlete.has(a.id))
      .map((a) => a.name);
    const flaggedNames = roster
      .filter((a) => (redDaysByAthlete.get(a.id) ?? 0) >= 2)
      .map((a) => `${a.name} (${redDaysByAthlete.get(a.id)} flagged days)`);
    const prLines = prsByAthlete
      .flatMap(({ athlete, prs }) =>
        prs.map((pr) => `${athlete.name}: ${pr.exerciseName} ${pr.weight}${pr.unit} x ${pr.reps}`),
      )
      .slice(0, 10);
    const perAthleteLines = roster.map(
      (a) => `${a.name}: ${workoutsByAthlete.get(a.id) ?? 0} workouts logged`,
    );

    const prompt = `Weekly roster data for a strength coach's team summary:
- Roster size: ${roster.length} athletes
- Total workouts logged this week across the roster: ${totalWorkouts}
- Per-athlete workout counts: ${perAthleteLines.join("; ")}
- Athletes with zero workouts logged this week: ${noWorkoutsNames.length > 0 ? noWorkoutsNames.join(", ") : "none"}
- Athletes with 2+ flagged (poor) readiness days this week: ${flaggedNames.length > 0 ? flaggedNames.join(", ") : "none"}
- New PRs this week: ${prLines.length > 0 ? prLines.join("; ") : "none logged"}

Write a short (3-5 sentence) plain-language weekly summary for the coach, highlighting real trends -- overall roster compliance, standout performances, and anyone who may need a check-in (missed sessions or flagged readiness). Be specific and reference actual names and numbers from the data above. Talk directly to the coach as "you". No preamble or sign-off, just the summary itself.`;

    const text = await askClaude(
      "You are a concise, direct strength and conditioning assistant coach writing a weekly roster summary for the head coach. Ground everything strictly in the data given -- never invent athletes, numbers, or events you weren't told about. This summary is for the coach's eyes only, to help them decide who to check in with.",
      [{ role: "user", content: prompt }],
      { maxTokens: 350 },
    );
    if (!text) return null;

    const [row] = await db
      .insert(coachDigests)
      .values({ coachId, weekStart, digest: text.trim() })
      .onConflictDoUpdate({
        target: [coachDigests.coachId, coachDigests.weekStart],
        set: { digest: text.trim() },
      })
      .returning();
    return row;
  },

  async getOrCreateCoachDigest(
    coachId: number,
  ): Promise<{ digest: (typeof coachDigests.$inferSelect) | null; isNew: boolean }> {
    const weekStart = formatISO(startOfWeek(new Date(), { weekStartsOn: 1 }), {
      representation: "date",
    });
    const existing = await this.getCoachDigest(coachId, weekStart);
    if (existing) return { digest: existing, isNew: false };
    const generated = await this.generateCoachDigest(coachId, weekStart);
    return { digest: generated, isNew: generated != null };
  },

  // ---------- AI chat coach ----------
  // Every message either side has ever sent, oldest first -- this is never a
  // private channel (see the schema comment on athleteChatMessages), so this
  // same query backs both the athlete's own view and the coach's read-only
  // view of it.
  async getChatMessagesForAthlete(athleteId: number, limit = 50) {
    const rows = await db.query.athleteChatMessages.findMany({
      where: eq(athleteChatMessages.athleteId, athleteId),
      orderBy: desc(athleteChatMessages.createdAt),
      limit,
    });
    return rows.reverse();
  },

  // Coach-scoped read of an athlete's chat -- 404s (via null) if the athlete
  // isn't on this coach's roster, so a coach can never read someone else's.
  async getChatMessagesForCoachAthlete(coachId: number, athleteId: number) {
    const onRoster = await this.getRosterAthleteForCoach(coachId, athleteId);
    if (!onRoster) return null;
    return this.getChatMessagesForAthlete(athleteId);
  },

  // Stores the athlete's message no matter what (so the coach's view is
  // always a complete, honest transcript, even the messages that hit an AI
  // outage), then grounds a reply in the athlete's own real data -- and,
  // critically for a minor-athlete-facing feature, never lets that reply
  // read as an unsupervised directive: anything that would change their
  // training or nutrition gets framed as something to run by their coach,
  // never a standalone instruction. The full transcript is always readable
  // by their coach (see getChatMessagesForCoachAthlete), so this is never a
  // private, unsupervised channel.
  async sendAthleteChatMessage(athleteId: number, content: string) {
    const [userMessage] = await db
      .insert(athleteChatMessages)
      .values({ athleteId, role: "athlete", content })
      .returning();

    if (!aiEnabled) {
      const [assistantMessage] = await db
        .insert(athleteChatMessages)
        .values({
          athleteId,
          role: "assistant",
          content: "Your AI coach isn't set up yet -- reach out to your coach directly for now.",
        })
        .returning();
      return { userMessage, assistantMessage };
    }

    const today = formatISO(new Date(), { representation: "date" });
    const [summary, streak, wellnessToday, history] = await Promise.all([
      this.getAthleteProgressSummary(athleteId),
      this.getStreakForAthlete(athleteId),
      this.getWellnessCheckin(athleteId, today),
      this.getChatMessagesForAthlete(athleteId, 20),
    ]);

    const prSummary =
      summary.recentPRs.length > 0
        ? summary.recentPRs
            .slice(0, 5)
            .map((pr) => `${pr.exerciseName} ${pr.weight}${pr.unit} x ${pr.reps} on ${pr.date}`)
            .join("; ")
        : "no PRs logged yet";
    const wellnessSummary = wellnessToday
      ? `sleep ${wellnessToday.sleepHours}h, soreness ${wellnessToday.soreness}/5, stress ${wellnessToday.stress}/5`
      : "no check-in logged today";

    const system = `You are Forge's AI training assistant, chatting directly with a young athlete. Ground every answer strictly in the data below -- never invent exercises, numbers, or events you weren't given.

Athlete's data:
- Total workouts completed all-time: ${summary.totalWorkoutsCompleted}
- Current streak: ${streak.currentStreak} days
- Recent PRs: ${prSummary}
- Today's wellness check-in: ${wellnessSummary}

Hard rules, no exceptions:
1. Never diagnose an injury or give medical advice. If the athlete mentions pain, injury, or feeling unwell, tell them to stop and tell their coach (or a doctor/trainer for anything serious) -- do not suggest modifications, workarounds, or whether it's safe to continue.
2. Never tell the athlete to change their training (weight, sets, reps, exercises) or their nutrition as a direct instruction. You can share general, encouraging, educational information, but any specific change must be explicitly framed as "something to bring up with your coach" -- you are never the final word on their program.
3. This entire conversation is visible to the athlete's coach. That's a good thing, not a secret -- you can mention it naturally if relevant (e.g. when suggesting they loop in their coach).
4. Keep replies short (2-4 sentences), warm, and direct. Talk to the athlete as "you". No preamble.`;

    const messages = history.map((m) => ({
      role: (m.role === "athlete" ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    }));

    const text = await askClaude(system, messages, { maxTokens: 300 });
    const [assistantMessage] = await db
      .insert(athleteChatMessages)
      .values({
        athleteId,
        role: "assistant",
        content:
          text?.trim() ??
          "Sorry, I couldn't come up with a reply just now -- try again in a bit, or reach out to your coach.",
      })
      .returning();
    return { userMessage, assistantMessage };
  },

  // ---------- Teams ----------
  async getTeamsForCoach(coachId: number) {
    const rows = await db.query.teams.findMany({
      where: eq(teams.coachId, coachId),
      with: { members: { with: { athlete: true } } },
      orderBy: asc(teams.name),
    });
    // The `with: { athlete: true }` join above pulls the full user row --
    // strip passwordHash before this ever reaches a response; a coach
    // legitimately sees the rest (including healthStatus).
    const sanitized = rows.map((team) => ({
      ...team,
      members: team.members.map((m) => {
        const { passwordHash, ...athlete } = m.athlete;
        return { ...m, athlete };
      }),
    }));
    // Teams created before the join-code column existed have none yet --
    // backfill lazily so every team the coach sees always has one to share.
    return Promise.all(
      sanitized.map(async (team) => {
        if (team.code) return team;
        let code = generateCoachCode();
        while (await this.getTeamByCode(code)) code = generateCoachCode();
        const [updated] = await db
          .update(teams)
          .set({ code })
          .where(eq(teams.id, team.id))
          .returning();
        return { ...team, code: updated.code };
      }),
    );
  },

  async createTeam(coachId: number, name: string) {
    let code = generateCoachCode();
    while (await this.getTeamByCode(code)) {
      code = generateCoachCode();
    }
    const [team] = await db.insert(teams).values({ coachId, name, code }).returning();
    return team;
  },

  async getTeamByCode(code: string) {
    return db.query.teams.findFirst({ where: eq(teams.code, code.toUpperCase()) });
  },

  async addAthleteToTeam(teamId: number, athleteId: number) {
    const existing = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.athleteId, athleteId),
      ),
    });
    if (existing) return existing;
    const [row] = await db
      .insert(teamMembers)
      .values({ teamId, athleteId })
      .returning();
    return row;
  },

  async removeAthleteFromTeam(teamId: number, athleteId: number) {
    await db
      .delete(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.athleteId, athleteId)),
      );
  },

  async deleteTeam(teamId: number) {
    await db.delete(teams).where(eq(teams.id, teamId));
  },

  // ---------- Team board (shared Q&A, not private messaging) ----------
  async getTeamBoardPosts(coachId: number) {
    const rows = await db.query.teamPosts.findMany({
      where: eq(teamPosts.coachId, coachId),
      orderBy: desc(teamPosts.createdAt),
      with: { author: true },
    });
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      isAnnouncement: r.isAnnouncement,
      createdAt: r.createdAt,
      author: { id: r.author.id, name: r.author.name, role: r.author.role },
    }));
  },

  async createTeamPost(
    coachId: number,
    authorId: number,
    body: string,
    isAnnouncement = false,
  ) {
    const [row] = await db
      .insert(teamPosts)
      .values({ coachId, authorId, body, isAnnouncement })
      .returning();
    const author = await db.query.users.findFirst({ where: eq(users.id, authorId) });
    return {
      id: row.id,
      body: row.body,
      isAnnouncement: row.isAnnouncement,
      createdAt: row.createdAt,
      author: { id: author!.id, name: author!.name, role: author!.role },
    };
  },

  // Whether this user has unseen team board activity -- compares their
  // last-read timestamp against the board's newest post. A user who has
  // never opened the board (teamBoardReadAt null) sees a flag as soon as
  // there's at least one post, not retroactively for old history.
  async getTeamBoardHasUnread(userId: number, coachId: number) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    const latest = await db.query.teamPosts.findFirst({
      where: eq(teamPosts.coachId, coachId),
      orderBy: desc(teamPosts.createdAt),
    });
    if (!latest) return false;
    if (!user?.teamBoardReadAt) return true;
    return latest.createdAt > user.teamBoardReadAt;
  },

  async markTeamBoardRead(userId: number) {
    await db.update(users).set({ teamBoardReadAt: new Date() }).where(eq(users.id, userId));
  },

  // ---------- Exercises ----------
  // System-wide, unfiltered -- used for one-off seeding/migration scripts
  // that need to know what already exists by name regardless of current
  // owner (an exercise's coachId can change, e.g. when its ownership is
  // handed to the admin to become a Forge-official exercise).
  async getAllExercises() {
    return db.query.exercises.findMany();
  },

  // Exercises created by an admin are "Forge" branded -- shared with every
  // coach, read-only to them. A coach's own exercises are private to them.
  // These are derived from the creator's role rather than stored as a flag,
  // so there's no separate field that could drift out of sync with it.
  withOwnership<T extends { coachId: number; coach: { name: string; role: string } }>(
    ex: T,
    requestingUserId: number,
  ) {
    const { coach, ...rest } = ex;
    const isForgeOfficial = coach.role === "admin";
    return {
      ...rest,
      isForgeOfficial,
      ownerLabel: isForgeOfficial ? "FORGE" : initialsFor(coach.name),
      editable: rest.coachId === requestingUserId,
    };
  },

  // A coach's own bank plus every Forge-official exercise -- what a coach
  // sees in their exercise bank and the program-builder picker.
  async getVisibleExercisesForCoach(coachId: number) {
    const admins = await db.query.users.findMany({ where: eq(users.role, "admin") });
    const ownerIds = Array.from(new Set([coachId, ...admins.map((a) => a.id)]));
    const rows = await db.query.exercises.findMany({
      where: inArray(exercises.coachId, ownerIds),
      orderBy: desc(exercises.createdAt),
      with: { coach: true },
    });
    return rows.map((ex) => this.withOwnership(ex, coachId));
  },

  // Exercises a specific user (coach or admin) personally created -- an
  // admin's own bank is exactly their Forge library, nothing shared in.
  async getExercisesByCoach(coachId: number) {
    const rows = await db.query.exercises.findMany({
      where: eq(exercises.coachId, coachId),
      orderBy: desc(exercises.createdAt),
      with: { coach: true },
    });
    return rows.map((ex) => this.withOwnership(ex, coachId));
  },

  async getExerciseDetail(id: number, requestingUserId: number) {
    const ex = await db.query.exercises.findFirst({
      where: eq(exercises.id, id),
      with: { coach: true },
    });
    if (!ex) return null;
    const openReport = await db.query.exerciseReports.findFirst({
      where: and(
        eq(exerciseReports.exerciseId, id),
        eq(exerciseReports.reportedBy, requestingUserId),
        eq(exerciseReports.status, "open"),
      ),
    });
    return {
      ...this.withOwnership(ex, requestingUserId),
      hasOpenReport: !!openReport,
    };
  },

  async getExercise(id: number) {
    return db.query.exercises.findFirst({ where: eq(exercises.id, id) });
  },

  async createExercise(coachId: number, data: any) {
    const [row] = await db
      .insert(exercises)
      .values({ ...data, coachId })
      .returning();
    await this.detectTrendingExercises();
    return row;
  },

  async updateExercise(id: number, data: any) {
    const [row] = await db
      .update(exercises)
      .set(data)
      .where(eq(exercises.id, id))
      .returning();
    if (data.name !== undefined) await this.detectTrendingExercises();
    return row;
  },

  // One-off migration helper: hand an existing exercise library over to a
  // different owner (e.g. promoting a coach's library to the admin's
  // official Forge library). Idempotent -- re-running finds nothing left
  // to move once it's already been done.
  async transferExerciseOwnership(fromUserId: number, toUserId: number) {
    await db
      .update(exercises)
      .set({ coachId: toUserId })
      .where(eq(exercises.coachId, fromUserId));
  },

  async deleteExercise(id: number) {
    await db.delete(exercises).where(eq(exercises.id, id));
  },

  // ---------- Trending exercises (numbers, not opt-in, -> Forge) ----------
  // No coach ever nominates anything. Whenever two or more different
  // coaches independently end up with an exercise of the same name (case/
  // whitespace insensitive), that convergence is itself the signal --
  // surfaced to the admin as a candidate. Per-coach exercise privacy is
  // untouched: this only ever compares names, never shows one coach's
  // exercise details to another, and the admin only ever sees a count, not
  // which coaches. Runs after every create/rename so the queue stays live;
  // cheap full-table scan, fine at this app's scale.
  async detectTrendingExercises() {
    const tracked = await db
      .select({
        id: exerciseSubmissions.id,
        status: exerciseSubmissions.status,
        name: exercises.name,
      })
      .from(exerciseSubmissions)
      .innerJoin(exercises, eq(exerciseSubmissions.exerciseId, exercises.id));
    const resolvedNames = new Set(
      tracked.filter((r) => r.status !== "pending").map((r) => r.name.trim().toLowerCase()),
    );
    const pendingByName = new Map(
      tracked.filter((r) => r.status === "pending").map((r) => [r.name.trim().toLowerCase(), r.id]),
    );

    const allExercises = await db.query.exercises.findMany({ with: { coach: true } });
    const forgeNames = new Set(
      allExercises
        .filter((e) => e.coach.role === "admin")
        .map((e) => e.name.trim().toLowerCase()),
    );

    const groups = new Map<string, typeof allExercises>();
    for (const ex of allExercises) {
      if (ex.coach.role !== "coach") continue;
      const key = ex.name.trim().toLowerCase();
      if (resolvedNames.has(key) || forgeNames.has(key)) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ex);
    }

    // A pending candidate whose coach count has since dropped below 2
    // (someone deleted or renamed their copy) no longer belongs in the
    // queue -- remove it rather than leave a stale nag.
    for (const [key, pendingId] of pendingByName) {
      const group = groups.get(key);
      if (!group || new Set(group.map((e) => e.coachId)).size < 2) {
        await db.delete(exerciseSubmissions).where(eq(exerciseSubmissions.id, pendingId));
      }
    }

    for (const [key, group] of groups) {
      const distinctCoachIds = new Set(group.map((e) => e.coachId));
      if (distinctCoachIds.size < 2) continue;
      const existingId = pendingByName.get(key);
      if (existingId) {
        await db
          .update(exerciseSubmissions)
          .set({ coachCount: distinctCoachIds.size })
          .where(eq(exerciseSubmissions.id, existingId));
      } else {
        const earliest = group.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
        await db.insert(exerciseSubmissions).values({
          exerciseId: earliest.id,
          submittedBy: earliest.coachId,
          coachCount: distinctCoachIds.size,
        });
      }
    }
  },

  async getPendingSubmissionsForAdmin() {
    const rows = await db.query.exerciseSubmissions.findMany({
      where: eq(exerciseSubmissions.status, "pending"),
      orderBy: asc(exerciseSubmissions.createdAt),
      with: { exercise: true },
    });
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      coachCount: r.coachCount,
      exercise: {
        id: r.exercise.id,
        name: r.exercise.name,
        category: r.exercise.category,
        muscleGroup: r.exercise.muscleGroup,
        movementType: r.exercise.movementType,
        laterality: r.exercise.laterality,
        equipment: r.exercise.equipment,
        instructions: r.exercise.instructions,
        videoUrl: r.exercise.videoUrl,
      },
    }));
  },

  async resolveSubmission(id: number, approve: boolean, adminId: number, name?: string) {
    const submission = await db.query.exerciseSubmissions.findFirst({
      where: eq(exerciseSubmissions.id, id),
    });
    if (!submission) return null;
    if (approve) {
      await db
        .update(exercises)
        .set({ coachId: adminId, ...(name ? { name } : {}) })
        .where(eq(exercises.id, submission.exerciseId));
    }
    const [row] = await db
      .update(exerciseSubmissions)
      .set({ status: approve ? "approved" : "rejected", resolvedAt: new Date() })
      .where(eq(exerciseSubmissions.id, id))
      .returning();
    return row;
  },

  // ---------- Exercise reports (coach flags a Forge exercise) ----------
  async createExerciseReport(
    exerciseId: number,
    reportedBy: number,
    input: CreateExerciseReportInput,
  ) {
    const [row] = await db
      .insert(exerciseReports)
      .values({
        exerciseId,
        reportedBy,
        issueType: input.issueType,
        note: input.note || null,
      })
      .returning();
    return row;
  },

  async getOpenReportsForAdmin() {
    const rows = await db.query.exerciseReports.findMany({
      where: eq(exerciseReports.status, "open"),
      orderBy: asc(exerciseReports.createdAt),
      with: { exercise: true, reporter: true },
    });
    return rows.map((r) => ({
      id: r.id,
      issueType: r.issueType,
      note: r.note,
      createdAt: r.createdAt,
      exercise: {
        id: r.exercise.id,
        name: r.exercise.name,
        category: r.exercise.category,
        muscleGroup: r.exercise.muscleGroup,
        movementType: r.exercise.movementType,
        laterality: r.exercise.laterality,
        equipment: r.exercise.equipment,
        instructions: r.exercise.instructions,
        videoUrl: r.exercise.videoUrl,
      },
      reporter: { id: r.reporter.id, name: r.reporter.name },
    }));
  },

  async resolveReport(id: number) {
    const [row] = await db
      .update(exerciseReports)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(eq(exerciseReports.id, id))
      .returning();
    return row;
  },

  // ---------- Programs ----------
  // System-wide, unfiltered -- same idempotency purpose as getAllExercises:
  // a program's owner/name can change after seeding (e.g. handed to the
  // admin and renamed as Forge-official), so a seed script checking "does
  // this exist yet" needs to look everywhere, not just under whichever
  // account originally created it.
  async getAllPrograms() {
    return db.query.programs.findMany();
  },

  // A single owner's own programs -- used by both a coach's private bank
  // and an admin's Forge program library (same query, different owner id).
  async getProgramsByCoach(coachId: number) {
    const progs = await db.query.programs.findMany({
      where: eq(programs.coachId, coachId),
      with: {
        weeks: { with: { days: true } },
        assignments: true,
      },
      orderBy: desc(programs.createdAt),
    });
    return progs.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      createdAt: p.createdAt,
      weekCount: p.weeks.length,
      dayCount: p.weeks.reduce((acc, w) => acc + w.days.length, 0),
      assignedAthleteCount: new Set(p.assignments.map((a) => a.athleteId)).size,
    }));
  },

  // A coach's own programs plus every Forge-official (admin-created) one --
  // same Forge-tagging model as getVisibleExercisesForCoach.
  async getVisibleProgramsForCoach(coachId: number) {
    const admins = await db.query.users.findMany({ where: eq(users.role, "admin") });
    const ownerIds = Array.from(new Set([coachId, ...admins.map((a) => a.id)]));
    const progs = await db.query.programs.findMany({
      where: inArray(programs.coachId, ownerIds),
      with: {
        weeks: { with: { days: true } },
        assignments: true,
        coach: true,
      },
      orderBy: desc(programs.createdAt),
    });
    return progs.map((p) => {
      const { weeks, assignments, ...ownership } = this.withOwnership(p, coachId);
      return {
        ...ownership,
        weekCount: weeks.length,
        dayCount: weeks.reduce((acc, w) => acc + w.days.length, 0),
        assignedAthleteCount: new Set(assignments.map((a) => a.athleteId)).size,
      };
    });
  },

  async getProgramFull(id: number) {
    return db.query.programs.findFirst({
      where: eq(programs.id, id),
      with: {
        weeks: {
          orderBy: asc(programWeeks.weekNumber),
          with: {
            days: {
              orderBy: asc(programDays.dayNumber),
              with: {
                exercises: {
                  orderBy: asc(programExercises.orderIndex),
                  with: { exercise: true },
                },
              },
            },
          },
        },
      },
    });
  },

  // Detail view for a program a coach may only look at, not necessarily
  // edit -- their own programs, or any Forge-official one (read-only).
  // Returns null if the program doesn't exist or isn't visible to them at
  // all (someone else's private program).
  async getVisibleProgramDetail(id: number, requestingUserId: number) {
    const program = await db.query.programs.findFirst({
      where: eq(programs.id, id),
      with: {
        coach: true,
        weeks: {
          orderBy: asc(programWeeks.weekNumber),
          with: {
            days: {
              orderBy: asc(programDays.dayNumber),
              with: {
                exercises: {
                  orderBy: asc(programExercises.orderIndex),
                  with: { exercise: true },
                },
              },
            },
          },
        },
      },
    });
    if (!program) return null;
    const isForgeOfficial = program.coach.role === "admin";
    if (program.coachId !== requestingUserId && !isForgeOfficial) return null;
    return this.withOwnership(program, requestingUserId);
  },

  // A program a coach may assign to their athletes -- their own, or any
  // Forge-official template. Distinct from edit/delete ownership, which
  // stays strictly "created by this exact user" (assertCoachOwnsProgram).
  async getProgramIfUsableByCoach(coachId: number, programId: number) {
    const program = await db.query.programs.findFirst({
      where: eq(programs.id, programId),
      with: { coach: true },
    });
    if (!program) return null;
    const isForgeOfficial = program.coach.role === "admin";
    if (program.coachId !== coachId && !isForgeOfficial) return null;
    return program;
  },

  async createProgramWithStructure(
    coachId: number,
    structure: ProgramStructureInput,
  ) {
    return db.transaction(async (tx) => {
      const [program] = await tx
        .insert(programs)
        .values({
          coachId,
          name: structure.name,
          description: structure.description ?? null,
        })
        .returning();

      for (const week of structure.weeks) {
        const [weekRow] = await tx
          .insert(programWeeks)
          .values({
            programId: program.id,
            weekNumber: week.weekNumber,
            name: week.name ?? null,
          })
          .returning();

        for (const day of week.days) {
          const [dayRow] = await tx
            .insert(programDays)
            .values({
              weekId: weekRow.id,
              dayNumber: day.dayNumber,
              title: day.title,
              isRestDay: day.isRestDay,
            })
            .returning();

          for (const ex of day.exercises) {
            await tx.insert(programExercises).values({
              dayId: dayRow.id,
              exerciseId: ex.exerciseId,
              orderIndex: ex.orderIndex,
              sets: ex.sets,
              reps: ex.reps,
              weight: ex.weight ?? null,
              restSeconds: ex.restSeconds ?? null,
              notes: ex.notes ?? null,
              supersetGroup: ex.supersetGroup ?? null,
              trackingLevel: ex.trackingLevel ?? "none",
              videoCheckEnabled: ex.videoCheckEnabled ?? false,
            });
          }
        }
      }

      return program;
    });
  },

  // Returns a draft program structure shaped exactly like
  // ProgramStructureInput -- the caller POSTs it to the normal
  // createProgramWithStructure route just like the manual "Create & Build"
  // and "Duplicate" flows already do, dropping the coach straight into the
  // full builder to review, edit, or delete anything before it's ever
  // assigned to an athlete. This function itself never assigns a program to
  // anyone -- that stays a separate, explicit coach action.
  async generateProgramDraft(coachId: number, prompt: string): Promise<ProgramStructureInput | null> {
    const visibleExercises = await this.getVisibleExercisesForCoach(coachId);
    if (visibleExercises.length === 0) return null;
    const validIds = visibleExercises.map((e) => e.id);
    const catalog = visibleExercises
      .map((e) => `${e.id}: ${e.name} (${e.category}, ${e.muscleGroup})`)
      .join("\n");

    const tool = {
      name: "generate_program_draft",
      description: "Generates a draft strength & conditioning program structure using only the provided exercise IDs.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          weeks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                weekNumber: { type: "integer" },
                name: { type: "string" },
                days: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      dayNumber: { type: "integer" },
                      title: { type: "string" },
                      isRestDay: { type: "boolean" },
                      exercises: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            exerciseId: { type: "integer", enum: validIds },
                            sets: { type: "integer" },
                            reps: { type: "string" },
                            weight: { type: "string" },
                            restSeconds: { type: "integer" },
                            notes: { type: "string" },
                          },
                          required: ["exerciseId", "sets", "reps"],
                        },
                      },
                    },
                    required: ["dayNumber", "title", "isRestDay", "exercises"],
                  },
                },
              },
              required: ["weekNumber", "days"],
            },
          },
        },
        required: ["name", "weeks"],
      },
    };

    const system = `You are a strength and conditioning program design assistant helping a coach draft a new training program. Ground the program entirely in the coach's request and the exercise catalog you're given -- you may ONLY reference exercise IDs from that catalog, never invent an exercise or its ID. Design a sensible, appropriately periodized structure (reasonable set/rep schemes, rest days where appropriate, progression across weeks if multiple weeks are implied). This is a draft the coach will review and edit before it's ever shown to an athlete, so favor a complete, usable starting point over asking clarifying questions.`;

    const userPrompt = `Coach's request: "${prompt}"

Available exercises (id: name (category, muscle group)) -- you may ONLY use exercise IDs from this list:
${catalog}

Design a complete draft program matching the coach's request.`;

    type RawDraft = {
      name?: string;
      description?: string;
      weeks?: {
        weekNumber?: number;
        name?: string;
        days?: {
          dayNumber?: number;
          title?: string;
          isRestDay?: boolean;
          exercises?: {
            exerciseId: number;
            sets?: number;
            reps?: string;
            weight?: string;
            restSeconds?: number;
            notes?: string;
          }[];
        }[];
      }[];
    };

    const draft = await askClaudeStructured<RawDraft>(system, userPrompt, tool, { maxTokens: 4096 });
    if (!draft) return null;

    const validIdSet = new Set(validIds);
    return {
      name: draft.name?.trim() || "AI Draft Program",
      description: draft.description?.trim() || null,
      weeks: (draft.weeks ?? []).map((w, wi) => ({
        weekNumber: w.weekNumber ?? wi + 1,
        name: w.name ?? null,
        days: (w.days ?? []).map((d, di) => ({
          dayNumber: d.dayNumber ?? di + 1,
          title: d.title?.trim() || "Training Day",
          isRestDay: Boolean(d.isRestDay),
          exercises: (d.exercises ?? [])
            .filter((ex) => validIdSet.has(ex.exerciseId))
            .map((ex, ei) => ({
              exerciseId: ex.exerciseId,
              orderIndex: ei,
              sets: ex.sets ?? 3,
              reps: ex.reps || "10",
              weight: ex.weight || null,
              restSeconds: ex.restSeconds ?? null,
              notes: ex.notes || null,
            })),
        })),
      })),
    };
  },

  async updateProgramStructure(
    programId: number,
    structure: ProgramStructureInput,
  ) {
    return db.transaction(async (tx) => {
      await tx
        .update(programs)
        .set({
          name: structure.name,
          description: structure.description ?? null,
        })
        .where(eq(programs.id, programId));

      // Simplest consistent approach: wipe and rebuild the structure.
      await tx.delete(programWeeks).where(eq(programWeeks.programId, programId));

      for (const week of structure.weeks) {
        const [weekRow] = await tx
          .insert(programWeeks)
          .values({
            programId,
            weekNumber: week.weekNumber,
            name: week.name ?? null,
          })
          .returning();

        for (const day of week.days) {
          const [dayRow] = await tx
            .insert(programDays)
            .values({
              weekId: weekRow.id,
              dayNumber: day.dayNumber,
              title: day.title,
              isRestDay: day.isRestDay,
            })
            .returning();

          for (const ex of day.exercises) {
            await tx.insert(programExercises).values({
              dayId: dayRow.id,
              exerciseId: ex.exerciseId,
              orderIndex: ex.orderIndex,
              sets: ex.sets,
              reps: ex.reps,
              weight: ex.weight ?? null,
              restSeconds: ex.restSeconds ?? null,
              notes: ex.notes ?? null,
              supersetGroup: ex.supersetGroup ?? null,
              trackingLevel: ex.trackingLevel ?? "none",
              videoCheckEnabled: ex.videoCheckEnabled ?? false,
            });
          }
        }
      }
    });
  },

  async deleteProgram(id: number) {
    await db.delete(programs).where(eq(programs.id, id));
  },

  // ---------- AI conversational program builder (admin only) ----------
  // Full transcript for a program's AI chat, oldest first.
  async getProgramChatMessages(programId: number) {
    const rows = await db.query.programChatMessages.findMany({
      where: eq(programChatMessages.programId, programId),
      orderBy: desc(programChatMessages.createdAt),
    });
    return rows.reverse();
  },

  // Admin-only conversational program builder. Every turn, the AI gets the
  // full chat history plus the program's *current* structure and must emit
  // a complete replacement structure -- never a diff -- which is applied via
  // the same wipe-and-rebuild updateProgramStructure the manual builder
  // uses. Unlike the coach-facing AI Assist (generateProgramDraft, which
  // only ever returns a draft for the coach to review before it touches a
  // real program) and the athlete chat (advice-only, never edits a
  // program), this auto-applies every turn with no review step -- that's
  // deliberate: it's scoped to the trusted admin role building/editing a
  // program for their own personal training, not a coach acting on a minor
  // athlete's behalf.
  async generateProgramFromChat(programId: number, authorId: number, content: string) {
    const [userMessage] = await db
      .insert(programChatMessages)
      .values({ programId, authorId, role: "user", content })
      .returning();

    const fail = async (text: string) => {
      const [assistantMessage] = await db
        .insert(programChatMessages)
        .values({ programId, authorId, role: "assistant", content: text })
        .returning();
      return { userMessage, assistantMessage, program: await this.getProgramFull(programId) };
    };

    if (!aiEnabled) {
      return fail("AI isn't set up yet -- ask whoever manages this Forge instance to configure it.");
    }

    const [program, history, visibleExercises] = await Promise.all([
      this.getProgramFull(programId),
      this.getProgramChatMessages(programId),
      this.getVisibleExercisesForCoach(authorId),
    ]);
    if (!program) return fail("Couldn't find that program anymore.");
    if (visibleExercises.length === 0) {
      return fail("There aren't any exercises available to build with yet.");
    }

    const validIds = visibleExercises.map((e) => e.id);
    const validIdSet = new Set(validIds);
    const catalog = visibleExercises
      .map((e) => `${e.id}: ${e.name} (${e.category}, ${e.muscleGroup})`)
      .join("\n");

    const currentStructure = {
      name: program.name,
      description: program.description,
      weeks: program.weeks.map((w) => ({
        weekNumber: w.weekNumber,
        name: w.name,
        days: w.days.map((d) => ({
          dayNumber: d.dayNumber,
          title: d.title,
          isRestDay: d.isRestDay,
          exercises: d.exercises.map((ex) => ({
            exerciseId: ex.exerciseId,
            exerciseName: ex.exercise.name,
            sets: ex.sets,
            reps: ex.reps,
            weight: ex.weight,
            restSeconds: ex.restSeconds,
            notes: ex.notes,
            supersetGroup: ex.supersetGroup,
            videoCheckEnabled: ex.videoCheckEnabled,
          })),
        })),
      })),
    };

    const tool = {
      name: "update_program",
      description:
        "Replaces the entire program structure with a new one reflecting the requested changes, and writes a short chat reply summarizing what changed.",
      input_schema: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description:
              "A short (1-4 sentence) chat reply describing what you changed and why, written conversationally to the person you're building this for.",
          },
          name: { type: "string" },
          description: { type: "string" },
          weeks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                weekNumber: { type: "integer" },
                name: { type: "string" },
                days: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      dayNumber: { type: "integer" },
                      title: { type: "string" },
                      isRestDay: { type: "boolean" },
                      exercises: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            exerciseId: { type: "integer", enum: validIds },
                            sets: { type: "integer" },
                            reps: { type: "string" },
                            weight: { type: "string" },
                            restSeconds: { type: "integer" },
                            notes: { type: "string" },
                            supersetGroup: { type: "string" },
                            videoCheckEnabled: {
                              type: "boolean",
                              description:
                                "Set true when the user asks for a form check / video check on this exercise. This triggers the app's own recording flow and an AI form-check review once they submit a video -- you never generate this feedback yourself, just flip the flag.",
                            },
                          },
                          required: ["exerciseId", "sets", "reps"],
                        },
                      },
                    },
                    required: ["dayNumber", "title", "isRestDay", "exercises"],
                  },
                },
              },
              required: ["weekNumber", "days"],
            },
          },
        },
        required: ["summary", "name", "weeks"],
      },
    };

    const system = `You are a strength and conditioning program design assistant, chatting directly with the person who owns this program and trains themselves with it. You may ONLY reference exercise IDs from the catalog you're given -- never invent an exercise or its ID. On every turn you must emit the COMPLETE program structure exactly as it should exist after this turn's changes, not just what changed -- anything you omit will be deleted, so carry forward everything the user didn't ask you to change. Keep sensible periodization (rest days, reasonable set/rep schemes, sensible progression across weeks). If they ask for a "form check" or "video check" on an exercise, set that exercise's videoCheckEnabled to true (and leave it true on anything it was already true for, unless they ask you to turn it off). Also write a short, conversational summary of what you changed.`;

    const historyText = history
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const userPrompt = `Available exercises (id: name (category, muscle group)) -- you may ONLY use exercise IDs from this list:
${catalog}

Current program structure:
${JSON.stringify(currentStructure)}

Conversation so far:
${historyText}

Respond to the user's latest message by producing the complete updated program structure and a short summary of what you changed.`;

    type RawUpdate = {
      summary?: string;
      name?: string;
      description?: string;
      weeks?: {
        weekNumber?: number;
        name?: string;
        days?: {
          dayNumber?: number;
          title?: string;
          isRestDay?: boolean;
          exercises?: {
            exerciseId: number;
            sets?: number;
            reps?: string;
            weight?: string;
            restSeconds?: number;
            notes?: string;
            supersetGroup?: string;
            videoCheckEnabled?: boolean;
          }[];
        }[];
      }[];
    };

    const result = await askClaudeStructured<RawUpdate>(system, userPrompt, tool, { maxTokens: 4096 });
    if (!result) {
      return fail("Sorry, I couldn't come up with an update just now -- try again in a bit.");
    }

    const structure: ProgramStructureInput = {
      name: result.name?.trim() || program.name,
      description: result.description?.trim() || null,
      weeks: (result.weeks ?? []).map((w, wi) => ({
        weekNumber: w.weekNumber ?? wi + 1,
        name: w.name ?? null,
        days: (w.days ?? []).map((d, di) => ({
          dayNumber: d.dayNumber ?? di + 1,
          title: d.title?.trim() || "Training Day",
          isRestDay: Boolean(d.isRestDay),
          exercises: (d.exercises ?? [])
            .filter((ex) => validIdSet.has(ex.exerciseId))
            .map((ex, ei) => ({
              exerciseId: ex.exerciseId,
              orderIndex: ei,
              sets: ex.sets ?? 3,
              reps: ex.reps || "10",
              weight: ex.weight || null,
              restSeconds: ex.restSeconds ?? null,
              notes: ex.notes || null,
              supersetGroup: ex.supersetGroup || null,
              videoCheckEnabled: ex.videoCheckEnabled ?? false,
            })),
        })),
      })),
    };

    await this.updateProgramStructure(programId, structure);
    // Marks the program as AI-authored permanently -- see the schema
    // comment on programs.aiAuthored for why this never gets cleared.
    await db.update(programs).set({ aiAuthored: true }).where(eq(programs.id, programId));

    const [assistantMessage] = await db
      .insert(programChatMessages)
      .values({
        programId,
        authorId,
        role: "assistant",
        content: result.summary?.trim() || "Updated the program.",
      })
      .returning();

    return { userMessage, assistantMessage, program: await this.getProgramFull(programId) };
  },

  // "Full function" AI form check: a direct, unsupervised critique from
  // still frames of a recorded set, written into the same chat transcript
  // as the program builder so it reads as one continuous assistant-coach
  // conversation. Deliberately gated on aiAuthored -- this is the one place
  // in the app where the AI critiques technique with no human review step
  // at all, which is only safe because it's scoped to a program the AI
  // itself already builds/edits for its own owner, never a coach's program
  // or an athlete under a coach's supervision (compare the athlete chat's
  // hard rule to never give unsupervised training directives).
  async submitFormCheck(
    programId: number,
    authorId: number,
    exerciseName: string,
    images: { mediaType: "image/jpeg" | "image/png"; data: string }[],
  ) {
    const program = await this.getProgramFull(programId);
    if (!program || !program.aiAuthored) return null;

    const [userMessage] = await db
      .insert(programChatMessages)
      .values({
        programId,
        authorId,
        role: "user",
        content: `[Form check requested: ${exerciseName}]`,
      })
      .returning();

    const reply = async (text: string) => {
      const [assistantMessage] = await db
        .insert(programChatMessages)
        .values({ programId, authorId, role: "assistant", content: text })
        .returning();
      return { userMessage, assistantMessage };
    };

    if (!aiEnabled || images.length === 0) {
      return reply("AI isn't set up yet -- ask whoever manages this Forge instance to configure it.");
    }

    const system = `You are a strength coach reviewing still frames captured from someone's own training video, sent directly to you for feedback with no other coach in the loop -- you are their only coach for this. Give a direct, specific, encouraging critique of their technique on "${exerciseName}": what looks solid, and 1-3 concrete cues to fix anything that doesn't. Base everything strictly on what's visible in the frames -- if the images don't show enough to say anything useful (bad angle, too blurry, wrong exercise), say so plainly instead of guessing. Keep it to 3-5 sentences, talk to them as "you", no preamble.`;

    const text = await askClaudeVision(
      system,
      `Here are frames from a set of ${exerciseName}. What do you see?`,
      images,
      { maxTokens: 400 },
    );

    return reply(
      text?.trim() ?? "Couldn't get a read on that video -- try again with a clearer angle.",
    );
  },

  async getProgramDayForCoach(coachId: number, dayId: number) {
    const day = await db.query.programDays.findFirst({
      where: eq(programDays.id, dayId),
      with: {
        exercises: {
          orderBy: asc(programExercises.orderIndex),
          with: { exercise: true },
        },
        week: { with: { program: true } },
      },
    });
    if (!day || day.week.program.coachId !== coachId) return undefined;
    return {
      id: day.id,
      title: day.title,
      isRestDay: day.isRestDay,
      dayNumber: day.dayNumber,
      programId: day.week.program.id,
      programName: day.week.program.name,
      weekNumber: day.week.weekNumber,
      exercises: day.exercises,
    };
  },

  // Read-only counterpart to getProgramDayForCoach -- also allows viewing a
  // day (and posting/reading comments on it) for a Forge-official program
  // the coach has assigned to one of their athletes, even though they don't
  // own the program itself. Editing (getProgramDayForCoach, used by the PUT
  // route) stays strictly owner-only so a coach can never modify shared
  // official content just because they assigned it.
  async getProgramDayForCoachView(coachId: number, dayId: number) {
    const day = await db.query.programDays.findFirst({
      where: eq(programDays.id, dayId),
      with: {
        exercises: {
          orderBy: asc(programExercises.orderIndex),
          with: { exercise: true },
        },
        week: { with: { program: true } },
      },
    });
    if (!day) return undefined;
    if (day.week.program.coachId !== coachId) {
      const hasAssignment = await db.query.assignments.findFirst({
        where: and(
          eq(assignments.coachId, coachId),
          eq(assignments.programId, day.week.program.id),
        ),
      });
      if (!hasAssignment) return undefined;
    }
    return {
      id: day.id,
      title: day.title,
      isRestDay: day.isRestDay,
      dayNumber: day.dayNumber,
      programId: day.week.program.id,
      programName: day.week.program.name,
      weekNumber: day.week.weekNumber,
      exercises: day.exercises,
    };
  },

  async updateProgramDay(dayId: number, input: UpdateProgramDayInput) {
    return db.transaction(async (tx) => {
      await tx
        .update(programDays)
        .set({ title: input.title, isRestDay: input.isRestDay })
        .where(eq(programDays.id, dayId));

      await tx.delete(programExercises).where(eq(programExercises.dayId, dayId));

      if (input.exercises.length > 0) {
        await tx.insert(programExercises).values(
          input.exercises.map((ex, i) => ({
            dayId,
            exerciseId: ex.exerciseId,
            orderIndex: ex.orderIndex ?? i,
            sets: ex.sets,
            reps: ex.reps,
            weight: ex.weight ?? null,
            restSeconds: ex.restSeconds ?? null,
            notes: ex.notes ?? null,
            supersetGroup: ex.supersetGroup ?? null,
            trackingLevel: ex.trackingLevel ?? "none",
            videoCheckEnabled: ex.videoCheckEnabled ?? false,
          })),
        );
      }
    });
  },

  // ---------- Assignments ----------
  async createAssignment(
    coachId: number,
    programId: number,
    athletes: { athleteId: number; correctivesEnabled: boolean }[],
    startDate: string,
    dateOverrides?: Record<string, string>,
  ) {
    // Re-assigning a program an athlete already has (or has finished) is
    // intentional -- e.g. running the same block again -- so every request
    // creates a fresh assignment. The newest one wins on any calendar date
    // it overlaps with an older assignment (see reconcileOverlappingAssignments).
    const created = athletes.length
      ? await db
          .insert(assignments)
          .values(
            athletes.map((a) => ({
              coachId,
              programId,
              athleteId: a.athleteId,
              startDate,
              correctivesEnabled: a.correctivesEnabled,
              dateOverrides: dateOverrides && Object.keys(dateOverrides).length ? dateOverrides : null,
            })),
          )
          .returning()
      : [];

    return { created };
  },

  async getAssignmentForCoach(coachId: number, assignmentId: number) {
    return db.query.assignments.findFirst({
      where: and(eq(assignments.id, assignmentId), eq(assignments.coachId, coachId)),
    });
  },

  async updateAssignment(assignmentId: number, input: UpdateAssignmentInput) {
    const [row] = await db
      .update(assignments)
      .set({ correctivesEnabled: input.correctivesEnabled })
      .where(eq(assignments.id, assignmentId))
      .returning();
    return row;
  },

  async getAssignmentsForCoach(coachId: number) {
    const rows = await db.query.assignments.findMany({
      where: eq(assignments.coachId, coachId),
      with: { program: true, athlete: true },
      orderBy: desc(assignments.createdAt),
    });
    // `with: { athlete: true }` pulls the full user row -- strip
    // passwordHash before this reaches a response.
    return rows.map((a) => {
      const { passwordHash, ...athlete } = a.athlete;
      return { ...a, athlete };
    });
  },

  async getAssignmentFull(id: number) {
    const assignment = await db.query.assignments.findFirst({
      where: eq(assignments.id, id),
    });
    if (!assignment) return undefined;
    const program = await this.getProgramFull(assignment.programId);
    return { assignment, program };
  },

  // ---------- Correctives ----------
  async getCorrectivesForAssignmentDay(assignmentId: number, programDayId: number) {
    return db.query.assignmentCorrectives.findMany({
      where: and(
        eq(assignmentCorrectives.assignmentId, assignmentId),
        eq(assignmentCorrectives.programDayId, programDayId),
      ),
      orderBy: asc(assignmentCorrectives.orderIndex),
      with: { exercise: true },
    });
  },

  async updateCorrectivesForAssignmentDay(
    assignmentId: number,
    programDayId: number,
    input: UpdateCorrectivesInput,
  ) {
    return db.transaction(async (tx) => {
      await tx
        .delete(assignmentCorrectives)
        .where(
          and(
            eq(assignmentCorrectives.assignmentId, assignmentId),
            eq(assignmentCorrectives.programDayId, programDayId),
          ),
        );

      if (input.correctives.length > 0) {
        await tx.insert(assignmentCorrectives).values(
          input.correctives.map((c, i) => ({
            assignmentId,
            programDayId,
            exerciseId: c.exerciseId,
            orderIndex: c.orderIndex ?? i,
            sets: c.sets,
            reps: c.reps,
            weight: c.weight ?? null,
            restSeconds: c.restSeconds ?? null,
            notes: c.notes ?? null,
          })),
        );
      }
    });
  },

  // Every non-rest day in a program, in order, with its week/day position
  // and the calendar date that position would land on for a given start
  // date -- the raw material for the manual-schedule editor in the assign
  // dialog (a coach adjusting individual days for games/travel/rest).
  async getProgramSchedule(programId: number, startDate: string) {
    const program = await this.getProgramFull(programId);
    if (!program) return [];
    const schedule: {
      programDayId: number;
      weekNumber: number;
      dayNumber: number;
      title: string;
      defaultDate: string;
    }[] = [];
    for (const week of program.weeks) {
      for (const day of week.days) {
        if (day.isRestDay) continue;
        const offset = (week.weekNumber - 1) * 7 + (day.dayNumber - 1);
        schedule.push({
          programDayId: day.id,
          weekNumber: week.weekNumber,
          dayNumber: day.dayNumber,
          title: day.title,
          defaultDate: formatISO(addDays(parseISO(startDate), offset), {
            representation: "date",
          }),
        });
      }
    }
    return schedule;
  },

  // Groups a program's non-rest days by title -- e.g. every "Lower Body
  // Strength" day across all weeks in one group, every "Upper Body
  // Push/Pull" day in another -- so the quick-start correctives flow can
  // ask for different correctives per day type instead of one blanket list.
  async getNonRestDayGroups(programId: number) {
    const program = await this.getProgramFull(programId);
    if (!program) return [];
    const groups = new Map<string, number[]>();
    for (const week of program.weeks) {
      for (const day of week.days) {
        if (day.isRestDay) continue;
        const ids = groups.get(day.title) ?? [];
        ids.push(day.id);
        groups.set(day.title, ids);
      }
    }
    return Array.from(groups.entries()).map(([title, programDayIds]) => ({
      title,
      programDayIds,
    }));
  },

  // Quick-start default for a freshly created assignment: apply one
  // corrective list to a specific set of days at once (typically all days
  // sharing a title, from getNonRestDayGroups), so a coach can set
  // correctives during the assign flow instead of visiting each day on the
  // calendar individually. Only ever touches days that actually belong to
  // this assignment's own program. Fine-tuning specific days afterward
  // still works the same as before via updateCorrectivesForAssignmentDay.
  async applyCorrectivesToDays(
    assignmentId: number,
    programDayIds: number[],
    correctives: UpdateCorrectivesInput["correctives"],
  ) {
    const assignment = await db.query.assignments.findFirst({
      where: eq(assignments.id, assignmentId),
    });
    if (!assignment) return;
    const program = await this.getProgramFull(assignment.programId);
    if (!program) return;
    const validDayIds = new Set(
      program.weeks.flatMap((w) => w.days.filter((d) => !d.isRestDay).map((d) => d.id)),
    );
    for (const dayId of programDayIds) {
      if (!validDayIds.has(dayId)) continue;
      await this.updateCorrectivesForAssignmentDay(assignmentId, dayId, { correctives });
    }
  },

  async copyCorrectivesToDays(
    assignmentId: number,
    sourceProgramDayId: number,
    targetProgramDayIds: number[],
  ) {
    const source = await this.getCorrectivesForAssignmentDay(
      assignmentId,
      sourceProgramDayId,
    );
    for (const dayId of targetProgramDayIds) {
      await db.transaction(async (tx) => {
        await tx
          .delete(assignmentCorrectives)
          .where(
            and(
              eq(assignmentCorrectives.assignmentId, assignmentId),
              eq(assignmentCorrectives.programDayId, dayId),
            ),
          );
        if (source.length > 0) {
          await tx.insert(assignmentCorrectives).values(
            source.map((c, i) => ({
              assignmentId,
              programDayId: dayId,
              exerciseId: c.exerciseId,
              orderIndex: i,
              sets: c.sets,
              reps: c.reps,
              weight: c.weight,
              restSeconds: c.restSeconds,
              notes: c.notes,
            })),
          );
        }
      });
    }
  },

  async getRecentCorrectivesForAthlete(
    coachId: number,
    athleteId: number,
    limit = 10,
  ) {
    const rows = await db
      .select({
        exerciseId: assignmentCorrectives.exerciseId,
        createdAt: assignmentCorrectives.createdAt,
      })
      .from(assignmentCorrectives)
      .innerJoin(assignments, eq(assignmentCorrectives.assignmentId, assignments.id))
      .where(and(eq(assignments.athleteId, athleteId), eq(assignments.coachId, coachId)))
      .orderBy(desc(assignmentCorrectives.createdAt));

    const seen = new Set<number>();
    const distinctIds: number[] = [];
    for (const r of rows) {
      if (!seen.has(r.exerciseId)) {
        seen.add(r.exerciseId);
        distinctIds.push(r.exerciseId);
      }
      if (distinctIds.length >= limit) break;
    }
    if (distinctIds.length === 0) return [];
    const rowsById = await db.query.exercises.findMany({
      where: inArray(exercises.id, distinctIds),
    });
    const byId = new Map(rowsById.map((e) => [e.id, e]));
    return distinctIds.map((id) => byId.get(id)).filter((e): e is typeof rowsById[number] => !!e);
  },

  // ---------- Workout comments ----------
  async getAssignmentForAthlete(athleteId: number, assignmentId: number) {
    return db.query.assignments.findFirst({
      where: and(eq(assignments.id, assignmentId), eq(assignments.athleteId, athleteId)),
    });
  },

  async getWorkoutComments(assignmentId: number, programDayId: number) {
    const rows = await db.query.workoutComments.findMany({
      where: and(
        eq(workoutComments.assignmentId, assignmentId),
        eq(workoutComments.programDayId, programDayId),
      ),
      orderBy: asc(workoutComments.createdAt),
      with: { author: true },
    });
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      videoUrl: r.videoUrl,
      imageUrl: r.imageUrl,
      createdAt: r.createdAt,
      author: { id: r.author.id, name: r.author.name, role: r.author.role },
    }));
  },

  async addWorkoutComment(
    assignmentId: number,
    programDayId: number,
    authorId: number,
    input: CreateWorkoutCommentInput,
  ) {
    const [row] = await db
      .insert(workoutComments)
      .values({
        assignmentId,
        programDayId,
        authorId,
        body: input.body,
        videoUrl: input.videoUrl || null,
        imageUrl: input.imageUrl || null,
      })
      .returning();
    const author = await db.query.users.findFirst({ where: eq(users.id, authorId) });
    return {
      id: row.id,
      body: row.body,
      videoUrl: row.videoUrl,
      imageUrl: row.imageUrl,
      createdAt: row.createdAt,
      author: { id: author!.id, name: author!.name, role: author!.role },
    };
  },

  // ---------- Password reset ----------
  // Invalidates any earlier outstanding tokens for this user first, so only
  // the most recently requested link ever works. Returns the raw token --
  // it's never persisted, only its hash is.
  async createPasswordResetToken(userId: number) {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db.insert(passwordResetTokens).values({
      userId,
      tokenHash: hashResetToken(token),
      expiresAt,
    });
    return token;
  },

  async getValidPasswordResetToken(rawToken: string) {
    const tokenHash = hashResetToken(rawToken);
    const row = await db.query.passwordResetTokens.findFirst({
      where: and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    });
    return row ?? null;
  },

  async consumePasswordResetToken(tokenId: number, userId: number, newPasswordHash: string) {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash: newPasswordHash })
        .where(eq(users.id, userId));
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, tokenId));
    });
  },

  // ---------- Notifications ----------
  // Deliberately narrow: only ever created for a coach when an athlete
  // comments or attaches a video (see the call site in routes.ts) -- never
  // for program completions or team-wide activity, by design.
  async createNotification(
    userId: number,
    type: string,
    title: string,
    body: string,
    link?: string,
  ) {
    const [row] = await db
      .insert(notifications)
      .values({ userId, type, title, body, link: link ?? null })
      .returning();
    return row;
  },

  async getNotificationsForUser(userId: number, limit = 30) {
    return db.query.notifications.findMany({
      where: eq(notifications.userId, userId),
      orderBy: desc(notifications.createdAt),
      limit,
    });
  },

  async getUnreadNotificationCount(userId: number) {
    const rows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return rows.length;
  },

  async markAllNotificationsRead(userId: number) {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  },

  async updateNotificationPrefs(userId: number, input: UpdateNotificationPrefsInput) {
    const [row] = await db
      .update(users)
      .set({
        phone: input.phone ?? null,
        notifyEmail: input.notifyEmail,
        notifySms: input.notifySms,
      })
      .where(eq(users.id, userId))
      .returning();
    return row;
  },

  // ---------- Push subscriptions ----------
  // One row per browser/device; re-subscribing the same endpoint (e.g. the
  // user toggles the setting off and on) just no-ops rather than creating
  // a duplicate.
  async savePushSubscription(
    userId: number,
    endpoint: string,
    keys: { p256dh: string; auth: string },
  ) {
    const existing = await db.query.pushSubscriptions.findFirst({
      where: eq(pushSubscriptions.endpoint, endpoint),
    });
    if (existing) return existing;
    const [row] = await db
      .insert(pushSubscriptions)
      .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
      .returning();
    return row;
  },

  async removePushSubscription(endpoint: string) {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  },

  async getPushSubscriptionsForUser(userId: number) {
    return db.query.pushSubscriptions.findMany({
      where: eq(pushSubscriptions.userId, userId),
    });
  },

  // ---------- Calendar ----------
  async getCalendarForAthlete(
    athleteId: number,
    rangeStart: string,
    rangeEnd: string,
  ) {
    const athleteAssignments = await db.query.assignments.findMany({
      where: eq(assignments.athleteId, athleteId),
      with: {
        program: {
          with: {
            weeks: {
              with: {
                days: { with: { exercises: true } },
              },
            },
          },
        },
      },
    });

    const start = parseISO(rangeStart);
    const end = parseISO(rangeEnd);

    type CalendarEntry = {
      date: string;
      assignmentId: number;
      programDayId: number;
      programId: number;
      programName: string;
      title: string;
      isRestDay: boolean;
      exerciseCount: number;
      completed: boolean;
    };

    const entries: CalendarEntry[] = [];

    for (const a of athleteAssignments) {
      for (const week of a.program.weeks) {
        for (const day of week.days) {
          const date = resolveAssignmentDate(a, week.weekNumber, day.dayNumber, day.id);
          if (isWithinInterval(date, { start, end })) {
            entries.push({
              date: formatISO(date, { representation: "date" }),
              assignmentId: a.id,
              programDayId: day.id,
              programId: a.program.id,
              programName: a.program.name,
              title: day.title,
              isRestDay: day.isRestDay,
              exerciseCount: day.exercises.length,
              completed: false,
            });
          }
        }
      }
    }

    if (entries.length > 0) {
      const logs = await db.query.workoutLogs.findMany({
        where: and(
          eq(workoutLogs.athleteId, athleteId),
          inArray(
            workoutLogs.assignmentId,
            Array.from(new Set(entries.map((e) => e.assignmentId))),
          ),
        ),
      });
      const completedKeys = new Set(
        logs
          .filter((l) => l.completed)
          .map((l) => `${l.assignmentId}:${l.programDayId}:${l.date}`),
      );
      for (const e of entries) {
        if (completedKeys.has(`${e.assignmentId}:${e.programDayId}:${e.date}`)) {
          e.completed = true;
        }
      }
    }

    const createdAtByAssignment = new Map(
      athleteAssignments.map((a) => [a.id, new Date(a.createdAt)]),
    );
    const reconciled = reconcileOverlappingAssignments(entries, (e) => e.date, createdAtByAssignment);
    reconciled.sort((a, b) => a.date.localeCompare(b.date));
    return reconciled;
  },

  async getCalendarForCoach(
    coachId: number,
    rangeStart: string,
    rangeEnd: string,
    athleteId?: number,
  ) {
    const coachAssignments = await db.query.assignments.findMany({
      where: athleteId
        ? and(eq(assignments.coachId, coachId), eq(assignments.athleteId, athleteId))
        : eq(assignments.coachId, coachId),
      with: {
        athlete: true,
        program: {
          with: {
            weeks: {
              with: {
                days: { with: { exercises: true } },
              },
            },
          },
        },
      },
    });

    const start = parseISO(rangeStart);
    const end = parseISO(rangeEnd);

    type CoachCalendarEntry = {
      date: string;
      assignmentId: number;
      programDayId: number;
      programId: number;
      programName: string;
      athleteId: number;
      athleteName: string;
      title: string;
      isRestDay: boolean;
      exerciseCount: number;
      completed: boolean;
    };

    const entries: CoachCalendarEntry[] = [];

    for (const a of coachAssignments) {
      for (const week of a.program.weeks) {
        for (const day of week.days) {
          const date = resolveAssignmentDate(a, week.weekNumber, day.dayNumber, day.id);
          if (isWithinInterval(date, { start, end })) {
            entries.push({
              date: formatISO(date, { representation: "date" }),
              assignmentId: a.id,
              programDayId: day.id,
              programId: a.program.id,
              programName: a.program.name,
              athleteId: a.athlete.id,
              athleteName: a.athlete.name,
              title: day.title,
              isRestDay: day.isRestDay,
              exerciseCount: day.exercises.length,
              completed: false,
            });
          }
        }
      }
    }

    if (entries.length > 0) {
      const logs = await db.query.workoutLogs.findMany({
        where: inArray(
          workoutLogs.assignmentId,
          Array.from(new Set(entries.map((e) => e.assignmentId))),
        ),
      });
      const completedKeys = new Set(
        logs
          .filter((l) => l.completed)
          .map((l) => `${l.assignmentId}:${l.programDayId}:${l.date}`),
      );
      for (const e of entries) {
        if (completedKeys.has(`${e.assignmentId}:${e.programDayId}:${e.date}`)) {
          e.completed = true;
        }
      }
    }

    const createdAtByAssignment = new Map(
      coachAssignments.map((a) => [a.id, new Date(a.createdAt)]),
    );
    const reconciled = reconcileOverlappingAssignments(
      entries,
      (e) => `${e.athleteId}:${e.date}`,
      createdAtByAssignment,
    );
    reconciled.sort((a, b) => a.date.localeCompare(b.date));
    return reconciled;
  },

  // Simple RPE-based autoregulation: turn how hard the last set felt into a
  // concrete suggestion for this time, the way TrainHeroic's Training Load
  // does but surfaced as one plain-language line instead of a chart to read.
  // Rounds to the nearest 2.5 since that's the smallest common plate jump.
  suggestNextLoad(
    rpe: number | null,
    weight: string | null,
    weightMode: "numeric" | "bodyweight" | "band" | "box",
  ): { text: string; suggestedWeight: number | null } | null {
    if (rpe == null) return null;
    const parsed = weightMode === "numeric" && weight ? parseFloat(weight) : NaN;
    const hasWeight = !Number.isNaN(parsed);
    const round = (n: number) => Math.round(n / 2.5) * 2.5;

    if (rpe <= 6) {
      return hasWeight
        ? { text: `Felt easy last time — try ${round(parsed * 1.05)}`, suggestedWeight: round(parsed * 1.05) }
        : { text: "Felt easy last time — add a rep or two", suggestedWeight: null };
    }
    if (rpe <= 8) {
      return hasWeight
        ? { text: `On target — repeat ${parsed}`, suggestedWeight: parsed }
        : { text: "On target — repeat this", suggestedWeight: null };
    }
    if (rpe === 9) {
      return hasWeight
        ? { text: `Near max effort — hold ${parsed}`, suggestedWeight: parsed }
        : { text: "Near max effort — hold this", suggestedWeight: null };
    }
    return hasWeight
      ? { text: `Maxed out — consider backing off to ${round(parsed * 0.93)}`, suggestedWeight: null }
      : { text: "Maxed out — consider a lighter set", suggestedWeight: null };
  },

  // The shared DB fetch behind performance history -- last 60 logs before a
  // date, with everything needed to reconstruct per-exercise history from
  // them in memory (see extractPerformanceHistory above). Deliberately not
  // filtered by exercise here: a workout day with N exercises calls this
  // ONCE and reuses the same rows for all of them, instead of re-running
  // this same query N times and throwing away the overlap every time.
  async getRecentWorkoutLogsForAthlete(athleteId: number, beforeDate: string) {
    return db.query.workoutLogs.findMany({
      where: and(eq(workoutLogs.athleteId, athleteId), lt(workoutLogs.date, beforeDate)),
      orderBy: desc(workoutLogs.date),
      limit: 60,
      with: {
        entries: {
          with: {
            sets: { orderBy: asc(workoutSetEntries.setNumber) },
            programExercise: true,
            corrective: true,
          },
        },
      },
    });
  },

  // Most recent prior time this athlete logged this specific exercise
  // (across any program/day) for the "LAST: 4x3 @ 415lb" reference line, plus
  // a flat history of every individual set ever logged for it so the UI can
  // show "what did I get last time at THIS rep count" per set rather than
  // one summary for the whole exercise -- a pyramid scheme (8/5/3/1) should
  // compare each set against its own rep count, not the first set overall.
  // Single-exercise convenience wrapper -- getWorkoutDayDetail below fetches
  // the logs itself once and calls extractPerformanceHistory directly for
  // each exercise instead of using this, to avoid re-fetching per exercise.
  async getPerformanceHistoryForAthlete(
    athleteId: number,
    exerciseId: number,
    beforeDate: string,
  ) {
    const logs = await this.getRecentWorkoutLogsForAthlete(athleteId, beforeDate);
    return extractPerformanceHistory(logs, exerciseId);
  },

  async getWorkoutDayDetail(
    athleteId: number,
    assignmentId: number,
    programDayId: number,
    date: string,
  ) {
    const assignment = await db.query.assignments.findFirst({
      where: and(
        eq(assignments.id, assignmentId),
        eq(assignments.athleteId, athleteId),
      ),
      with: { program: true },
    });
    if (!assignment) return undefined;

    const day = await db.query.programDays.findFirst({
      where: eq(programDays.id, programDayId),
      with: {
        exercises: {
          orderBy: asc(programExercises.orderIndex),
          with: { exercise: true },
        },
        week: true,
      },
    });
    if (!day) return undefined;

    const correctives = assignment.correctivesEnabled
      ? await this.getCorrectivesForAssignmentDay(assignmentId, programDayId)
      : [];

    const log = await db.query.workoutLogs.findFirst({
      where: and(
        eq(workoutLogs.assignmentId, assignmentId),
        eq(workoutLogs.programDayId, programDayId),
        eq(workoutLogs.date, date),
      ),
      with: { entries: { with: { sets: true } } },
    });

    // One shared fetch for every exercise + corrective on this day, instead
    // of the N nearly-identical queries this used to run (one per exercise,
    // each re-fetching the same last-60-logs window and only differing in
    // which exerciseId it filtered for afterward).
    const recentLogs = await this.getRecentWorkoutLogsForAthlete(athleteId, date);
    const exercisesWithHistory = day.exercises.map((pe) => {
      const { lastPerformance, setHistory } = extractPerformanceHistory(
        recentLogs,
        pe.exerciseId,
      );
      return { ...pe, lastPerformance, setHistory };
    });
    const correctivesWithHistory = correctives.map((c) => {
      const { lastPerformance, setHistory } = extractPerformanceHistory(recentLogs, c.exerciseId);
      return { ...c, lastPerformance, setHistory };
    });

    const { week, ...dayFields } = day;
    return {
      programId: assignment.program.id,
      programName: assignment.program.name,
      programAiAuthored: assignment.program.aiAuthored,
      correctivesEnabled: assignment.correctivesEnabled,
      day: { ...dayFields, weekNumber: week.weekNumber, exercises: exercisesWithHistory },
      correctives: correctivesWithHistory,
      log: log ?? null,
    };
  },

  async submitWorkoutLog(athleteId: number, input: SubmitWorkoutLogInput) {
    const athlete = await db.query.users.findFirst({ where: eq(users.id, athleteId) });
    const weightUnit = athlete?.preferredWeightUnit ?? "lbs";
    return db.transaction(async (tx) => {
      let log = await tx.query.workoutLogs.findFirst({
        where: and(
          eq(workoutLogs.assignmentId, input.assignmentId),
          eq(workoutLogs.programDayId, input.programDayId),
          eq(workoutLogs.date, input.date),
        ),
      });

      if (log) {
        [log] = await tx
          .update(workoutLogs)
          .set({
            completed: input.completed,
            completedAt: input.completed ? new Date() : null,
          })
          .where(eq(workoutLogs.id, log.id))
          .returning();
        // cascades to workout_set_entries for the removed entries
        await tx
          .delete(workoutLogEntries)
          .where(eq(workoutLogEntries.workoutLogId, log.id));
      } else {
        [log] = await tx
          .insert(workoutLogs)
          .values({
            assignmentId: input.assignmentId,
            programDayId: input.programDayId,
            athleteId,
            date: input.date,
            completed: input.completed,
            completedAt: input.completed ? new Date() : null,
          })
          .returning();
      }

      for (const entry of input.entries) {
        const [entryRow] = await tx
          .insert(workoutLogEntries)
          .values({
            workoutLogId: log!.id,
            programExerciseId: entry.programExerciseId ?? null,
            correctiveId: entry.correctiveId ?? null,
            weightMode: entry.weightMode,
            rpe: entry.rpe ?? null,
            notes: entry.notes ?? null,
          })
          .returning();

        if (entry.sets.length > 0) {
          await tx.insert(workoutSetEntries).values(
            entry.sets.map((s) => ({
              logEntryId: entryRow.id,
              setNumber: s.setNumber,
              reps: s.reps ?? null,
              weight: s.weight ?? null,
              weightUnit: entry.weightMode === "numeric" && s.weight ? weightUnit : null,
              bandColor: s.bandColor ?? null,
              boxHeight: s.boxHeight ?? null,
              boxHeightUnit: s.boxHeightUnit ?? null,
              peakVelocityMps: s.peakVelocityMps ?? null,
              meanVelocityMps: s.meanVelocityMps ?? null,
              concentricSeconds: s.concentricSeconds ?? null,
              eccentricSeconds: s.eccentricSeconds ?? null,
              barPathDeviationCm: s.barPathDeviationCm ?? null,
              barPathTrace: s.barPathTrace ?? null,
            })),
          );
        }
      }

      return log;
    });
  },

  // ---------- Coach analytics ----------
  // Coach-only, full picture of an athlete's history for one exercise --
  // every set ever logged (not just CV-tracked ones), with weight/unit,
  // estimated 1RM (Epley), PR flags, and CV metrics when present. Athletes
  // never see this rollup -- only the live number during their own set.
  async getExerciseAnalyticsForCoach(coachId: number, athleteId: number, exerciseId: number) {
    const peRows = await db
      .select({
        date: workoutLogs.date,
        setNumber: workoutSetEntries.setNumber,
        reps: workoutSetEntries.reps,
        weight: workoutSetEntries.weight,
        weightUnit: workoutSetEntries.weightUnit,
        bandColor: workoutSetEntries.bandColor,
        boxHeight: workoutSetEntries.boxHeight,
        boxHeightUnit: workoutSetEntries.boxHeightUnit,
        weightMode: workoutLogEntries.weightMode,
        rpe: workoutLogEntries.rpe,
        peakVelocityMps: workoutSetEntries.peakVelocityMps,
        meanVelocityMps: workoutSetEntries.meanVelocityMps,
        concentricSeconds: workoutSetEntries.concentricSeconds,
        eccentricSeconds: workoutSetEntries.eccentricSeconds,
        barPathDeviationCm: workoutSetEntries.barPathDeviationCm,
      })
      .from(workoutSetEntries)
      .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
      .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
      .innerJoin(assignments, eq(workoutLogs.assignmentId, assignments.id))
      .innerJoin(programExercises, eq(workoutLogEntries.programExerciseId, programExercises.id))
      .where(
        and(
          eq(assignments.coachId, coachId),
          eq(assignments.athleteId, athleteId),
          eq(programExercises.exerciseId, exerciseId),
        ),
      );

    const correctiveRows = await db
      .select({
        date: workoutLogs.date,
        setNumber: workoutSetEntries.setNumber,
        reps: workoutSetEntries.reps,
        weight: workoutSetEntries.weight,
        weightUnit: workoutSetEntries.weightUnit,
        bandColor: workoutSetEntries.bandColor,
        boxHeight: workoutSetEntries.boxHeight,
        boxHeightUnit: workoutSetEntries.boxHeightUnit,
        weightMode: workoutLogEntries.weightMode,
        rpe: workoutLogEntries.rpe,
        peakVelocityMps: workoutSetEntries.peakVelocityMps,
        meanVelocityMps: workoutSetEntries.meanVelocityMps,
        concentricSeconds: workoutSetEntries.concentricSeconds,
        eccentricSeconds: workoutSetEntries.eccentricSeconds,
        barPathDeviationCm: workoutSetEntries.barPathDeviationCm,
      })
      .from(workoutSetEntries)
      .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
      .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
      .innerJoin(assignments, eq(workoutLogs.assignmentId, assignments.id))
      .innerJoin(
        assignmentCorrectives,
        eq(workoutLogEntries.correctiveId, assignmentCorrectives.id),
      )
      .where(
        and(
          eq(assignments.coachId, coachId),
          eq(assignments.athleteId, athleteId),
          eq(assignmentCorrectives.exerciseId, exerciseId),
        ),
      );

    const rows = [...peRows, ...correctiveRows]
      .filter((r) => r.reps != null)
      .sort((a, b) => a.date.localeCompare(b.date) || a.setNumber - b.setNumber);

    const bestByReps = new Map<string, number>();
    return rows.map((r) => {
      const weight = r.weight ? parseFloat(r.weight) : NaN;
      const reps = r.reps ? parseInt(r.reps, 10) : NaN;
      const hasNumeric = r.weightMode === "numeric" && !Number.isNaN(weight);
      const estimatedOneRm =
        hasNumeric && !Number.isNaN(reps) && reps > 0
          ? Math.round(weight * (1 + reps / 30) * 10) / 10
          : null;

      let isPR = false;
      if (hasNumeric && r.reps) {
        const prevBest = bestByReps.get(r.reps) ?? -Infinity;
        if (weight > prevBest) {
          isPR = true;
          bestByReps.set(r.reps, weight);
        }
      }

      return { ...r, estimatedOneRm, isPR };
    });
  },

  // An athlete's own, deliberately limited view of their progress -- just
  // enough to see recent PRs and where they currently stand on each lift.
  // No velocity/bar-path/RPE trends or charts and no historical time series;
  // that level of detail stays behind the coach's full analytics page.
  async getAthleteProgressSummary(athleteId: number) {
    const rows = await db
      .select({
        date: workoutLogs.date,
        setNumber: workoutSetEntries.setNumber,
        reps: workoutSetEntries.reps,
        weight: workoutSetEntries.weight,
        weightUnit: workoutSetEntries.weightUnit,
        weightMode: workoutLogEntries.weightMode,
        exerciseId: exercises.id,
        exerciseName: exercises.name,
      })
      .from(workoutSetEntries)
      .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
      .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
      .innerJoin(assignments, eq(workoutLogs.assignmentId, assignments.id))
      .innerJoin(programExercises, eq(workoutLogEntries.programExerciseId, programExercises.id))
      .innerJoin(exercises, eq(programExercises.exerciseId, exercises.id))
      .where(eq(assignments.athleteId, athleteId));

    const sorted = rows
      .filter((r) => r.weightMode === "numeric" && r.weight && r.reps)
      .sort((a, b) => a.date.localeCompare(b.date) || a.setNumber - b.setNumber);

    const bestByKey = new Map<string, number>();
    const prEvents: {
      exerciseName: string;
      weight: number;
      unit: string;
      reps: string;
      date: string;
    }[] = [];
    for (const r of sorted) {
      const weight = parseFloat(r.weight!);
      if (Number.isNaN(weight)) continue;
      const key = `${r.exerciseId}-${r.weightUnit}-${r.reps}`;
      const prevBest = bestByKey.get(key) ?? -Infinity;
      if (weight > prevBest) {
        bestByKey.set(key, weight);
        prEvents.push({
          exerciseName: r.exerciseName,
          weight,
          unit: r.weightUnit ?? "lbs",
          reps: r.reps!,
          date: r.date,
        });
      }
    }
    const recentPRs = prEvents.reverse().slice(0, 10);

    const latestByExercise = new Map<number, (typeof sorted)[number]>();
    for (const r of sorted) latestByExercise.set(r.exerciseId, r);
    const currentLifts = Array.from(latestByExercise.values())
      .map((r) => ({
        exerciseName: r.exerciseName,
        weight: r.weight!,
        unit: r.weightUnit ?? "lbs",
        reps: r.reps!,
        date: r.date,
      }))
      .sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));

    const completedLogs = await db.query.workoutLogs.findMany({
      where: and(eq(workoutLogs.athleteId, athleteId), eq(workoutLogs.completed, true)),
    });
    const monthPrefix = new Date().toISOString().slice(0, 7);
    const workoutsThisMonth = completedLogs.filter((l) => l.date.startsWith(monthPrefix)).length;

    return {
      totalWorkoutsCompleted: completedLogs.length,
      workoutsThisMonth,
      recentPRs,
      currentLifts,
    };
  },

  // Every distinct exercise this athlete has ever logged at least one set
  // for, scoped to this coach -- not just CV-tracked ones, so the coach can
  // drill into plain weight/PR history too.
  async getExercisesWithHistoryForAthlete(coachId: number, athleteId: number) {
    const peRows = await db
      .selectDistinct({ id: exercises.id, name: exercises.name })
      .from(workoutSetEntries)
      .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
      .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
      .innerJoin(assignments, eq(workoutLogs.assignmentId, assignments.id))
      .innerJoin(programExercises, eq(workoutLogEntries.programExerciseId, programExercises.id))
      .innerJoin(exercises, eq(programExercises.exerciseId, exercises.id))
      .where(and(eq(assignments.coachId, coachId), eq(assignments.athleteId, athleteId)));

    const correctiveRows = await db
      .selectDistinct({ id: exercises.id, name: exercises.name })
      .from(workoutSetEntries)
      .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
      .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
      .innerJoin(assignments, eq(workoutLogs.assignmentId, assignments.id))
      .innerJoin(
        assignmentCorrectives,
        eq(workoutLogEntries.correctiveId, assignmentCorrectives.id),
      )
      .innerJoin(exercises, eq(assignmentCorrectives.exerciseId, exercises.id))
      .where(and(eq(assignments.coachId, coachId), eq(assignments.athleteId, athleteId)));

    const byId = new Map<number, string>();
    for (const r of [...peRows, ...correctiveRows]) byId.set(r.id, r.name);
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  // Reduced overview shown before a specific exercise is chosen -- recent
  // sessions across everything this athlete has logged, so picking an
  // athlete is never a dead end even before drilling into one exercise.
  async getRecentSessionsForAthlete(coachId: number, athleteId: number, limit = 8) {
    const owned = await db
      .select({ id: assignments.id })
      .from(assignments)
      .where(and(eq(assignments.coachId, coachId), eq(assignments.athleteId, athleteId)));
    const assignmentIds = owned.map((a) => a.id);
    if (assignmentIds.length === 0) return [];

    const logs = await db.query.workoutLogs.findMany({
      where: and(
        eq(workoutLogs.athleteId, athleteId),
        inArray(workoutLogs.assignmentId, assignmentIds),
      ),
      orderBy: desc(workoutLogs.date),
      limit,
      with: {
        day: true,
        entries: {
          with: {
            sets: true,
            programExercise: { with: { exercise: true } },
            corrective: { with: { exercise: true } },
          },
        },
      },
    });

    return logs.map((log) => {
      let totalReps = 0;
      let totalVolume = 0;
      const exerciseNames = new Set<string>();
      for (const entry of log.entries) {
        const name = entry.programExercise?.exercise.name ?? entry.corrective?.exercise.name;
        if (name) exerciseNames.add(name);
        for (const set of entry.sets) {
          const reps = set.reps ? parseInt(set.reps, 10) : NaN;
          if (Number.isNaN(reps)) continue;
          totalReps += reps;
          if (entry.weightMode === "numeric" && set.weight) {
            const w = parseFloat(set.weight);
            if (!Number.isNaN(w)) totalVolume += reps * w;
          }
        }
      }
      return {
        date: log.date,
        dayTitle: log.day.title,
        completed: log.completed,
        exercises: Array.from(exerciseNames),
        totalReps,
        totalVolume,
      };
    });
  },

  // ---------- Leaderboard (coach-only) ----------

  // Every distinct exercise ANY athlete on this coach's roster has logged --
  // the leaderboard's exercise picker, same shape as the per-athlete
  // analytics picker but not scoped to one athlete.
  async getLeaderboardExercisesForCoach(coachId: number) {
    const peRows = await db
      .selectDistinct({ id: exercises.id, name: exercises.name })
      .from(workoutSetEntries)
      .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
      .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
      .innerJoin(assignments, eq(workoutLogs.assignmentId, assignments.id))
      .innerJoin(programExercises, eq(workoutLogEntries.programExerciseId, programExercises.id))
      .innerJoin(exercises, eq(programExercises.exerciseId, exercises.id))
      .where(eq(assignments.coachId, coachId));

    const correctiveRows = await db
      .selectDistinct({ id: exercises.id, name: exercises.name })
      .from(workoutSetEntries)
      .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
      .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
      .innerJoin(assignments, eq(workoutLogs.assignmentId, assignments.id))
      .innerJoin(
        assignmentCorrectives,
        eq(workoutLogEntries.correctiveId, assignmentCorrectives.id),
      )
      .innerJoin(exercises, eq(assignmentCorrectives.exerciseId, exercises.id))
      .where(eq(assignments.coachId, coachId));

    const byId = new Map<number, string>();
    for (const r of [...peRows, ...correctiveRows]) byId.set(r.id, r.name);
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  // Ranks every athlete on this coach's roster by their best Epley-estimated
  // 1RM for one exercise. Only numeric-weight sets count -- bodyweight/band
  // sets have no comparable load, same rule the PR detector uses.
  // Derived purely from existing assignment schedules + workout logs, no new
  // tables. "Streak" = consecutive most-recent *scheduled* training days
  // (rest days excluded, so a normal week off doesn't reset it) that were
  // completed, walking backward from the most recent scheduled day that's
  // already happened.
  async getStreaksForCoachRoster(coachId: number) {
    const roster = await this.getRosterForCoach(coachId);
    if (roster.length === 0) return new Map<number, { currentStreak: number; totalCompleted: number }>();
    return this.computeStreaks(roster.map((a) => a.id));
  },

  async getStreakForAthlete(athleteId: number) {
    const map = await this.computeStreaks([athleteId]);
    return map.get(athleteId) ?? { currentStreak: 0, totalCompleted: 0 };
  },

  async computeStreaks(athleteIds: number[]) {
    const athleteAssignments = await db.query.assignments.findMany({
      where: inArray(assignments.athleteId, athleteIds),
      with: { program: { with: { weeks: { with: { days: true } } } } },
    });

    const today = formatISO(new Date(), { representation: "date" });
    const assignmentAthlete = new Map(athleteAssignments.map((a) => [a.id, a.athleteId]));

    const scheduledByAthlete = new Map<
      number,
      Map<string, { assignmentId: number; programDayId: number }>
    >();
    for (const a of athleteAssignments) {
      let byDate = scheduledByAthlete.get(a.athleteId);
      if (!byDate) {
        byDate = new Map();
        scheduledByAthlete.set(a.athleteId, byDate);
      }
      for (const week of a.program.weeks) {
        for (const day of week.days) {
          if (day.isRestDay) continue;
          const dateStr = formatISO(
            resolveAssignmentDate(a, week.weekNumber, day.dayNumber, day.id),
            { representation: "date" },
          );
          if (dateStr <= today && !byDate.has(dateStr)) {
            byDate.set(dateStr, { assignmentId: a.id, programDayId: day.id });
          }
        }
      }
    }

    const assignmentIds = athleteAssignments.map((a) => a.id);
    const logs = assignmentIds.length
      ? await db.query.workoutLogs.findMany({
          where: and(inArray(workoutLogs.assignmentId, assignmentIds), eq(workoutLogs.completed, true)),
        })
      : [];
    const completedKeys = new Set(logs.map((l) => `${l.assignmentId}:${l.programDayId}:${l.date}`));
    const completedCountByAthlete = new Map<number, number>();
    for (const l of logs) {
      const athleteId = assignmentAthlete.get(l.assignmentId);
      if (athleteId == null) continue;
      completedCountByAthlete.set(athleteId, (completedCountByAthlete.get(athleteId) ?? 0) + 1);
    }

    const result = new Map<number, { currentStreak: number; totalCompleted: number }>();
    for (const athleteId of athleteIds) {
      const byDate = scheduledByAthlete.get(athleteId) ?? new Map();
      const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));
      let currentStreak = 0;
      for (const date of sortedDates) {
        const { assignmentId, programDayId } = byDate.get(date)!;
        if (completedKeys.has(`${assignmentId}:${programDayId}:${date}`)) currentStreak++;
        else break;
      }
      result.set(athleteId, {
        currentStreak,
        totalCompleted: completedCountByAthlete.get(athleteId) ?? 0,
      });
    }
    return result;
  },

  async getLeaderboardForExercise(coachId: number, exerciseId: number) {
    const peRows = await db
      .select({
        athleteId: assignments.athleteId,
        date: workoutLogs.date,
        reps: workoutSetEntries.reps,
        weight: workoutSetEntries.weight,
        weightUnit: workoutSetEntries.weightUnit,
        weightMode: workoutLogEntries.weightMode,
      })
      .from(workoutSetEntries)
      .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
      .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
      .innerJoin(assignments, eq(workoutLogs.assignmentId, assignments.id))
      .innerJoin(programExercises, eq(workoutLogEntries.programExerciseId, programExercises.id))
      .where(and(eq(assignments.coachId, coachId), eq(programExercises.exerciseId, exerciseId)));

    const correctiveRows = await db
      .select({
        athleteId: assignments.athleteId,
        date: workoutLogs.date,
        reps: workoutSetEntries.reps,
        weight: workoutSetEntries.weight,
        weightUnit: workoutSetEntries.weightUnit,
        weightMode: workoutLogEntries.weightMode,
      })
      .from(workoutSetEntries)
      .innerJoin(workoutLogEntries, eq(workoutSetEntries.logEntryId, workoutLogEntries.id))
      .innerJoin(workoutLogs, eq(workoutLogEntries.workoutLogId, workoutLogs.id))
      .innerJoin(assignments, eq(workoutLogs.assignmentId, assignments.id))
      .innerJoin(
        assignmentCorrectives,
        eq(workoutLogEntries.correctiveId, assignmentCorrectives.id),
      )
      .where(
        and(eq(assignments.coachId, coachId), eq(assignmentCorrectives.exerciseId, exerciseId)),
      );

    const bestByAthlete = new Map<
      number,
      { estimatedOneRm: number; weight: number; reps: number; date: string; weightUnit: string }
    >();
    for (const r of [...peRows, ...correctiveRows]) {
      if (r.weightMode !== "numeric" || !r.weight || !r.reps) continue;
      const weight = parseFloat(r.weight);
      const reps = parseInt(r.reps, 10);
      if (Number.isNaN(weight) || Number.isNaN(reps) || reps <= 0) continue;
      const estimatedOneRm = Math.round(weight * (1 + reps / 30) * 10) / 10;
      const existing = bestByAthlete.get(r.athleteId);
      if (!existing || estimatedOneRm > existing.estimatedOneRm) {
        bestByAthlete.set(r.athleteId, {
          estimatedOneRm,
          weight,
          reps,
          date: r.date,
          weightUnit: r.weightUnit ?? "lbs",
        });
      }
    }

    const athleteIds = Array.from(bestByAthlete.keys());
    if (athleteIds.length === 0) return [];

    const profiles = await db
      .select({
        id: users.id,
        name: users.name,
        sport: users.sport,
        position: users.position,
        age: users.age,
        heightIn: users.heightIn,
        bodyWeightLbs: users.bodyWeightLbs,
      })
      .from(users)
      .where(inArray(users.id, athleteIds));
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const streaks = await this.getStreaksForCoachRoster(coachId);

    return athleteIds
      .map((id) => ({
        ...profileById.get(id)!,
        ...bestByAthlete.get(id)!,
        currentStreak: streaks.get(id)?.currentStreak ?? 0,
        totalCompleted: streaks.get(id)?.totalCompleted ?? 0,
      }))
      .sort((a, b) => b.estimatedOneRm - a.estimatedOneRm);
  },
};
