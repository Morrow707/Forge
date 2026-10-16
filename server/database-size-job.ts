/** Says, once a day and at every boot, how full the database is and what is filling it.
 *
 * WHY. On 2026-10-16, read off the Render metrics API, forge-db was 623 MB of a 1,020 MB disk
 * -- 61% full -- with no real users yet, and nothing in Forge could say what was in it. The
 * candidates are known (a tracked set stores its skeleton frames as JSON, a few MB each; the
 * knowledge library stores a transcribed textbook and its embeddings; a session table that is
 * never vacuumed), but a guess is not a number. The disk fills silently and a full disk stops
 * every write on the platform at once, so the size is worth one log line a day.
 *
 * WHAT IT WRITES. Sizes only: the database total, then the largest tables by
 * `pg_total_relation_size` (table + indexes + TOAST), each with its row estimate. Never a row,
 * a column value, a name or an email -- the Render log is read by whoever has the dashboard.
 *
 * It is a job like the others (`scheduleDailyJob`, the advisory lock, the run history the admin
 * dashboard reads), and it also runs once at boot, because a deploy is when somebody is looking
 * at the log. The boot run goes through the same lock so two instances starting together do
 * not both write it.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";
import { scheduleDailyJob, runWithJobLock } from "./job-lock";
import { reportJobFailure } from "./job-errors";

export const DATABASE_SIZE_JOB = "database-size-report";
const TOP_TABLES = 12;

type TableRow = { table: string; totalBytes: number; rowsEstimate: number };

function readRows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
}

export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDatabaseSizeReport(totalBytes: number, tables: TableRow[]): string {
  const parts = tables.map((t) => `${t.table} ${formatMb(t.totalBytes)} (~${t.rowsEstimate} rows)`);
  return `Database size: ${formatMb(totalBytes)} total; largest tables: ${parts.join("; ")}`;
}

export async function measureDatabaseSize(): Promise<{ totalBytes: number; tables: TableRow[] }> {
  const total = readRows<{ bytes: string | number }>(
    await db.execute(sql`SELECT pg_database_size(current_database())::bigint AS bytes`),
  );
  const tables = readRows<{ table: string; total_bytes: string | number; rows_estimate: string | number }>(
    await db.execute(sql`
      SELECT c.relname AS "table",
             pg_total_relation_size(c.oid)::bigint AS total_bytes,
             GREATEST(c.reltuples, 0)::bigint AS rows_estimate
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
       ORDER BY pg_total_relation_size(c.oid) DESC
       LIMIT ${TOP_TABLES}
    `),
  );
  return {
    totalBytes: Number(total[0]?.bytes ?? 0),
    tables: tables.map((t) => ({
      table: t.table,
      totalBytes: Number(t.total_bytes),
      rowsEstimate: Number(t.rows_estimate),
    })),
  };
}

export async function runDatabaseSizeReport() {
  try {
    const { totalBytes, tables } = await measureDatabaseSize();
    console.log(formatDatabaseSizeReport(totalBytes, tables));
    return { totalMb: Math.round(totalBytes / (1024 * 1024)), tables: tables.length };
  } catch (err) {
    reportJobFailure(DATABASE_SIZE_JOB, err);
    return { totalMb: 0, tables: 0 };
  }
}

export function startDatabaseSizeJob(): void {
  // The boot run is through the lock too: on a deploy both the old and the new instance can be
  // up for a moment, and one report is enough.
  void runWithJobLock(DATABASE_SIZE_JOB, runDatabaseSizeReport);
  scheduleDailyJob(DATABASE_SIZE_JOB, 8, runDatabaseSizeReport);
}
