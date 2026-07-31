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
  workoutLogs,
  workoutLogEntries,
  type InsertUser,
} from "@shared/schema";
import type {
  ProgramStructureInput,
  SubmitWorkoutLogInput,
  UpdateProgramDayInput,
} from "@shared/schema";
import { eq, and, inArray, asc, desc } from "drizzle-orm";
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
          })),
        );
      }
    });
  },

  // ---------- Assignments ----------
  async createAssignment(
    coachId: number,
    programId: number,
    athleteIds: number[],
    startDate: string,
  ) {
    const rows = await db
      .insert(assignments)
      .values(
        athleteIds.map((athleteId) => ({
          coachId,
          programId,
          athleteId,
          startDate,
        })),
      )
      .returning();
    return rows;
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

    const log = await db.query.workoutLogs.findFirst({
      where: and(
        eq(workoutLogs.assignmentId, assignmentId),
        eq(workoutLogs.programDayId, programDayId),
        eq(workoutLogs.date, date),
      ),
      with: { entries: true },
    });

    return {
      programName: assignment.program.name,
      day,
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

      if (input.entries.length > 0) {
        await tx.insert(workoutLogEntries).values(
          input.entries.map((e) => ({
            workoutLogId: log!.id,
            programExerciseId: e.programExerciseId,
            actualSets: e.actualSets ?? null,
            actualReps: e.actualReps ?? null,
            actualWeight: e.actualWeight ?? null,
            rpe: e.rpe ?? null,
            notes: e.notes ?? null,
          })),
        );
      }

      return log;
    });
  },
};
