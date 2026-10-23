/** Says, at every boot, which declared foreign keys the LIVE database is missing.
 *
 * WHY THIS AND NOT `npm run db:check-drift`. That CLI has existed since the orphan-video
 * episode and is wired into CI -- and CI runs it against a database the same job created
 * minutes earlier, where every constraint was written by the CREATE TABLE that made the table.
 * It passes trivially there, every time, and it had therefore NEVER ONCE RUN against production.
 * server/check-schema-drift.ts's own comment explains the asymmetry it exists to catch: a
 * REFERENCES written inside `CREATE TABLE IF NOT EXISTS` reaches only databases where the table
 * did not already exist, so on production -- the one database that is never fresh -- the
 * constraint was never created and never will be.
 *
 * What that cost, measured 2026-10-22: `workout_set_entries` had ZERO foreign keys and 19,683
 * rows whose parent entry was gone, 1,213 of them still holding a skeleton trace, 451 MB of a
 * 489 MB database. Those rows belong to accounts deleted on 2026-10-11; the cascade that should
 * have taken them did not exist. See server/orphan-set-rows-cleanup.ts, which deletes them and
 * adds that one constraint.
 *
 * THIS JOB REPAIRS NOTHING, and that restraint is the point, in check-schema-drift.ts's own
 * words: "adding a cascade to a table that has accumulated orphans will either fail outright or
 * start deleting rows that survived precisely because the constraint was missing, and that is a
 * decision for a person with the production data in front of them, not for a build step." A
 * boot job is a build step. So it reports, a person reads the log, and each repair is its own
 * one-shot with its own count of what it is about to delete.
 *
 * It logs NAMES OF CONSTRAINTS -- table, column, referenced table, delete rule -- and never a
 * row, a value or a count of anybody's data. That is schema, not athlete data.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";
import { runWithJobLock, scheduleDailyJob } from "./job-lock";
import { reportJobFailure } from "./job-errors";
import {
  actualForeignKeys,
  compareForeignKeys,
  declaredForeignKeys,
  describeFk,
  type ActualFk,
  type FkDrift,
} from "./foreign-key-drift";

export const FK_DRIFT_JOB = "foreign-key-drift-report";

/** How many missing keys to name in one line. The log line has a practical ceiling and the
 *  COUNT is the number that decides whether anybody has to act; if the list is longer than this
 *  the count still tells the truth and `npm run db:check-drift` against the same database
 *  prints all of them. */
const NAMES_IN_THE_LINE = 25;

export function formatFkDrift(drift: FkDrift): string {
  const { declaredCount, missing, wrongAction } = drift;
  if (missing.length === 0 && wrongAction.length === 0) {
    return `[job:${FK_DRIFT_JOB}] no foreign-key drift: all ${declaredCount} declared keys are on the database.`;
  }
  const named = missing.slice(0, NAMES_IN_THE_LINE).map(describeFk);
  const more = missing.length > NAMES_IN_THE_LINE ? ` (+${missing.length - NAMES_IN_THE_LINE} more)` : "";
  const wrong = wrongAction
    .slice(0, NAMES_IN_THE_LINE)
    .map(({ fk, found }) => `${fk.table}.${fk.columns.join(",")} -> ${fk.refTable}: declared "${fk.onDelete}", database has "${found}"`);
  return (
    `[job:${FK_DRIFT_JOB}] ${missing.length} of ${declaredCount} declared foreign keys are MISSING and ` +
    `${wrongAction.length} have the wrong delete rule. NOT repaired here -- see this file's comment. ` +
    `missing: ${named.join("; ")}${more}` +
    (wrong.length ? ` | wrong rule: ${wrong.join("; ")}` : "")
  );
}

export async function runFkDriftReport() {
  const declared = declaredForeignKeys();
  const actual = await actualForeignKeys(
    (text) => db.execute(sql.raw(text)) as unknown as Promise<{ rows: ActualFk[] }>,
  );
  const drift = compareForeignKeys(declared, actual);
  console.log(formatFkDrift(drift));
  return {
    declared: drift.declaredCount,
    missing: drift.missing.length,
    wrongDeleteRule: drift.wrongAction.length,
  };
}

/** At boot, because a deploy is when somebody is reading the log, and daily beside the database
 *  size report for the same reason it exists: a constraint can go missing again the day a table
 *  is recreated by hand. */
export function startFkDriftJob(): void {
  const run = async () => {
    try {
      return await runFkDriftReport();
    } catch (err) {
      reportJobFailure(FK_DRIFT_JOB, err, {});
    }
  };
  void runWithJobLock(FK_DRIFT_JOB, run);
  scheduleDailyJob(FK_DRIFT_JOB, 8, run);
}
