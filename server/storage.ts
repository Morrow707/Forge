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
  CreateWorkoutCommentInput,
  CreateExerciseReportInput,
} from "@shared/schema";
import { eq, and, inArray, asc, desc, lt } from "drizzle-orm";
import { generateCoachCode } from "./auth-utils";
import { addDays, parseISO, formatISO, isWithinInterval } from "date-fns";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return initials || "?";
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
  // verifying the target user is one the requester may edit.
  async updateUserProfile(userId: number, input: UpdateProfileInput) {
    const [row] = await db.update(users).set(input).where(eq(users.id, userId)).returning();
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
      })
      .from(coachAthletes)
      .innerJoin(users, eq(coachAthletes.athleteId, users.id))
      .where(and(eq(coachAthletes.coachId, coachId), eq(coachAthletes.athleteId, athleteId)));
    return rows[0] ?? null;
  },

  async getCoachesForAthlete(athleteId: number) {
    const rows = await db
      .select({ id: users.id, name: users.name, coachCode: users.coachCode })
      .from(coachAthletes)
      .innerJoin(users, eq(coachAthletes.coachId, users.id))
      .where(eq(coachAthletes.athleteId, athleteId));
    return rows;
  },

  // ---------- Teams ----------
  async getTeamsForCoach(coachId: number) {
    const rows = await db.query.teams.findMany({
      where: eq(teams.coachId, coachId),
      with: { members: { with: { athlete: true } } },
      orderBy: asc(teams.name),
    });
    // Teams created before the join-code column existed have none yet --
    // backfill lazily so every team the coach sees always has one to share.
    return Promise.all(
      rows.map(async (team) => {
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
    const pendingSubmission = await db.query.exerciseSubmissions.findFirst({
      where: and(
        eq(exerciseSubmissions.exerciseId, id),
        eq(exerciseSubmissions.submittedBy, requestingUserId),
        eq(exerciseSubmissions.status, "pending"),
      ),
    });
    const openReport = await db.query.exerciseReports.findFirst({
      where: and(
        eq(exerciseReports.exerciseId, id),
        eq(exerciseReports.reportedBy, requestingUserId),
        eq(exerciseReports.status, "open"),
      ),
    });
    return {
      ...this.withOwnership(ex, requestingUserId),
      hasPendingSubmission: !!pendingSubmission,
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
    return row;
  },

  async updateExercise(id: number, data: any) {
    const [row] = await db
      .update(exercises)
      .set(data)
      .where(eq(exercises.id, id))
      .returning();
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

  // ---------- Exercise submissions (coach -> Forge) ----------
  async getPendingSubmissionForExercise(exerciseId: number, submittedBy: number) {
    return db.query.exerciseSubmissions.findFirst({
      where: and(
        eq(exerciseSubmissions.exerciseId, exerciseId),
        eq(exerciseSubmissions.submittedBy, submittedBy),
        eq(exerciseSubmissions.status, "pending"),
      ),
    });
  },

  async createExerciseSubmission(exerciseId: number, submittedBy: number) {
    const [row] = await db
      .insert(exerciseSubmissions)
      .values({ exerciseId, submittedBy })
      .returning();
    return row;
  },

  async getPendingSubmissionsForAdmin() {
    const rows = await db.query.exerciseSubmissions.findMany({
      where: eq(exerciseSubmissions.status, "pending"),
      orderBy: asc(exerciseSubmissions.createdAt),
      with: { exercise: true, submitter: true },
    });
    return rows.map((r) => ({
      id: r.id,
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
      submitter: { id: r.submitter.id, name: r.submitter.name },
    }));
  },

  async resolveSubmission(id: number, approve: boolean, adminId: number) {
    const submission = await db.query.exerciseSubmissions.findFirst({
      where: eq(exerciseSubmissions.id, id),
    });
    if (!submission) return null;
    if (approve) {
      await db.update(exercises).set({ coachId: adminId }).where(eq(exercises.id, submission.exerciseId));
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
    return db.query.assignments.findMany({
      where: eq(assignments.coachId, coachId),
      with: { program: true, athlete: true },
      orderBy: desc(assignments.createdAt),
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
      })
      .returning();
    const author = await db.query.users.findFirst({ where: eq(users.id, authorId) });
    return {
      id: row.id,
      body: row.body,
      videoUrl: row.videoUrl,
      createdAt: row.createdAt,
      author: { id: author!.id, name: author!.name, role: author!.role },
    };
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
      const assignmentStart = parseISO(a.startDate);
      for (const week of a.program.weeks) {
        for (const day of week.days) {
          const offset = (week.weekNumber - 1) * 7 + (day.dayNumber - 1);
          const date = addDays(assignmentStart, offset);
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
      const assignmentStart = parseISO(a.startDate);
      for (const week of a.program.weeks) {
        for (const day of week.days) {
          const offset = (week.weekNumber - 1) * 7 + (day.dayNumber - 1);
          const date = addDays(assignmentStart, offset);
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
    weightMode: "numeric" | "bodyweight" | "band",
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

  // Most recent prior time this athlete logged this specific exercise
  // (across any program/day) for the "LAST: 4x3 @ 415lb" reference line, plus
  // a flat history of every individual set ever logged for it so the UI can
  // show "what did I get last time at THIS rep count" per set rather than
  // one summary for the whole exercise -- a pyramid scheme (8/5/3/1) should
  // compare each set against its own rep count, not the first set overall.
  async getPerformanceHistoryForAthlete(
    athleteId: number,
    exerciseId: number,
    beforeDate: string,
  ) {
    const logs = await db.query.workoutLogs.findMany({
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

    type SetHistoryPoint = {
      date: string;
      reps: string;
      weight: string | null;
      weightMode: "numeric" | "bodyweight" | "band";
      weightUnit: "lbs" | "kg" | null;
      rpe: number | null;
    };
    let lastPerformance: {
      date: string;
      sets: number;
      reps: string | null;
      weight: string | null;
      weightMode: "numeric" | "bodyweight" | "band";
      weightUnit: "lbs" | "kg" | null;
      rpe: number | null;
      suggestion: { text: string; suggestedWeight: number | null } | null;
    } | null = null;
    const setHistory: SetHistoryPoint[] = [];

    for (const log of logs) {
      for (const entry of log.entries) {
        const entryExerciseId =
          entry.programExercise?.exerciseId ?? entry.corrective?.exerciseId;
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
            rpe: entry.rpe,
            suggestion: this.suggestNextLoad(entry.rpe, weight, entry.weightMode),
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
            rpe: entry.rpe,
          });
          if (setHistory.length >= 200) break;
        }
      }
    }

    return { lastPerformance, setHistory };
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

    const exercisesWithHistory = await Promise.all(
      day.exercises.map(async (pe) => {
        const { lastPerformance, setHistory } = await this.getPerformanceHistoryForAthlete(
          athleteId,
          pe.exerciseId,
          date,
        );
        return { ...pe, lastPerformance, setHistory };
      }),
    );
    const correctivesWithHistory = await Promise.all(
      correctives.map(async (c) => {
        const { lastPerformance, setHistory } = await this.getPerformanceHistoryForAthlete(
          athleteId,
          c.exerciseId,
          date,
        );
        return { ...c, lastPerformance, setHistory };
      }),
    );

    return {
      programName: assignment.program.name,
      correctivesEnabled: assignment.correctivesEnabled,
      day: { ...day, exercises: exercisesWithHistory },
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

    return athleteIds
      .map((id) => ({ ...profileById.get(id)!, ...bestByAthlete.get(id)! }))
      .sort((a, b) => b.estimatedOneRm - a.estimatedOneRm);
  },
};
