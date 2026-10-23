/** Deletes the workout_set_entries rows whose parent is gone, then adds the foreign key that
 *  should have made them impossible.
 *
 * WHAT IS THERE. Off the production log of 2026-10-22: 19,797 set rows in all, 19,683 of them
 * with no `workout_log_entries` row behind their `log_entry_id`, and 1,213 of those still
 * holding `skeleton_frames` inline -- 451 MB of a 489 MB database, on a 1,020 MB disk. The set
 * ids reference entries 2..6595 while entries only exist from 6229, so everything below that
 * is residue: the demo accounts and the nine launch-audit accounts purged on 2026-10-11, whose
 * `workout_log_entries` rows went with the user and whose set rows did not.
 *
 * WHY THEY DID NOT GO. shared/schema.ts declares
 * `logEntryId ... .references(() => workoutLogEntries.id, { onDelete: "cascade" })`, and
 * production's table has ZERO foreign keys. server/check-schema-drift.ts explains why in full:
 * reconcile-schema.ts is additive-only, `CREATE TABLE IF NOT EXISTS` is a no-op against a table
 * that already exists, so a REFERENCES written inside one of those blocks only ever reached
 * databases where the table did not yet exist. The cascade has never existed on this table.
 *
 * SO THIS IS NOT A SPACE SAVING, IT IS A DELETION THAT DID NOT FINISH. Every one of these rows
 * belongs to an account that was deleted, and a deleted account's skeleton trace -- a biometric
 * record of a person, on a platform whose users are substantially minors -- is the one kind of
 * leftover this repo's own deletion promise does not permit. Scott, 2026-10-11, purging the
 * audit accounts: "purge every inch of data that belongs to all of your generated beta
 * accounts." CLAUDE.md has carried "1213 orphan workout_set_entries rows holding frames, 0
 * foreign keys -- cleanup awaits his word" since 2026-10-19; this is that word, given
 * 2026-10-22.
 *
 * WHY IT IS NOT storage.cleanupOrphanedVideoRows. That method (2026-08) found the same class --
 * its own comment records 1,078 rows with a video and a dead parent -- and NULLED THE VIDEO
 * COLUMNS, keeping the row. That was the narrower, safer act at the time and it is why the rows
 * are still here: it never touched `skeleton_frames`, which is where the 451 MB is. And
 * check-schema-drift.ts names that episode as the mistake to not repeat -- "it was treated as a
 * one-off cleanup rather than as evidence the constraint was absent." A cleanup without the
 * constraint comes back; 1,078 became 1,213.
 *
 * WHY THE CONSTRAINT IS ADDED HERE AND NOT BY THE RECONCILER. check-schema-drift.ts refuses to
 * repair, deliberately: "adding a cascade to a table that has accumulated orphans will either
 * fail outright or start deleting rows that survived precisely because the constraint was
 * missing, and that is a decision for a person with the production data in front of them, not
 * for a build step." Correct, and the reason the two halves are ONE job in ONE order: the
 * orphans go first, the constraint goes on second, and the constraint is only attempted once
 * the count of orphans is zero. Adding it first would fail; adding it to a table still holding
 * orphans is the thing that comment forbids.
 *
 * WHY A JOB AND NOT SQL IN reconcile-schema.ts. Two of these columns are FILES
 * (`skeleton_frames_path`, `form_check_video_url`) and SQL cannot unlink a file. A row deleted
 * with its path still on disk trades a database orphan for a filesystem orphan, which is worse:
 * `set-traces` is gated but `uploaded_files` would still carry a ledger row pointing at nothing.
 * So the files go first, then the rows.
 *
 * IDEMPOTENT, ONCE, AND IT SAYS WHAT IT DID. Guarded by the `applied_backfills` marker the beta
 * one-shot uses, so a redeploy is silent. Counts only in the log -- never an id, a name or a
 * value -- as database-size-job.ts established for this log.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";
import { runWithJobLock } from "./job-lock";
import { reportJobFailure } from "./job-errors";
import { deleteUploadedFile } from "./uploaded-files";

export const ORPHAN_SET_ROWS_CLEANUP = "orphan-set-rows-cleanup";

/** The marker is dated so a future cleanup of the same class is a NEW key rather than an edit to
 *  this one -- the mistake `cleanupOrphanedVideoRows` made was to be a cleanup with no record
 *  that it had already happened once. */
export const ORPHAN_SET_ROWS_MARKER = "orphan_set_rows_2026_10_22";

/** The constraint name Postgres would have given it, so a hand-added one is recognised. */
export const SET_ENTRY_PARENT_FK = "workout_set_entries_log_entry_id_workout_log_entries_id_fk";

function readRows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
}

export type OrphanCleanupOutcome = {
  /** "already_applied" | "cleaned" | "nothing_to_do" | "constraint_only" */
  status: string;
  orphansBefore: number;
  orphansAfter: number;
  framesHeld: number;
  filesDeleted: number;
  rowsDeleted: number;
  constraintAdded: boolean;
  constraintPresentBefore: boolean;
  note: string;
};

/** Every set row whose `log_entry_id` names an entry that does not exist. The LEFT JOIN is the
 *  same predicate the offload job already reports on and the same one
 *  `cleanupOrphanedVideoRows` used, so all three agree on what an orphan is. */
const ORPHAN_PREDICATE = sql`
  NOT EXISTS (
    SELECT 1 FROM workout_log_entries wle WHERE wle.id = workout_set_entries.log_entry_id
  )
`;

export async function cleanUpOrphanSetRows(): Promise<OrphanCleanupOutcome> {
  const applied = readRows<{ n: number }>(
    await db.execute(sql`
      SELECT count(*)::int AS n FROM applied_backfills WHERE key = ${ORPHAN_SET_ROWS_MARKER}
    `),
  );
  const constraintRows = readRows<{ n: number }>(
    await db.execute(sql`
      SELECT count(*)::int AS n FROM pg_constraint
      WHERE conrelid = 'workout_set_entries'::regclass AND contype = 'f'
    `),
  );
  const constraintPresentBefore = Number(constraintRows[0]?.n ?? 0) > 0;

  if (Number(applied[0]?.n ?? 0) > 0) {
    return {
      status: "already_applied",
      orphansBefore: 0,
      orphansAfter: 0,
      framesHeld: 0,
      filesDeleted: 0,
      rowsDeleted: 0,
      constraintAdded: false,
      constraintPresentBefore,
      note: "the marker is already in applied_backfills; nothing re-run",
    };
  }

  const counts = readRows<{ orphans: number; frames: number }>(
    await db.execute(sql`
      SELECT
        count(*)::int AS orphans,
        count(*) FILTER (
          WHERE skeleton_frames IS NOT NULL OR skeleton_frames_path IS NOT NULL
        )::int AS frames
      FROM workout_set_entries
      WHERE ${ORPHAN_PREDICATE}
    `),
  );
  const orphansBefore = Number(counts[0]?.orphans ?? 0);
  const framesHeld = Number(counts[0]?.frames ?? 0);

  // The files FIRST. A row deleted while its path is still on disk leaves a filesystem orphan
  // and an uploaded_files ledger row pointing at nothing, which is harder to find than the
  // database orphan it replaces.
  let filesDeleted = 0;
  if (orphansBefore > 0) {
    const files = readRows<{ trace: string | null; video: string | null }>(
      await db.execute(sql`
        SELECT skeleton_frames_path AS trace, form_check_video_url AS video
        FROM workout_set_entries
        WHERE ${ORPHAN_PREDICATE}
          AND (skeleton_frames_path IS NOT NULL OR form_check_video_url IS NOT NULL)
      `),
    );
    const urls = files.flatMap((f) => [f.trace, f.video]).filter((u): u is string => !!u);
    // Sequential rather than Promise.all: this runs once, at boot, and a thousand concurrent
    // unlinks on a mounted disk is the kind of thing that makes a deploy look hung.
    //
    // deleteUploadedFile answers a BOOLEAN and never throws (it treats an already-missing file
    // as success and records the removal in the ledger, which is the common case here --
    // cleanupOrphanedVideoRows deleted these videos in 2026-08 and nulled the columns). So a
    // false is a real failure worth counting separately, and never a reason to stop: leaving the
    // ROW behind because one file would not unlink is the worse outcome.
    for (const url of urls) {
      if (await deleteUploadedFile(url)) filesDeleted += 1;
      else console.warn(`[job:${ORPHAN_SET_ROWS_CLEANUP}] one orphan's file could not be removed`);
    }
  }

  const deleted = readRows<{ n: number }>(
    await db.execute(sql`
      WITH gone AS (
        DELETE FROM workout_set_entries WHERE ${ORPHAN_PREDICATE} RETURNING 1
      )
      SELECT count(*)::int AS n FROM gone
    `),
  );
  const rowsDeleted = Number(deleted[0]?.n ?? 0);

  const after = readRows<{ n: number }>(
    await db.execute(sql`
      SELECT count(*)::int AS n FROM workout_set_entries WHERE ${ORPHAN_PREDICATE}
    `),
  );
  const orphansAfter = Number(after[0]?.n ?? 0);

  // ONLY on a clean table. If anything is still orphaned -- a row inserted between the delete
  // and here, or a predicate that did not mean what it says -- the constraint would either fail
  // or take rows with it, and check-schema-drift.ts's comment forbids exactly that.
  let constraintAdded = false;
  if (orphansAfter === 0 && !constraintPresentBefore) {
    await db.execute(sql`
      ALTER TABLE workout_set_entries
        ADD CONSTRAINT ${sql.raw(`"${SET_ENTRY_PARENT_FK}"`)}
        FOREIGN KEY (log_entry_id) REFERENCES workout_log_entries(id) ON DELETE CASCADE
    `);
    constraintAdded = true;
  }

  if (rowsDeleted > 0) {
    // Reclaims the space for REUSE, not for the disk -- the Render disk number does not fall
    // until a VACUUM FULL, which takes an exclusive lock on this table and is a by-hand job in a
    // quiet hour (see set-trace-offload-job.ts's own note).
    await db.execute(sql`VACUUM (ANALYZE) workout_set_entries`);
  }

  await db.execute(sql`
    INSERT INTO applied_backfills (key) VALUES (${ORPHAN_SET_ROWS_MARKER})
    ON CONFLICT DO NOTHING
  `);

  const status =
    rowsDeleted > 0 ? "cleaned" : constraintAdded ? "constraint_only" : "nothing_to_do";
  return {
    status,
    orphansBefore,
    orphansAfter,
    framesHeld,
    filesDeleted,
    rowsDeleted,
    constraintAdded,
    constraintPresentBefore,
    note:
      orphansAfter > 0
        ? `${orphansAfter} orphans remain, so the foreign key was NOT added -- look at them before re-running`
        : constraintAdded
          ? "the declared cascade is on the table now, so this cannot recur"
          : constraintPresentBefore
            ? "the cascade was already present"
            : "no orphans and no cascade added",
  };
}

export function formatOrphanCleanup(o: OrphanCleanupOutcome): string {
  return (
    `[job:${ORPHAN_SET_ROWS_CLEANUP}] ${o.status}: ${o.rowsDeleted} orphan set rows deleted ` +
    `(${o.orphansBefore} found, ${o.framesHeld} held skeleton frames, ${o.filesDeleted} files removed); ` +
    `${o.orphansAfter} remain; foreign key ${
      o.constraintAdded ? "ADDED" : o.constraintPresentBefore ? "already present" : "not added"
    }. ${o.note}`
  );
}

/** Boot-time, once, through the same advisory lock the other jobs use so two instances starting
 *  together do not both run it. Never scheduled: it is a one-shot, and the marker is what makes
 *  a redeploy silent rather than a second pass. */
export function startOrphanSetRowsCleanup(): void {
  void runWithJobLock(ORPHAN_SET_ROWS_CLEANUP, async () => {
    try {
      const outcome = await cleanUpOrphanSetRows();
      if (outcome.status === "already_applied") return;
      console.log(formatOrphanCleanup(outcome));
      // The counters the admin dashboard's run history reads. Counts only.
      return {
        rowsDeleted: outcome.rowsDeleted,
        filesDeleted: outcome.filesDeleted,
        orphansRemaining: outcome.orphansAfter,
        constraintAdded: outcome.constraintAdded ? 1 : 0,
      };
    } catch (err) {
      reportJobFailure(ORPHAN_SET_ROWS_CLEANUP, err, {});
    }
  });
}
