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
]);
export const lateralityEnum = pgEnum("laterality", ["bilateral", "unilateral"]);
// Coach-only quick-glance status, toggled by the coach as an athlete gets
// hurt/recovers -- never surfaced to the athlete themselves (see PublicUser).
export const healthStatusEnum = pgEnum("health_status", ["healthy", "hurt"]);
// "bar_path" tracks only the bar's path/straightness (movement quality) --
// no speed emphasis, meant for phases where velocity isn't the point (e.g.
// rehab/offseason). "full" adds live bar speed, tempo, and velocity-loss.
export const trackingLevelEnum = pgEnum("tracking_level", [
  "none",
  "bar_path",
  "full",
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
  equipment: text("equipment").notNull().default("Barbell"),
  movementType: text("movement_type"),
  laterality: lateralityEnum("laterality"),
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

// A coach's own exercise, nominated to become official Forge content.
// Approving one just hands the exercise's ownership to the admin -- the
// same coachId column that already drives the FORGE/initials badge, so
// nothing else needs to change for it to show up as Forge-official.
export const exerciseSubmissions = pgTable("exercise_submissions", {
  id: serial("id").primaryKey(),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  submittedBy: integer("submitted_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
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
});

export const programWeeks = pgTable("program_weeks", {
  id: serial("id").primaryKey(),
  programId: integer("program_id")
    .notNull()
    .references(() => programs.id, { onDelete: "cascade" }),
  weekNumber: integer("week_number").notNull(),
  name: text("name"),
});

export const programDays = pgTable("program_days", {
  id: serial("id").primaryKey(),
  weekId: integer("week_id")
    .notNull()
    .references(() => programWeeks.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),
  title: text("title").notNull().default("Training Day"),
  isRestDay: boolean("is_rest_day").notNull().default(false),
});

export const programExercises = pgTable("program_exercises", {
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
});

export const assignments = pgTable("assignments", {
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
});

// Per-athlete, per-day corrective exercises. Kept separate from
// program_exercises (the shared template) because correctives are a manual
// judgment call for one specific athlete's instance of the program, not
// something that should apply to everyone assigned to it.
export const assignmentCorrectives = pgTable("assignment_correctives", {
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
});

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
  // Bar-speed/bar-path CV metrics for this set, computed on-device and
  // synced as plain numbers -- never the source video. Null unless the
  // exercise's trackingLevel was "bar_path"/"full" when this set was logged.
  peakVelocityMps: real("peak_velocity_mps"),
  meanVelocityMps: real("mean_velocity_mps"),
  concentricSeconds: real("concentric_seconds"),
  eccentricSeconds: real("eccentric_seconds"),
  barPathDeviationCm: real("bar_path_deviation_cm"),
  barPathTrace: json("bar_path_trace"),
});

// A two-way thread on a specific day of a specific assignment -- an athlete
// flagging a rough set or attaching a form-check video, a coach replying.
// Scoped to (assignmentId, programDayId) rather than a workoutLog row so the
// thread exists even before the athlete has logged anything for that day.
export const workoutComments = pgTable("workout_comments", {
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
});

// In-app notification inbox. Deliberately narrow: only ever created for a
// coach when an athlete comments or attaches a video, never for program
// completions or team-wide events -- see the notification-creation call
// sites in routes.ts for the full (short) list of triggers.
export const notifications = pgTable("notifications", {
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
});

// One row per browser/device a user has enabled push notifications on --
// the Web Push standard's subscription object (endpoint + encryption
// keys), opaque to us, handed to web-push verbatim when sending. A user
// can have several (phone, laptop, etc); each is removed independently if
// the push service reports it's gone stale (410/404 on send).
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
    isCorrective: z.boolean().default(false),
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
  trackingLevel: z.enum(["none", "bar_path", "full"]).optional(),
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
});

export const barPathPointSchema = z.object({
  t: z.number(),
  x: z.number(),
  y: z.number(),
});

export const setLogInputSchema = z.object({
  setNumber: z.number(),
  reps: z.string().optional().nullable(),
  weight: z.string().optional().nullable(),
  peakVelocityMps: z.number().optional().nullable(),
  meanVelocityMps: z.number().optional().nullable(),
  concentricSeconds: z.number().optional().nullable(),
  eccentricSeconds: z.number().optional().nullable(),
  barPathDeviationCm: z.number().optional().nullable(),
  barPathTrace: z.array(barPathPointSchema).optional().nullable(),
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
