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
  type InsertUser,
} from "@shared/schema";
import type {
  ProgramStructureInput,
  SubmitWorkoutLogInput,
  UpdateProgramDayInput,
  UpdateCorrectivesInput,
  UpdateAssignmentInput,
  UpdatePreferencesInput,
} from "@shared/schema";
import { eq, and, inArray, asc, desc, lt } from "drizzle-orm";
import { generateCoachCode } from "./auth-utils";
import { addDays, parseISO, formatISO, isWithinInterval } from "date-fns";

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
      })
      .from(coachAthletes)
      .innerJoin(users, eq(coachAthletes.athleteId, users.id))
      .where(eq(coachAthletes.coachId, coachId))
      .orderBy(asc(users.name));
    return rows;
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
    return db.query.teams.findMany({
      where: eq(teams.coachId, coachId),
      with: { members: { with: { athlete: true } } },
      orderBy: asc(teams.name),
    });
  },

  async createTeam(coachId: number, name: string) {
    const [team] = await db.insert(teams).values({ coachId, name }).returning();
    return team;
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
  async getExercisesByCoach(coachId: number) {
    return db.query.exercises.findMany({
      where: eq(exercises.coachId, coachId),
      orderBy: desc(exercises.createdAt),
    });
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

  async deleteExercise(id: number) {
    await db.delete(exercises).where(eq(exercises.id, id));
  },

  // ---------- Programs ----------
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
    const existing = await db.query.assignments.findMany({
      where: and(
        eq(assignments.coachId, coachId),
        eq(assignments.programId, programId),
      ),
    });
    const alreadyAssigned = new Set(existing.map((a) => a.athleteId));
    const toCreate = athletes.filter((a) => !alreadyAssigned.has(a.athleteId));
    const skippedAthleteIds = athletes
      .filter((a) => alreadyAssigned.has(a.athleteId))
      .map((a) => a.athleteId);

    const created = toCreate.length
      ? await db
          .insert(assignments)
          .values(
            toCreate.map((a) => ({
              coachId,
              programId,
              athleteId: a.athleteId,
              startDate,
              correctivesEnabled: a.correctivesEnabled,
            })),
          )
          .returning()
      : [];

    return { created, skippedAthleteIds };
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

    entries.sort((a, b) => a.date.localeCompare(b.date));
    return entries;
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

    entries.sort((a, b) => a.date.localeCompare(b.date));
    return entries;
  },

  // Most recent prior time this athlete logged this specific exercise
  // (across any program/day), for the "LAST: 4x3 @ 415lb" reference line.
  async getLastPerformanceForAthlete(
    athleteId: number,
    exerciseId: number,
    beforeDate: string,
  ) {
    const logs = await db.query.workoutLogs.findMany({
      where: and(eq(workoutLogs.athleteId, athleteId), lt(workoutLogs.date, beforeDate)),
      orderBy: desc(workoutLogs.date),
      limit: 30,
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

    for (const log of logs) {
      for (const entry of log.entries) {
        const entryExerciseId =
          entry.programExercise?.exerciseId ?? entry.corrective?.exerciseId;
        if (entryExerciseId === exerciseId && entry.sets.length > 0) {
          return {
            date: log.date,
            sets: entry.sets.length,
            reps: entry.sets[0]?.reps ?? null,
            weight: entry.sets[0]?.weight ?? null,
            weightMode: entry.weightMode,
          };
        }
      }
    }
    return null;
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
      day.exercises.map(async (pe) => ({
        ...pe,
        lastPerformance: await this.getLastPerformanceForAthlete(
          athleteId,
          pe.exerciseId,
          date,
        ),
      })),
    );
    const correctivesWithHistory = await Promise.all(
      correctives.map(async (c) => ({
        ...c,
        lastPerformance: await this.getLastPerformanceForAthlete(
          athleteId,
          c.exerciseId,
          date,
        ),
      })),
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
            })),
          );
        }
      }

      return log;
    });
  },
};
