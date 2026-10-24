/** Hands the dead space in `workout_set_entries` back to the disk, once.
 *
 * On 2026-10-23 Render mailed "your database is nearing its storage limit". The offload job
 * (set-trace-offload-job.ts) had already moved every skeleton trace out to files -- "0 still in
 * the table" every run since 2026-10-16 -- and the table STILL measured 447 MB for about 114
 * live rows, because a plain VACUUM frees dead tuples for REUSE and never returns the pages to
 * the operating system. Only VACUUM FULL rewrites the file, and that is a by-hand job in a
 * quiet hour on a busy table... which this table is not: 114 rows is a rewrite that finishes
 * in seconds, and at boot, under the job lock, nothing is talking to it yet.
 *
 * WHEN IT RUNS. Boot only, behind an `applied_backfills` marker so a redeploy is silent, and
 * only when both of these hold -- a precondition that fails SKIPS without writing the marker,
 * so the next boot tries again:
 *   - no row still carries frames inline (`skeleton_frames IS NULL` everywhere); a table the
 *     offload has not finished with would be rewritten at its full size for nothing;
 *   - the table is small enough to rewrite without filling the disk it is meant to free
 *     (its LIVE size, measured row by row, under 50 MB; VACUUM FULL needs that much space for
 *     the copy and no more).
 *
 * WHAT IT WRITES DOWN. Size before, size after, bytes returned -- sizes and counts only, never
 * a value, as database-size-job.ts established for this log. The marker is DATED so the next
 * time a table needs this it is a new key and a new decision, not an edit to this one.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";
import { runWithJobLock } from "./job-lock";
import { reportJobFailure } from "./job-errors";

export const SET_ENTRIES_VACUUM_FULL = "set-entries-vacuum-full";
export const SET_ENTRIES_VACUUM_FULL_MARKER = "vacuum_full_set_entries_2026_10_24";
/** Above this estimated live size the rewrite is a real lock on a real table and goes back to
 *  being a by-hand job; the 2026-10-24 table was ~114 rows, well under. */
export const MAX_LIVE_BYTES_FOR_BOOT_VACUUM = 50 * 1024 * 1024;

export type VacuumFullOutcome = {
  status: "already_applied" | "skipped_frames_remain" | "skipped_too_large" | "vacuumed";
  framesStillInline: number;
  liveRowsEstimate: number;
  bytesBefore: number;
  bytesAfter: number;
  note: string;
};

function readRows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
}

export async function vacuumFullSetEntriesOnce(): Promise<VacuumFullOutcome> {
  const applied = readRows<{ n: number }>(
    await db.execute(sql`
      SELECT count(*)::int AS n FROM applied_backfills WHERE key = ${SET_ENTRIES_VACUUM_FULL_MARKER}
    `),
  );
  const facts = readRows<{ frames: number; live: number; bytes: number }>(
    await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM workout_set_entries WHERE skeleton_frames IS NOT NULL) AS frames,
        (SELECT greatest(reltuples, 0)::bigint FROM pg_class WHERE oid = 'workout_set_entries'::regclass) AS live,
        pg_total_relation_size('workout_set_entries')::bigint AS bytes
    `),
  );
  const framesStillInline = Number(facts[0]?.frames ?? 0);
  const liveRowsEstimate = Number(facts[0]?.live ?? 0);
  const bytesBefore = Number(facts[0]?.bytes ?? 0);
  const base = { framesStillInline, liveRowsEstimate, bytesBefore, bytesAfter: bytesBefore };

  if (Number(applied[0]?.n ?? 0) > 0) {
    return { ...base, status: "already_applied", note: "the marker is already in applied_backfills; nothing re-run" };
  }
  if (framesStillInline > 0) {
    return {
      ...base,
      status: "skipped_frames_remain",
      note: `${framesStillInline} rows still hold frames inline; the offload job has to finish first, so this will try again next boot`,
    };
  }
  // The live bytes are what the rewrite has to copy: the stored size of every live row plus
  // the stored size of each json column (which is where a TOASTed value's bytes live, off the
  // heap page). Measured directly, because the first version estimated it off the statistics view's dead-tuple counter and
  // the daily plain VACUUM had already zeroed that counter -- the dead tuples were gone, the
  // PAGES were not, and 447 MB of empty pages read as 447 MB of live rows (production boot,
  // 2026-10-24 01:39 UTC: "skipped_too_large" on a table of 114 rows). A seq scan of a
  // mostly-empty 447 MB table is a one-time read at boot and fine.
  const live = readRows<{ live_bytes: number }>(
    await db.execute(sql`
      SELECT (
        coalesce(sum(pg_column_size(t.*)), 0)
        + coalesce(sum(pg_column_size(t.skeleton_frames)), 0)
        + coalesce(sum(pg_column_size(t.tracking_diagnostics)), 0)
        + coalesce(sum(pg_column_size(t.bar_path_trace)), 0)
        + coalesce(sum(pg_column_size(t.arm_path_trace)), 0)
        + coalesce(sum(pg_column_size(t.rep_breakdown)), 0)
        + coalesce(sum(pg_column_size(t.form_faults)), 0)
        + coalesce(sum(pg_column_size(t.jump_breakdown)), 0)
        + coalesce(sum(pg_column_size(t.med_ball_rep_breakdown)), 0)
        + coalesce(sum(pg_column_size(t.trust_scores)), 0)
        + coalesce(sum(pg_column_size(t.kb_swing_trust_score)), 0)
        + coalesce(sum(pg_column_size(t.med_ball_trust_score)), 0)
        + coalesce(sum(pg_column_size(t.swing_trust_score)), 0)
        + coalesce(sum(pg_column_size(t.arm_drive_asymmetry)), 0)
        + coalesce(sum(pg_column_size(t.leg_drive_asymmetry)), 0)
        + coalesce(sum(pg_column_size(t.capture_device_info)), 0)
      )::bigint AS live_bytes
      FROM workout_set_entries t
    `),
  );
  const liveBytesEstimate = Number(live[0]?.live_bytes ?? bytesBefore);
  if (liveBytesEstimate > MAX_LIVE_BYTES_FOR_BOOT_VACUUM) {
    return {
      ...base,
      status: "skipped_too_large",
      note: `the live rows are estimated at ${mb(liveBytesEstimate)} MB, over the ${mb(MAX_LIVE_BYTES_FOR_BOOT_VACUUM)} MB this boot-time pass will rewrite; run VACUUM FULL by hand in a quiet hour`,
    };
  }

  // Outside any transaction on purpose: Postgres refuses VACUUM inside one, and db.execute on
  // the pool runs each statement on its own.
  await db.execute(sql`VACUUM (FULL, ANALYZE) workout_set_entries`);

  const after = readRows<{ bytes: number }>(
    await db.execute(sql`SELECT pg_total_relation_size('workout_set_entries')::bigint AS bytes`),
  );
  const bytesAfter = Number(after[0]?.bytes ?? bytesBefore);
  await db.execute(sql`
    INSERT INTO applied_backfills (key) VALUES (${SET_ENTRIES_VACUUM_FULL_MARKER})
    ON CONFLICT DO NOTHING
  `);
  return {
    ...base,
    bytesAfter,
    status: "vacuumed",
    note: "the pages are back with the operating system; Render's disk-usage number should fall within its next sample",
  };
}

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function formatVacuumFull(o: VacuumFullOutcome): string {
  return (
    `[job:${SET_ENTRIES_VACUUM_FULL}] ${o.status}: workout_set_entries ${mb(o.bytesBefore)} MB -> ${mb(o.bytesAfter)} MB ` +
    `(${mb(Math.max(0, o.bytesBefore - o.bytesAfter))} MB returned to the disk; ~${o.liveRowsEstimate} live rows, ` +
    `${o.framesStillInline} still holding frames inline). ${o.note}`
  );
}

/** Boot-time, once, through the same advisory lock the other jobs use so two instances starting
 *  together do not both rewrite the table. Never scheduled. */
export function startSetEntriesVacuumFull(): void {
  void runWithJobLock(SET_ENTRIES_VACUUM_FULL, async () => {
    try {
      const outcome = await vacuumFullSetEntriesOnce();
      if (outcome.status === "already_applied") return;
      console.log(formatVacuumFull(outcome));
      return {
        bytesReturned: Math.max(0, outcome.bytesBefore - outcome.bytesAfter),
        vacuumed: outcome.status === "vacuumed" ? 1 : 0,
      };
    } catch (err) {
      reportJobFailure(SET_ENTRIES_VACUUM_FULL, err);
      throw err;
    }
  });
}
