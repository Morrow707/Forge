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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
// "bar_path" tracks only the bar's path/straightness (movement quality) --
// no speed emphasis, meant for phases where velocity isn't the point (e.g.
// rehab/offseason). "full" adds live bar speed, tempo, and velocity-loss.
// "jump" is a different signal entirely -- no implement to track, so it
// watches ankle position for flight phases instead of wrist/bar position
// (see jump-tracking.ts), reporting height/distance/ground-contact instead
// of velocity/power.
export const trackingLevelEnum = pgEnum("tracking_level", [
  "none",
  "bar_path",
  "full",
  "jump",
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
    heightIn: integer("height_in"),
    bodyWeightLbs: real("body_weight_lbs"),
    sport: text("sport"),
    position: text("position"),
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
  equipment: text("equipment").notNull().default("Barbell"),
  movementType: text("movement_type"),
  laterality: lateralityEnum("laterality"),
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

export const programWeeks = pgTable(
  "program_weeks",
  {
    id: serial("id").primaryKey(),
    programId: integer("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    name: text("name"),
  },
  (table) => ({
    programIdx: index("program_weeks_program_idx").on(table.programId),
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
    // Manual per-day schedule overrides, keyed by program_day_id (as a
    // string) -> an explicit calendar date. Lets a coach account for games,
    // travel, or extra rest by moving individual occurrences off the rigid
    // "every 7 days from startDate" grid; days with no entry here still fall
    // back to that computed date.
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

export const goalTypeEnum = pgEnum("goal_type", ["exercise", "testing"]);

// A target the athlete (or their coach) is working toward -- "achieved" is
// deliberately not a stored column. It's computed fresh each time goals are
// fetched by comparing targetValue against the athlete's current best (max
// weight ever logged, for an exercise goal; current profile value, for a
// testing goal), so it can never drift out of sync with the data it's about.
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
});

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

export type SendProgramChatMessageInput = z.infer<typeof sendProgramChatMessageSchema>;

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
// guidelines, rewritten in full on every admin chat turn -- same "emit the
// complete state, not a diff" pattern as programChatMessages/programs.
export const aiKnowledge = pgTable("ai_knowledge", {
  id: integer("id").primaryKey(),
  guidelines: text("guidelines").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sendAiKnowledgeChatMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export type SendAiKnowledgeChatMessageInput = z.infer<typeof sendAiKnowledgeChatMessageSchema>;

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
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  athlete: one(users, {
    fields: [teamMembers.athleteId],
    references: [users.id],
  }),
}));

export const teamPostsRelations = relations(teamPosts, ({ one }) => ({
  coach: one(users, { fields: [teamPosts.coachId], references: [users.id] }),
  author: one(users, { fields: [teamPosts.authorId], references: [users.id] }),
}));

export const exercisesRelations = relations(exercises, ({ one }) => ({
  coach: one(users, { fields: [exercises.coachId], references: [users.id] }),
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
  assignments: many(assignments),
}));

export const programWeeksRelations = relations(
  programWeeks,
  ({ one, many }) => ({
    program: one(programs, {
      fields: [programWeeks.programId],
      references: [programs.id],
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
  heightIn: z.number().int().min(0).max(120).optional().nullable(),
  bodyWeightLbs: z.number().min(0).max(1500).optional().nullable(),
  sport: z.string().trim().max(60).optional().nullable(),
  position: z.string().trim().max(60).optional().nullable(),
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
    secondaryMuscles: z.array(z.string().trim().min(1)).max(8).optional().nullable(),
    isCorrective: z.boolean().default(false),
    usesWeight: z.boolean().default(true),
    usesBodyweight: z.boolean().default(false),
    usesBand: z.boolean().default(false),
    usesBox: z.boolean().default(false),
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
  days: z.array(programDayInputSchema).default([]),
});

export const programStructureSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  weeks: z.array(programWeekInputSchema).default([]),
});

export const insertAssignmentSchema = z.object({
  programId: z.number(),
  startDate: z.string(),
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
  correctivesEnabled: z.boolean(),
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

export const repBreakdownEntrySchema = z.object({
  repNumber: z.number(),
  peakVelocityMps: z.number(),
  meanVelocityMps: z.number(),
  concentricSeconds: z.number(),
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

export const generateProgramDraftSchema = z.object({
  prompt: z.string().trim().min(5).max(500),
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
    type: z.enum(["exercise", "testing"]),
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
