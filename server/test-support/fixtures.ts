import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  users,
  exercises,
  programs,
  programWeeks,
  programDays,
  programExercises,
  assignments,
} from "@shared/schema";

// Clears every table between tests.
//
// Discovered from the catalog rather than listed, so a table added to the
// schema is covered without anyone remembering to update this -- the whole
// point of an integration suite is that it sees the real shape, and a
// hand-maintained list here would drift exactly the way the audit found
// reconcile-schema.ts drifting.
//
// One TRUNCATE for all of them, so CASCADE has nothing left to chase and
// foreign-key order stops mattering. RESTART IDENTITY keeps ids small and
// predictable across tests, which makes a failure easier to read.
export async function resetDatabase(): Promise<void> {
  const { rows } = await pool.query<{ name: string }>(`
    SELECT quote_ident(tablename) AS name
    FROM pg_tables
    WHERE schemaname = 'public'
  `);
  if (rows.length === 0) return;
  await pool.query(
    `TRUNCATE TABLE ${rows.map((r) => r.name).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

let sequence = 0;
const unique = () => `${Date.now().toString(36)}-${sequence++}`;

export async function makeCoach(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [row] = await db
    .insert(users)
    .values({
      email: `coach-${unique()}@example.test`,
      passwordHash: "not-a-real-hash",
      name: "Test Coach",
      role: "coach",
      ...overrides,
    })
    .returning();
  return row;
}

export async function makeAthlete(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [row] = await db
    .insert(users)
    .values({
      email: `athlete-${unique()}@example.test`,
      passwordHash: "not-a-real-hash",
      name: "Test Athlete",
      role: "athlete",
      ...overrides,
    })
    .returning();
  return row;
}

export async function makeExercise(coachId: number, overrides: Partial<typeof exercises.$inferInsert> = {}) {
  const [row] = await db
    .insert(exercises)
    .values({ coachId, name: `Exercise ${unique()}`, ...overrides })
    .returning();
  return row;
}

/**
 * A coach, an athlete, a one-day program containing `exerciseIds`, and an
 * assignment linking them -- the smallest arrangement that can carry a
 * logged workout, which is what most of these tests need before they can
 * assert anything.
 */
export async function makeAssignedProgram(opts: {
  coachId: number;
  athleteId: number;
  exerciseIds: number[];
  startDate?: string;
}) {
  const [program] = await db
    .insert(programs)
    .values({ coachId: opts.coachId, name: `Program ${unique()}` })
    .returning();
  const [week] = await db
    .insert(programWeeks)
    .values({ programId: program.id, weekNumber: 1 })
    .returning();
  const [day] = await db
    .insert(programDays)
    .values({ weekId: week.id, dayNumber: 1, title: "Day 1" })
    .returning();
  const programExerciseRows = await db
    .insert(programExercises)
    .values(
      opts.exerciseIds.map((exerciseId, i) => ({
        dayId: day.id,
        exerciseId,
        orderIndex: i,
        sets: 3,
        reps: "5",
      })),
    )
    .returning();
  const [assignment] = await db
    .insert(assignments)
    .values({
      programId: program.id,
      athleteId: opts.athleteId,
      coachId: opts.coachId,
      startDate: opts.startDate ?? "2026-01-05",
    })
    .returning();
  return { program, week, day, programExercises: programExerciseRows, assignment };
}

export { db, pool, sql };
