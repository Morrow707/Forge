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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const roleEnum = pgEnum("role", ["coach", "athlete"]);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: roleEnum("role").notNull(),
    coachCode: text("coach_code"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
    coachCodeIdx: uniqueIndex("users_coach_code_idx").on(table.coachCode),
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

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  coachId: integer("coach_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
  videoUrl: text("video_url"),
  instructions: text("instructions"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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

export const workoutLogEntries = pgTable("workout_log_entries", {
  id: serial("id").primaryKey(),
  workoutLogId: integer("workout_log_id")
    .notNull()
    .references(() => workoutLogs.id, { onDelete: "cascade" }),
  programExerciseId: integer("program_exercise_id")
    .notNull()
    .references(() => programExercises.id, { onDelete: "cascade" }),
  actualSets: integer("actual_sets"),
  actualReps: text("actual_reps"),
  actualWeight: text("actual_weight"),
  rpe: integer("rpe"),
  notes: text("notes"),
});

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

export const exercisesRelations = relations(exercises, ({ one }) => ({
  coach: one(users, { fields: [exercises.coachId], references: [users.id] }),
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
}));

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
  ({ one }) => ({
    log: one(workoutLogs, {
      fields: [workoutLogEntries.workoutLogId],
      references: [workoutLogs.id],
    }),
    programExercise: one(programExercises, {
      fields: [workoutLogEntries.programExerciseId],
      references: [programExercises.id],
    }),
  }),
);

// ---------- Zod insert schemas ----------

export const insertUserSchema = createInsertSchema(users)
  .pick({ email: true, passwordHash: true, name: true, role: true })
  .extend({ email: z.string().email() });

export const signupSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(6, "Password must be at least 6 characters"),
    name: z.string().min(1, "Name is required"),
    role: z.enum(["coach", "athlete"]),
    coachCode: z.string().optional(),
  })
  .refine((data) => data.role !== "athlete" || true, {});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const insertExerciseSchema = createInsertSchema(exercises).pick({
  name: true,
  category: true,
  muscleGroup: true,
  equipment: true,
  videoUrl: true,
  instructions: true,
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
  athleteIds: z.array(z.number()).min(1),
  startDate: z.string(),
});

export const logEntryInputSchema = z.object({
  programExerciseId: z.number(),
  actualSets: z.number().optional().nullable(),
  actualReps: z.string().optional().nullable(),
  actualWeight: z.string().optional().nullable(),
  rpe: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
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
export type WorkoutLog = typeof workoutLogs.$inferSelect;
export type WorkoutLogEntry = typeof workoutLogEntries.$inferSelect;
export type Team = typeof teams.$inferSelect;

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProgramStructureInput = z.infer<typeof programStructureSchema>;
export type InsertAssignmentInput = z.infer<typeof insertAssignmentSchema>;
export type SubmitWorkoutLogInput = z.infer<typeof submitWorkoutLogSchema>;

export type PublicUser = Omit<User, "passwordHash">;
