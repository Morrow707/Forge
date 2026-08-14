import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  pgEnum,
  uniqueIndex,
  varchar,
  json,
  index,
  real,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { BODY_PAIN_PARTS } from "./wellness";
import type { SkillFaultThresholds } from "./skill-fault-thresholds";
import { SKILL_FAULT_THRESHOLD_BOUNDS } from "./skill-fault-thresholds";

// Owned and populated by connect-pg-simple at runtime, not by our own code --
// declared here purely so drizzle-kit's live-diff sees it as an already-
// accounted-for table. Without this, `drizzle-kit push` treats it as an
// unclaimed table and guesses it might be a "rename" source whenever a new
// table is added to the schema, which can silently abort the rest of that
// push (see: assignment_correctives/session rename-ambiguity prompt on a
// non-interactive build, which aborted before the users.preferred_weight_unit
// column got added).
export const session = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey().notNull(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => ({
    expireIdx: index("IDX_session_expire").on(table.expire),
  }),
);

export const roleEnum = pgEnum("role", ["coach", "athlete", "admin"]);
export const weightUnitEnum = pgEnum("weight_unit", ["lbs", "kg"]);
export const weightModeEnum = pgEnum("weight_mode", [
  "numeric",
  "bodyweight",
  "band",
  "box",
]);
export const boxHeightUnitEnum = pgEnum("box_height_unit", ["in", "m"]);
// An athlete's own after-the-fact tag on one of their per-set form-check
// videos -- "best" and "worst" are the two ends of the comparison view
// (see set-video-review.tsx), not a rating scale. At most one set per
// exercise/day should carry each value, but that's enforced client-side
// (re-tagging one set clears the flag off whichever set had it), not by a
// DB constraint -- nothing downstream depends on that invariant holding.
export const formCheckFlagEnum = pgEnum("form_check_flag", ["best", "worst"]);
export const lateralityEnum = pgEnum("laterality", ["bilateral", "unilateral"]);
// Coach-only quick-glance status, toggled by the coach as an athlete gets
// hurt/recovers -- never surfaced to the athlete themselves (see PublicUser).
export const healthStatusEnum = pgEnum("health_status", ["healthy", "hurt"]);
// Where the athlete currently is in their competitive calendar -- feeds the
// AI's SEASON_PHASE_TRAINING_PRINCIPLES directly instead of relying on the
// athlete/coach happening to mention it in free text. Self-reported, same
// "just a profile field" treatment as sport/position below; null means
// unset, not "off-season" -- the AI still asks/infers from context when null.
export const seasonPhaseEnum = pgEnum("season_phase", [
  "off_season",
  "pre_season",
  "in_season",
  "taper",
]);
// Self-reported, same "just a profile field" treatment as sport/position
// above -- null means unset. Collected specifically so it's available (only
// ever in aggregate, never alongside a name) for the admin's platform-wide
// trends view; not otherwise used by any per-athlete feature today.
export const genderEnum = pgEnum("gender", [
  "male",
  "female",
  "non_binary",
  "prefer_not_to_say",
]);
// Self-reported training-style preference, fed directly to the AI program
// builder as a strong signal alongside whatever the coach's/athlete's
// prompt text implies -- see COMBINATION_EXERCISE_TRAINING_PRINCIPLES in
// storage.ts. Null means unset/no preference, not "traditional" -- the AI
// still infers from the request's own wording when this is null.
// "traditional" = standard compound-main-lift-plus-isolation-accessory
// programming; "combination_circuit" = prioritize chained, multi-pattern
// exercises for a time-efficient, heart-rate-elevating session over
// loading any one pattern heavy.
export const trainingStylePreferenceEnum = pgEnum("training_style_preference", [
  "traditional",
  "combination_circuit",
]);
// Free Agent nutrition AI personalization, asked once via a short
// questionnaire (see setNutritionGoalSchema/the nutrition goal routes) and
// remembered thereafter -- the person doesn't change, but their goal might,
// which is what the "Set new goal" reset (nulling both users columns below)
// is for. Deliberately short -- four broad buckets, not a diet plan.
export const NUTRITION_GOALS = [
  "build_muscle",
  "lose_fat",
  "improve_performance",
  "general_health",
] as const;
export type NutritionGoal = (typeof NUTRITION_GOALS)[number];
export const nutritionGoalEnum = pgEnum("nutrition_goal", NUTRITION_GOALS);
export const NUTRITION_GOAL_LABEL: Record<NutritionGoal, string> = {
  build_muscle: "Build muscle",
  lose_fat: "Lose fat",
  improve_performance: "Improve sport performance",
  general_health: "General health",
};
// Classic block-periodization phase for a coach-defined training block
// (a run of one or more weeks grouped under one goal) -- distinct from
// seasonPhase above, which is the athlete's competitive-calendar context,
// not a property of any one program.
export const PERIODIZATION_PHASES = [
  "accumulation",
  "intensification",
  "realization",
  "deload",
  "taper",
] as const;
export type PeriodizationPhase = (typeof PERIODIZATION_PHASES)[number];
export const periodizationPhaseEnum = pgEnum("periodization_phase", PERIODIZATION_PHASES);
export const PERIODIZATION_PHASE_LABEL: Record<PeriodizationPhase, string> = {
  accumulation: "Accumulation",
  intensification: "Intensification",
  realization: "Realization",
  deload: "Deload",
  taper: "Taper",
};
// "bar_path" tracks only the bar's path/straightness (movement quality) --
// no speed emphasis, meant for phases where velocity isn't the point (e.g.
// rehab/offseason). "full" adds live bar speed, tempo, and velocity-loss.
// "jump" is a different signal entirely -- no implement to track, so it
// watches ankle position for flight phases instead of wrist/bar position
// (see jump-tracking.ts), reporting height/distance/ground-contact instead
// of velocity/power.
// "sprint" and "mechanics" are Skills' own signals -- see
// sprint-tracking.ts and mechanics-tracking.ts. Reusing this enum (rather
// than declaring a parallel one) is purely a shared-vocabulary convenience;
// skillProgramExercises is still a wholly separate table from
// programExercises, so this doesn't reintroduce the shared-category
// coupling the rest of the Skills system deliberately avoids.
export const trackingLevelEnum = pgEnum("tracking_level", [
  "none",
  "bar_path",
  "full",
  "jump",
  "sprint",
  "mechanics",
]);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: roleEnum("role").notNull(),
    coachCode: text("coach_code"),
    preferredWeightUnit: weightUnitEnum("preferred_weight_unit")
      .notNull()
      .default("lbs"),
    // Athlete bio/profile fields -- optional, self-reported or filled in by
    // a coach managing their roster. Used for roster/team identification
    // and the coach-only leaderboard; meaningless for coach/admin accounts.
    age: integer("age"),
    gender: genderEnum("gender"),
    heightIn: integer("height_in"),
    bodyWeightLbs: real("body_weight_lbs"),
    sport: text("sport"),
    position: text("position"),
    seasonPhase: seasonPhaseEnum("season_phase"),
    trainingStylePreference: trainingStylePreferenceEnum("training_style_preference"),
    // Free Agent nutrition AI personalization -- see NUTRITION_GOALS above
    // and setNutritionGoalSchema below. Null means the athlete hasn't
    // answered the one-time questionnaire yet, which is exactly what the
    // client checks to decide whether to show it instead of the normal ask
    // box. "Set new goal" just nulls both back out to re-trigger it.
    nutritionGoal: nutritionGoalEnum("nutrition_goal"),
    nutritionGoalNote: text("nutrition_goal_note"),
    // Coach-entered testing/combine snapshot -- a fast manual number from a
    // testing day (tryouts, combine, quick assessment), deliberately
    // separate from and not derived from actual logged workout sets (which
    // already drive the leaderboard's estimated 1RM). One current value
    // each, not a history -- same "just a profile field" treatment as
    // age/height/weight above.
    fortyYardDash: real("forty_yard_dash"), // seconds
    verticalJumpIn: real("vertical_jump_in"),
    broadJumpIn: real("broad_jump_in"),
    proAgilitySeconds: real("pro_agility_seconds"),
    benchMaxLbs: real("bench_max_lbs"),
    squatMaxLbs: real("squat_max_lbs"),
    deadliftMaxLbs: real("deadlift_max_lbs"),
    // Optional, collected at signup or added later. notifyEmail/notifySms
    // are separate toggles on purpose -- a coach may want one, both, or
    // neither. Only ever used for the targeted events below, never for
    // program completions or team-wide activity (that's an explicit
    // decision to avoid notification fatigue).
    phone: text("phone"),
    notifyEmail: boolean("notify_email").notNull().default(true),
    notifySms: boolean("notify_sms").notNull().default(false),
    // Coach-only injury/availability flag -- see healthStatusEnum above.
    healthStatus: healthStatusEnum("health_status").notNull().default("healthy"),
    // Unguessable, unauthenticated URL token for the .ics calendar
    // subscribe feed -- calendar apps re-fetch a plain URL on a timer, they
    // can't carry a session cookie. Lazily generated on first request.
    calendarToken: text("calendar_token"),
    // When this user last opened the team board -- compared against the
    // board's newest post to show a "new activity" flag on the nav tab.
    teamBoardReadAt: timestamp("team_board_read_at"),
    // Coach-only, opt-in: an NCAA-style weekly countable-hours cap (in
    // minutes) this program is held to. Null means "not tracking CARA
    // compliance at all," not "no limit" -- most coaches never touch this,
    // and the whole feature (auto-started session timers, the compliance
    // dashboard) stays invisible until a coach who actually needs it sets
    // one.
    caraWeeklyCapMinutes: integer("cara_weekly_cap_minutes"),
    // Coach-only, opt-in per-field overrides for the Skills camera tracker's
    // fault-detection sensitivity (see shared/skill-fault-thresholds.ts for
    // the full set + defaults). Null/missing fields fall back to the
    // built-in defaults individually -- a coach who only wants to loosen
    // one threshold never has to also specify the other five.
    skillFaultThresholds: json("skill_fault_thresholds").$type<Partial<SkillFaultThresholds>>(),
    // Set on every successful login -- the signal behind the coach-facing
    // "hasn't logged in N days" re-engagement nudge. Null for any account
    // that hasn't logged in since this column was added; storage.ts falls
    // back to their most recent workout_logs date so a genuinely active
    // athlete isn't misflagged just because this column is new.
    lastActivityAt: timestamp("last_activity_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
    coachCodeIdx: uniqueIndex("users_coach_code_idx").on(table.coachCode),
    calendarTokenIdx: uniqueIndex("users_calendar_token_idx").on(table.calendarToken),
  }),
);

export const coachAthletes = pgTable(
  "coach_athletes",
  {
    id: serial("id").primaryKey(),
    coachId: integer("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    pairIdx: uniqueIndex("coach_athlete_pair_idx").on(
      table.coachId,
      table.athleteId,
    ),
  }),
);

export const coachAthleteRequestStatusEnum = pgEnum("coach_athlete_request_status", [
  "pending",
  "accepted",
  "declined",
]);

// A coach-initiated invite to an existing Free Agent (see /api/coach/roster/
// add-free-agent) -- deliberately NOT an immediate coachAthletes link, so an
// athlete always has to accept before a coach gains any roster access to
// them. Old requests are kept (not deleted) after a response so both sides
// can see the history; a new request can be sent again after a decline.
export const coachAthleteRequests = pgTable(
  "coach_athlete_requests",
  {
    id: serial("id").primaryKey(),
    coachId: integer("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: coachAthleteRequestStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    respondedAt: timestamp("responded_at"),
  },
  (table) => ({
    athleteIdx: index("coach_athlete_requests_athlete_idx").on(table.athleteId),
  }),
);

export const teams = pgTable(
  "teams",
  {
    id: serial("id").primaryKey(),
    coachId: integer("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // A random join code specific to this team -- an athlete signing up
    // with it links to the team's coach AND is added straight to the team,
    // unlike the coach's personal code which only links the coach.
    code: text("code"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    codeIdx: uniqueIndex("teams_code_idx").on(table.code),
  }),
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pairIdx: uniqueIndex("team_member_pair_idx").on(
      table.teamId,
      table.athleteId,
    ),
  }),
);

export const challengeMetricEnum = pgEnum("challenge_metric", [
  "workouts_completed",
  "total_reps",
  "total_volume",
]);

// Team-scoped, not individual -- the whole roster on a team pools its effort
// toward one shared number for the challenge window, which is the point:
// this sits alongside (not instead of) the existing per-athlete leaderboard.
// Progress is never persisted/incremented on write; it's recomputed live
// from workout_logs/workout_set_entries for the window every time it's
// viewed (storage.computeTeamChallengeProgress), same "derive, don't cache"
// approach as streaks and ACWR elsewhere in this codebase -- there's no
// event stream to keep a running counter in sync with, and the underlying
// data (a set logged, then edited, then unmarked complete) already changes
// after the fact.
export const teamChallenges = pgTable(
  "team_challenges",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    metric: challengeMetricEnum("metric").notNull(),
    // Null means "just track our total for the period," no fixed finish
    // line -- a coach can run this as an open-ended team tally instead of a
    // goal race if that fits the squad better.
    targetValue: integer("target_value"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamIdx: index("team_challenges_team_idx").on(table.teamId),
  }),
);

export type TeamChallenge = typeof teamChallenges.$inferSelect;

export const createTeamChallengeSchema = z
  .object({
    teamId: z.number(),
    title: z.string().trim().min(1).max(80),
    metric: z.enum(["workouts_completed", "total_reps", "total_volume"]),
    targetValue: z.number().int().positive().nullable().optional(),
    startDate: z.string(),
    endDate: z.string(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

// A team's competition schedule -- lets a coach plan the training week
// around competition rather than a rigid calendar grid. Deliberately
// separate from assignments/programDays: a game day isn't training, it's a
// fixed point every athlete's microcycle gets planned relative to (GD-3,
// GD-1, GD, GD+1...), and offsets are always computed live against whatever
// is actually scheduled rather than stored, so moving a game or editing a
// program never leaves a stale offset behind.
export const teamGameDays = pgTable(
  "team_game_days",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    opponent: text("opponent"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamIdx: index("team_game_days_team_idx").on(table.teamId),
  }),
);

export type TeamGameDay = typeof teamGameDays.$inferSelect;

export const createTeamGameDaySchema = z.object({
  date: z.string().min(1),
  opponent: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

// Shared coaching staff: lets multiple coach accounts operate as one
// program (roster, teams, exercises, programs, analytics) instead of one
// coach owning everything alone -- built for a program with an assistant/
// position-coach staff, not just a solo coach. primaryCoachId is always the
// staff's original coach account; every read-side query that scopes by
// "this coach's data" is widened to the whole staff list via
// getEffectiveCoachIds (server/storage.ts), so it doesn't matter which
// staff member created a given athlete link, program, or exercise --
// everyone on the staff sees the same thing. Joining reuses the primary
// coach's existing coachCode (the same code an athlete would use to find
// them) rather than a separate invite-code system.
export const coachStaff = pgTable(
  "coach_staff",
  {
    id: serial("id").primaryKey(),
    primaryCoachId: integer("primary_coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    staffCoachId: integer("staff_coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    pairIdx: uniqueIndex("coach_staff_pair_idx").on(
      table.primaryCoachId,
      table.staffCoachId,
    ),
    staffIdx: index("coach_staff_staff_idx").on(table.staffCoachId),
  }),
);

export const exerciseCategoryEnum = pgEnum("exercise_category", [
  "strength",
  "conditioning",
  "olympic",
  "accessory",
  "mobility",
  "plyometric",
]);

export const exercises = pgTable("exercises", {
  id: serial("id").primaryKey(),
  coachId: integer("coach_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: exerciseCategoryEnum("category").notNull().default("strength"),
  muscleGroup: text("muscle_group").notNull().default("Full Body"),
  // Muscles meaningfully worked besides the primary muscleGroup (e.g. a box
  // step-up's primary is Quads, but Glutes/Hamstrings/Calves all contribute
  // too) -- purely informational, shown on the exercise detail page only so
  // it never clutters the compact bank/picker views.
  secondaryMuscles: json("secondary_muscles").$type<string[]>(),
  // Which sports an exercise is particularly relevant to (e.g. Copenhagen
  // Plank -> Soccer, Hockey; Medicine Ball Scoop Toss -> Baseball, Softball)
  // -- purely a search/filter aid, not exhaustive or exclusive. Most generic
  // strength exercises are left untagged since they don't differentiate by
  // sport; this is reserved for exercises a coach would actually search by
  // sport name to find.
  sports: json("sports").$type<string[]>(),
  equipment: text("equipment").notNull().default("Barbell"),
  movementType: text("movement_type"),
  laterality: lateralityEnum("laterality"),
  // Two more classification axes on top of movementType, so a coach or the
  // AI program builder can filter/query at the level of an actual training
  // split -- "today is an upper body day" (bodyRegion) or "today is upper
  // push, horizontal only" (plane, only meaningful alongside a Push/Press/
  // Pull movementType). Deliberately independent free-text fields rather
  // than folded into movementType, matching how laterality already sits
  // beside it instead of being encoded into the movement name itself.
  bodyRegion: text("body_region"),
  plane: text("plane"),
  // A third classification axis: how many joints/patterns a rep actually
  // involves. "Compound" (multi-joint -- a squat, a bench press, a row),
  // "Isolation" (single-joint, one target muscle -- a bicep curl, a leg
  // extension), or "Combination" (two or more DIFFERENT patterns chained
  // into one continuous rep, e.g. a step-up into a shoulder press) -- see
  // COMBINATION_EXERCISE_TRAINING_PRINCIPLES in storage.ts for why that
  // third bucket exists as its own thing rather than just "a compound
  // exercise": a combination exercise is built for a time-crunched
  // general-fitness goal (elevated heart rate, max variety per minute),
  // not for loading any one pattern heavy, which is a genuinely different
  // programming intent than either compound or isolation work. Free text
  // like bodyRegion/plane above, not an enum, so a coach can always
  // override the seeded/inferred value.
  movementComplexity: text("movement_complexity"),
  // What the athlete actually logs for this exercise, set once here by the
  // coach instead of re-chosen by the athlete on every set -- not mutually
  // exclusive (a dumbbell box step-up needs both usesWeight and usesBox).
  usesWeight: boolean("uses_weight").notNull().default(true),
  usesBodyweight: boolean("uses_bodyweight").notNull().default(false),
  usesBand: boolean("uses_band").notNull().default(false),
  usesBox: boolean("uses_box").notNull().default(false),
  isCorrective: boolean("is_corrective").notNull().default(false),
  videoUrl: text("video_url"),
  instructions: text("instructions"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const exerciseSubmissionStatusEnum = pgEnum("exercise_submission_status", [
  "pending",
  "approved",
  "rejected",
]);

// No coach opts into this -- it's populated entirely by
// storage.detectTrendingExercises whenever two or more different coaches
// independently end up with an exercise of the same name (case/whitespace
// insensitive). submittedBy is just the earliest of those coaches, kept as
// an internal reference (never shown as "submitted by" in the UI); the
// real signal is coachCount. Approving one still just hands the exercise's
// ownership to the admin -- the same coachId column that already drives
// the FORGE/initials badge, so nothing else needs to change for it to show
// up as Forge-official -- and optionally renames it in the same step.
export const exerciseSubmissions = pgTable("exercise_submissions", {
  id: serial("id").primaryKey(),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  submittedBy: integer("submitted_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  coachCount: integer("coach_count").notNull().default(1),
  status: exerciseSubmissionStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const exerciseReportStatusEnum = pgEnum("exercise_report_status", ["open", "resolved"]);
export const exerciseIssueTypeEnum = pgEnum("exercise_issue_type", [
  "broken_video",
  "wrong_info",
  "misspelling",
  "other",
]);

// A coach flagging a problem with a Forge-official exercise they can see
// but can't fix themselves (broken video link, wrong movement type, a
// typo, etc).
export const exerciseReports = pgTable("exercise_reports", {
  id: serial("id").primaryKey(),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  reportedBy: integer("reported_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  issueType: exerciseIssueTypeEnum("issue_type").notNull(),
  note: text("note"),
  status: exerciseReportStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

// ---------- Skills (fully separate from Exercises/Programs) ----------
// A deliberate parallel system, not a category tacked onto `exercises` --
// a coach who only does strength & conditioning should never see a skill
// drill in their exercise bank/picker, and a skills coach should never see
// squats in theirs. Sharing one table with a filter would still leak
// through anywhere that queries "all exercises" without remembering to
// exclude skills; a separate table can't leak by construction.
export const skillExercises = pgTable(
  "skill_exercises",
  {
    id: serial("id").primaryKey(),
    coachId: integer("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Free-text like an exercise's muscleGroup, not a fixed enum -- SKILL_TYPES
    // in client/src/lib/skill-taxonomy.ts are just suggested quick-pick
    // chips (Hitting/Fielding/Throwing/Catching/Footwork/Pitching), so a
    // coach can type one that isn't on the list and it becomes its own
    // reusable tag from then on, same pattern as every other taxonomy field.
    skillType: text("skill_type").notNull().default("Hitting"),
    // Which sports this drill applies to -- deliberately not exclusive to
    // whichever sport it was written for. A throwing/arm-care drill written
    // for baseball is just as taggable with Volleyball or Football (both
    // use the same overhead-throwing mechanics for serving/passing), so a
    // coach in either sport can still find it.
    sports: json("sports").$type<string[]>(),
    equipment: text("equipment"),
    videoUrl: text("video_url"),
    instructions: text("instructions"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    coachIdx: index("skill_exercises_coach_idx").on(table.coachId),
  }),
);

// Skill Programs mirror the shape of Programs (program -> weeks -> days ->
// exercises -> assignments) but reference skillExercises, not exercises,
// and deliberately drop the strength-specific concepts that don't apply to
// a drill: no training blocks/periodization phases, no supersets, no
// correctives. Camera tracking exists (see trackingLevel on
// skillProgramExercises below) but is its own simpler on/off signal, not
// the strength side's category-aware video-check toggle.
export const skillPrograms = pgTable("skill_programs", {
  id: serial("id").primaryKey(),
  coachId: integer("coach_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const skillProgramWeeks = pgTable(
  "skill_program_weeks",
  {
    id: serial("id").primaryKey(),
    programId: integer("program_id")
      .notNull()
      .references(() => skillPrograms.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    name: text("name"),
  },
  (table) => ({
    programIdx: index("skill_program_weeks_program_idx").on(table.programId),
  }),
);

export const skillProgramDays = pgTable(
  "skill_program_days",
  {
    id: serial("id").primaryKey(),
    weekId: integer("week_id")
      .notNull()
      .references(() => skillProgramWeeks.id, { onDelete: "cascade" }),
    dayNumber: integer("day_number").notNull(),
    title: text("title").notNull().default("Skill Session"),
    isRestDay: boolean("is_rest_day").notNull().default(false),
  },
  (table) => ({
    weekIdx: index("skill_program_days_week_idx").on(table.weekId),
  }),
);

export const skillProgramExercises = pgTable(
  "skill_program_exercises",
  {
    id: serial("id").primaryKey(),
    dayId: integer("day_id")
      .notNull()
      .references(() => skillProgramDays.id, { onDelete: "cascade" }),
    skillExerciseId: integer("skill_exercise_id")
      .notNull()
      .references(() => skillExercises.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    sets: integer("sets").notNull().default(3),
    reps: text("reps").notNull().default("10"),
    restSeconds: integer("rest_seconds"),
    notes: text("notes"),
    // Only "none", "sprint", or "mechanics" are meaningful here -- "bar_path"/
    // "full"/"jump" are strength-side camera pipelines with no skill-drill
    // equivalent.
    trackingLevel: trackingLevelEnum("tracking_level").notNull().default("none"),
  },
  (table) => ({
    dayIdx: index("skill_program_exercises_day_idx").on(table.dayId),
  }),
);

export const skillAssignments = pgTable(
  "skill_assignments",
  {
    id: serial("id").primaryKey(),
    skillProgramId: integer("skill_program_id")
      .notNull()
      .references(() => skillPrograms.id, { onDelete: "cascade" }),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    coachId: integer("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    durationWeeks: integer("duration_weeks").notNull().default(1),
    dateOverrides: json("date_overrides").$type<Record<string, string>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteIdx: index("skill_assignments_athlete_idx").on(table.athleteId),
    coachIdx: index("skill_assignments_coach_idx").on(table.coachId),
  }),
);

// One row per camera-tracked skill session (sprint/agility or swing/throw
// mechanics) -- there's no broader skill-day completion/logging system yet
// (see the comment on getCalendarForAthlete's skill-entry merge in
// storage.ts), so this exists purely to keep a captured result from being a
// one-time, thrown-away number. athleteId is denormalized here (derivable
// via the assignment)
// the same way workoutLogs denormalizes it off assignments, since almost
// every read of this table filters by athlete directly.
export const skillSessionLogs = pgTable(
  "skill_session_logs",
  {
    id: serial("id").primaryKey(),
    skillAssignmentId: integer("skill_assignment_id")
      .notNull()
      .references(() => skillAssignments.id, { onDelete: "cascade" }),
    skillProgramDayId: integer("skill_program_day_id")
      .notNull()
      .references(() => skillProgramDays.id, { onDelete: "cascade" }),
    skillProgramExerciseId: integer("skill_program_exercise_id")
      .notNull()
      .references(() => skillProgramExercises.id, { onDelete: "cascade" }),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackingLevel: trackingLevelEnum("tracking_level").notNull(),
    elapsedSeconds: real("elapsed_seconds"),
    distanceYards: real("distance_yards"),
    cameraAngle: text("camera_angle"),
    faults: json("faults"),
    // Mechanics-only fields (see mechanics-tracking.ts) -- null for sprint
    // rows, and vice versa for elapsedSeconds/distanceYards above. One wide
    // table rather than a second one since a session log is already a
    // single, simple "one row per capture" shape either way.
    hipShoulderSeparationDeg: real("hip_shoulder_separation_deg"),
    weightTransferPct: real("weight_transfer_pct"),
    hipRotationDeg: real("hip_rotation_deg"),
    armSlotDeg: real("arm_slot_deg"),
    armSlotLabel: text("arm_slot_label"),
    wellSequenced: boolean("well_sequenced"),
    // Both optional opt-ins, not part of a normal capture -- the athlete
    // must explicitly choose to keep the clip (see the privacy comment on
    // MechanicsTrackerDialog; a capture is ephemeral by default) before
    // videoUrl is ever set, and coachAnnotationUrl only gets set afterward
    // if their coach actually opens it and draws on a frame. Reuses
    // VideoAnnotationDialog as-is (it only ever needs a bare videoUrl in,
    // an imageUrl out) rather than building a parallel comment-thread
    // system the way the strength side's workoutComments does.
    videoUrl: text("video_url"),
    coachAnnotationUrl: text("coach_annotation_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteIdx: index("skill_session_logs_athlete_idx").on(table.athleteId),
    assignmentIdx: index("skill_session_logs_assignment_idx").on(table.skillAssignmentId),
  }),
);

export const programs = pgTable("programs", {
  id: serial("id").primaryKey(),
  coachId: integer("coach_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Set once the conversational AI program builder has ever applied a turn
  // to this program -- never cleared afterward, even if a human edits it by
  // hand later. Gates the "full function" AI features that skip any human
  // review step (autonomous form-check feedback, one-tap exercise
  // substitution): those are only safe to let the AI act on unsupervised
  // when it's already the program's author, not when it would be silently
  // rewriting a coach's program for an athlete.
  aiAuthored: boolean("ai_authored").notNull().default(false),
});

// A named, phase-tagged span of one or more weeks within a program (e.g.
// "Hypertrophy Block" / accumulation, "Peaking Block" / realization) --
// purely an organizational overlay on top of the existing week-chunking, so
// a program with no blocks defined behaves exactly as before.
export const programBlocks = pgTable(
  "program_blocks",
  {
    id: serial("id").primaryKey(),
    programId: integer("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phase: periodizationPhaseEnum("phase"),
    orderIndex: integer("order_index").notNull().default(0),
    notes: text("notes"),
  },
  (table) => ({
    programIdx: index("program_blocks_program_idx").on(table.programId),
  }),
);

export const programWeeks = pgTable(
  "program_weeks",
  {
    id: serial("id").primaryKey(),
    programId: integer("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    name: text("name"),
    // Null means "not part of any block" -- most weeks in most programs,
    // since blocks are opt-in. Set null (not cascaded) if its block is
    // deleted, so the weeks themselves are never lost.
    blockId: integer("block_id").references(() => programBlocks.id, { onDelete: "set null" }),
  },
  (table) => ({
    programIdx: index("program_weeks_program_idx").on(table.programId),
    blockIdx: index("program_weeks_block_idx").on(table.blockId),
  }),
);

export const programDays = pgTable(
  "program_days",
  {
    id: serial("id").primaryKey(),
    weekId: integer("week_id")
      .notNull()
      .references(() => programWeeks.id, { onDelete: "cascade" }),
    dayNumber: integer("day_number").notNull(),
    title: text("title").notNull().default("Training Day"),
    isRestDay: boolean("is_rest_day").notNull().default(false),
  },
  (table) => ({
    weekIdx: index("program_days_week_idx").on(table.weekId),
  }),
);

export const programExercises = pgTable(
  "program_exercises",
  {
    id: serial("id").primaryKey(),
    dayId: integer("day_id")
      .notNull()
      .references(() => programDays.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    sets: integer("sets").notNull().default(3),
    reps: text("reps").notNull().default("10"),
    weight: text("weight"),
    restSeconds: integer("rest_seconds"),
    notes: text("notes"),
    // Exercises sharing the same (non-null) supersetGroup value, and adjacent
    // in orderIndex, are chained together and rendered as one lettered slot
    // (A1, A2...) instead of separate letters. Opaque token, not a display value.
    supersetGroup: text("superset_group"),
    // Only meaningful within a superset group (2+ exercises sharing a
    // supersetGroup token): false (default) auto-starts the rest timer
    // after every exercise's set, same as a solo exercise. true auto-starts
    // it only after the LAST exercise in the group's set -- e.g. bicep
    // curls straight into a single-arm row with no rest between them, then
    // a real rest once both are done. Ignored for solo (non-superset)
    // exercises, which always rest after every set regardless of this flag.
    restAfterGroupOnly: boolean("rest_after_group_only").notNull().default(false),
    trackingLevel: trackingLevelEnum("tracking_level").notNull().default("none"),
    videoCheckEnabled: boolean("video_check_enabled").notNull().default(false),
  },
  (table) => ({
    dayIdx: index("program_exercises_day_idx").on(table.dayId),
  }),
);

export const assignments = pgTable(
  "assignments",
  {
    id: serial("id").primaryKey(),
    programId: integer("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    coachId: integer("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    correctivesEnabled: boolean("correctives_enabled").notNull().default(true),
    // How many times to repeat the program's own week pattern end-to-end,
    // not "how many weeks to cut it off at" -- 1 (the default, and every
    // pre-migration row's backfilled value) means "the program's own weeks,
    // once through," identical to the only behavior that existed before
    // this column. A 4-native-week program assigned with durationWeeks=3
    // runs all 4 weeks, 3 times over (12 calendar weeks total), which is
    // what lets a coach repeat a periodized block without re-assigning it
    // every time it finishes. See resolveAssignmentDate in storage.ts.
    durationWeeks: integer("duration_weeks").notNull().default(1),
    // Manual per-day schedule overrides, keyed by program_day_id (as a
    // string) -> an explicit calendar date. Lets a coach account for games,
    // travel, or extra rest by moving individual occurrences off the rigid
    // "every 7 days from startDate" grid; days with no entry here still fall
    // back to that computed date. Only ever applied to the first cycle
    // through the program's weeks -- see resolveAssignmentDate.
    dateOverrides: json("date_overrides").$type<Record<string, string>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteIdx: index("assignments_athlete_idx").on(table.athleteId),
    coachIdx: index("assignments_coach_idx").on(table.coachId),
  }),
);

// Per-athlete, per-day corrective exercises. Kept separate from
// program_exercises (the shared template) because correctives are a manual
// judgment call for one specific athlete's instance of the program, not
// something that should apply to everyone assigned to it.
export const assignmentCorrectives = pgTable(
  "assignment_correctives",
  {
    id: serial("id").primaryKey(),
    assignmentId: integer("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    programDayId: integer("program_day_id")
      .notNull()
      .references(() => programDays.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    sets: integer("sets").notNull().default(3),
    reps: text("reps").notNull().default("10"),
    weight: text("weight"),
    restSeconds: integer("rest_seconds"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    assignmentDayIdx: index("assignment_correctives_assignment_day_idx").on(
      table.assignmentId,
      table.programDayId,
    ),
  }),
);

// Per-athlete, per-day exercise substitution -- same "override one athlete's
// specific occurrence of a shared day, never the program template" pattern
// as assignment_correctives above, but for swapping an already-prescribed
// exercise rather than adding one. Lets a flare-up get a modified session
// today without editing program_exercises, which every other athlete on
// that program still shares. One row per swapped program_exercise; a
// program_exercise with no row here is shown as originally prescribed.
export const assignmentExerciseOverrides = pgTable(
  "assignment_exercise_overrides",
  {
    id: serial("id").primaryKey(),
    assignmentId: integer("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    programDayId: integer("program_day_id")
      .notNull()
      .references(() => programDays.id, { onDelete: "cascade" }),
    programExerciseId: integer("program_exercise_id")
      .notNull()
      .references(() => programExercises.id, { onDelete: "cascade" }),
    substituteExerciseId: integer("substitute_exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    assignmentDayIdx: index("assignment_exercise_overrides_assignment_day_idx").on(
      table.assignmentId,
      table.programDayId,
    ),
    uniquePerExercise: uniqueIndex("assignment_exercise_overrides_unique_idx").on(
      table.assignmentId,
      table.programDayId,
      table.programExerciseId,
    ),
  }),
);

export type AssignmentExerciseOverride = typeof assignmentExerciseOverrides.$inferSelect;

export const workoutLogs = pgTable(
  "workout_logs",
  {
    id: serial("id").primaryKey(),
    assignmentId: integer("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    programDayId: integer("program_day_id")
      .notNull()
      .references(() => programDays.id, { onDelete: "cascade" }),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    dayInstanceIdx: uniqueIndex("workout_log_day_instance_idx").on(
      table.assignmentId,
      table.programDayId,
      table.date,
    ),
    // Backs getRecentWorkoutLogsForAthlete's "last 60 logs before date X for
    // this athlete" query -- the single hottest read in the app, run on
    // every workout day view.
    athleteDateIdx: index("workout_logs_athlete_date_idx").on(table.athleteId, table.date),
  }),
);

// One row per logged exercise (either a program exercise or a corrective --
// exactly one of the two FKs is set). Actual per-set performance lives in
// workoutSetEntries below, sized to however many sets were prescribed.
export const workoutLogEntries = pgTable("workout_log_entries", {
  id: serial("id").primaryKey(),
  workoutLogId: integer("workout_log_id")
    .notNull()
    .references(() => workoutLogs.id, { onDelete: "cascade" }),
  programExerciseId: integer("program_exercise_id").references(
    () => programExercises.id,
    { onDelete: "cascade" },
  ),
  correctiveId: integer("corrective_id").references(
    () => assignmentCorrectives.id,
    { onDelete: "cascade" },
  ),
  weightMode: weightModeEnum("weight_mode").notNull().default("numeric"),
  rpe: integer("rpe"),
  notes: text("notes"),
  // TEMPORARY: dropped from the app's data model long ago (superseded by
  // workoutSetEntries + correctiveId/weightMode above), but never actually
  // dropped from the deployed database. Declaring them here as unused,
  // harmless leftovers lets drizzle-kit push see them as already-accounted-
  // for, so it can't confuse a genuinely new column (like correctiveId) for
  // a rename of one of these -- that ambiguity was silently aborting the
  // rest of the migration on every deploy since correctives shipped. Remove
  // these three lines in a follow-up PR once a deploy has run successfully
  // with this in place (at that point corrective_id will already exist, so
  // dropping them will be an unambiguous "drop column", not a rename guess).
  actualSets: integer("actual_sets"),
  actualReps: text("actual_reps"),
  actualWeight: text("actual_weight"),
});

export const workoutSetEntries = pgTable("workout_set_entries", {
  id: serial("id").primaryKey(),
  logEntryId: integer("log_entry_id")
    .notNull()
    .references(() => workoutLogEntries.id, { onDelete: "cascade" }),
  setNumber: integer("set_number").notNull(),
  reps: text("reps"),
  weight: text("weight"),
  // The athlete's preferred unit at the moment this set was logged -- weight
  // is otherwise a unitless string, which makes history/PR comparisons and
  // coach analytics ambiguous once an athlete ever switches lbs/kg. Null for
  // bodyweight/band sets (weightMode lives on the parent log entry) and for
  // rows logged before this column existed.
  weightUnit: weightUnitEnum("weight_unit_at_log"),
  // Only populated for band/box exercises respectively (see exercises.usesBand
  // / usesBox) -- independent of weight/weightUnit above so a combo movement
  // like a dumbbell box step-up can carry both a weight AND a box height on
  // the same set.
  bandColor: text("band_color"),
  boxHeight: text("box_height"),
  boxHeightUnit: boxHeightUnitEnum("box_height_unit"),
  // Bar-speed/bar-path CV metrics for this set, computed on-device and
  // synced as plain numbers -- never the source video. Null unless the
  // exercise's trackingLevel was "bar_path"/"full" when this set was logged.
  peakVelocityMps: real("peak_velocity_mps"),
  meanVelocityMps: real("mean_velocity_mps"),
  concentricSeconds: real("concentric_seconds"),
  eccentricSeconds: real("eccentric_seconds"),
  barPathDeviationCm: real("bar_path_deviation_cm"),
  barPathTrace: json("bar_path_trace"),
  // Heuristic biomechanics flags from on-device pose estimation (squat
  // depth, knee valgus, forward lean, bar path drift) -- see
  // pose-tracking.ts's detectFormFaults. Empty/null when nothing was
  // flagged, not just when tracking wasn't on.
  formFaults: json("form_faults"),
  // Per-rep velocity decay / depth-consistency / sticking-point curve for
  // this set -- see bar-tracking.ts's RepBreakdown. Null for sets tracked
  // before this existed, same as the other CV columns above.
  repBreakdown: json("rep_breakdown"),
  // Independent left/right wrist path traces (same coordinate convention as
  // barPathTrace) for spotting side-to-side asymmetry that the single
  // averaged bar path can't show. Null when one side was out of frame too
  // much of the set to build a trace.
  armPathTrace: json("arm_path_trace"),
  // Estimated output power from the same tracked trace, using the set's
  // entered weight as load (mass * 9.81 * concentric velocity) -- null
  // whenever there's no numeric weight to use as load, same as the other CV
  // columns above being null when tracking wasn't on. peakPowerWatts pairs
  // with peakVelocityMps, meanPowerWatts with meanVelocityMps.
  peakPowerWatts: real("peak_power_watts"),
  meanPowerWatts: real("mean_power_watts"),
  // Mean velocity of the eccentric (lowering) phase, averaged across the
  // set -- the concentric-side numbers above already exist; this is the
  // other half, matching what velocity-based-training tools like Perch
  // report as a separate figure rather than folding it into concentric.
  eccentricMeanVelocityMps: real("eccentric_mean_velocity_mps"),
  // Average per-rep vertical range of motion for the set, in cm -- distance
  // traveled during the concentric (lifting) phase, from the same trace
  // barPathDeviationCm is derived from.
  romCm: real("rom_cm"),
  // Fatigue within the set: how much peak concentric velocity dropped from
  // the first rep to the last, as a percentage. Null for single-rep sets
  // (nothing to compare against).
  velocityLossPercent: real("velocity_loss_percent"),
  // One set can carry an athlete-recorded form-check clip of that specific
  // set (not just one video per exercise per day) -- see
  // form-video-recorder-dialog.tsx and set-video-review.tsx. Every
  // recorded clip is kept; formCheckFlag is how the athlete marks which one
  // was their best/worst for the side-by-side comparison view, not a
  // deletion signal.
  formCheckVideoUrl: text("form_check_video_url"),
  formCheckFlag: formCheckFlagEnum("form_check_flag"),
  // "jump" tracking mode's numbers (see jump-tracking.ts) -- null unless
  // trackingLevel was "jump" when this set was logged. Best-of-set height
  // and distance rather than an average, same convention as peakVelocityMps
  // being the set's best rep. barPathTrace above is reused for the jump's
  // ankle-height trace (same {t,x,y} shape, just a vertical excursion
  // instead of horizontal bar drift) rather than adding a redundant column.
  jumpHeightCm: real("jump_height_cm"),
  jumpDistanceCm: real("jump_distance_cm"),
  groundContactSeconds: real("ground_contact_seconds"),
  reactiveStrengthIndex: real("reactive_strength_index"),
  jumpBreakdown: json("jump_breakdown"),
  // Per-rep left/right knee-drive comparison for bilateral lower-body lifts
  // (see pose-tracking.ts's computeLegDriveAsymmetry) -- null unless the
  // exercise's movementType was "Squat" (or it was jump-tracked) and both
  // legs stayed in frame long enough during the drive phase to trust a
  // comparison. Not applicable to unilateral exercises (single-leg squats,
  // lunges), which load one leg at a time rather than both at once.
  legDriveAsymmetry: json("leg_drive_asymmetry"),
  // Per-rep left/right arm-drive comparison for a bilateral shared-bar
  // press/pull (see bar-tracking.ts's computeArmDriveAsymmetry) -- the arm
  // equivalent of legDriveAsymmetry above, built from the two independent
  // implement trackers bar-tracker-dialog.tsx already runs for tilt/grip
  // width rather than a joint angle (a press/pull has no knee to measure
  // drive rate from). Null unless the equipment used a shared bar and the
  // movement was a bilateral Push/Pull with enough clean data on both sides.
  armDriveAsymmetry: json("arm_drive_asymmetry"),
  // Per-rep tracking-confidence score (see bar-tracking.ts's
  // computeRepTrustScores) -- folds position-fusion confidence,
  // tracker-disagreement rejections, and the whole set's movement-mismatch/
  // camera-alignment status into one number/label per rep, so a coach
  // reviewing this set later can tell which reps' numbers to actually
  // believe instead of only ever seeing that context live, in the tracker
  // dialog, at the moment the set was captured.
  trustScores: json("trust_scores"),
});

// A two-way thread on a specific day of a specific assignment -- an athlete
// flagging a rough set or attaching a form-check video, a coach replying.
// Scoped to (assignmentId, programDayId) rather than a workoutLog row so the
// thread exists even before the athlete has logged anything for that day.
export const workoutComments = pgTable(
  "workout_comments",
  {
    id: serial("id").primaryKey(),
    assignmentId: integer("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    programDayId: integer("program_day_id")
      .notNull()
      .references(() => programDays.id, { onDelete: "cascade" }),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    videoUrl: text("video_url"),
    // A coach-drawn markup on a paused frame of the athlete's video -- e.g.
    // circling a knee valgus moment -- saved as a PNG and attached the same
    // way a video link is, just a different media type on the same comment.
    imageUrl: text("image_url"),
    // The workout day this comment/video is actually FOR (the athlete's
    // calendar date, e.g. logging a session for last Friday two days late)
    // -- deliberately separate from createdAt below, which is just when the
    // comment row was written and can be well after the fact for a
    // backfilled log. Null for older rows written before this existed, and
    // for a coach's own reply/annotation (a reply isn't "for" any one
    // occurrence of a recurring program day the way an athlete's submission
    // is), in which case display falls back to createdAt.
    date: text("date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    assignmentDayIdx: index("workout_comments_assignment_day_idx").on(
      table.assignmentId,
      table.programDayId,
    ),
  }),
);

// In-app notification inbox. Deliberately narrow: only ever created for a
// coach when an athlete comments or attaches a video, never for program
// completions or team-wide events -- see the notification-creation call
// sites in routes.ts for the full (short) list of triggers.
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    // Covers both the inbox list (userId, ordered by date) and the unread
    // count/mark-read queries (userId + read=false) -- polled every 60s for
    // every logged-in coach and athlete.
    userReadIdx: index("notifications_user_read_idx").on(table.userId, table.read),
  }),
);

// One row per browser/device a user has enabled push notifications on --
// the Web Push standard's subscription object (endpoint + encryption
// keys), opaque to us, handed to web-push verbatim when sending. A user
// can have several (phone, laptop, etc); each is removed independently if
// the push service reports it's gone stale (410/404 on send).
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("push_subscriptions_user_idx").on(table.userId),
  }),
);

// Single-use, expiring password reset tokens. Only the SHA-256 hash of the
// token is stored -- same reasoning as password hashing -- so a database
// leak alone can't be used to reset anyone's password.
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One shared board per coach -- every post is visible to the coach and
// every athlete on that coach's roster, deliberately not a private 1:1
// thread. Scoped by coachId (not a specific `teams` row) so it works the
// same whether or not a coach has bothered to organize athletes into teams.
export const teamPosts = pgTable(
  "team_posts",
  {
    id: serial("id").primaryKey(),
    coachId: integer("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    // Coach-only, opt-in per post (defaults off so it's never left on by
    // accident) -- pushes to every team member's device regardless of their
    // notification preferences, meant for emergencies (practice moved, etc).
    isAnnouncement: boolean("is_announcement").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    coachIdx: index("team_posts_coach_idx").on(table.coachId),
  }),
);

// Athlete-logged body weight/composition over time -- no photos (explicitly
// out of scope, storage cost). One row per check-in; an athlete owns and can
// delete their own entries, and their coach can view (read-only) via roster.
export const bodyMetrics = pgTable(
  "body_metrics",
  {
    id: serial("id").primaryKey(),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    weight: real("weight").notNull(),
    weightUnit: weightUnitEnum("weight_unit").notNull().default("lbs"),
    bodyFatPercent: real("body_fat_percent"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteIdx: index("body_metrics_athlete_idx").on(table.athleteId),
  }),
);

// One row per athlete, coach-set (or self-set for a Free Agent with no
// coach -- see updateNutritionTargetsSchema/the athlete nutrition routes)
// macro and micronutrient targets. Deliberately NOT AI-generated -- the AI
// only ever explains general sports-nutrition science (see
// NUTRITION_EDUCATION_PRINCIPLES in server/storage.ts); an actual
// individualized number here always comes from a human (a coach, ideally
// backed by a real registered dietitian) plugging in a real plan. "Current
// targets" only, same "just a profile field" treatment as the users-table
// testing/combine fields above -- no history, since these change as a real
// plan is adjusted, not as a trend to chart.
export const nutritionTargets = pgTable(
  "nutrition_targets",
  {
    id: serial("id").primaryKey(),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Macros
    caloriesKcal: integer("calories_kcal"),
    proteinG: real("protein_g"),
    carbsG: real("carbs_g"),
    fatG: real("fat_g"),
    fiberG: real("fiber_g"),
    waterOz: real("water_oz"),
    // Micros most relevant to athletes specifically (bone health, RED-S,
    // sweat/electrolyte losses) rather than a full multivitamin panel.
    calciumMg: real("calcium_mg"),
    ironMg: real("iron_mg"),
    vitaminDMcg: real("vitamin_d_mcg"),
    potassiumMg: real("potassium_mg"),
    magnesiumMg: real("magnesium_mg"),
    sodiumMg: real("sodium_mg"),
    vitaminB12Mcg: real("vitamin_b12_mcg"),
    zincMg: real("zinc_mg"),
    // Free-form context from whoever set this -- e.g. "per team RD's plan,
    // reviewed 3/1" or a Free Agent's own notes to themselves.
    notes: text("notes"),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteIdx: uniqueIndex("nutrition_targets_athlete_idx").on(table.athleteId),
  }),
);

export const foodLogSourceEnum = pgEnum("food_log_source", ["barcode", "search", "manual", "photo"]);

// One row per logged food item, on a given calendar date -- mostly never an
// AI capability (see server/food-lookup.ts): barcode/name lookups just proxy
// a public food database (Open Food Facts, USDA FoodData Central) for
// convenience, same way the plate calculator looks up known plate weights.
// "photo" is the one exception -- a meal photo has no barcode/database entry
// to look up, so estimating its contents requires an actual AI vision call
// (see storage.analyzeMealPhoto) -- but the resulting row is still always
// free for every athlete, coached or Free Agent, same as every other source:
// this is what an athlete logs against the nutritionTargets a coach (or the
// athlete themselves) already set, the same "coach sets the plan, human
// enters the data" split as everywhere else in nutrition tracking.
export const foodLogEntries = pgTable(
  "food_log_entries",
  {
    id: serial("id").primaryKey(),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    description: text("description").notNull(),
    brand: text("brand"),
    servingDescription: text("serving_description"),
    caloriesKcal: integer("calories_kcal"),
    proteinG: real("protein_g"),
    carbsG: real("carbs_g"),
    fatG: real("fat_g"),
    fiberG: real("fiber_g"),
    sodiumMg: real("sodium_mg"),
    // Same "athletes specifically" micro set as nutritionTargets above (not
    // a full multivitamin panel) -- mirrors that table's column naming so
    // a logged entry's micros can be compared directly against the
    // athlete's targets. Unlike the macro-ish fields above, no lookup path
    // populates these automatically yet (Open Food Facts/USDA barcode
    // lookups could in principle, but weren't wired up here) -- they're
    // filled by the AI photo-analysis path (see analyzeMealPhoto) or
    // manual entry/edit. Missing means "not provided," never coerced to 0.
    calciumMg: real("calcium_mg"),
    ironMg: real("iron_mg"),
    vitaminDMcg: real("vitamin_d_mcg"),
    potassiumMg: real("potassium_mg"),
    magnesiumMg: real("magnesium_mg"),
    vitaminB12Mcg: real("vitamin_b12_mcg"),
    zincMg: real("zinc_mg"),
    source: foodLogSourceEnum("source").notNull(),
    barcode: text("barcode"),
    loggedAt: timestamp("logged_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteDateIdx: index("food_log_entries_athlete_date_idx").on(table.athleteId, table.date),
  }),
);

export type FoodLogEntry = typeof foodLogEntries.$inferSelect;

const foodLogMicroFields = {
  calciumMg: z.coerce.number().min(0).max(10000).optional().nullable(),
  ironMg: z.coerce.number().min(0).max(200).optional().nullable(),
  vitaminDMcg: z.coerce.number().min(0).max(2000).optional().nullable(),
  potassiumMg: z.coerce.number().min(0).max(20000).optional().nullable(),
  magnesiumMg: z.coerce.number().min(0).max(5000).optional().nullable(),
  vitaminB12Mcg: z.coerce.number().min(0).max(1000).optional().nullable(),
  zincMg: z.coerce.number().min(0).max(500).optional().nullable(),
};

export const createFoodLogEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  description: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(120).optional().nullable(),
  servingDescription: z.string().trim().max(120).optional().nullable(),
  caloriesKcal: z.coerce.number().min(0).max(10000).optional().nullable(),
  proteinG: z.coerce.number().min(0).max(1000).optional().nullable(),
  carbsG: z.coerce.number().min(0).max(2000).optional().nullable(),
  fatG: z.coerce.number().min(0).max(1000).optional().nullable(),
  fiberG: z.coerce.number().min(0).max(300).optional().nullable(),
  sodiumMg: z.coerce.number().min(0).max(20000).optional().nullable(),
  ...foodLogMicroFields,
  source: z.enum(["barcode", "search", "manual", "photo"]),
  barcode: z.string().trim().max(64).optional().nullable(),
});
export type CreateFoodLogEntryInput = z.infer<typeof createFoodLogEntrySchema>;

// Athlete editing an entry after posting it -- everything but date/source/
// barcode (which describe how/when it was logged, not what's in it) is
// editable, and every field is optional since an edit only needs to touch
// what changed.
export const updateFoodLogEntrySchema = z.object({
  description: z.string().trim().min(1).max(200).optional(),
  brand: z.string().trim().max(120).optional().nullable(),
  servingDescription: z.string().trim().max(120).optional().nullable(),
  caloriesKcal: z.coerce.number().min(0).max(10000).optional().nullable(),
  proteinG: z.coerce.number().min(0).max(1000).optional().nullable(),
  carbsG: z.coerce.number().min(0).max(2000).optional().nullable(),
  fatG: z.coerce.number().min(0).max(1000).optional().nullable(),
  fiberG: z.coerce.number().min(0).max(300).optional().nullable(),
  sodiumMg: z.coerce.number().min(0).max(20000).optional().nullable(),
  ...foodLogMicroFields,
});
export type UpdateFoodLogEntryInput = z.infer<typeof updateFoodLogEntrySchema>;

// Automatic snapshot of the testing/combine fields (see users table above),
// one row per date whenever a coach actually changes one of those numbers
// via the roster profile edit -- there's no separate "log a testing day"
// form, this just captures the full 7-metric state every time it moves so
// team trends have something to plot. Re-saving unchanged values never
// creates a row; a real change on a date that already has one updates it
// in place rather than duplicating.
export const testingResults = pgTable(
  "testing_results",
  {
    id: serial("id").primaryKey(),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    fortyYardDash: real("forty_yard_dash"),
    verticalJumpIn: real("vertical_jump_in"),
    broadJumpIn: real("broad_jump_in"),
    proAgilitySeconds: real("pro_agility_seconds"),
    benchMaxLbs: real("bench_max_lbs"),
    squatMaxLbs: real("squat_max_lbs"),
    deadliftMaxLbs: real("deadlift_max_lbs"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteIdx: index("testing_results_athlete_idx").on(table.athleteId),
    athleteDateIdx: uniqueIndex("testing_results_athlete_date_idx").on(
      table.athleteId,
      table.date,
    ),
  }),
);

// One row per joint+movement reading, not one row per assessment session --
// unlike testingResults' fixed columns, a goniometer session can cover any
// subset of joints, so a flat append-only log (each reading independently
// dated) fits better than a wide table that would need a column per
// joint/movement combination. "joint" reuses BODY_PAIN_PARTS' left/right key
// convention (shared/wellness.ts) wherever a joint has a laterality split;
// see shared/goniometer.ts for the full joint/movement taxonomy and normal-
// range reference used to classify a reading as restricted/normal/
// hypermobile. No uniqueness constraint on (athleteId, date, joint,
// movement) -- a coach re-measuring the same joint twice in one session to
// confirm a number should be able to save both readings.
export const goniometerReadings = pgTable(
  "goniometer_readings",
  {
    id: serial("id").primaryKey(),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recordedBy: integer("recorded_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    joint: text("joint").notNull(),
    movement: text("movement").notNull(),
    angleDegrees: real("angle_degrees").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteIdx: index("goniometer_readings_athlete_idx").on(table.athleteId),
    athleteJointIdx: index("goniometer_readings_athlete_joint_idx").on(
      table.athleteId,
      table.joint,
    ),
  }),
);

export const insertGoniometerReadingSchema = z.object({
  athleteId: z.number(),
  date: z.string(),
  joint: z.string(),
  movement: z.string(),
  angleDegrees: z.number(),
  notes: z.string().optional().nullable(),
});

// One AI-generated deficit within a weakness report -- see weaknessReports
// below. category is free text (not an enum) since the AI names it from
// whatever data actually produced the flag (e.g. "Joint Mobility",
// "Left/Right Asymmetry", "Load Management") rather than being boxed into
// a fixed list that may not fit every situation.
export const weaknessDeficitSchema = z.object({
  title: z.string(),
  category: z.string(),
  evidence: z.string(),
  whyItMatters: z.string(),
  suggestedFocus: z.string(),
});
export type WeaknessDeficit = z.infer<typeof weaknessDeficitSchema>;

// A point-in-time analysis, not a live-updating dashboard -- generated on
// demand (coach-triggered, or a Free Agent analyzing themselves) from
// whatever PT/S&C data exists at that moment, then kept as a dated snapshot
// so a coach can look back and see whether a previously flagged deficit
// actually improved. deficits stays a snapshot even if the underlying
// goniometer/asymmetry/ACWR data it was built from is edited or deleted
// afterward -- re-generating produces a new row, it never mutates this one.
export const weaknessReports = pgTable("weakness_reports", {
  id: serial("id").primaryKey(),
  athleteId: integer("athlete_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  generatedBy: integer("generated_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  deficits: json("deficits").$type<WeaknessDeficit[]>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WeaknessReport = typeof weaknessReports.$inferSelect;

// "skill" is Skills' own goal type -- targets a best (lowest) sprint-timing
// elapsedSeconds for one skill drill, computed off skillSessionLogs the
// same read-only, never-stored-achieved way "exercise"/"testing" are
// computed off workoutSetEntries/users. skillExerciseId below is the only
// Skills-table reference this row ever gets; goals stays otherwise a
// wholly strength-side table.
export const goalTypeEnum = pgEnum("goal_type", ["exercise", "testing", "skill"]);

// A target the athlete (or their coach) is working toward -- "achieved" is
// deliberately not a stored column. It's computed fresh each time goals are
// fetched by comparing targetValue against the athlete's current best (max
// weight ever logged, for an exercise goal; current profile value, for a
// testing goal; best sprint time, for a skill goal), so it can never drift
// out of sync with the data it's about.
export const goals = pgTable(
  "goals",
  {
    id: serial("id").primaryKey(),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: goalTypeEnum("type").notNull(),
    exerciseId: integer("exercise_id").references(() => exercises.id, { onDelete: "cascade" }),
    testingMetric: text("testing_metric"),
    // Only set for type "skill" -- the drill this goal tracks a best sprint
    // time for. Deliberately a separate column from exerciseId rather than
    // reusing it, even though both are just "which thing this goal is
    // about": exerciseId's FK points at the strength exercises table, and a
    // skill goal must never accidentally resolve against it.
    skillExerciseId: integer("skill_exercise_id").references(() => skillExercises.id, { onDelete: "cascade" }),
    targetValue: real("target_value").notNull(),
    targetUnit: text("target_unit").notNull(),
    targetDate: date("target_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteIdx: index("goals_athlete_idx").on(table.athleteId),
  }),
);

// A mandatory once-per-day self-report -- the athlete can't use the rest of
// the app on a given calendar date until a row exists for that date (gated
// client-side by WellnessGate). Re-submitting the same date updates that
// day's answers in place rather than creating a second row.
export const wellnessCheckins = pgTable(
  "wellness_checkins",
  {
    id: serial("id").primaryKey(),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    sleepHours: real("sleep_hours").notNull(),
    soreness: integer("soreness").notNull(),
    stress: integer("stress").notNull(),
    hydration: integer("hydration").notNull().default(3),
    mentalFocus: integer("mental_focus").notNull().default(3),
    // Which body parts the athlete flagged as hurting today -- only ever
    // shown/edited in the expanded check-in form, never the collapsed
    // one-line summary. Empty array is the common case (nothing hurts).
    bodyPainMap: json("body_pain_map").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteIdx: index("wellness_checkins_athlete_idx").on(table.athleteId),
    athleteDateIdx: uniqueIndex("wellness_checkins_athlete_date_idx").on(
      table.athleteId,
      table.date,
    ),
  }),
);

export type WellnessCheckin = typeof wellnessCheckins.$inferSelect;

export const submitWellnessCheckinSchema = z.object({
  sleepHours: z.number().min(0).max(24),
  soreness: z.number().int().min(1).max(5),
  stress: z.number().int().min(1).max(5),
  hydration: z.number().int().min(1).max(5).default(3),
  mentalFocus: z.number().int().min(1).max(5).default(3),
  bodyPainMap: z.array(z.string()).max(BODY_PAIN_PARTS.length).default([]),
});

// Self-reported by the athlete (or logged by a coach for a roster athlete),
// one row per injury -- when it happened and which body part, so the AI
// program builder can add correctives around it or stay cautious near it
// (see getAthleteAiContext) without the athlete having to re-explain it in
// every chat. `resolved` lets an old, healed injury stay on file as useful
// history while the AI weighs it less heavily than something still active
// -- see the "months ago" framing built in storage.ts. `bodyPart` reuses
// the same BODY_PAIN_PARTS vocabulary as the daily wellness check-in's pain
// map for a consistent taxonomy across the app, but stays free text (not a
// DB enum) the same way exercise taxonomy fields do, so a coach can always
// describe something the fixed list doesn't cover.
export const injuryHistory = pgTable(
  "injury_history",
  {
    id: serial("id").primaryKey(),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bodyPart: text("body_part").notNull(),
    occurredOn: date("occurred_on").notNull(),
    description: text("description"),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteIdx: index("injury_history_athlete_idx").on(table.athleteId, table.occurredOn),
  }),
);

export type InjuryHistoryEntry = typeof injuryHistory.$inferSelect;

export const submitInjurySchema = z.object({
  bodyPart: z.string().trim().min(1).max(60),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  description: z.string().trim().max(500).optional().nullable(),
});
export type SubmitInjuryInput = z.infer<typeof submitInjurySchema>;

export const caraActivityTypeEnum = pgEnum("cara_activity_type", [
  "training", // auto-started the moment the day's readiness check-in is submitted
  "meeting",
  "film_review",
  "travel",
  "other",
]);

export const caraEndReasonEnum = pgEnum("cara_end_reason", [
  "completed", // workout marked complete -- the clean case
  "idle_timeout", // server-side sweep closed a stale session automatically
  "manual_stop", // athlete confirmed "not still training," or a coach closed a logged activity
]);

// NCAA-style countable-athletically-related-activity (CARA) time tracking.
// A row is open the instant it's created (endedAt/endReason null) -- closing
// it is always a separate, server-driven event (workout completion, an idle
// sweep, or an explicit stop), never something the client unilaterally
// decides. That's deliberate: the whole point is a record that survives an
// audit even if an athlete's phone dies mid-set or they just forget to tap
// "done," so the source of truth can never be "whatever the browser tab
// happened to be doing."
export const caraSessions = pgTable(
  "cara_sessions",
  {
    id: serial("id").primaryKey(),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityType: caraActivityTypeEnum("activity_type").notNull(),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    // Bumped on every set logged while a "training" session is open. The
    // idle-timeout sweep compares against this, not the wall clock, so a
    // forgotten session closes at the athlete's last real activity instead
    // of whenever a coach happens to notice it's still open -- an audit
    // never sees inflated idle time tacked onto a real workout.
    lastActivityAt: timestamp("last_activity_at").notNull().defaultNow(),
    endedAt: timestamp("ended_at"),
    endReason: caraEndReasonEnum("end_reason"),
    // Set only for non-training activities a coach logs by hand -- a team
    // meeting or film session has no "reps" to detect idleness from, so
    // those get manual start/end times instead of the auto-tracked flow.
    loggedByCoachId: integer("logged_by_coach_id").references(() => users.id),
    note: text("note"),
  },
  (table) => ({
    athleteIdx: index("cara_sessions_athlete_idx").on(table.athleteId),
    // Every lookup here is either "does this athlete have an open session"
    // or "sweep stale open sessions," both filtering on endedAt IS NULL --
    // this keeps both cheap regardless of how much closed history piles up.
    openIdx: index("cara_sessions_open_idx").on(table.athleteId, table.endedAt),
  }),
);

export type CaraSession = typeof caraSessions.$inferSelect;

export const logCaraActivitySchema = z.object({
  athleteId: z.number(),
  activityType: z.enum(["meeting", "film_review", "travel", "other"]),
  startedAt: z.string(),
  endedAt: z.string(),
  note: z.string().max(500).optional(),
});

export const setCaraCapSchema = z.object({
  capMinutes: z.number().int().min(1).max(10080).nullable(),
});

// "speed" is Skills' own category -- counts sprint-timing captures
// (skillSessionLogs rows with trackingLevel "sprint"), entirely separate
// from every other category's strength-table-only counts. It's still
// awarded through the exact same checkAndAwardTrophies pass as the rest;
// the only Skills-specific part is which count feeds it.
export const trophyCategoryEnum = pgEnum("trophy_category", [
  "workout_count",
  "streak",
  "pr_count",
  "speed",
]);

export const trophyTierEnum = pgEnum("trophy_tier", ["bronze", "silver", "gold"]);

// Persisted, Pokemon-Go-style stacking achievements: once a threshold is
// crossed the row is written permanently and never removed, even if the
// underlying stat later drops back down (a broken streak doesn't take its
// streak trophies away). This is deliberately the single system covering
// workout-count milestones, streak milestones, and PR-count milestones --
// keeps three overlapping gamification ideas from turning into three
// half-built ones. One row per (athleteId, key); `key` is a stable id like
// "workout_count_100" defined in shared/achievements.ts, not the display
// label, so re-labeling a trophy later doesn't orphan already-awarded rows.
export const athleteTrophies = pgTable(
  "athlete_trophies",
  {
    id: serial("id").primaryKey(),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    category: trophyCategoryEnum("category").notNull(),
    tier: trophyTierEnum("tier").notNull(),
    label: text("label").notNull(),
    threshold: integer("threshold").notNull(),
    unlockedAt: timestamp("unlocked_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteIdx: index("athlete_trophies_athlete_idx").on(table.athleteId),
    athleteKeyIdx: uniqueIndex("athlete_trophies_athlete_key_idx").on(
      table.athleteId,
      table.key,
    ),
  }),
);

export type AthleteTrophy = typeof athleteTrophies.$inferSelect;

// AI-generated, one per athlete per date, cached permanently once written
// (same lazy-materialize-then-cache pattern as testingResults above) rather
// than regenerated on every view -- a day's wellness check-in and RPE
// history up to that point don't change after the fact, so there's nothing
// to gain from re-asking. Never blocks the workout day fetch: this is
// requested by its own lazy endpoint, not bundled into getWorkoutDayDetail.
export const readinessBriefings = pgTable(
  "readiness_briefings",
  {
    id: serial("id").primaryKey(),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    briefing: text("briefing").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteDateIdx: uniqueIndex("readiness_briefings_athlete_date_idx").on(
      table.athleteId,
      table.date,
    ),
  }),
);

export type ReadinessBriefing = typeof readinessBriefings.$inferSelect;

// One per athlete per ISO week (Monday date), cached for the rest of that
// week once generated -- same lazy-materialize pattern as
// readinessBriefings, just weekly instead of daily.
export const athleteDigests = pgTable(
  "athlete_digests",
  {
    id: serial("id").primaryKey(),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    digest: text("digest").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteWeekIdx: uniqueIndex("athlete_digests_athlete_week_idx").on(
      table.athleteId,
      table.weekStart,
    ),
  }),
);

export type AthleteDigest = typeof athleteDigests.$inferSelect;

// One per coach per ISO week -- roster-wide insight rollup, same pattern.
export const coachDigests = pgTable(
  "coach_digests",
  {
    id: serial("id").primaryKey(),
    coachId: integer("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    digest: text("digest").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    coachWeekIdx: uniqueIndex("coach_digests_coach_week_idx").on(table.coachId, table.weekStart),
  }),
);

export type CoachDigest = typeof coachDigests.$inferSelect;

export const chatRoleEnum = pgEnum("chat_role", ["athlete", "assistant"]);

// Every message either side of the AI chat ever sends, kept permanently --
// this is never a private channel: the athlete's coach can always read the
// full transcript (see /api/coach/roster/:athleteId/chat), the same way a
// coach can see workout comments. Never edited or deleted from either side.
export const athleteChatMessages = pgTable(
  "athlete_chat_messages",
  {
    id: serial("id").primaryKey(),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: chatRoleEnum("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteIdx: index("athlete_chat_messages_athlete_idx").on(
      table.athleteId,
      table.createdAt,
    ),
  }),
);

export type AthleteChatMessage = typeof athleteChatMessages.$inferSelect;

export const sendChatMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;

export const programChatRoleEnum = pgEnum("program_chat_role", ["user", "assistant"]);

// Chat transcript for the conversational AI program builder -- the admin
// describes what they want, the AI rewrites the program's full structure
// each turn and replies with a summary. Kept permanently, never edited.
export const programChatMessages = pgTable(
  "program_chat_messages",
  {
    id: serial("id").primaryKey(),
    programId: integer("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: programChatRoleEnum("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    programIdx: index("program_chat_messages_program_idx").on(
      table.programId,
      table.createdAt,
    ),
  }),
);

export type ProgramChatMessage = typeof programChatMessages.$inferSelect;

export const sendProgramChatMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

// Same conversational-AI-program-builder pattern as programChatMessages
// above, but against skillPrograms -- kept as its own table (not a shared
// "chat messages" table with a kind discriminator) since it references
// skillPrograms.id, not programs.id, and the two program systems are
// deliberately kept fully separate end to end (see the schema comment on
// skillPrograms).
export const skillProgramChatMessages = pgTable(
  "skill_program_chat_messages",
  {
    id: serial("id").primaryKey(),
    skillProgramId: integer("skill_program_id")
      .notNull()
      .references(() => skillPrograms.id, { onDelete: "cascade" }),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: programChatRoleEnum("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    skillProgramIdx: index("skill_program_chat_messages_program_idx").on(
      table.skillProgramId,
      table.createdAt,
    ),
  }),
);

export type SkillProgramChatMessage = typeof skillProgramChatMessages.$inferSelect;

export const sendSkillProgramChatMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export type SendProgramChatMessageInput = z.infer<typeof sendProgramChatMessageSchema>;

// ---------------- Classes (self-guided skills curriculum) ----------------
// A Class is an ordered curriculum of Lessons an athlete works through on
// their own -- lesson 1 unlocks immediately, each later lesson unlocks once
// the previous one's rule is satisfied. Same coachId + isForgeOfficial
// ownership model already used for exercises/programs/skillPrograms: a
// coach's own Class is private to their roster; an admin's Forge Class is
// available to any coach to assign AND is the only kind a Free Agent (who
// has no coach) can ever see or enroll in. Per-lesson pricing (see
// classLessons.priceCents) only ever applies to a Forge Class sold to a
// Free Agent -- a coach's own athletes never see a price on their coach's
// own Class.
export const classes = pgTable("classes", {
  id: serial("id").primaryKey(),
  coachId: integer("coach_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  // Free text, same lightweight pattern as users.sport -- no fixed taxonomy
  // to migrate every time a new kind of class shows up. Browse pages derive
  // their filter chips from whatever categories actually exist rather than
  // a hardcoded list.
  category: text("category"),
  isForgeOfficial: boolean("is_forge_official").notNull().default(false),
  // Optional -- an athlete can't enroll in this class until they've
  // completed (see classEnrollments.completedAt) the referenced one. Self-
  // referencing FK, nullable, ON DELETE SET NULL (removing the prerequisite
  // class should just clear the chain, not cascade-delete classes that
  // depend on it).
  prerequisiteClassId: integer("prerequisite_class_id").references((): AnyPgColumn => classes.id, {
    onDelete: "set null",
  }),
  // Defaults to false at the column level so every class that existed
  // before this migration (already live) stays visible -- createClassWithStructure
  // explicitly inserts true for a freshly created class instead, so new
  // classes start hidden from browse/enroll until their author flips this.
  // Never gates access for someone already enrolled -- see
  // getVisibleClassesForCoach/getVisibleClassesForFreeAgent's own notes.
  isDraft: boolean("is_draft").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const classUnlockRuleEnum = pgEnum("class_unlock_rule", [
  "immediate",
  "time_elapsed",
  "sessions_logged",
  "reps_logged",
  "manual",
]);

export const classLessons = pgTable(
  "class_lessons",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    lessonNumber: integer("lesson_number").notNull(),
    title: text("title").notNull(),
    // Shown even while the lesson is locked-but-reachable or unpaid -- the
    // "let them view them to a certain degree" half of the two-gate model,
    // alongside the drill list read off skillProgramId's one day.
    description: text("description"),
    // A dedicated, hidden skill program holding this lesson's actual drills
    // (always exactly one day, repeated on the calendar for as long as the
    // unlock rule takes to satisfy) -- never surfaced in the coach's own
    // Skill Programs list (see the lesson-content exclusion in
    // getVisibleSkillProgramsForCoach). This reuses the skill-program
    // builder's editor, the assignment/calendar pipeline, and
    // skillSessionLogs wholesale instead of standing up a second, parallel
    // content-and-logging system just for lessons.
    skillProgramId: integer("skill_program_id")
      .notNull()
      .references(() => skillPrograms.id, { onDelete: "cascade" }),
    unlockRule: classUnlockRuleEnum("unlock_rule").notNull().default("immediate"),
    // Meaning depends on unlockRule: days for time_elapsed, distinct
    // capture-days for sessions_logged, raw skillSessionLogs row count for
    // reps_logged. Null for immediate/manual. sessions_logged/reps_logged
    // only ever see activity from drills with camera tracking turned on --
    // there's no general (non-camera) skill-day completion log to count
    // against yet, so a lesson using either rule should keep tracking
    // enabled on at least one drill or its progress can never move.
    unlockThreshold: integer("unlock_threshold"),
    // Cents; null = free/included. Only read when the parent class is
    // isForgeOfficial (see the table comment above).
    priceCents: integer("price_cents"),
    // Ordered click/tap-through reading pages shown before the drill list
    // and end-of-chapter quiz -- the actual lesson lecture content, as
    // opposed to `description`'s short teaser shown while still locked. See
    // classLessonQuizQuestions for the quiz that follows this content.
    content: json("content").$type<{ title?: string; body: string }[]>().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    classIdx: index("class_lessons_class_idx").on(table.classId),
  }),
);

// One quiz per lesson, taken after its content pages -- unlike Coaches
// Corner's ungraded self-check (academyQuizQuestions), this one gates
// progress (see classLessonProgress.quizPassedAt), so answers are scored.
export const classLessonQuizQuestions = pgTable(
  "class_lesson_quiz_questions",
  {
    id: serial("id").primaryKey(),
    classLessonId: integer("class_lesson_id")
      .notNull()
      .references(() => classLessons.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    questionText: text("question_text").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    lessonIdx: index("class_lesson_quiz_questions_lesson_idx").on(table.classLessonId),
  }),
);

export const classLessonQuizAnswers = pgTable(
  "class_lesson_quiz_answers",
  {
    id: serial("id").primaryKey(),
    questionId: integer("question_id")
      .notNull()
      .references(() => classLessonQuizQuestions.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    answerText: text("answer_text").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
    // Shown when this specific answer is expanded after submitting, correct
    // or not -- same convention as academyQuizAnswers.explanation.
    explanation: text("explanation").notNull(),
  },
  (table) => ({
    questionIdx: index("class_lesson_quiz_answers_question_idx").on(table.questionId),
  }),
);

// A coach's own pacing override for a Forge Class they've assigned to their
// roster -- layered on top of (and, when present, replacing) the admin-
// authored default in classLessons.unlockRule/unlockThreshold. Lets a coach
// require real practice reps ("effort drip": the athlete must actually log
// completed sessions of the previous lesson's drill day some number of
// times, not just let a calendar day pass) alongside or instead of a
// minimum wait ("time drip"), independent of whatever rule the admin who
// authored the content originally picked. Scoped to (classId, coachId), not
// per-lesson -- one pacing setting governs every lesson-to-lesson
// transition in the class for that coach's roster. Never touches the
// class/lesson content itself, so this stays editable by a coach even on an
// isForgeOfficial class whose lessons are otherwise admin-only.
export const classCoachSettings = pgTable(
  "class_coach_settings",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    coachId: integer("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Effort drip: minimum distinct logged sessions of a lesson's drill day
    // required before the next lesson can unlock. Null = no repetition
    // requirement from this override.
    minSessionsRequired: integer("min_sessions_required"),
    // Time drip: minimum whole days that must elapse after a lesson unlocks
    // before the next one can. Combines with minSessionsRequired (both must
    // clear) rather than either/or. Null = no minimum wait from this
    // override.
    minDaysElapsed: integer("min_days_elapsed"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    classCoachIdx: uniqueIndex("class_coach_settings_class_coach_idx").on(
      table.classId,
      table.coachId,
    ),
  }),
);

export const classEnrollments = pgTable(
  "class_enrollments",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The coach who enrolled this athlete -- equals athleteId for a Free
    // Agent's own self-enrollment into a Forge Class, same bypass reasoning
    // as skillAssignments.coachId (an athlete is never on their own roster).
    coachId: integer("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    // Set once, the first time every lesson in the class satisfies its
    // requirement (quizPassedAt for a quiz-bearing lesson, contentCompletedAt
    // otherwise) -- see storage.checkAndMarkClassCompleted. Drives the
    // class-level completion badge, distinct from the per-lesson bronze/gold
    // quiz stars.
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteIdx: index("class_enrollments_athlete_idx").on(table.athleteId),
    classIdx: index("class_enrollments_class_idx").on(table.classId),
  }),
);

export const classLessonProgress = pgTable(
  "class_lesson_progress",
  {
    id: serial("id").primaryKey(),
    enrollmentId: integer("enrollment_id")
      .notNull()
      .references(() => classEnrollments.id, { onDelete: "cascade" }),
    classLessonId: integer("class_lesson_id")
      .notNull()
      .references(() => classLessons.id, { onDelete: "cascade" }),
    // Set once this lesson actually starts (progression gate cleared AND,
    // if priced, paid for) -- that's the moment its skill program lands on
    // the athlete's calendar. Null before that, including while the lesson
    // is merely "reachable" (previous lesson done, this one still unpaid).
    skillAssignmentId: integer("skill_assignment_id").references(() => skillAssignments.id, {
      onDelete: "set null",
    }),
    unlockedAt: timestamp("unlocked_at"),
    purchasedAt: timestamp("purchased_at"),
    // Coach/admin escape hatch -- force a lesson open regardless of what its
    // unlock rule says, independent of which rule type the lesson uses.
    manuallyUnlocked: boolean("manually_unlocked").notNull().default(false),
    // Set once the athlete has clicked/tapped through every content page.
    // Required (alongside quizPassedAt) before the "Add to Calendar" button
    // that actually creates skillAssignmentId becomes clickable, for any
    // lesson that has quiz questions -- see recomputeClassProgress.
    contentCompletedAt: timestamp("content_completed_at"),
    // Set the first time the athlete clears the pass threshold on this
    // lesson's quiz. Unlimited retries; earlier failed attempts aren't
    // persisted, only the eventual pass.
    quizPassedAt: timestamp("quiz_passed_at"),
    // Set the first time the athlete gets every question right in one
    // attempt (implies quizPassedAt). Drives the gold-vs-bronze star shown
    // on the lesson card -- bronze for quizPassedAt, gold for this.
    quizPerfectAt: timestamp("quiz_perfect_at"),
    // Consecutive failed attempts since the last pass (or since starting).
    // Reset to 0 on a pass. Crossing CLASS_QUIZ_STUCK_THRESHOLD fires a
    // one-time "athlete is stuck" notification to their coach -- see
    // coachNotifiedStuckAt below and submitClassLessonQuiz.
    quizFailCount: integer("quiz_fail_count").notNull().default(0),
    // Guards the stuck notification to fire once per lesson, not on every
    // failed attempt past the threshold.
    coachNotifiedStuckAt: timestamp("coach_notified_stuck_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    enrollmentIdx: index("class_lesson_progress_enrollment_idx").on(table.enrollmentId),
  }),
);

export const classesRelations = relations(classes, ({ one, many }) => ({
  coach: one(users, { fields: [classes.coachId], references: [users.id] }),
  lessons: many(classLessons),
  enrollments: many(classEnrollments),
}));

export const classLessonsRelations = relations(classLessons, ({ one, many }) => ({
  class: one(classes, { fields: [classLessons.classId], references: [classes.id] }),
  skillProgram: one(skillPrograms, {
    fields: [classLessons.skillProgramId],
    references: [skillPrograms.id],
  }),
  progress: many(classLessonProgress),
  quizQuestions: many(classLessonQuizQuestions),
}));

export const classLessonQuizQuestionsRelations = relations(
  classLessonQuizQuestions,
  ({ one, many }) => ({
    lesson: one(classLessons, {
      fields: [classLessonQuizQuestions.classLessonId],
      references: [classLessons.id],
    }),
    answers: many(classLessonQuizAnswers),
  }),
);

export const classLessonQuizAnswersRelations = relations(classLessonQuizAnswers, ({ one }) => ({
  question: one(classLessonQuizQuestions, {
    fields: [classLessonQuizAnswers.questionId],
    references: [classLessonQuizQuestions.id],
  }),
}));

export const classCoachSettingsRelations = relations(classCoachSettings, ({ one }) => ({
  class: one(classes, { fields: [classCoachSettings.classId], references: [classes.id] }),
  coach: one(users, { fields: [classCoachSettings.coachId], references: [users.id] }),
}));

export const classEnrollmentsRelations = relations(classEnrollments, ({ one, many }) => ({
  class: one(classes, { fields: [classEnrollments.classId], references: [classes.id] }),
  athlete: one(users, { fields: [classEnrollments.athleteId], references: [users.id] }),
  lessonProgress: many(classLessonProgress),
}));

export const classLessonProgressRelations = relations(classLessonProgress, ({ one }) => ({
  enrollment: one(classEnrollments, {
    fields: [classLessonProgress.enrollmentId],
    references: [classEnrollments.id],
  }),
  lesson: one(classLessons, {
    fields: [classLessonProgress.classLessonId],
    references: [classLessons.id],
  }),
  skillAssignment: one(skillAssignments, {
    fields: [classLessonProgress.skillAssignmentId],
    references: [skillAssignments.id],
  }),
}));

export type Class = typeof classes.$inferSelect;
export type ClassLesson = typeof classLessons.$inferSelect;
export type ClassEnrollment = typeof classEnrollments.$inferSelect;
export type ClassLessonProgress = typeof classLessonProgress.$inferSelect;
export type ClassLessonQuizQuestion = typeof classLessonQuizQuestions.$inferSelect;
export type ClassLessonQuizAnswer = typeof classLessonQuizAnswers.$inferSelect;
export type ClassCoachSettings = typeof classCoachSettings.$inferSelect;

export const classLessonContentPageSchema = z.object({
  title: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1).max(10000),
  // A reference link for further instruction on this page's topic -- either
  // a pasted YouTube search-results URL (same convention as
  // skillVideoSearchUrl in server/seed.ts -- a specific hand-picked video ID
  // can go dead or turn out wrong with no way to verify it from here) or a
  // relative /uploads/lesson-videos/... path from a direct upload. Not
  // `.url()`-validated for the same reason imageUrls below isn't -- a
  // relative path is an expected case, not an edge case.
  videoUrl: z.string().trim().min(1).max(500).nullable().optional(),
  // Original instructional diagrams, not stock photography (none licensed
  // for use here) -- a relative static asset path (e.g. "/lessons/x.svg")
  // or a full URL, shown as a small gallery under the page's body text.
  // Not `.url()`-validated since a relative path is the expected common
  // case, not an edge case.
  imageUrls: z.array(z.string().trim().min(1).max(500)).max(6).optional(),
  // A downloadable worksheet/handout for this page -- a relative
  // /uploads/lesson-attachments/... path from a direct upload, same
  // reasoning as videoUrl above.
  attachmentUrl: z.string().trim().min(1).max(500).nullable().optional(),
  attachmentName: z.string().trim().max(200).nullable().optional(),
});

export const classLessonQuizAnswerInputSchema = z.object({
  // Present when editing an existing answer; absent for a new one -- same
  // in-place-update convention as classLessonInputSchema.id.
  id: z.number().optional(),
  orderIndex: z.number().int().default(0),
  answerText: z.string().trim().min(1).max(500),
  isCorrect: z.boolean().default(false),
  explanation: z.string().trim().min(1).max(1000),
});

export const classLessonQuizQuestionInputSchema = z.object({
  id: z.number().optional(),
  orderIndex: z.number().int().default(0),
  questionText: z.string().trim().min(1).max(1000),
  answers: z.array(classLessonQuizAnswerInputSchema).min(2).max(8),
});

export const classLessonExerciseInputSchema = z.object({
  skillExerciseId: z.number(),
  orderIndex: z.number().int().default(0),
  sets: z.number().int().min(1).default(3),
  reps: z.string().trim().min(1).default("10"),
  restSeconds: z.number().int().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  trackingLevel: z.enum(["none", "sprint", "mechanics"]).default("none"),
});

export const classLessonInputSchema = z.object({
  // Present when editing an existing lesson (matches it for in-place
  // update, preserving its hidden skillProgramId and therefore any
  // skillAssignments already created off it) -- absent for a brand-new
  // lesson being added in this same save. See updateClassStructure.
  id: z.number().optional(),
  lessonNumber: z.number().int().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  unlockRule: z.enum(["immediate", "time_elapsed", "sessions_logged", "reps_logged", "manual"]),
  unlockThreshold: z.number().int().min(1).nullable().optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  exercises: z.array(classLessonExerciseInputSchema).default([]),
  content: z.array(classLessonContentPageSchema).default([]),
  quizQuestions: z.array(classLessonQuizQuestionInputSchema).default([]),
});

export const classStructureSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  prerequisiteClassId: z.number().int().positive().nullable().optional(),
  isDraft: z.boolean().optional(),
  lessons: z.array(classLessonInputSchema).default([]),
});

export type ClassStructureInput = z.infer<typeof classStructureSchema>;
export type ClassLessonInput = z.infer<typeof classLessonInputSchema>;

export const enrollInClassSchema = z.object({
  classId: z.number(),
  startDate: z.string(),
});

// A coach's pacing override for a class -- see classCoachSettings' own
// comment for why this is separate from (and coach-editable independent of)
// the admin-authored lesson content. Both fields nullable; either or both
// may be set, and either may be cleared back to null (falling back to the
// lesson's own admin default) by omitting it here.
export const classCoachSettingsInputSchema = z.object({
  minSessionsRequired: z.number().int().min(1).max(365).nullable().optional(),
  minDaysElapsed: z.number().int().min(1).max(365).nullable().optional(),
});

export type ClassCoachSettingsInput = z.infer<typeof classCoachSettingsInputSchema>;

// ---------- Coaches Corner (admin-authored coach education, "Coaches
// Corner") ----------
// A separate, much simpler content model than Classes above: this is
// reading/reference material for the COACH (program-design theory, Olympic
// lift technique, youth development, arm care, reading Forge's own
// analytics, season planning, coaching communication), not a drill an
// athlete performs, so there's no hidden skill program, no camera tracking,
// and no per-athlete enrollment. Platform-wide, admin-authored, and paywalled
// as a single bundle (see hasCoachesCornerAccess in routes.ts) rather than
// priced per-lesson.
export const academyTracks = pgTable("academy_tracks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  // A concise, AI-facing distillation of this track's core teaching points --
  // injected into every AI coach/program-builder system prompt IN ADDITION
  // TO (never in place of) the admin-taught aiKnowledge/nutritionKnowledge
  // guidelines, so every bot in the app reflects the same coaching
  // philosophy taught here. See getCoachesCornerPrinciplesForAi in storage.ts.
  keyPrinciplesForAi: text("key_principles_for_ai").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const academyLessons = pgTable(
  "academy_lessons",
  {
    id: serial("id").primaryKey(),
    trackId: integer("track_id")
      .notNull()
      .references(() => academyTracks.id, { onDelete: "cascade" }),
    lessonNumber: integer("lesson_number").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    estMinutes: integer("est_minutes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    trackIdx: index("academy_lessons_track_idx").on(table.trackId),
  }),
);

// A coach's own "read this" checkbox -- purely a personal progress marker
// (drives a completion count on the track catalog), never gates access to
// later lessons the way Class lesson progress does.
export const academyLessonCompletions = pgTable(
  "academy_lesson_completions",
  {
    id: serial("id").primaryKey(),
    coachId: integer("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => academyLessons.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at").notNull().defaultNow(),
  },
  (table) => ({
    coachLessonUnique: uniqueIndex("academy_lesson_completions_coach_lesson_idx").on(
      table.coachId,
      table.lessonId,
    ),
  }),
);

// One quiz per track, shown after the lesson list -- a self-check, not a
// scored exam (no attempt/score persistence). Every answer carries its own
// explanation, correct or not, so a coach can expand any answer at any
// time to see why it's right or wrong, not just the one they picked.
export const academyQuizQuestions = pgTable(
  "academy_quiz_questions",
  {
    id: serial("id").primaryKey(),
    trackId: integer("track_id")
      .notNull()
      .references(() => academyTracks.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    questionText: text("question_text").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    trackIdx: index("academy_quiz_questions_track_idx").on(table.trackId),
  }),
);

export const academyQuizAnswers = pgTable(
  "academy_quiz_answers",
  {
    id: serial("id").primaryKey(),
    questionId: integer("question_id")
      .notNull()
      .references(() => academyQuizQuestions.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    answerText: text("answer_text").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
    // Shown when this specific answer is expanded -- written to stand on its
    // own regardless of which answer the coach actually picked first.
    explanation: text("explanation").notNull(),
  },
  (table) => ({
    questionIdx: index("academy_quiz_answers_question_idx").on(table.questionId),
  }),
);

export const academyTracksRelations = relations(academyTracks, ({ many }) => ({
  lessons: many(academyLessons),
  quizQuestions: many(academyQuizQuestions),
}));

export const academyQuizQuestionsRelations = relations(academyQuizQuestions, ({ one, many }) => ({
  track: one(academyTracks, { fields: [academyQuizQuestions.trackId], references: [academyTracks.id] }),
  answers: many(academyQuizAnswers),
}));

export const academyQuizAnswersRelations = relations(academyQuizAnswers, ({ one }) => ({
  question: one(academyQuizQuestions, {
    fields: [academyQuizAnswers.questionId],
    references: [academyQuizQuestions.id],
  }),
}));

export const academyLessonsRelations = relations(academyLessons, ({ one, many }) => ({
  track: one(academyTracks, { fields: [academyLessons.trackId], references: [academyTracks.id] }),
  completions: many(academyLessonCompletions),
}));

export const academyLessonCompletionsRelations = relations(academyLessonCompletions, ({ one }) => ({
  lesson: one(academyLessons, {
    fields: [academyLessonCompletions.lessonId],
    references: [academyLessons.id],
  }),
  coach: one(users, { fields: [academyLessonCompletions.coachId], references: [users.id] }),
}));

export type AcademyTrack = typeof academyTracks.$inferSelect;
export type AcademyLesson = typeof academyLessons.$inferSelect;
export type AcademyQuizQuestion = typeof academyQuizQuestions.$inferSelect;
export type AcademyQuizAnswer = typeof academyQuizAnswers.$inferSelect;

export const academyLessonInputSchema = z.object({
  // Present when editing an existing lesson (matches it for in-place
  // update) -- absent for a brand-new lesson being added in this same save.
  id: z.number().optional(),
  lessonNumber: z.number().int().min(1),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  estMinutes: z.number().int().min(1).nullable().optional(),
});

export const academyQuizAnswerInputSchema = z.object({
  id: z.number().optional(),
  orderIndex: z.number().int().default(0),
  answerText: z.string().trim().min(1).max(300),
  isCorrect: z.boolean().default(false),
  explanation: z.string().trim().min(1).max(1000),
});

export const academyQuizQuestionInputSchema = z.object({
  id: z.number().optional(),
  orderIndex: z.number().int().default(0),
  questionText: z.string().trim().min(1).max(500),
  answers: z.array(academyQuizAnswerInputSchema).min(2).max(6),
});

export const academyTrackStructureSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  keyPrinciplesForAi: z.string().trim().min(1).max(4000),
  orderIndex: z.number().int().default(0),
  lessons: z.array(academyLessonInputSchema).default([]),
  quizQuestions: z.array(academyQuizQuestionInputSchema).default([]),
});

export type AcademyTrackStructureInput = z.infer<typeof academyTrackStructureSchema>;
export type AcademyLessonInput = z.infer<typeof academyLessonInputSchema>;
export type AcademyQuizQuestionInput = z.infer<typeof academyQuizQuestionInputSchema>;
export type AcademyQuizAnswerInput = z.infer<typeof academyQuizAnswerInputSchema>;

export const aiKnowledgeChatRoleEnum = pgEnum("ai_knowledge_chat_role", ["admin", "assistant"]);

// Chat transcript for the admin teaching the AI program builder general
// programming knowledge (e.g. "Bulgarian split squats are a secondary lift
// on leg day, not a true accessory") -- separate from programChatMessages
// above, which edits one specific program. This conversation edits
// aiKnowledge.guidelines instead, which every program-generation prompt
// reads and applies platform-wide. Global, not per-athlete/per-program --
// there's only ever one admin-facing knowledge conversation.
export const aiKnowledgeMessages = pgTable(
  "ai_knowledge_messages",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: aiKnowledgeChatRoleEnum("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    createdIdx: index("ai_knowledge_messages_created_idx").on(table.createdAt),
  }),
);

export type AiKnowledgeMessage = typeof aiKnowledgeMessages.$inferSelect;

// Singleton row (always id 1) holding the AI's current living programming
// guidelines. Each admin chat turn proposes a full rewrite of this document
// (see storage.updateAiKnowledgeFromChat) but only commits it here once the
// admin reviews a diff and explicitly applies it (applyAiKnowledgeProposal)
// -- there's no in-between "patch" representation for free text the way
// programChatMessages/programs has for structured program data, so the
// safety net is a human review step instead of a structural one.
export const aiKnowledge = pgTable("ai_knowledge", {
  id: integer("id").primaryKey(),
  guidelines: text("guidelines").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sendAiKnowledgeChatMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export type SendAiKnowledgeChatMessageInput = z.infer<typeof sendAiKnowledgeChatMessageSchema>;

export const applyKnowledgeProposalSchema = z.object({
  guidelines: z.string().trim().min(1).max(20000),
});

export type ApplyKnowledgeProposalInput = z.infer<typeof applyKnowledgeProposalSchema>;

// Same admin-teaching pattern as aiKnowledge/aiKnowledgeMessages above, but
// for the nutrition education AI (answerNutritionQuestion) instead of the
// program builder -- a separate conversation and a separate living
// guidelines document, since the two AIs serve completely different
// knowledge domains and the admin may want to teach them independently.
export const nutritionKnowledgeMessages = pgTable(
  "nutrition_knowledge_messages",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: aiKnowledgeChatRoleEnum("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    createdIdx: index("nutrition_knowledge_messages_created_idx").on(table.createdAt),
  }),
);

export type NutritionKnowledgeMessage = typeof nutritionKnowledgeMessages.$inferSelect;

// Singleton row (always id 1) holding the nutrition AI's current living
// guidelines, rewritten in full on every admin chat turn.
export const nutritionKnowledge = pgTable("nutrition_knowledge", {
  id: integer("id").primaryKey(),
  guidelines: text("guidelines").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const substituteExerciseSchema = z.object({
  programExerciseId: z.number().int().positive(),
  reason: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(500).optional().default(""),
});

export type SubstituteExerciseInput = z.infer<typeof substituteExerciseSchema>;

// ---------- Relations ----------

export const usersRelations = relations(users, ({ many }) => ({
  exercises: many(exercises),
  programs: many(programs),
  coachedAthletes: many(coachAthletes, { relationName: "coach" }),
  coaches: many(coachAthletes, { relationName: "athlete" }),
  teams: many(teams),
}));

export const coachAthletesRelations = relations(coachAthletes, ({ one }) => ({
  coach: one(users, {
    fields: [coachAthletes.coachId],
    references: [users.id],
    relationName: "coach",
  }),
  athlete: one(users, {
    fields: [coachAthletes.athleteId],
    references: [users.id],
    relationName: "athlete",
  }),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  coach: one(users, { fields: [teams.coachId], references: [users.id] }),
  members: many(teamMembers),
  challenges: many(teamChallenges),
  gameDays: many(teamGameDays),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  athlete: one(users, {
    fields: [teamMembers.athleteId],
    references: [users.id],
  }),
}));

export const teamChallengesRelations = relations(teamChallenges, ({ one }) => ({
  team: one(teams, { fields: [teamChallenges.teamId], references: [teams.id] }),
}));

export const teamGameDaysRelations = relations(teamGameDays, ({ one }) => ({
  team: one(teams, { fields: [teamGameDays.teamId], references: [teams.id] }),
}));

export const coachStaffRelations = relations(coachStaff, ({ one }) => ({
  primaryCoach: one(users, {
    fields: [coachStaff.primaryCoachId],
    references: [users.id],
    relationName: "primaryCoach",
  }),
  staffCoach: one(users, {
    fields: [coachStaff.staffCoachId],
    references: [users.id],
    relationName: "staffCoach",
  }),
}));

export const teamPostsRelations = relations(teamPosts, ({ one }) => ({
  coach: one(users, { fields: [teamPosts.coachId], references: [users.id] }),
  author: one(users, { fields: [teamPosts.authorId], references: [users.id] }),
}));

export const exercisesRelations = relations(exercises, ({ one }) => ({
  coach: one(users, { fields: [exercises.coachId], references: [users.id] }),
}));

export const skillExercisesRelations = relations(skillExercises, ({ one }) => ({
  coach: one(users, { fields: [skillExercises.coachId], references: [users.id] }),
}));

export const skillProgramsRelations = relations(skillPrograms, ({ one, many }) => ({
  coach: one(users, { fields: [skillPrograms.coachId], references: [users.id] }),
  weeks: many(skillProgramWeeks),
  assignments: many(skillAssignments),
}));

export const skillProgramWeeksRelations = relations(skillProgramWeeks, ({ one, many }) => ({
  program: one(skillPrograms, {
    fields: [skillProgramWeeks.programId],
    references: [skillPrograms.id],
  }),
  days: many(skillProgramDays),
}));

export const skillProgramDaysRelations = relations(skillProgramDays, ({ one, many }) => ({
  week: one(skillProgramWeeks, {
    fields: [skillProgramDays.weekId],
    references: [skillProgramWeeks.id],
  }),
  exercises: many(skillProgramExercises),
}));

export const skillProgramExercisesRelations = relations(skillProgramExercises, ({ one }) => ({
  day: one(skillProgramDays, {
    fields: [skillProgramExercises.dayId],
    references: [skillProgramDays.id],
  }),
  skillExercise: one(skillExercises, {
    fields: [skillProgramExercises.skillExerciseId],
    references: [skillExercises.id],
  }),
}));

export const skillAssignmentsRelations = relations(skillAssignments, ({ one }) => ({
  program: one(skillPrograms, {
    fields: [skillAssignments.skillProgramId],
    references: [skillPrograms.id],
  }),
  athlete: one(users, { fields: [skillAssignments.athleteId], references: [users.id] }),
  coach: one(users, { fields: [skillAssignments.coachId], references: [users.id] }),
}));

export const skillSessionLogsRelations = relations(skillSessionLogs, ({ one }) => ({
  assignment: one(skillAssignments, {
    fields: [skillSessionLogs.skillAssignmentId],
    references: [skillAssignments.id],
  }),
  day: one(skillProgramDays, {
    fields: [skillSessionLogs.skillProgramDayId],
    references: [skillProgramDays.id],
  }),
  programExercise: one(skillProgramExercises, {
    fields: [skillSessionLogs.skillProgramExerciseId],
    references: [skillProgramExercises.id],
  }),
  athlete: one(users, { fields: [skillSessionLogs.athleteId], references: [users.id] }),
}));

export const exerciseSubmissionsRelations = relations(exerciseSubmissions, ({ one }) => ({
  exercise: one(exercises, {
    fields: [exerciseSubmissions.exerciseId],
    references: [exercises.id],
  }),
  submitter: one(users, {
    fields: [exerciseSubmissions.submittedBy],
    references: [users.id],
  }),
}));

export const exerciseReportsRelations = relations(exerciseReports, ({ one }) => ({
  exercise: one(exercises, { fields: [exerciseReports.exerciseId], references: [exercises.id] }),
  reporter: one(users, { fields: [exerciseReports.reportedBy], references: [users.id] }),
}));

export const programsRelations = relations(programs, ({ one, many }) => ({
  coach: one(users, { fields: [programs.coachId], references: [users.id] }),
  weeks: many(programWeeks),
  blocks: many(programBlocks),
  assignments: many(assignments),
}));

export const programBlocksRelations = relations(programBlocks, ({ one, many }) => ({
  program: one(programs, { fields: [programBlocks.programId], references: [programs.id] }),
  weeks: many(programWeeks),
}));

export const programWeeksRelations = relations(
  programWeeks,
  ({ one, many }) => ({
    program: one(programs, {
      fields: [programWeeks.programId],
      references: [programs.id],
    }),
    block: one(programBlocks, {
      fields: [programWeeks.blockId],
      references: [programBlocks.id],
    }),
    days: many(programDays),
  }),
);

export const programDaysRelations = relations(
  programDays,
  ({ one, many }) => ({
    week: one(programWeeks, {
      fields: [programDays.weekId],
      references: [programWeeks.id],
    }),
    exercises: many(programExercises),
    correctives: many(assignmentCorrectives),
  }),
);

export const programExercisesRelations = relations(
  programExercises,
  ({ one }) => ({
    day: one(programDays, {
      fields: [programExercises.dayId],
      references: [programDays.id],
    }),
    exercise: one(exercises, {
      fields: [programExercises.exerciseId],
      references: [exercises.id],
    }),
  }),
);

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  program: one(programs, {
    fields: [assignments.programId],
    references: [programs.id],
  }),
  athlete: one(users, {
    fields: [assignments.athleteId],
    references: [users.id],
  }),
  coach: one(users, {
    fields: [assignments.coachId],
    references: [users.id],
  }),
  logs: many(workoutLogs),
  correctives: many(assignmentCorrectives),
  comments: many(workoutComments),
}));

export const workoutCommentsRelations = relations(workoutComments, ({ one }) => ({
  assignment: one(assignments, {
    fields: [workoutComments.assignmentId],
    references: [assignments.id],
  }),
  programDay: one(programDays, {
    fields: [workoutComments.programDayId],
    references: [programDays.id],
  }),
  author: one(users, {
    fields: [workoutComments.authorId],
    references: [users.id],
  }),
}));

export const assignmentCorrectivesRelations = relations(
  assignmentCorrectives,
  ({ one }) => ({
    assignment: one(assignments, {
      fields: [assignmentCorrectives.assignmentId],
      references: [assignments.id],
    }),
    day: one(programDays, {
      fields: [assignmentCorrectives.programDayId],
      references: [programDays.id],
    }),
    exercise: one(exercises, {
      fields: [assignmentCorrectives.exerciseId],
      references: [exercises.id],
    }),
  }),
);

export const assignmentExerciseOverridesRelations = relations(
  assignmentExerciseOverrides,
  ({ one }) => ({
    assignment: one(assignments, {
      fields: [assignmentExerciseOverrides.assignmentId],
      references: [assignments.id],
    }),
    day: one(programDays, {
      fields: [assignmentExerciseOverrides.programDayId],
      references: [programDays.id],
    }),
    programExercise: one(programExercises, {
      fields: [assignmentExerciseOverrides.programExerciseId],
      references: [programExercises.id],
    }),
    substituteExercise: one(exercises, {
      fields: [assignmentExerciseOverrides.substituteExerciseId],
      references: [exercises.id],
    }),
  }),
);

export const workoutLogsRelations = relations(
  workoutLogs,
  ({ one, many }) => ({
    assignment: one(assignments, {
      fields: [workoutLogs.assignmentId],
      references: [assignments.id],
    }),
    day: one(programDays, {
      fields: [workoutLogs.programDayId],
      references: [programDays.id],
    }),
    athlete: one(users, {
      fields: [workoutLogs.athleteId],
      references: [users.id],
    }),
    entries: many(workoutLogEntries),
  }),
);

export const workoutLogEntriesRelations = relations(
  workoutLogEntries,
  ({ one, many }) => ({
    log: one(workoutLogs, {
      fields: [workoutLogEntries.workoutLogId],
      references: [workoutLogs.id],
    }),
    programExercise: one(programExercises, {
      fields: [workoutLogEntries.programExerciseId],
      references: [programExercises.id],
    }),
    corrective: one(assignmentCorrectives, {
      fields: [workoutLogEntries.correctiveId],
      references: [assignmentCorrectives.id],
    }),
    sets: many(workoutSetEntries),
  }),
);

export const workoutSetEntriesRelations = relations(
  workoutSetEntries,
  ({ one }) => ({
    logEntry: one(workoutLogEntries, {
      fields: [workoutSetEntries.logEntryId],
      references: [workoutLogEntries.id],
    }),
  }),
);

// ---------- Zod insert schemas ----------

export const insertUserSchema = createInsertSchema(users)
  .pick({ email: true, passwordHash: true, name: true, role: true })
  .extend({ email: z.string().email() });

// role is deliberately restricted to coach/athlete -- admin accounts are
// never self-service, only promoted directly in the database.
export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required"),
  role: z.enum(["coach", "athlete"]),
  coachCode: z.string().optional(),
  phone: z.string().trim().max(20).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updatePreferencesSchema = z.object({
  preferredWeightUnit: z.enum(["lbs", "kg"]),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  age: z.number().int().min(0).max(120).optional().nullable(),
  gender: z.enum(["male", "female", "non_binary", "prefer_not_to_say"]).optional().nullable(),
  heightIn: z.number().int().min(0).max(120).optional().nullable(),
  bodyWeightLbs: z.number().min(0).max(1500).optional().nullable(),
  sport: z.string().trim().max(60).optional().nullable(),
  position: z.string().trim().max(60).optional().nullable(),
  seasonPhase: z.enum(["off_season", "pre_season", "in_season", "taper"]).optional().nullable(),
  trainingStylePreference: z.enum(["traditional", "combination_circuit"]).optional().nullable(),
  fortyYardDash: z.number().min(0).max(20).optional().nullable(),
  verticalJumpIn: z.number().min(0).max(60).optional().nullable(),
  broadJumpIn: z.number().min(0).max(200).optional().nullable(),
  proAgilitySeconds: z.number().min(0).max(20).optional().nullable(),
  benchMaxLbs: z.number().min(0).max(1500).optional().nullable(),
  squatMaxLbs: z.number().min(0).max(1500).optional().nullable(),
  deadliftMaxLbs: z.number().min(0).max(1500).optional().nullable(),
});

export const updateNotificationPrefsSchema = z.object({
  phone: z.string().trim().max(20).optional().nullable(),
  notifyEmail: z.boolean(),
  notifySms: z.boolean(),
});

export const insertExerciseSchema = createInsertSchema(exercises)
  .pick({
    name: true,
    category: true,
    muscleGroup: true,
    equipment: true,
    videoUrl: true,
    instructions: true,
  })
  .extend({
    movementType: z.string().optional().nullable(),
    laterality: z.enum(["bilateral", "unilateral"]).optional().nullable(),
    bodyRegion: z.string().optional().nullable(),
    plane: z.string().optional().nullable(),
    secondaryMuscles: z
      .array(z.string().trim().min(1))
      .max(8, "You can select up to 8 secondary muscles")
      .optional()
      .nullable(),
    sports: z.array(z.string().trim().min(1)).max(8, "You can select up to 8 sports").optional().nullable(),
    isCorrective: z.boolean().default(false),
    usesWeight: z.boolean().default(true),
    usesBodyweight: z.boolean().default(false),
    usesBand: z.boolean().default(false),
    usesBox: z.boolean().default(false),
  });

export const insertSkillExerciseSchema = createInsertSchema(skillExercises)
  .pick({
    name: true,
    skillType: true,
    equipment: true,
    videoUrl: true,
    instructions: true,
  })
  .extend({
    sports: z.array(z.string().trim().min(1)).max(8, "You can select up to 8 sports").optional().nullable(),
  });

// ---------- Skill Programs (fully separate from Programs) ----------
export const skillProgramExerciseInputSchema = z.object({
  id: z.number().optional(),
  skillExerciseId: z.number(),
  orderIndex: z.number().default(0),
  sets: z.number().min(1).default(3),
  reps: z.string().default("10"),
  restSeconds: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  trackingLevel: z.enum(["none", "sprint", "mechanics"]).optional(),
});

export const skillProgramDayInputSchema = z.object({
  id: z.number().optional(),
  dayNumber: z.number(),
  title: z.string().default("Skill Session"),
  isRestDay: z.boolean().default(false),
  exercises: z.array(skillProgramExerciseInputSchema).default([]),
});

export const skillProgramWeekInputSchema = z.object({
  id: z.number().optional(),
  weekNumber: z.number(),
  name: z.string().optional().nullable(),
  days: z.array(skillProgramDayInputSchema).default([]),
});

export const skillProgramStructureSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  weeks: z.array(skillProgramWeekInputSchema).default([]),
});

export const insertSkillAssignmentSchema = z.object({
  skillProgramId: z.number(),
  startDate: z.string(),
  durationWeeks: z.number().int().min(1).max(12).default(1),
  dateOverrides: z.record(z.string(), z.string()).optional(),
  athletes: z.array(z.object({ athleteId: z.number() })).min(1),
});

export const insertProgramSchema = createInsertSchema(programs).pick({
  name: true,
  description: true,
});

export const programExerciseInputSchema = z.object({
  id: z.number().optional(),
  exerciseId: z.number(),
  orderIndex: z.number().default(0),
  sets: z.number().min(1).default(3),
  reps: z.string().default("10"),
  weight: z.string().optional().nullable(),
  restSeconds: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  supersetGroup: z.string().optional().nullable(),
  restAfterGroupOnly: z.boolean().optional(),
  trackingLevel: z.enum(["none", "bar_path", "full", "jump"]).optional(),
  videoCheckEnabled: z.boolean().optional(),
});

export const programDayInputSchema = z.object({
  id: z.number().optional(),
  dayNumber: z.number(),
  title: z.string().default("Training Day"),
  isRestDay: z.boolean().default(false),
  exercises: z.array(programExerciseInputSchema).default([]),
});

export const programWeekInputSchema = z.object({
  id: z.number().optional(),
  weekNumber: z.number(),
  name: z.string().optional().nullable(),
  // Index into the sibling `blocks` array on programStructureSchema below,
  // not a database id -- blocks are wiped and rebuilt in the same
  // save as weeks/days, so there's no stable id to reference until after
  // the insert. Null/omitted means this week isn't part of any block.
  blockIndex: z.number().optional().nullable(),
  days: z.array(programDayInputSchema).default([]),
});

export const programBlockInputSchema = z.object({
  name: z.string().min(1),
  phase: z.enum(PERIODIZATION_PHASES).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const programStructureSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  blocks: z.array(programBlockInputSchema).default([]),
  weeks: z.array(programWeekInputSchema).default([]),
});

export const insertAssignmentSchema = z.object({
  programId: z.number(),
  startDate: z.string(),
  // How many times to repeat the program's own week pattern -- see the
  // durationWeeks column comment in the assignments table.
  durationWeeks: z.number().int().min(1).max(12).default(1),
  // Optional manual schedule -- programDayId (as a string key) -> an
  // explicit date, for days that shouldn't land on the rigid "every 7 days
  // from startDate" grid (games, travel, an extra rest day). Applied the
  // same way to every athlete created in this one assignment call.
  dateOverrides: z.record(z.string(), z.string()).optional(),
  athletes: z
    .array(
      z.object({
        athleteId: z.number(),
        correctivesEnabled: z.boolean().default(true),
      }),
    )
    .min(1),
});

export const updateAssignmentSchema = z.object({
  correctivesEnabled: z.boolean().optional(),
  durationWeeks: z.number().int().min(1).max(12).optional(),
});

export const updateProgramDaySchema = z.object({
  title: z.string().min(1),
  isRestDay: z.boolean(),
  exercises: z.array(programExerciseInputSchema).default([]),
});

export const correctiveInputSchema = z.object({
  exerciseId: z.number(),
  orderIndex: z.number().default(0),
  sets: z.number().min(1).default(3),
  reps: z.string().default("10"),
  weight: z.string().optional().nullable(),
  restSeconds: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateCorrectivesSchema = z.object({
  correctives: z.array(correctiveInputSchema).default([]),
});

export const applyCorrectivesToDaysSchema = z.object({
  programDayIds: z.array(z.number()).min(1),
  correctives: z.array(correctiveInputSchema).default([]),
});

export const createWorkoutCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  videoUrl: z.string().trim().max(500).optional().nullable(),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  // The calendar date this comment/video is for -- see workoutComments.date.
  // Optional since a coach's reply isn't tied to one occurrence the way an
  // athlete's submission is.
  date: z.string().trim().max(20).optional().nullable(),
});

export const createAnnotationSchema = z.object({
  dataUrl: z.string().startsWith("data:image/png;base64,"),
});

export const createExerciseReportSchema = z.object({
  issueType: z.enum(["broken_video", "wrong_info", "misspelling", "other"]),
  note: z.string().trim().max(1000).optional(),
});

export const resolveSubmissionSchema = z.object({
  approve: z.boolean(),
  // Only meaningful when approving -- lets the admin give the exercise its
  // canonical Forge name in the same action, since it started as one
  // coach's own private name for it.
  name: z.string().trim().min(1).max(200).optional(),
});

export const barPathPointSchema = z.object({
  t: z.number(),
  x: z.number(),
  y: z.number(),
});

export const formFaultSchema = z.object({
  code: z.string(),
  label: z.string(),
});

export const createSkillSessionLogSchema = z.object({
  skillAssignmentId: z.number(),
  skillProgramDayId: z.number(),
  skillProgramExerciseId: z.number(),
  trackingLevel: z.enum(["sprint", "mechanics"]),
  elapsedSeconds: z.number().min(0).max(120).optional().nullable(),
  distanceYards: z.number().min(0).max(200).optional().nullable(),
  // "side"/"front_behind" are sprint's vocabulary, "face_on"/"down_the_line"
  // are mechanics' -- one shared text column (see skillSessionLogs), just
  // validated against whichever tracking level actually sent it.
  cameraAngle: z.enum(["side", "front_behind", "face_on", "down_the_line"]).optional().nullable(),
  faults: z.array(formFaultSchema).optional().nullable(),
  hipShoulderSeparationDeg: z.number().min(0).max(180).optional().nullable(),
  weightTransferPct: z.number().min(0).max(100).optional().nullable(),
  hipRotationDeg: z.number().min(0).max(360).optional().nullable(),
  armSlotDeg: z.number().min(0).max(90).optional().nullable(),
  armSlotLabel: z.enum(["overhand", "three-quarter", "sidearm"]).optional().nullable(),
  wellSequenced: z.boolean().optional().nullable(),
  // Opt-in only -- set when the athlete explicitly chooses "Save clip for
  // coach" after a capture (see MechanicsTrackerDialog); absent otherwise.
  videoUrl: z.string().trim().max(500).optional().nullable(),
});

export const setSkillSessionAnnotationSchema = z.object({
  imageUrl: z.string().trim().max(500).min(1),
});

// Full replacement, not a patch -- the settings form always has a value for
// every field (pre-filled with whatever's currently effective, default or
// override), so there's never a partial submission to reconcile. Bounds
// come from SKILL_FAULT_THRESHOLD_BOUNDS so this can't drift from what the
// UI itself enforces.
export const updateSkillFaultThresholdsSchema = z.object({
  minAccelerationLeanDeg: z.coerce
    .number()
    .min(SKILL_FAULT_THRESHOLD_BOUNDS.minAccelerationLeanDeg.min)
    .max(SKILL_FAULT_THRESHOLD_BOUNDS.minAccelerationLeanDeg.max),
  hipDropRatioThreshold: z.coerce
    .number()
    .min(SKILL_FAULT_THRESHOLD_BOUNDS.hipDropRatioThreshold.min)
    .max(SKILL_FAULT_THRESHOLD_BOUNDS.hipDropRatioThreshold.max),
  lowWeightTransferPct: z.coerce
    .number()
    .min(SKILL_FAULT_THRESHOLD_BOUNDS.lowWeightTransferPct.min)
    .max(SKILL_FAULT_THRESHOLD_BOUNDS.lowWeightTransferPct.max),
  lowHipRotationDeg: z.coerce
    .number()
    .min(SKILL_FAULT_THRESHOLD_BOUNDS.lowHipRotationDeg.min)
    .max(SKILL_FAULT_THRESHOLD_BOUNDS.lowHipRotationDeg.max),
  lowSeparationDeg: z.coerce
    .number()
    .min(SKILL_FAULT_THRESHOLD_BOUNDS.lowSeparationDeg.min)
    .max(SKILL_FAULT_THRESHOLD_BOUNDS.lowSeparationDeg.max),
  sequencingToleranceMs: z.coerce
    .number()
    .min(SKILL_FAULT_THRESHOLD_BOUNDS.sequencingToleranceMs.min)
    .max(SKILL_FAULT_THRESHOLD_BOUNDS.sequencingToleranceMs.max),
});

export const repBreakdownEntrySchema = z.object({
  repNumber: z.number(),
  peakVelocityMps: z.number(),
  meanVelocityMps: z.number(),
  concentricSeconds: z.number(),
  // How long into the concentric phase peak velocity was reached -- see
  // bar-tracking.ts's RepBreakdown comment. Optional since sets logged
  // before this field existed won't have it.
  timeToPeakVelocitySeconds: z.number().optional(),
  startT: z.number(),
  endT: z.number(),
  depthDeg: z.number().optional().nullable(),
  velocityCurve: z
    .array(z.object({ positionCm: z.number(), velocityMps: z.number() }))
    .optional(),
  // This rep's vertical range of motion, and (when a load was entered) its
  // peak concentric power -- same per-rep granularity as the fields above,
  // just added alongside them rather than as a separate array.
  romCm: z.number().optional().nullable(),
  peakPowerWatts: z.number().optional().nullable(),
  meanPowerWatts: z.number().optional().nullable(),
  // The eccentric (lowering) phase immediately preceding this rep's
  // concentric lift -- null for rep 1 when the set starts from a dead
  // stop (nothing to lower first).
  eccentricSeconds: z.number().optional().nullable(),
  eccentricVelocityMps: z.number().optional().nullable(),
});

export const armPathTraceSchema = z.object({
  left: z.array(barPathPointSchema),
  right: z.array(barPathPointSchema),
});

// One entry per rep of a bilateral lower-body lift, comparing how fast each
// knee extended during that rep's drive phase -- see pose-tracking.ts's
// computeLegDriveAsymmetry. asymmetryPercent is relative to whichever side
// drove faster, so 0 is perfectly even and higher means a bigger gap.
export const legDriveAsymmetryEntrySchema = z.object({
  repNumber: z.number(),
  leftDriveDegPerSec: z.number(),
  rightDriveDegPerSec: z.number(),
  asymmetryPercent: z.number(),
  dominantSide: z.enum(["left", "right"]),
});

// Same shape as legDriveAsymmetryEntrySchema above, but velocity (m/s)
// instead of angular drive rate -- see bar-tracking.ts's
// computeArmDriveAsymmetry for why a press/pull's two arms are compared by
// speed rather than a joint angle.
export const armDriveAsymmetryEntrySchema = z.object({
  repNumber: z.number(),
  leftVelocityMps: z.number(),
  rightVelocityMps: z.number(),
  asymmetryPercent: z.number(),
  dominantSide: z.enum(["left", "right"]),
});

// See bar-tracking.ts's computeRepTrustScores.
export const repTrustScoreSchema = z.object({
  repNumber: z.number(),
  score: z.number(),
  label: z.enum(["high", "medium", "low"]),
  notes: z.array(z.string()),
});

// One entry per detected jump within a "jump" tracking-mode set -- see
// jump-tracking.ts's summarizeJumpSet for how these are derived from the
// ankle-height trace. Distinct from repBreakdownEntrySchema above since a
// jump has no velocity/power numbers, and a lift rep has no flight or
// ground-contact time.
export const jumpBreakdownEntrySchema = z.object({
  repNumber: z.number(),
  flightSeconds: z.number(),
  jumpHeightCm: z.number(),
  peakHeightCm: z.number(),
  horizontalDistanceCm: z.number().nullable(),
  // Time on the ground before this jump's takeoff, measured from the
  // previous jump's landing -- null for the first jump in the set (nothing
  // to measure from).
  groundContactSeconds: z.number().nullable(),
});

export const setLogInputSchema = z.object({
  setNumber: z.number(),
  reps: z.string().optional().nullable(),
  weight: z.string().optional().nullable(),
  bandColor: z.string().optional().nullable(),
  boxHeight: z.string().optional().nullable(),
  boxHeightUnit: z.enum(["in", "m"]).optional().nullable(),
  peakVelocityMps: z.number().optional().nullable(),
  meanVelocityMps: z.number().optional().nullable(),
  concentricSeconds: z.number().optional().nullable(),
  eccentricSeconds: z.number().optional().nullable(),
  barPathDeviationCm: z.number().optional().nullable(),
  barPathTrace: z.array(barPathPointSchema).optional().nullable(),
  formFaults: z.array(formFaultSchema).optional().nullable(),
  repBreakdown: z.array(repBreakdownEntrySchema).optional().nullable(),
  armPathTrace: armPathTraceSchema.optional().nullable(),
  legDriveAsymmetry: z.array(legDriveAsymmetryEntrySchema).optional().nullable(),
  armDriveAsymmetry: z.array(armDriveAsymmetryEntrySchema).optional().nullable(),
  trustScores: z.array(repTrustScoreSchema).optional().nullable(),
  peakPowerWatts: z.number().optional().nullable(),
  meanPowerWatts: z.number().optional().nullable(),
  eccentricMeanVelocityMps: z.number().optional().nullable(),
  romCm: z.number().optional().nullable(),
  velocityLossPercent: z.number().optional().nullable(),
  formCheckVideoUrl: z.string().trim().max(500).optional().nullable(),
  formCheckFlag: z.enum(["best", "worst"]).optional().nullable(),
  jumpHeightCm: z.number().optional().nullable(),
  jumpDistanceCm: z.number().optional().nullable(),
  groundContactSeconds: z.number().optional().nullable(),
  reactiveStrengthIndex: z.number().optional().nullable(),
  jumpBreakdown: z.array(jumpBreakdownEntrySchema).optional().nullable(),
});

export const logEntryInputSchema = z
  .object({
    programExerciseId: z.number().optional(),
    correctiveId: z.number().optional(),
    weightMode: z.enum(["numeric", "bodyweight", "band"]).default("numeric"),
    rpe: z.number().optional().nullable(),
    notes: z.string().optional().nullable(),
    sets: z.array(setLogInputSchema).default([]),
  })
  .refine(
    (data) => (data.programExerciseId != null) !== (data.correctiveId != null),
    { message: "Exactly one of programExerciseId or correctiveId must be set" },
  );

export const coachAnalyticsQuerySchema = z.object({
  athleteId: z.coerce.number(),
  exerciseId: z.coerce.number(),
});

export const submitWorkoutLogSchema = z.object({
  assignmentId: z.number(),
  programDayId: z.number(),
  date: z.string(),
  completed: z.boolean().default(false),
  entries: z.array(logEntryInputSchema).default([]),
});

// ---------- Types ----------

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Exercise = typeof exercises.$inferSelect;
export type SkillExercise = typeof skillExercises.$inferSelect;
export type SkillProgram = typeof skillPrograms.$inferSelect;
export type SkillAssignment = typeof skillAssignments.$inferSelect;
export type SkillSessionLog = typeof skillSessionLogs.$inferSelect;
export type Program = typeof programs.$inferSelect;
export type ProgramWeek = typeof programWeeks.$inferSelect;
export type ProgramDay = typeof programDays.$inferSelect;
export type ProgramExercise = typeof programExercises.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type AssignmentCorrective = typeof assignmentCorrectives.$inferSelect;
export type WorkoutLog = typeof workoutLogs.$inferSelect;
export type WorkoutLogEntry = typeof workoutLogEntries.$inferSelect;
export type WorkoutSetEntry = typeof workoutSetEntries.$inferSelect;
export type WorkoutComment = typeof workoutComments.$inferSelect;
export type Team = typeof teams.$inferSelect;

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProgramStructureInput = z.infer<typeof programStructureSchema>;
export type SkillProgramStructureInput = z.infer<typeof skillProgramStructureSchema>;
export type CreateSkillSessionLogInput = z.infer<typeof createSkillSessionLogSchema>;

export const generateProgramDraftSchema = z.object({
  prompt: z.string().trim().min(5).max(500),
  // Optional -- lets a coach point the draft at one specific roster athlete
  // so the AI can read that athlete's real profile (sport/position/age/
  // season) instead of guessing from the prompt text alone. Omitted for the
  // normal "build a reusable program, assign it later" flow.
  athleteId: z.number().int().positive().optional(),
});
export type GenerateProgramDraftInput = z.infer<typeof generateProgramDraftSchema>;
export type InsertAssignmentInput = z.infer<typeof insertAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type UpdateProgramDayInput = z.infer<typeof updateProgramDaySchema>;
export type UpdateCorrectivesInput = z.infer<typeof updateCorrectivesSchema>;
export type ApplyCorrectivesToDaysInput = z.infer<typeof applyCorrectivesToDaysSchema>;
export type SubmitWorkoutLogInput = z.infer<typeof submitWorkoutLogSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateNotificationPrefsInput = z.infer<typeof updateNotificationPrefsSchema>;
export type CreateWorkoutCommentInput = z.infer<typeof createWorkoutCommentSchema>;
export type CreateExerciseReportInput = z.infer<typeof createExerciseReportSchema>;
export type ResolveSubmissionInput = z.infer<typeof resolveSubmissionSchema>;

// healthStatus is coach-only -- deliberately excluded here so it never rides
// along in an athlete's own login/signup/me response. Coach-facing roster
// endpoints attach it explicitly (see getRosterForCoach).
export type PublicUser = Omit<User, "passwordHash" | "healthStatus">;

export const updateHealthStatusSchema = z.object({
  healthStatus: z.enum(["healthy", "hurt"]),
});
export type UpdateHealthStatusInput = z.infer<typeof updateHealthStatusSchema>;

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const createTeamPostSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  isAnnouncement: z.boolean().optional().default(false),
});
export type CreateTeamPostInput = z.infer<typeof createTeamPostSchema>;
export type TeamPost = typeof teamPosts.$inferSelect;

export const createBodyMetricSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  weight: z.coerce.number().positive(),
  weightUnit: z.enum(["lbs", "kg"]),
  bodyFatPercent: z.coerce.number().min(0).max(100).optional(),
  notes: z.string().max(500).optional(),
});
export type CreateBodyMetricInput = z.infer<typeof createBodyMetricSchema>;
export type BodyMetric = typeof bodyMetrics.$inferSelect;

export type TestingResult = typeof testingResults.$inferSelect;

export type GoniometerReading = typeof goniometerReadings.$inferSelect;
export type InsertGoniometerReading = z.infer<typeof insertGoniometerReadingSchema>;

// Every field optional/nullable -- a coach (or a Free Agent editing their
// own, see the athlete nutrition routes) can set as many or as few of these
// as they actually have real numbers for; partial data is normal, not an
// error state.
export const updateNutritionTargetsSchema = z.object({
  caloriesKcal: z.coerce.number().int().min(0).max(20000).optional().nullable(),
  proteinG: z.coerce.number().min(0).max(1000).optional().nullable(),
  carbsG: z.coerce.number().min(0).max(2000).optional().nullable(),
  fatG: z.coerce.number().min(0).max(1000).optional().nullable(),
  fiberG: z.coerce.number().min(0).max(300).optional().nullable(),
  waterOz: z.coerce.number().min(0).max(1000).optional().nullable(),
  calciumMg: z.coerce.number().min(0).max(10000).optional().nullable(),
  ironMg: z.coerce.number().min(0).max(200).optional().nullable(),
  vitaminDMcg: z.coerce.number().min(0).max(1000).optional().nullable(),
  potassiumMg: z.coerce.number().min(0).max(20000).optional().nullable(),
  magnesiumMg: z.coerce.number().min(0).max(5000).optional().nullable(),
  sodiumMg: z.coerce.number().min(0).max(20000).optional().nullable(),
  vitaminB12Mcg: z.coerce.number().min(0).max(5000).optional().nullable(),
  zincMg: z.coerce.number().min(0).max(200).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});
export type UpdateNutritionTargetsInput = z.infer<typeof updateNutritionTargetsSchema>;
export type NutritionTargets = typeof nutritionTargets.$inferSelect;

// The nutrition AI's one-time (until reset) goal questionnaire -- see
// NUTRITION_GOALS/the users.nutritionGoal columns above.
export const setNutritionGoalSchema = z.object({
  nutritionGoal: z.enum(NUTRITION_GOALS),
  nutritionGoalNote: z.string().trim().max(300).optional().nullable(),
});
export type SetNutritionGoalInput = z.infer<typeof setNutritionGoalSchema>;

export const testingTrendsQuerySchema = z.object({
  metric: z.enum([
    "fortyYardDash",
    "verticalJumpIn",
    "broadJumpIn",
    "proAgilitySeconds",
    "benchMaxLbs",
    "squatMaxLbs",
    "deadliftMaxLbs",
  ]),
});
export type TestingMetric = z.infer<typeof testingTrendsQuerySchema>["metric"];

export const createGoalSchema = z
  .object({
    type: z.enum(["exercise", "testing", "skill"]),
    exerciseId: z.coerce.number().optional(),
    testingMetric: z.enum([
      "fortyYardDash",
      "verticalJumpIn",
      "broadJumpIn",
      "proAgilitySeconds",
      "benchMaxLbs",
      "squatMaxLbs",
      "deadliftMaxLbs",
    ]).optional(),
    skillExerciseId: z.coerce.number().optional(),
    targetValue: z.coerce.number().positive(),
    targetUnit: z.string().trim().min(1).max(10),
    targetDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
      .optional(),
  })
  .refine((data) => (data.type === "exercise" ? data.exerciseId != null : true), {
    message: "exerciseId is required for exercise goals",
  })
  .refine((data) => (data.type === "testing" ? data.testingMetric != null : true), {
    message: "testingMetric is required for testing goals",
  })
  .refine((data) => (data.type === "skill" ? data.skillExerciseId != null : true), {
    message: "skillExerciseId is required for skill goals",
  });
export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type Goal = typeof goals.$inferSelect;

export const suggestGoalTargetSchema = z
  .object({
    type: z.enum(["exercise", "testing"]),
    exerciseId: z.coerce.number().optional(),
    testingMetric: z
      .enum([
        "fortyYardDash",
        "verticalJumpIn",
        "broadJumpIn",
        "proAgilitySeconds",
        "benchMaxLbs",
        "squatMaxLbs",
        "deadliftMaxLbs",
      ])
      .optional(),
  })
  .refine((data) => (data.type === "exercise" ? data.exerciseId != null : true), {
    message: "exerciseId is required for exercise goals",
  })
  .refine((data) => (data.type === "testing" ? data.testingMetric != null : true), {
    message: "testingMetric is required for testing goals",
  });
export type SuggestGoalTargetInput = z.infer<typeof suggestGoalTargetSchema>;
