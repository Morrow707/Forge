/**
 * THE ORPHAN SET ROWS GO, THE LIVE ONES STAY, AND THE CASCADE GOES ON SO IT CANNOT RECUR.
 *
 * Added 2026-10-22. This is the test for a change that DELETES production rows, so it drives the
 * real function against real Postgres and asserts both halves and their ORDER.
 *
 * The setup reproduces production rather than approximating it: the test database is created by
 * reconcile-schema.ts, so it HAS the declared cascade -- which is exactly why production's
 * absence of it went unnoticed for so long (see server/check-schema-drift.ts). So each case
 * DROPS the constraint first, which is the state production has been in since the table was
 * made, and only then creates the orphan the missing constraint permits. A test that could not
 * create an orphan would be a test of nothing.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "./db";
import {
  cleanUpOrphanSetRows,
  formatOrphanCleanup,
  ORPHAN_SET_ROWS_MARKER,
  SET_ENTRY_PARENT_FK,
} from "./orphan-set-rows-cleanup";
import {
  resetDatabase,
  makeCoach,
  makeAthlete,
  makeExercise,
  makeAssignedProgram,
  makeLoggedSetWithVideo,
  makeUploadedFile,
  uploadedFileExists,
} from "./test-support/fixtures";
import { workoutSetEntries, workoutLogEntries } from "@shared/schema";
import { eq } from "drizzle-orm";

async function foreignKeyCount(): Promise<number> {
  const r = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM pg_constraint
    WHERE conrelid = 'workout_set_entries'::regclass AND contype = 'f'
  `);
  return Number((r as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0);
}

/** Production's state: the table with no cascade. Dropped by name AND by any other spelling, so
 *  the case does not depend on what the reconciler happened to call it. */
async function dropTheCascade(): Promise<void> {
  const r = await db.execute<{ conname: string }>(sql`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'workout_set_entries'::regclass AND contype = 'f'
  `);
  for (const row of (r as unknown as { rows: { conname: string }[] }).rows) {
    await db.execute(sql.raw(`ALTER TABLE workout_set_entries DROP CONSTRAINT "${row.conname}"`));
  }
}

/** Puts the cascade back under its canonical name if it is absent.
 *
 *  THIS FILE IS THE ONE PLACE IN THE SUITE THAT CHANGES THE SCHEMA, and `resetDatabase`
 *  TRUNCATEs rows without restoring constraints -- so a dropped foreign key survives
 *  `beforeEach`, leaked into every later case here on the first run of this file (two of them
 *  went red saying so), and would leak into every OTHER itest file sharing the database, where
 *  it would quietly change what a cascade-dependent test observes. So the cascade is asserted
 *  present before each case and restored after each one: this file leaves the database exactly
 *  as it found it. */
async function ensureTheCascade(): Promise<void> {
  if ((await foreignKeyCount()) > 0) return;
  // Any orphan a case deliberately left behind goes first, because adding the constraint over
  // one FAILS -- which is the production guard this whole feature is about, met here in
  // teardown. (It cost a red run to see it: the "a second run is silent" case ends with a live
  // orphan on purpose and the restore could not take.) Deleting rows in teardown is free; the
  // table is truncated before the next case regardless.
  await db.execute(sql`
    DELETE FROM workout_set_entries
    WHERE NOT EXISTS (
      SELECT 1 FROM workout_log_entries wle WHERE wle.id = workout_set_entries.log_entry_id
    )
  `);
  await db.execute(
    sql.raw(
      `ALTER TABLE workout_set_entries ADD CONSTRAINT "${SET_ENTRY_PARENT_FK}" ` +
        `FOREIGN KEY (log_entry_id) REFERENCES workout_log_entries(id) ON DELETE CASCADE`,
    ),
  );
}

async function clearMarker(): Promise<void> {
  await db.execute(sql`DELETE FROM applied_backfills WHERE key = ${ORPHAN_SET_ROWS_MARKER}`);
}

/** A set with a parent, and a set whose parent is then removed out from under it -- which is
 *  only possible with the cascade off, and is precisely how production got 19,683 of them. */
async function aLiveSetAndAnOrphan(opts: { withFiles?: boolean } = {}) {
  const coach = await makeCoach();
  const athlete = await makeAthlete();
  const lift = await makeExercise(coach.id, { name: "Back Squat" });
  const { day, programExercises, assignment } = await makeAssignedProgram({
    coachId: coach.id,
    athleteId: athlete.id,
    exerciseIds: [lift.id],
  });

  const liveVideo = await makeUploadedFile(`live-${athlete.id}.mp4`);
  await makeLoggedSetWithVideo({
    athleteId: athlete.id,
    assignmentId: assignment.id,
    programDayId: day.id,
    exerciseId: lift.id,
    programExerciseId: programExercises[0].id,
    date: "2026-01-01",
    videoUrl: liveVideo,
  });

  const doomedVideo = await makeUploadedFile(`doomed-${athlete.id}.mp4`);
  await makeLoggedSetWithVideo({
    athleteId: athlete.id,
    assignmentId: assignment.id,
    programDayId: day.id,
    exerciseId: lift.id,
    programExerciseId: programExercises[0].id,
    date: "2026-01-02",
    videoUrl: doomedVideo,
  });

  // The row that will be orphaned is the newest entry's. Find it, give it a trace file if the
  // case wants one, then remove its entry -- the step the missing cascade allows.
  const entries = await db
    .select({ id: workoutLogEntries.id })
    .from(workoutLogEntries)
    .orderBy(workoutLogEntries.id);
  const doomedEntryId = entries[entries.length - 1].id;

  let tracePath: string | null = null;
  if (opts.withFiles) {
    tracePath = await makeUploadedFile(`trace-${athlete.id}.json`);
    await db
      .update(workoutSetEntries)
      .set({ skeletonFramesPath: tracePath })
      .where(eq(workoutSetEntries.logEntryId, doomedEntryId));
  }

  await db.execute(sql`DELETE FROM workout_log_entries WHERE id = ${doomedEntryId}`);

  return { liveVideo, doomedVideo, tracePath, doomedEntryId };
}

describe("the orphan set rows are removed and the cascade is restored", () => {
  beforeEach(async () => {
    await resetDatabase();
    await clearMarker();
    await ensureTheCascade();
  });

  // Not only beforeEach: a case that drops the constraint and then fails mid-way would otherwise
  // hand the next FILE a database with no cascade on this table.
  afterEach(ensureTheCascade);

  it("the setup really produces an orphan, so the cases below are testing something", async () => {
    // Guards against the whole file passing vacuously: with the cascade ON, removing the entry
    // takes the set with it and there is no orphan to find. Mutation-proofed by construction.
    expect(await foreignKeyCount()).toBeGreaterThan(0);
    await dropTheCascade();
    expect(await foreignKeyCount()).toBe(0);
    await aLiveSetAndAnOrphan();
    const orphans = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM workout_set_entries wse
      LEFT JOIN workout_log_entries wle ON wle.id = wse.log_entry_id WHERE wle.id IS NULL
    `);
    expect(Number((orphans as unknown as { rows: { n: number }[] }).rows[0].n)).toBe(1);
  });

  it("deletes the orphan and keeps the live row", async () => {
    await dropTheCascade();
    await aLiveSetAndAnOrphan();

    const outcome = await cleanUpOrphanSetRows();

    expect(outcome.status).toBe("cleaned");
    expect(outcome.orphansBefore).toBe(1);
    expect(outcome.rowsDeleted).toBe(1);
    expect(outcome.orphansAfter).toBe(0);

    const left = await db.select({ id: workoutSetEntries.id }).from(workoutSetEntries);
    expect(left).toHaveLength(1);
  });

  it("adds the declared cascade, and only once the table is clean", async () => {
    await dropTheCascade();
    await aLiveSetAndAnOrphan();
    expect(await foreignKeyCount()).toBe(0);

    const outcome = await cleanUpOrphanSetRows();

    expect(outcome.constraintPresentBefore).toBe(false);
    expect(outcome.constraintAdded).toBe(true);
    expect(await foreignKeyCount()).toBe(1);
  });

  it("and with the cascade on, the orphan cannot come back -- which is the whole point", async () => {
    // The recurrence test. cleanupOrphanedVideoRows cleaned 1,078 of these in 2026-08 without
    // the constraint and they came back as 1,213; this asserts the second half really closes it.
    await dropTheCascade();
    await aLiveSetAndAnOrphan();
    await cleanUpOrphanSetRows();
    expect(await foreignKeyCount()).toBe(1);

    const remaining = await db.select({ id: workoutLogEntries.id }).from(workoutLogEntries);
    expect(remaining.length).toBeGreaterThan(0);
    await db.execute(sql`DELETE FROM workout_log_entries WHERE id = ${remaining[0].id}`);

    const orphans = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM workout_set_entries wse
      LEFT JOIN workout_log_entries wle ON wle.id = wse.log_entry_id WHERE wle.id IS NULL
    `);
    expect(Number((orphans as unknown as { rows: { n: number }[] }).rows[0].n)).toBe(0);
  });

  it("removes the orphan's files and leaves the live row's alone", async () => {
    await dropTheCascade();
    const { liveVideo, doomedVideo, tracePath } = await aLiveSetAndAnOrphan({ withFiles: true });
    expect(await uploadedFileExists(liveVideo)).toBe(true);
    expect(await uploadedFileExists(doomedVideo)).toBe(true);
    expect(await uploadedFileExists(tracePath!)).toBe(true);

    const outcome = await cleanUpOrphanSetRows();

    // Both of the orphan's files: the clip and the skeleton trace. SQL cannot unlink a file,
    // which is why this is a job rather than a statement in reconcile-schema.ts.
    expect(outcome.filesDeleted).toBe(2);
    expect(await uploadedFileExists(doomedVideo)).toBe(false);
    expect(await uploadedFileExists(tracePath!)).toBe(false);
    expect(await uploadedFileExists(liveVideo)).toBe(true);
  });

  it("counts the frames it is about to destroy before destroying them", async () => {
    // The number that goes in the log. A destructive one-shot that cannot say what it removed is
    // one nobody can check afterwards.
    await dropTheCascade();
    await aLiveSetAndAnOrphan({ withFiles: true });
    const outcome = await cleanUpOrphanSetRows();
    expect(outcome.framesHeld).toBe(1);
    expect(formatOrphanCleanup(outcome)).toContain("1 held skeleton frames");
  });

  it("a second run is silent: the marker, not the emptiness, is what stops it", async () => {
    await dropTheCascade();
    await aLiveSetAndAnOrphan();
    await cleanUpOrphanSetRows();

    // Make a NEW orphan, which the marker must cause to be left alone. This is the distinction
    // that matters: "already applied" is a record that the one-shot ran, not a claim that there
    // is nothing to do -- so a fresh orphan after it is somebody else's bug to find, not this
    // job's to silently eat on every future deploy.
    await dropTheCascade();
    await aLiveSetAndAnOrphan();

    const second = await cleanUpOrphanSetRows();
    expect(second.status).toBe("already_applied");
    expect(second.rowsDeleted).toBe(0);

    const orphans = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM workout_set_entries wse
      LEFT JOIN workout_log_entries wle ON wle.id = wse.log_entry_id WHERE wle.id IS NULL
    `);
    expect(Number((orphans as unknown as { rows: { n: number }[] }).rows[0].n)).toBe(1);
  });

  it("REFUSES the cascade while an orphan survives the delete, instead of throwing on it", async () => {
    // THE GUARD check-schema-drift.ts DEMANDS, and the only case that reaches it. Its comment:
    // "adding a cascade to a table that has accumulated orphans will either fail outright or
    // start deleting rows that survived precisely because the constraint was missing."
    //
    // Reaching it needs an orphan to exist AT THE MOMENT OF THE ALTER, which the job's own
    // DELETE would otherwise have removed -- the real-world version is a row inserted by a
    // request in flight between the two statements. A trigger reproduces that honestly: one
    // orphan is re-inserted as the delete removes the last one, so `orphansAfter` is non-zero
    // through no fault of the predicate.
    //
    // Mutation-tested: dropping `orphansAfter === 0` from the condition makes Postgres refuse
    // the ALTER, the job throws, and this case goes red. Without it, nothing in the file
    // noticed the guard was gone.
    await dropTheCascade();
    await aLiveSetAndAnOrphan();

    await db.execute(sql`
      CREATE OR REPLACE FUNCTION forge_test_reinsert_orphan() RETURNS trigger AS $fn$
      BEGIN
        INSERT INTO workout_set_entries (log_entry_id, set_number, reps, weight)
        VALUES (OLD.log_entry_id, 99, '1', '1');
        RETURN OLD;
      END;
      $fn$ LANGUAGE plpgsql
    `);
    await db.execute(sql`
      CREATE TRIGGER forge_test_reinsert_orphan
      AFTER DELETE ON workout_set_entries
      FOR EACH ROW WHEN (pg_trigger_depth() < 1)
      EXECUTE FUNCTION forge_test_reinsert_orphan()
    `);

    try {
      const outcome = await cleanUpOrphanSetRows();

      expect(outcome.rowsDeleted).toBe(1);
      expect(outcome.orphansAfter).toBeGreaterThan(0);
      // The two halves of the contract: no constraint, and no exception.
      expect(outcome.constraintAdded).toBe(false);
      expect(await foreignKeyCount()).toBe(0);
      // And it says so, rather than reporting a clean run.
      expect(outcome.note).toContain("orphans remain");
      expect(formatOrphanCleanup(outcome)).toContain("not added");
    } finally {
      await db.execute(sql`DROP TRIGGER IF EXISTS forge_test_reinsert_orphan ON workout_set_entries`);
      await db.execute(sql`DROP FUNCTION IF EXISTS forge_test_reinsert_orphan()`);
    }
  });

  it("is a no-op on a healthy database, and says so without touching the cascade", async () => {
    // The shape every environment but production is in, CI included. It must not drop, re-add
    // or disturb a constraint that is already correct.
    const before = await foreignKeyCount();
    expect(before).toBe(1);

    const outcome = await cleanUpOrphanSetRows();

    expect(outcome.status).toBe("nothing_to_do");
    expect(outcome.rowsDeleted).toBe(0);
    expect(outcome.constraintPresentBefore).toBe(true);
    expect(outcome.constraintAdded).toBe(false);
    expect(await foreignKeyCount()).toBe(before);
  });

  it("names the constraint the reconciler's own CREATE TABLE would have named", async () => {
    // If these two names differ, a database that HAS the constraint under the other spelling
    // gets a second one added -- so the name is load-bearing, not cosmetic.
    const r = await db.execute<{ conname: string }>(sql`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'workout_set_entries'::regclass AND contype = 'f'
    `);
    const existing = (r as unknown as { rows: { conname: string }[] }).rows.map((x) => x.conname);
    expect(existing).toContain(SET_ENTRY_PARENT_FK);
  });
});
