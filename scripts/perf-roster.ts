/* Roster-scale performance harness.
 *
 * Reading the storage layer tells you where a query sits inside a loop. It
 * does not tell you what that costs, and the answer is not obvious: 300 small
 * indexed lookups can beat one large join, or can exhaust a 20-connection
 * pool and queue behind itself. So this seeds a real roster into a real
 * Postgres and times the coach-facing paths that grow with it.
 *
 * Deliberately not a test. It is slow, it needs a database it is allowed to
 * wipe, and its output is a number to think about rather than an assertion to
 * pass -- a threshold here would either be so loose it never fires or so
 * tight it fails on whatever machine CI happens to give us.
 *
 *   DATABASE_URL=... npx tsx scripts/perf-roster.ts [rosterSize...]
 */
import { db, pool } from "../server/db";
import { storage } from "../server/storage";
import {
  users,
  exercises,
  programs,
  programWeeks,
  programDays,
  programExercises,
  assignments,
  coachAthletes,
  workoutLogs,
  workoutLogEntries,
  workoutSetEntries,
} from "@shared/schema";
import { sql } from "drizzle-orm";

const SIZES = process.argv.slice(2).map(Number).filter((n) => n > 0);
const ROSTER_SIZES = SIZES.length ? SIZES : [25, 100, 300];
// Days of history per athlete. Real programs run months; this is enough to
// make the log tables big without making seeding the slow part of the run.
const LOG_DAYS = 10;

async function reset() {
  const { rows } = await pool.query<{ name: string }>(
    `SELECT quote_ident(tablename) AS name FROM pg_tables WHERE schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  await pool.query(`TRUNCATE TABLE ${rows.map((r) => r.name).join(", ")} RESTART IDENTITY CASCADE`);
}

/** One coach, N athletes, each on their own assigned program with real
 * logged sets. Bulk-inserted -- seeding 300 athletes one row at a time is
 * slower than everything being measured. */
async function seed(rosterSize: number) {
  await reset();
  const [coach] = await db
    .insert(users)
    .values({ email: "coach@perf.test", passwordHash: "x", name: "Perf Coach", role: "coach" })
    .returning();

  const athleteRows = await db
    .insert(users)
    .values(
      Array.from({ length: rosterSize }, (_, i) => ({
        email: `athlete-${i}@perf.test`,
        passwordHash: "x",
        name: `Athlete ${i}`,
        role: "athlete" as const,
        dateOfBirth: "2000-01-01",
        timeZone: i % 3 === 0 ? "America/Denver" : null,
      })),
    )
    .returning({ id: users.id });
  const athleteIds = athleteRows.map((r) => r.id);

  await db
    .insert(coachAthletes)
    .values(athleteIds.map((athleteId) => ({ coachId: coach.id, athleteId })));

  const exerciseRows = await db
    .insert(exercises)
    .values(
      ["Back Squat", "Bench Press", "Deadlift", "Pendlay Row", "Box Jump"].map((name) => ({
        coachId: coach.id,
        name,
      })),
    )
    .returning({ id: exercises.id });
  const exerciseIds = exerciseRows.map((r) => r.id);

  // One program per athlete, which is the shape that actually stresses the
  // per-athlete queries -- a single shared program would let one cached day
  // answer for the whole roster and quietly flatter every number below.
  const programRows = await db
    .insert(programs)
    .values(athleteIds.map((_, i) => ({ coachId: coach.id, name: `Program ${i}` })))
    .returning({ id: programs.id });
  // Two weeks, so that with a start date a week ago the SECOND week's day 1
  // lands on today. A one-week program starting ten days ago has already
  // ended, which is how the first run of this harness measured the empty
  // path and reported a flat query count -- the per-athlete loop it was
  // built to measure never executed. The assertion in main() exists so that
  // cannot pass silently again.
  const weekRows = await db
    .insert(programWeeks)
    .values(programRows.flatMap((p) => [1, 2].map((weekNumber) => ({ programId: p.id, weekNumber }))))
    .returning({ id: programWeeks.id, programId: programWeeks.programId });
  const dayRows = await db
    .insert(programDays)
    .values(weekRows.flatMap((w) => [1, 2, 3].map((d) => ({ weekId: w.id, dayNumber: d, title: `Day ${d}` }))))
    .returning({ id: programDays.id, weekId: programDays.weekId });
  await db.insert(programExercises).values(
    dayRows.flatMap((d) =>
      exerciseIds.map((exerciseId, i) => ({ dayId: d.id, exerciseId, orderIndex: i, sets: 3, reps: "5" })),
    ),
  );

  const today = new Date();
  const assignmentRows = await db
    .insert(assignments)
    .values(
      athleteIds.map((athleteId, i) => ({
        programId: programRows[i].id,
        athleteId,
        coachId: coach.id,
        // A week back, so week 2 day 1 is today and every athlete on the
        // roster has a scheduled session on the measured date.
        startDate: new Date(today.getTime() - 7 * 864e5).toISOString().slice(0, 10),
      })),
    )
    .returning({ id: assignments.id, athleteId: assignments.athleteId });

  const dayByWeek = new Map<number, number[]>();
  for (const d of dayRows) dayByWeek.set(d.weekId, [...(dayByWeek.get(d.weekId) ?? []), d.id]);
  const weekByProgram = new Map<number, number>();
  for (const w of weekRows) if (!weekByProgram.has(w.programId)) weekByProgram.set(w.programId, w.id);

  const logValues: (typeof workoutLogs.$inferInsert)[] = [];
  for (const [i, a] of assignmentRows.entries()) {
    const days = dayByWeek.get(weekByProgram.get(programRows[i].id)!) ?? [];
    for (let d = 0; d < LOG_DAYS; d++) {
      logValues.push({
        assignmentId: a.id,
        programDayId: days[d % days.length],
        athleteId: a.athleteId,
        date: new Date(today.getTime() - d * 864e5).toISOString().slice(0, 10),
        completed: true,
      });
    }
  }
  const logRows = await db.insert(workoutLogs).values(logValues).returning({ id: workoutLogs.id });

  const entryRows = await db
    .insert(workoutLogEntries)
    .values(logRows.flatMap((l) => exerciseIds.map((exerciseId) => ({ workoutLogId: l.id, exerciseId }))))
    .returning({ id: workoutLogEntries.id });

  // Inserted in chunks: one statement with ~450k parameters is a different
  // failure (a protocol limit) than anything this harness is measuring.
  const setValues = entryRows.flatMap((e) =>
    [1, 2, 3].map((setNumber) => ({
      logEntryId: e.id,
      setNumber,
      reps: "5",
      weight: 225,
      completed: true,
    })),
  );
  for (let i = 0; i < setValues.length; i += 5000) {
    await db.insert(workoutSetEntries).values(setValues.slice(i, i + 5000));
  }

  return { coach, athleteIds, rows: { logs: logRows.length, sets: setValues.length } };
}

async function time<T>(label: string, fn: () => Promise<T>): Promise<{ label: string; ms: number; queries: number }> {
  const before = await queryCount();
  const t0 = performance.now();
  await fn();
  const ms = performance.now() - t0;
  return { label, ms, queries: (await queryCount()) - before };
}

/** Queries actually issued, counted by wrapping the pool the ORM uses.
 *
 * pg_stat_statements would be the obvious source and is not installed here,
 * but the pool is the better place anyway: it counts what THIS process sent,
 * so a concurrent connection cannot inflate the number, and it needs nothing
 * from the server. Query count is the figure worth comparing across machines;
 * wall time on a sandbox is only good for ratios. */
let queries = 0;
const realQuery = pool.query.bind(pool);
(pool as any).query = (...args: unknown[]) => {
  queries += 1;
  return (realQuery as any)(...args);
};
async function queryCount(): Promise<number> {
  return queries;
}

async function main() {
  const results: Record<string, Record<number, { ms: number; queries: number }>> = {};
  for (const size of ROSTER_SIZES) {
    process.stderr.write(`seeding ${size} athletes...\n`);
    const { coach, rows } = await seed(size);
    process.stderr.write(`  ${rows.logs} logs, ${rows.sets} sets\n`);

    const today = new Date().toISOString().slice(0, 10);
    // Guard against measuring nothing. The point of this harness is the
    // per-athlete work inside the briefing; if the roster has no scheduled
    // session today, every number below is the cost of an empty list.
    const scheduled = await storage.getCalendarForCoach(coach.id, today, today);
    process.stderr.write(`  ${scheduled.length} calendar entries today\n`);
    if (scheduled.length < size) {
      throw new Error(
        `seed produced ${scheduled.length} calendar entries for ${size} athletes -- ` +
          `the per-athlete path would not be exercised, so these numbers would mean nothing`,
      );
    }
    const measurements = [
      await time("getRosterForCoach", () => storage.getRosterForCoach(coach.id)),
      await time("getDayBriefingForCoach", () => storage.getDayBriefingForCoach(coach.id, today)),
      await time("getCoachWeeklyDigest", () => storage.getCoachWeeklyDigest(coach.id)),
      await time("getRosterSeatCountForCoach", () => storage.getRosterSeatCountForCoach(coach.id)),
      await time("getAthletesBlockedPendingGuardian", () =>
        storage.getAthletesBlockedPendingGuardian(),
      ),
    ];
    for (const m of measurements) {
      results[m.label] ??= {};
      results[m.label][size] = { ms: m.ms, queries: m.queries };
    }
  }

  const header = ["method", ...ROSTER_SIZES.flatMap((s) => [`${s} ms`, `${s} q`])];
  const table = Object.entries(results).map(([label, bySize]) => [
    label,
    ...ROSTER_SIZES.flatMap((s) => [
      bySize[s] ? bySize[s].ms.toFixed(0) : "-",
      bySize[s] ? String(bySize[s].queries) : "-",
    ]),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...table.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log("\n" + line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of table) console.log(line(row));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
