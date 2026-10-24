/**
 * THE BOOT-TIME VACUUM FULL AGAINST REAL POSTGRES.
 *
 * Added 2026-10-24 beside server/set-entries-vacuum-full.ts. The decision logic is driven with a
 * fake in the-vacuum-runs-once-and-only-on-an-emptied-table.test.ts; what only Postgres can
 * prove is that `VACUUM (FULL, ANALYZE)` runs at all through the pool (Postgres refuses it
 * inside a transaction, and drizzle's `db.execute` has to be running it outside one), that the
 * table's size is read before and after, and that the marker is written once and read back.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "./db";
import {
  vacuumFullSetEntriesOnce,
  formatVacuumFull,
  SET_ENTRIES_VACUUM_FULL_MARKER,
} from "./set-entries-vacuum-full";
import {
  resetDatabase,
  makeCoach,
  makeAthlete,
  makeExercise,
  makeAssignedProgram,
  makeLoggedSetWithVideo,
} from "./test-support/fixtures";

async function markerCount(): Promise<number> {
  const r = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM applied_backfills WHERE key = ${SET_ENTRIES_VACUUM_FULL_MARKER}
  `);
  return Number((r as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0);
}

async function plantSet(): Promise<void> {
  const coach = await makeCoach();
  const athlete = await makeAthlete();
  const lift = await makeExercise(coach.id);
  const { assignment, day, programExercises } = await makeAssignedProgram({
    coachId: coach.id,
    athleteId: athlete.id,
    exerciseIds: [lift.id],
  });
  await makeLoggedSetWithVideo({
    athleteId: athlete.id,
    assignmentId: assignment.id,
    programDayId: day.id,
    exerciseId: lift.id,
    programExerciseId: programExercises[0].id,
    date: "2026-01-01",
    videoUrl: "/uploads/form-videos/vacuum-itest.mp4",
  });
}

beforeEach(async () => {
  await resetDatabase();
  await db.execute(sql`DELETE FROM applied_backfills WHERE key = ${SET_ENTRIES_VACUUM_FULL_MARKER}`);
});

describe("vacuumFullSetEntriesOnce on real Postgres", () => {
  it("rewrites an emptied table, measures it, writes the marker, and is silent on the second run", async () => {
    await plantSet();
    // Make some dead space the way production did: write frames inline, then null them.
    await db.execute(sql`UPDATE workout_set_entries SET skeleton_frames = ${JSON.stringify([{ t: 0, j: Array(2000).fill(0.5) }])}::json`);
    await db.execute(sql`UPDATE workout_set_entries SET skeleton_frames = NULL`);
    // Stats the size estimate reads come from ANALYZE; a fresh table has none.
    await db.execute(sql`ANALYZE workout_set_entries`);

    const first = await vacuumFullSetEntriesOnce();
    expect(first.status).toBe("vacuumed");
    expect(first.framesStillInline).toBe(0);
    expect(first.bytesBefore).toBeGreaterThan(0);
    expect(first.bytesAfter).toBeGreaterThan(0);
    expect(first.bytesAfter).toBeLessThanOrEqual(first.bytesBefore);
    expect(await markerCount()).toBe(1);
    expect(formatVacuumFull(first)).toMatch(/vacuumed: workout_set_entries [\d.]+ MB -> [\d.]+ MB/);

    const second = await vacuumFullSetEntriesOnce();
    expect(second.status).toBe("already_applied");
    expect(await markerCount()).toBe(1);

    // The row is still there: a rewrite moves pages, never rows.
    const rows = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM workout_set_entries`);
    expect(Number((rows as unknown as { rows: { n: number }[] }).rows[0]?.n)).toBe(1);
  });

  it("skips without the marker while a row still holds frames inline", async () => {
    await plantSet();
    await db.execute(sql`UPDATE workout_set_entries SET skeleton_frames = ${JSON.stringify([{ t: 0 }])}::json`);

    const o = await vacuumFullSetEntriesOnce();
    expect(o.status).toBe("skipped_frames_remain");
    expect(o.framesStillInline).toBe(1);
    expect(await markerCount()).toBe(0);
  });
});
