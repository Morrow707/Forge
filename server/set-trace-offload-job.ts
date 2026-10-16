/** Moves the skeleton frames that are still INSIDE `workout_set_entries` out to files.
 *
 * The write path has stored new captures' frames as files since 2026-10-16 (set-trace-files.ts
 * says why). This is the other half: the 17,000-odd rows written before that, 450 MB of them,
 * which a save of their day would otherwise go on re-inserting in full until the day is next
 * touched -- and most never will be. A few rows at a time, each read, written to its file, and
 * nulled in one UPDATE guarded on the column still being non-null, so a save that lands on the
 * same row between the read and the write cannot be overwritten (the save would have moved the
 * frames itself and the guard finds nothing to null).
 *
 * Runs at boot and daily, under the job lock, for at most a minute per run, and is idempotent:
 * with nothing left to move it finds no rows and stops. A plain VACUUM (never FULL, which takes
 * an exclusive lock on the busiest table in the app) runs after a batch that moved anything, so
 * the space the dead tuples held is reusable; the disk-usage number Render shows does not fall
 * until an operator runs VACUUM FULL in a quiet hour, and does not need to.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";
import { scheduleDailyJob, runWithJobLock } from "./job-lock";
import { reportJobFailure } from "./job-errors";
import { setTracePathFor, writeSetTraceFile, deleteSetTraceFile } from "./set-trace-files";

export const SET_TRACE_OFFLOAD_JOB = "set-trace-offload";
const BATCH = 5;
const TIME_BUDGET_MS = 60_000;

type Row = {
  id: number;
  set_number: number;
  log_id: number;
  athlete_id: number;
  program_exercise_id: number | null;
  corrective_id: number | null;
  skeleton_frames: unknown;
};

function readRows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
}

export async function offloadSetTraces(opts: { timeBudgetMs?: number; batch?: number } = {}) {
  const budget = opts.timeBudgetMs ?? TIME_BUDGET_MS;
  const batch = opts.batch ?? BATCH;
  const started = Date.now();
  let moved = 0;
  let remaining = 0;
  try {
    while (Date.now() - started < budget) {
      const rows = readRows<Row>(
        await db.execute(sql`
          SELECT wse.id, wse.set_number, wl.id AS log_id, wl.athlete_id,
                 wle.program_exercise_id, wle.corrective_id, wse.skeleton_frames
            FROM workout_set_entries wse
            JOIN workout_log_entries wle ON wle.id = wse.log_entry_id
            JOIN workout_logs wl ON wl.id = wle.workout_log_id
           WHERE wse.skeleton_frames IS NOT NULL
           ORDER BY wse.id
           LIMIT ${batch}
        `),
      );
      if (rows.length === 0) break;
      // Says what each batch found: ids only, never a frame. The first production run reported
      // "moved 0 ... 1213 still in the table" in 100 ms, which neither branch below explains
      // on its own, so the batch narrates itself until that is understood.
      console.log(`[job:${SET_TRACE_OFFLOAD_JOB}] batch of ${rows.length}: ids ${rows.map((r) => r.id).join(",")}`);
      for (const row of rows) {
        const frames = Array.isArray(row.skeleton_frames) ? row.skeleton_frames : [];
        const exerciseKey = row.program_exercise_id != null ? `pe:${row.program_exercise_id}` : `c:${row.corrective_id}`;
        const url = setTracePathFor(Number(row.athlete_id), Number(row.log_id), exerciseKey, Number(row.set_number));
        await writeSetTraceFile(url, frames);
        const updated = readRows<{ id: number }>(
          await db.execute(sql`
            UPDATE workout_set_entries
               SET skeleton_frames = NULL, skeleton_frames_path = ${url}
             WHERE id = ${row.id} AND skeleton_frames IS NOT NULL
             RETURNING id
          `),
        );
        if (updated.length > 0) {
          moved++;
          await db.execute(
            sql`INSERT INTO uploaded_files (path, uploaded_by) VALUES (${url}, ${Number(row.athlete_id)}) ON CONFLICT (path) DO NOTHING`,
          );
        } else {
          console.log(`[job:${SET_TRACE_OFFLOAD_JOB}] set ${row.id} was gone or already moved before its UPDATE.`);
          // A save of that day landed between the read and the write: it re-inserted the set
          // (a new id) and this row is gone, so the file just written has no row to belong to.
          // The next run finds the new row. Nothing is lost; the orphan is removed here.
          await deleteSetTraceFile(url);
        }
      }
    }
    const left = readRows<{ n: string | number }>(
      await db.execute(sql`SELECT count(*)::int AS n FROM workout_set_entries WHERE skeleton_frames IS NOT NULL`),
    );
    remaining = Number(left[0]?.n ?? 0);
    if (moved > 0) {
      await db.execute(sql`VACUUM (ANALYZE) workout_set_entries`);
    }
    console.log(`[job:${SET_TRACE_OFFLOAD_JOB}] moved ${moved} sets' skeleton frames to files; ${remaining} still in the table.`);
  } catch (err) {
    console.error(`[job:${SET_TRACE_OFFLOAD_JOB}] stopped on an error after moving ${moved}:`, err instanceof Error ? err.message : String(err));
    reportJobFailure(SET_TRACE_OFFLOAD_JOB, err, { moved });
  }
  return { moved, remaining };
}

export function startSetTraceOffloadJob(): void {
  void runWithJobLock(SET_TRACE_OFFLOAD_JOB, () => offloadSetTraces());
  scheduleDailyJob(SET_TRACE_OFFLOAD_JOB, 7, () => offloadSetTraces());
}
