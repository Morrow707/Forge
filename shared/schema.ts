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
import type { CoachFeature } from "./team-features";
import { COACH_FEATURES } from "./team-features";

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
    // Real birthdate, kept separate from the self-reported/coach-entered
    // "age" snapshot above -- age gating (see shared/privacy-tiers.ts) needs
    // a value that doesn't go stale as a season passes. Nullable because no
    // account created before this existed has one; those accounts fall back
    // to "tier unknown" everywhere tiering is checked rather than being
    // guessed at.
    dateOfBirth: date("date_of_birth"),
    // True only for an account created through claimProvisionalAthlete's
    // coach-issued-claim-code flow, where a coach/program acted as the
    // provisioning agent rather than the athlete self-registering directly.
    // Recorded permanently even after the athlete ages out of Tier 1 --
    // it's a historical fact about how consent was originally obtained, not
    // a live status.
    provisionedViaCoachConsent: boolean("provisioned_via_coach_consent").notNull().default(false),
    // Set at signup for a Tier 2 (13-17) account -- a real parental-notice
    // delivery flow (what it says, how/when it's sent) is intentionally NOT
    // built yet; this column exists so that pipeline has somewhere to read
    // "does this account need one" from once the actual notice content has
    // legal sign-off, instead of that decision being made silently by
    // omission.
    requiresGuardianNotice: boolean("requires_guardian_notice").notNull().default(false),
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
    // Clickwrap consent record -- null for every account created before
    // this existed (there's nothing to backfill it with) and for accounts
    // an admin creates directly rather than through public signup. A
    // snapshot of the EXACT text shown at the moment of signup, not a
    // pointer to legalAgreement's current row -- the admin can edit that
    // row later, and this must keep reading as what this specific user
    // actually agreed to regardless of any later edit.
    agreedToTermsAt: timestamp("agreed_to_terms_at"),
    agreedToTermsText: text("agreed_to_terms_text"),
    // White-label team identity -- coach-only, meaningless on an athlete/
    // admin row. Resolved through to the whole coaching staff (see
    // getEffectiveCoachIds), so it always lives on the staff's primary
    // coach account regardless of which staff member set it; an athlete
    // sees their own coach's values via getEffectiveBrandingForUser, not
    // their own row. logoUrl points at an uploaded file the same way
    // lesson images do (see uploadLessonImage in routes.ts). Colors are
    // hex strings ("#RRGGBB"), validated in updateCoachBrandingSchema
    // below -- applied as CSS custom properties, not parsed further.
    brandTeamName: text("brand_team_name"),
    brandLogoUrl: text("brand_logo_url"),
    brandPrimaryColor: text("brand_primary_color"),
    brandSecondaryColor: text("brand_secondary_color"),
    // Coach-only nav-visibility toggles -- see shared/team-features.ts for
    // the field list and "missing means on" resolution. Same primary-coach
    // resolution as the branding fields above.
    enabledFeatures: json("enabled_features").$type<Partial<Record<CoachFeature, boolean>>>(),
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
  // Exact mirror of programs.aiAuthored -- see its own comment. Gates the
  // "full function" AI skill form-check the same way, for the same reason:
  // only safe to let the AI critique technique unsupervised when it's
  // already this skill program's author.
  aiAuthored: boolean("ai_authored").notNull().default(false),
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
    // "throw" mode only -- see MechanicsResult.peakWristSpeedMps's own
    // comment in mechanics-tracking.ts.
    peakWristSpeedMps: real("peak_wrist_speed_mps"),
    // Both modes -- see MechanicsResult.strideLengthM's own comment in
    // mechanics-tracking.ts.
    strideLengthM: real("stride_length_m"),
    // "throw" mode only -- see the matching MechanicsResult fields' own
    // comments in mechanics-tracking.ts (a basketball jump shot's release
    // point, sharing the "throw" mode arm-slot/peak-wrist-speed metrics).
    elbowExtensionDeg: real("elbow_extension_deg"),
    releaseHeightM: real("release_height_m"),
    setPointPauseSeconds: real("set_point_pause_seconds"),
    // Both modes -- see MechanicsResult.kneeBendDepthDeg's own comment.
    kneeBendDepthDeg: real("knee_bend_depth_deg"),
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

// Day-level "I did this" marker for a skill day, exactly parallel to
// workoutLogs on the strength side -- separate from skillSessionLogs (one
// row per camera-tracked drill capture) since a skill day can include
// untracked drills too, and a whole day needs one completion state
// regardless of how many of its drills were actually camera-tracked.
export const skillDayLogs = pgTable(
  "skill_day_logs",
  {
    id: serial("id").primaryKey(),
    skillAssignmentId: integer("skill_assignment_id")
      .notNull()
      .references(() => skillAssignments.id, { onDelete: "cascade" }),
    skillProgramDayId: integer("skill_program_day_id")
      .notNull()
      .references(() => skillProgramDays.id, { onDelete: "cascade" }),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    dayInstanceIdx: uniqueIndex("skill_day_log_day_instance_idx").on(
      table.skillAssignmentId,
      table.skillProgramDayId,
      table.date,
    ),
  }),
);

// A two-way thread on a specific day of a specific skill assignment --
// exact mirror of workoutComments (see its own comment) for the skill side:
// a question about a drill, an attached video, a coach's (or, for a Free
// Agent's self-assigned day, the AI's) reply.
export const skillDayComments = pgTable(
  "skill_day_comments",
  {
    id: serial("id").primaryKey(),
    skillAssignmentId: integer("skill_assignment_id")
      .notNull()
      .references(() => skillAssignments.id, { onDelete: "cascade" }),
    skillProgramDayId: integer("skill_program_day_id")
      .notNull()
      .references(() => skillProgramDays.id, { onDelete: "cascade" }),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    videoUrl: text("video_url"),
    imageUrl: text("image_url"),
    date: text("date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    assignmentDayIdx: index("skill_day_comments_assignment_day_idx").on(
      table.skillAssignmentId,
      table.skillProgramDayId,
    ),
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

// Native-app twin of pushSubscriptions above -- one row per device a user
// has registered for APNs push (the native iOS/Android app, not a browser
// tab). deviceToken is Apple's opaque per-install token, unique per device
// (unlike endpoint above, which is unique per browser subscription but
// doesn't need a DB-level unique constraint since dedup happens in
// storage). Removed the same way: APNs reports a dead token via a
// 400/410 response, same signal web-push gives for a stale endpoint.
export const apnsDeviceTokens = pgTable(
  "apns_device_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceToken: text("device_token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("apns_device_tokens_user_idx").on(table.userId),
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

// ---------- Movement Screen ----------
// A coach/PT-administered battery of functional-movement tests (overhead
// squat, Y-balance, etc.) under Forge's own name -- deliberately not built
// as the trademarked, certification-gated FMS(R) system, so tests can be
// added or dropped freely. Purely informational everywhere it's read:
// nothing here gates a program or an assignment, same "flag, don't decide"
// treatment health status already gets.
export const movementScreenScoreTypeEnum = pgEnum("movement_screen_score_type", [
  "grade_0_3",
  "distance_in",
  "time_sec",
  "asymmetry_pct",
]);
export const movementScreenCaptureMethodEnum = pgEnum("movement_screen_capture_method", [
  "manual",
  "photo_import",
  "camera_assisted",
]);
// Which side an individual RESULT belongs to -- distinct from lateralityEnum
// above, which describes whether a battery TEST is scored per-side at all.
export const bodySideEnum = pgEnum("body_side", ["left", "right"]);

// A named, ordered test list. Forge ships one or more official batteries
// (isForgeOfficial, owned by an admin account -- same explicit-flag pattern
// classes.isForgeOfficial uses, since ownership can't just be inferred from
// author role the way exercises do). A coach never edits an official
// battery directly -- they fork it (forkedFromId) into their own copy via
// the same duplicate-then-edit action program-list already has, and edit
// that instead. Deleting a fork IS "revert to Forge's version" -- there's
// nothing to lose, the original was never touched.
export const movementScreenBatteries = pgTable("movement_screen_batteries", {
  id: serial("id").primaryKey(),
  coachId: integer("coach_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  isForgeOfficial: boolean("is_forge_official").notNull().default(false),
  name: text("name").notNull(),
  description: text("description"),
  forkedFromId: integer("forked_from_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MovementScreenBattery = typeof movementScreenBatteries.$inferSelect;

// The checklist definition -- drives both the printed score sheet and the
// manual-entry form. testKey is the stable identity a captured result
// snapshots (see movementScreenResults below), so re-ordering or
// re-wording a test here never touches a result already recorded against
// it.
export const movementScreenBatteryTests = pgTable(
  "movement_screen_battery_tests",
  {
    id: serial("id").primaryKey(),
    batteryId: integer("battery_id")
      .notNull()
      .references(() => movementScreenBatteries.id, { onDelete: "cascade" }),
    testKey: text("test_key").notNull(),
    label: text("label").notNull(),
    // Free text, not an enum -- purely a display grouping with no logic
    // keyed off its exact value, so a coach can type whatever label makes
    // sense to them instead of picking from a fixed list.
    category: text("category").notNull(),
    scoreType: movementScreenScoreTypeEnum("score_type").notNull(),
    // The coach's own typed unit label (e.g. "reps", "sec", "0-3") shown on
    // the print sheet and manual-entry form in place of the generic label
    // movementScreenScoreUnit(scoreType) would otherwise produce -- see
    // resolveMovementScreenUnitLabel in shared/movement-screen.ts. Null
    // means "just use the generic one for this scoreType."
    unitLabel: text("unit_label"),
    side: lateralityEnum("side").notNull(),
    instructions: text("instructions"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => ({
    batteryIdx: index("movement_screen_battery_tests_battery_idx").on(table.batteryId, table.sortOrder),
  }),
);

export type MovementScreenBatteryTest = typeof movementScreenBatteryTests.$inferSelect;

// One administered session. batteryId is nullable and purely a "what
// template was this filled out from" pointer -- results below never depend
// on it still existing or being unchanged.
export const movementScreens = pgTable(
  "movement_screens",
  {
    id: serial("id").primaryKey(),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    coachId: integer("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    batteryId: integer("battery_id").references(() => movementScreenBatteries.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    captureMethod: movementScreenCaptureMethodEnum("capture_method").notNull().default("manual"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteIdx: index("movement_screens_athlete_idx").on(table.athleteId, table.date),
  }),
);

export type MovementScreen = typeof movementScreens.$inferSelect;

// Self-contained per-test result -- testKey/label/category/scoreType are
// snapshotted from the battery test at capture time, not FK'd, so editing a
// battery later can never orphan or reinterpret a past result. side is null
// for a bilateral test's single score, left/right for a unilateral test's
// two. flagged is always computed at insert time (see createMovementScreen
// in storage.ts) -- a grade<=1 threshold for grade_0_3 tests, or an
// asymmetry check between a unilateral test's two sides -- never entered by
// hand, since it's what drives both the corrective-exercise suggestions and
// the AI athlete-context line.
export const movementScreenResults = pgTable(
  "movement_screen_results",
  {
    id: serial("id").primaryKey(),
    screenId: integer("screen_id")
      .notNull()
      .references(() => movementScreens.id, { onDelete: "cascade" }),
    testKey: text("test_key").notNull(),
    label: text("label").notNull(),
    category: text("category").notNull(),
    scoreType: movementScreenScoreTypeEnum("score_type").notNull(),
    unitLabel: text("unit_label"),
    side: bodySideEnum("side"),
    scoreValue: real("score_value").notNull(),
    flagged: boolean("flagged").notNull().default(false),
    notes: text("notes"),
  },
  (table) => ({
    screenIdx: index("movement_screen_results_screen_idx").on(table.screenId),
  }),
);

export type MovementScreenResult = typeof movementScreenResults.$inferSelect;

const movementScreenCategorySchema = z.string().trim().min(1).max(40);
const movementScreenScoreTypeSchema = z.enum(["grade_0_3", "distance_in", "time_sec", "asymmetry_pct"]);
const movementScreenUnitLabelSchema = z.string().trim().max(20).optional().nullable();

export const movementScreenBatteryTestInputSchema = z.object({
  testKey: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "lowercase letters, numbers, underscores only"),
  label: z.string().trim().min(1).max(120),
  category: movementScreenCategorySchema,
  scoreType: movementScreenScoreTypeSchema,
  unitLabel: movementScreenUnitLabelSchema,
  side: z.enum(["bilateral", "unilateral"]),
  instructions: z.string().trim().max(500).optional().nullable(),
});
export type MovementScreenBatteryTestInput = z.infer<typeof movementScreenBatteryTestInputSchema>;

export const updateMovementScreenBatterySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  tests: z.array(movementScreenBatteryTestInputSchema).min(1).max(30),
});
export type UpdateMovementScreenBatteryInput = z.infer<typeof updateMovementScreenBatterySchema>;

export const movementScreenResultInputSchema = z.object({
  testKey: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(120),
  category: movementScreenCategorySchema,
  scoreType: movementScreenScoreTypeSchema,
  unitLabel: movementScreenUnitLabelSchema,
  side: z.enum(["left", "right"]).optional().nullable(),
  scoreValue: z.number(),
  notes: z.string().trim().max(300).optional().nullable(),
});
export type MovementScreenResultInput = z.infer<typeof movementScreenResultInputSchema>;

export const createMovementScreenSchema = z.object({
  athleteId: z.number().int(),
  batteryId: z.number().int().optional().nullable(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  captureMethod: z.enum(["manual", "photo_import", "camera_assisted"]).default("manual"),
  notes: z.string().trim().max(1000).optional().nullable(),
  results: z.array(movementScreenResultInputSchema).min(1).max(30),
});
export type CreateMovementScreenInput = z.infer<typeof createMovementScreenSchema>;

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
    // Null while active, set the same moment `resolved` flips true (see
    // setInjuryResolved in storage.ts) -- `resolved` alone can't answer how
    // LONG an injury lasted, only whether it currently is or isn't over,
    // which is what made it impossible to line an injury's actual duration
    // up against the athlete's training log for that window.
    resolvedOn: date("resolved_on"),
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

// A standalone row transcribed from a photographed velocity-based-training
// printout (Perch, OVR, or similar bar-speed device output) -- deliberately
// NOT wired into programExercises/workoutSetEntries the way a camera-tracked
// set is. A printout has no assignment/programExercise to attach to (it was
// captured outside the app entirely), and unlike a live tracked set, nobody
// here can catch a bad transcription before it lands -- so this stays its
// own reviewable log rather than silently feeding the same trend charts a
// verified tracked set would. exerciseName is free text, not an exerciseId,
// for the same reason: a coach reviewing the transcription is trusted to
// fix a misread name, but auto-matching it into the real exercise bank
// would let an OCR error quietly create garbage exercises.
export const importedTestingData = pgTable(
  "imported_testing_data",
  {
    id: serial("id").primaryKey(),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    importedByUserId: integer("imported_by_user_id").references(() => users.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    exerciseName: text("exercise_name").notNull(),
    setNumber: integer("set_number"),
    loadLbs: real("load_lbs"),
    velocityMps: real("velocity_mps"),
    powerWatts: real("power_watts"),
    source: text("source").notNull().default("photo import"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    athleteIdx: index("imported_testing_data_athlete_idx").on(table.athleteId, table.date),
  }),
);
export type ImportedTestingDataRow = typeof importedTestingData.$inferSelect;

// A roster slot created from a photographed intake sheet before the athlete
// it describes has ever signed themselves up -- there's no existing path
// for a coach to create a live, login-capable account on someone else's
// behalf (self-signup + a coachCode is the only way an athlete account gets
// created today), so a mass tryout/intake day needs somewhere to hold
// "we have this person's info, they haven't claimed it yet" state. A coach
// hands the athlete their claimCode; POST /api/claim/:code/signup turns
// this into a real users row (see claimProvisionalAthlete in storage.ts)
// and the provisional row is deleted, not archived -- once claimed, the
// real user row is the only copy of this person's data that should exist.
export const provisionalAthletes = pgTable(
  "provisional_athletes",
  {
    id: serial("id").primaryKey(),
    coachId: integer("coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    claimCode: text("claim_code").notNull(),
    name: text("name").notNull(),
    // Optional -- a coach filling in an intake sheet may not have this on
    // hand yet. The claiming athlete (or their parent/guardian) supplies a
    // real one in claimProvisionalAthleteSchema if it's still missing here,
    // since a real DOB is required to derive a privacy tier before the
    // account is created.
    dateOfBirth: date("date_of_birth"),
    heightIn: integer("height_in"),
    bodyWeightLbs: real("body_weight_lbs"),
    age: integer("age"),
    gender: genderEnum("gender"),
    sport: text("sport"),
    position: text("position"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    claimCodeIdx: uniqueIndex("provisional_athletes_claim_code_idx").on(table.claimCode),
    coachIdx: index("provisional_athletes_coach_idx").on(table.coachId),
  }),
);
export type ProvisionalAthlete = typeof provisionalAthletes.$inferSelect;

export const claimProvisionalAthleteSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  // Only required here if the coach's intake sheet didn't already capture
  // one (see provisionalAthletes.dateOfBirth) -- whichever of the two is
  // present is what the claim route uses to derive a privacy tier.
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .refine((v) => new Date(v) <= new Date(), "Date of birth can't be in the future")
    .optional(),
  agreedToTerms: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the terms to create an account" }),
  }),
});
export type ClaimProvisionalAthleteInput = z.infer<typeof claimProvisionalAthleteSchema>;

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

export const movementScreenBatteriesRelations = relations(movementScreenBatteries, ({ many }) => ({
  tests: many(movementScreenBatteryTests),
}));

export const movementScreenBatteryTestsRelations = relations(movementScreenBatteryTests, ({ one }) => ({
  battery: one(movementScreenBatteries, {
    fields: [movementScreenBatteryTests.batteryId],
    references: [movementScreenBatteries.id],
  }),
}));

export const movementScreensRelations = relations(movementScreens, ({ many }) => ({
  results: many(movementScreenResults),
}));

export const movementScreenResultsRelations = relations(movementScreenResults, ({ one }) => ({
  screen: one(movementScreens, {
    fields: [movementScreenResults.screenId],
    references: [movementScreens.id],
  }),
}));

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

// Singleton row (always id 1), same pattern as aiKnowledge above -- the
// current clickwrap agreement text every new coach/athlete must accept to
// sign up. Admin-editable, publicly readable (has to be, since it's shown
// on the signup page before an account exists to authenticate as). Editing
// this never touches any existing user's own agreedToTermsText snapshot on
// their user row -- only future signups see the new text.
export const legalAgreement = pgTable("legal_agreement", {
  id: integer("id").primaryKey(),
  content: text("content").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const updateLegalAgreementSchema = z.object({
  content: z.string().trim().min(1).max(20000),
});
export type UpdateLegalAgreementInput = z.infer<typeof updateLegalAgreementSchema>;

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

export const aiKnowledgeMaturityEnum = pgEnum("ai_knowledge_maturity", ["established", "experimental"]);
export const aiKnowledgeSourceTypeEnum = pgEnum("ai_knowledge_source_type", [
  "chat",
  "url",
  "image",
  "pasted_text",
]);

// One row per discrete taught fact/rule -- the central knowledge base every
// AI feature on the platform reads from, superseding the single free-text
// aiKnowledge/nutritionKnowledge documents above (kept in place, not
// dropped, until the teaching-chat flow itself is migrated over to write
// here instead). Per-entry rows rather than one big blob is what makes real
// changelog history (aiKnowledgeChangelog below), cross-time contradiction
// detection, and position/gender/age filtering possible -- diffing a single
// document can't cleanly answer "did THIS specific rule change" or "which
// entries actually apply to THIS athlete."
export const aiKnowledgeEntries = pgTable(
  "ai_knowledge_entries",
  {
    id: serial("id").primaryKey(),
    content: text("content").notNull(),
    // Organizational only (admin UI grouping) -- every entry is available to
    // every AI feature regardless of category, matching the "one central
    // AI" design; this never gates which prompts see it.
    category: text("category"),
    // All four null = a universal rule (applies to every athlete). Any
    // combination narrows it -- e.g. position="linebacker" with gender/age
    // left null applies to every linebacker regardless of gender or age.
    position: text("position"),
    gender: genderEnum("gender"),
    ageMin: integer("age_min"),
    ageMax: integer("age_max"),
    maturity: aiKnowledgeMaturityEnum("maturity").notNull().default("established"),
    sourceType: aiKnowledgeSourceTypeEnum("source_type").notNull().default("chat"),
    // The original material this was taught from -- a URL, an excerpt of
    // pasted text, or a note about an uploaded image -- kept so a rule can
    // be traced back to where it came from later, not just what it
    // currently says.
    sourceExcerpt: text("source_excerpt"),
    taughtBy: integer("taught_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Soft-deactivation, not deletion -- "everything learned is knowledge
    // gained" even once superseded. An inactive entry still exists for the
    // changelog and contradiction-detection to reference; it's just
    // excluded from what gets injected into live AI prompts.
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    activeIdx: index("ai_knowledge_entries_active_idx").on(table.active),
  }),
);

export type AiKnowledgeEntry = typeof aiKnowledgeEntries.$inferSelect;

export const aiKnowledgeChangeTypeEnum = pgEnum("ai_knowledge_change_type", [
  "created",
  "updated",
  "corrected",
  "deactivated",
]);

// Append-only history of every change to an aiKnowledgeEntries row -- what
// it said before, what it says now, and why -- so a later, contradictory
// teaching turn can be answered with "you taught this on [date] because
// [reason] -- what's different now?" instead of nothing remembering it ever
// happened. changeType distinguishes a genuine correction ("that was just
// wrong") from an ordinary refinement, since those should be weighed
// differently by anything reading this history back.
export const aiKnowledgeChangelog = pgTable(
  "ai_knowledge_changelog",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => aiKnowledgeEntries.id, { onDelete: "cascade" }),
    previousContent: text("previous_content"),
    newContent: text("new_content").notNull(),
    reason: text("reason").notNull(),
    changeType: aiKnowledgeChangeTypeEnum("change_type").notNull().default("updated"),
    changedBy: integer("changed_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    entryIdx: index("ai_knowledge_changelog_entry_idx").on(table.entryId, table.createdAt),
  }),
);

export type AiKnowledgeChangelogEntry = typeof aiKnowledgeChangelog.$inferSelect;

// ---------- Admin Query Engine ----------
// Multi-parametric filtering across the platform-wide aggregate view --
// extends queryAggregateAthleteData's redaction rule (no name/email/team)
// to the wider performance/health categories that endpoint never covered:
// VBT set metrics, daily wellness, injury status, skill/mechanics faults,
// movement-screen flags, tracking trust scores, and CARA compliance.
// lookbackDays bounds how recent a set/wellness/skill capture must be to
// count, since most of what's filtered here is repeated-measures data, not
// a single profile value. Video URLs and every free-text field (injury
// descriptions, food-log text, AI-written briefings/digests) are
// deliberately left out of both the filters and the returned rows -- a
// materially bigger privacy step than exact numeric/categorical values,
// held back for a later, explicit decision rather than folded in here.
// Results carry an opaque athleteId (never a name) so a match can actually
// be acted on -- see queryAthletesAdvanced's own comment in storage.ts for
// why that's a real, deliberate step beyond what queryAggregateAthleteData
// exposes today.
const numericRangeSchema = z
  .object({ min: z.number().optional(), max: z.number().optional() })
  .optional();

export const adminAthleteQueryFiltersSchema = z.object({
  lookbackDays: z.number().int().min(1).max(365).default(30),
  sport: z.array(z.string()).optional(),
  position: z.array(z.string()).optional(),
  seasonPhase: z.array(z.string()).optional(),
  gender: z.array(z.string()).optional(),
  healthStatus: z.array(z.enum(["healthy", "hurt"])).optional(),
  age: numericRangeSchema,
  bodyWeightLbs: numericRangeSchema,
  fortyYardDash: numericRangeSchema,
  verticalJumpIn: numericRangeSchema,
  broadJumpIn: numericRangeSchema,
  proAgilitySeconds: numericRangeSchema,
  benchMaxLbs: numericRangeSchema,
  squatMaxLbs: numericRangeSchema,
  deadliftMaxLbs: numericRangeSchema,
  // Latest daily wellness check-in within lookbackDays.
  soreness: numericRangeSchema,
  stress: numericRangeSchema,
  sleepHours: numericRangeSchema,
  hydration: numericRangeSchema,
  mentalFocus: numericRangeSchema,
  // Tracked-set VBT metrics within lookbackDays -- best peak, average mean.
  peakVelocityMps: numericRangeSchema,
  meanVelocityMps: numericRangeSchema,
  romCm: numericRangeSchema,
  velocityLossPercent: numericRangeSchema,
  // Lowest per-rep trust score seen within lookbackDays, 0-100.
  minTrustScorePct: numericRangeSchema,
  // Fault codes from detectFormFaults (pose-tracking.ts) / mechanics-tracking.ts
  // / sprint-tracking.ts -- any set/session within lookbackDays carrying one
  // of these codes matches. Free text, not an enum, same reasoning as the
  // faults themselves (see bar-tracker-dialog.tsx's FormFault type).
  formFaultCodes: z.array(z.string()).optional(),
  skillFaultCodes: z.array(z.string()).optional(),
  hasUnresolvedInjury: z.boolean().optional(),
  hasFlaggedMovementScreen: z.boolean().optional(),
  // Trailing-7-day CARA minutes used, as a percent of caraWeeklyCapMinutes --
  // only athletes with a cap set can match. Always trailing 7 days
  // regardless of lookbackDays, since the cap itself is weekly.
  caraCapUsagePercent: numericRangeSchema,
});
export type AdminAthleteQueryFilters = z.infer<typeof adminAthleteQueryFiltersSchema>;

// A saved filter combination an admin can re-run in one click ("Red Flag /
// At-Risk", "NCAA Compliance Audit", etc.) instead of rebuilding it every
// time. filters is snapshotted whole, not decomposed into columns, since
// adminAthleteQueryFiltersSchema is still evolving and a saved view should
// survive fields being added around it.
export const adminSavedViews = pgTable("admin_saved_views", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  filters: json("filters").$type<AdminAthleteQueryFilters>().notNull(),
  createdByAdminId: integer("created_by_admin_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type AdminSavedView = typeof adminSavedViews.$inferSelect;

export const createAdminSavedViewSchema = z.object({
  name: z.string().trim().min(1).max(80),
  filters: adminAthleteQueryFiltersSchema,
});
export type CreateAdminSavedViewInput = z.infer<typeof createAdminSavedViewSchema>;

// ---------- Consent records ----------
// Immutable log of every clickwrap/consent event a user's account has on
// file -- insert-only, no update or delete route anywhere touches this
// table. Distinct from users.agreedToTermsAt/agreedToTermsText (which only
// ever holds the CURRENT snapshot for basic Terms-of-Service acceptance):
// this table can hold multiple, differently-typed consent events per user
// over time (a biometric waiver is a separate legal instrument from a
// general ToS acceptance, and a Tier 1 account's consent is given by a
// coach acting as agent, not the athlete themselves -- givenByUserId
// records exactly who clicked "I agree" and on whose behalf).
//
// See shared/privacy-tiers.ts's own comment: which consent types are
// actually required for which tier, and the exact document text each one
// should show, is legal work that hasn't happened yet. This table is the
// place that work lands once it has -- logConsentRecord already fires for
// ordinary Terms-of-Service acceptance today so the audit trail exists
// from day one, not bolted on retroactively later.
export const consentTypeEnum = pgEnum("consent_type", [
  "terms_of_service",
  "biometric_waiver",
  "coach_coppa_consent",
  "parental_notice_ack",
]);

export const consentRecords = pgTable(
  "consent_records",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    consentType: consentTypeEnum("consent_type").notNull(),
    // Exact text shown at the moment of consent, same "snapshot, not a
    // pointer" reasoning as users.agreedToTermsText -- an admin editing the
    // current document later must never change what this row says someone
    // already agreed to.
    documentText: text("document_text").notNull(),
    // A short label for which version of that text this was (e.g. a date
    // or short hash) -- lets two rows be compared without diffing the full
    // text every time.
    documentVersion: text("document_version").notNull(),
    // Null when the account holder gave consent themselves; set to the
    // coach's user id for a coach_coppa_consent row, where the coach is
    // acting as the provisioning agent for a Tier 1 athlete who can't
    // legally consent on their own behalf.
    givenByUserId: integer("given_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("consent_records_user_idx").on(table.userId, table.createdAt),
  }),
);
export type ConsentRecord = typeof consentRecords.$inferSelect;

// ---------- Record access audit log ----------
// Immutable, insert-only log of a staff member (coach or admin) touching
// one specific athlete's video or biometric record -- the per-record
// counterpart to aggregateDataAccessLog above, which only ever covers
// bulk/aggregate views with no single athlete to name. Built for a lawyer
// (or an admin) to review, not as a claim that this covers every access
// path in the app yet: today it's wired into the admin video-management
// page only (list-viewed and delete events) -- see
// getRecordAccessAuditLog's own comment in storage.ts for the honest
// scope of what is and isn't instrumented.
export const recordAccessActionEnum = pgEnum("record_access_action", [
  "viewed",
  "streamed",
  "downloaded",
  "exported",
  "deleted",
]);

export const recordAccessAuditLogs = pgTable(
  "record_access_audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Null for an action with no single athlete (e.g. loading the admin
    // video list, or a bulk delete sweep) -- see resourceType/detail for
    // what actually happened in that case.
    targetAthleteId: integer("target_athlete_id").references(() => users.id, { onDelete: "set null" }),
    actionType: recordAccessActionEnum("action_type").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    // Free text, e.g. a bulk action's cutoff/count -- not the same as
    // justification below, which is specifically "why did a human do this."
    detail: text("detail"),
    justification: text("justification"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    targetIdx: index("record_access_audit_logs_target_idx").on(table.targetAthleteId, table.createdAt),
    userIdx: index("record_access_audit_logs_user_idx").on(table.userId, table.createdAt),
  }),
);
export type RecordAccessAuditLog = typeof recordAccessAuditLogs.$inferSelect;

// ---------- Legal documents (draft, admin-editable) ----------
// A real Terms of Service and Privacy Policy, kept separate from
// legalAgreement above -- that table is specifically the short clickwrap
// text a new signup must accept, and is already live/enforced. These are
// fuller reference documents for editing, printing, and emailing (see the
// admin Documents tab) -- not wired into the signup flow, and not enforced
// against current beta accounts. Seeded once with real starting draft text
// (see server/seed.ts) via onConflictDoNothing, so re-seeding never
// clobbers an admin's edits.
export const legalDocumentTypeEnum = pgEnum("legal_document_type", ["terms_of_service", "privacy_policy"]);

export const legalDocuments = pgTable("legal_documents", {
  id: serial("id").primaryKey(),
  docType: legalDocumentTypeEnum("doc_type").notNull().unique(),
  content: text("content").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type LegalDocument = typeof legalDocuments.$inferSelect;

export const updateLegalDocumentSchema = z.object({
  content: z.string().trim().min(1).max(50000),
});
export type UpdateLegalDocumentInput = z.infer<typeof updateLegalDocumentSchema>;

export const emailLegalDocumentSchema = z.object({
  to: z.string().trim().email(),
});

// Audit trail for the platform-wide aggregate athlete data view (admin-only)
// -- the first place admin can see every athlete's data across every
// coach's roster, not just programs/classes admin owns itself, so who
// looked and when is worth keeping a record of even though nothing here
// restricts what they can see.
export const aggregateDataAccessLog = pgTable("aggregate_data_access_log", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  viewedAt: timestamp("viewed_at").notNull().defaultNow(),
});

export type AggregateDataAccessLogEntry = typeof aggregateDataAccessLog.$inferSelect;

// One row per (entry, feature-call) match -- not a running counter on
// aiKnowledgeEntries itself, so admin can see WHEN and WHERE an entry gets
// pulled into context, not just how many times total. "Available to the
// prompt" (this logs every entry buildForgeAiContext matched for a call),
// not "the model definitely quoted it" -- true per-citation tracking would
// need every consuming prompt to report back which specific rule it
// leaned on, which is real future work; this is the honest, buildable
// version: which taught knowledge is actually reaching real feature calls
// versus sitting unused.
export const aiKnowledgeUsageLog = pgTable(
  "ai_knowledge_usage_log",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => aiKnowledgeEntries.id, { onDelete: "cascade" }),
    // Which AI feature pulled it in -- "athlete_chat", "program_draft",
    // "form_check", etc. (see buildForgeAiContext's own callers).
    context: text("context").notNull(),
    calledAt: timestamp("called_at").notNull().defaultNow(),
  },
  (table) => ({
    entryIdx: index("ai_knowledge_usage_log_entry_idx").on(table.entryId, table.calledAt),
  }),
);

// The complement of the usage log above -- logged when a coaching-judgment
// AI call had a specific athlete profile in view but nothing taught
// matched it at all, so admin can see recurring blind spots ("guessed on
// this position/age combo four times, nothing taught for it") instead of
// only ever seeing what IS taught.
export const aiKnowledgeGapLog = pgTable(
  "ai_knowledge_gap_log",
  {
    id: serial("id").primaryKey(),
    context: text("context").notNull(),
    position: text("position"),
    gender: genderEnum("gender"),
    age: integer("age"),
    calledAt: timestamp("called_at").notNull().defaultNow(),
  },
  (table) => ({
    contextIdx: index("ai_knowledge_gap_log_context_idx").on(table.context, table.calledAt),
  }),
);

export const reflectionFindingTierEnum = pgEnum("reflection_finding_tier", [
  "safety",
  "informational",
]);
export const reflectionConfidenceEnum = pgEnum("reflection_confidence", [
  "low",
  "moderate",
  "high",
]);

// Output of the automatic background reflection job (server/reflection-job.ts)
// -- mines the aggregate athlete dataset and the injury/training-load link
// for patterns worth an admin's attention, without waiting for an admin to
// go looking. "safety" findings (e.g. injuries clustering after a
// training-load spike) push through immediately regardless of notification
// prefs, same "emergency reach" override notifyUser already has for
// announcements; "informational" ones (e.g. a real population segment with
// no established guidance taught for it) land in-app only. sampleSize +
// confidence are stored columns, not just baked into the prose, so a
// finding can never be read as more certain than the underlying N actually
// supports. category is the dedup key the job checks before generating a
// fresh finding -- the same real pattern shouldn't renotify on every run
// while it's still true, only once per cooldown window.
export const aiReflectionFindings = pgTable(
  "ai_reflection_findings",
  {
    id: serial("id").primaryKey(),
    tier: reflectionFindingTierEnum("tier").notNull(),
    category: text("category").notNull(),
    summary: text("summary").notNull(),
    detail: text("detail").notNull(),
    sampleSize: integer("sample_size").notNull(),
    confidence: reflectionConfidenceEnum("confidence").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index("ai_reflection_findings_category_idx").on(table.category, table.createdAt),
  }),
);

export type AiReflectionFinding = typeof aiReflectionFindings.$inferSelect;

// Forge AI's own chat thread -- separate from aiKnowledgeMessages/
// nutritionKnowledgeMessages above (those stay as-is, feeding the two old
// documents, until they're retired). Reuses aiKnowledgeChatRoleEnum since
// it's the same admin/assistant vocabulary, just a distinct conversation.
export const forgeAiMessages = pgTable(
  "forge_ai_messages",
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
    createdIdx: index("forge_ai_messages_created_idx").on(table.createdAt),
  }),
);

export type ForgeAiMessage = typeof forgeAiMessages.$inferSelect;

export const sendForgeAiChatMessageSchema = z.object({
  content: z.string().trim().min(1), // no max -- admin gets an unbounded paste, see task list
  // Same base64 image-block shape the meal-photo/food-scan AI routes
  // already use (see /api/athlete/food/analyze-photo) -- never written to
  // disk, only ever sent through to Claude for this one turn.
  image: z.object({ mediaType: z.enum(["image/jpeg", "image/png"]), data: z.string().min(1) }).optional(),
});
export type SendForgeAiChatMessageInput = z.infer<typeof sendForgeAiChatMessageSchema>;

// Mirrors chatWithForgeAi's proposal shape (storage.ts) -- the admin is
// applying exactly what the chat proposed, echoed back client-side, not
// composing a new one from scratch.
export const applyForgeAiEntryProposalSchema = z.object({
  content: z.string().trim().min(1),
  category: z.string().trim().max(60).optional().nullable(),
  position: z.string().trim().max(60).optional().nullable(),
  gender: z.enum(["male", "female", "non_binary", "prefer_not_to_say"]).optional().nullable(),
  ageMin: z.number().int().optional().nullable(),
  ageMax: z.number().int().optional().nullable(),
  maturity: z.enum(["established", "experimental"]),
  summary: z.string(),
  updatesEntryId: z.number().int().optional().nullable(),
  isCorrection: z.boolean().optional().default(false),
  changeReason: z.string().optional().default(""),
  sourceType: z.enum(["chat", "image", "url", "pasted_text"]).optional(),
  sourceExcerpt: z.string().max(2000).optional().nullable(),
});
export type ApplyForgeAiEntryProposalInput = z.infer<typeof applyForgeAiEntryProposalSchema>;

export const deactivateForgeAiEntrySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type DeactivateForgeAiEntryInput = z.infer<typeof deactivateForgeAiEntrySchema>;

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

export const skillDayCommentsRelations = relations(skillDayComments, ({ one }) => ({
  assignment: one(skillAssignments, {
    fields: [skillDayComments.skillAssignmentId],
    references: [skillAssignments.id],
  }),
  day: one(skillProgramDays, {
    fields: [skillDayComments.skillProgramDayId],
    references: [skillProgramDays.id],
  }),
  author: one(users, { fields: [skillDayComments.authorId], references: [users.id] }),
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
  // Required for every signup (coach and athlete both) so the route can
  // derive a privacy tier (see shared/privacy-tiers.ts) before the account
  // is ever created -- an athlete signup that resolves to Tier 1 (under 13)
  // is rejected outright there rather than created and gated after the
  // fact. The route only applies that rejection to role "athlete" in
  // practice (a 12-year-old head coach isn't a real case this app needs to
  // handle), but every account gets a real DOB on file either way.
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .refine((v) => new Date(v) <= new Date(), "Date of birth can't be in the future"),
  agreedToTerms: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the terms to create an account" }),
  }),
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

// Exact mirror of createWorkoutCommentSchema for the skill side -- see
// skillDayComments.
export const createSkillDayCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  videoUrl: z.string().trim().max(500).optional().nullable(),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  date: z.string().trim().max(20).optional().nullable(),
});

export const setSkillDayCompleteSchema = z.object({
  date: z.string().trim().min(1).max(20),
  completed: z.boolean(),
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
  // "throw" mode only -- see MechanicsResult.peakWristSpeedMps's own
  // comment for why this is a proxy (wrist speed, not the thrown object's
  // own exit velocity -- there's no ball/implement detection here).
  peakWristSpeedMps: z.number().min(0).max(60).optional().nullable(),
  // Both modes -- see MechanicsResult.strideLengthM's own comment.
  strideLengthM: z.number().min(0).max(3).optional().nullable(),
  // "throw" mode only -- see the matching MechanicsResult fields' own
  // comments in mechanics-tracking.ts.
  elbowExtensionDeg: z.number().min(0).max(180).optional().nullable(),
  releaseHeightM: z.number().min(-1).max(2).optional().nullable(),
  setPointPauseSeconds: z.number().min(0).max(10).optional().nullable(),
  // Both modes -- see MechanicsResult.kneeBendDepthDeg's own comment.
  kneeBendDepthDeg: z.number().min(0).max(180).optional().nullable(),
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
export type SkillDayLog = typeof skillDayLogs.$inferSelect;
export type SkillDayComment = typeof skillDayComments.$inferSelect;
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
export type CreateSkillDayCommentInput = z.infer<typeof createSkillDayCommentSchema>;
export type SetSkillDayCompleteInput = z.infer<typeof setSkillDayCompleteSchema>;
export type CreateExerciseReportInput = z.infer<typeof createExerciseReportSchema>;
export type ResolveSubmissionInput = z.infer<typeof resolveSubmissionSchema>;

// healthStatus is coach-only -- deliberately excluded here so it never rides
// along in an athlete's own login/signup/me response. Coach-facing roster
// endpoints attach it explicitly (see getRosterForCoach).
export type PublicUser = Omit<
  User,
  "passwordHash" | "healthStatus" | "agreedToTermsText"
>;

export const updateHealthStatusSchema = z.object({
  healthStatus: z.enum(["healthy", "hurt"]),
});
export type UpdateHealthStatusInput = z.infer<typeof updateHealthStatusSchema>;

// Empty string clears a field back to unbranded (falls back to the default
// Forge wordmark/colors) -- a coach who set a team name and wants to undo
// it shouldn't have to know to send null specifically.
const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Enter a color as #RRGGBB")
  .or(z.literal(""));

export const updateCoachBrandingSchema = z.object({
  teamName: z.string().trim().max(60).optional(),
  primaryColor: hexColor.optional(),
  secondaryColor: hexColor.optional(),
});
export type UpdateCoachBrandingInput = z.infer<typeof updateCoachBrandingSchema>;

export const updateCoachFeaturesSchema = z.object(
  Object.fromEntries(COACH_FEATURES.map((key) => [key, z.boolean().optional()])) as Record<
    CoachFeature,
    z.ZodOptional<z.ZodBoolean>
  >,
);
export type UpdateCoachFeaturesInput = z.infer<typeof updateCoachFeaturesSchema>;

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const apnsSubscribeSchema = z.object({
  deviceToken: z.string().min(1),
});
export type ApnsSubscribeInput = z.infer<typeof apnsSubscribeSchema>;

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
