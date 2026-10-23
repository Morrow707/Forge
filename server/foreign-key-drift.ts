/** The declared foreign keys, the live ones, and the difference -- with no side effects.
 *
 * SPLIT OUT OF check-schema-drift.ts ON 2026-10-22, AND THE SPLIT IS LOAD-BEARING. That file is
 * a CLI: it calls `main()` at module scope and `process.exit(1)` when it finds drift, which is
 * right for `npm run db:check-drift` and catastrophic for anything the SERVER imports. The
 * boot-time report (server/fk-drift-job.ts) needs the same comparison, and importing the CLI to
 * get it would have run the CLI at every boot -- connecting, comparing, and exiting the process
 * with status 1 on a database that has drift. Production HAS drift; that is why the report
 * exists. So the server would have crash-looped on deploy. Caught by an unhandled
 * "process.exit unexpectedly called" in the unit run, before it ever reached a deploy.
 *
 * So: this module holds the logic and touches nothing. The CLI keeps its `main()` and its exit
 * code; the job logs a line and returns. Neither imports the other. Do not merge them back.
 *
 * Does the live database actually have the foreign keys shared/schema.ts declares?
 *
 * This exists because the answer turned out to be no, and nothing anywhere would have said so.
 * server/reconcile-schema.ts is additive-only by design -- CREATE TABLE IF NOT EXISTS, ADD
 * COLUMN IF NOT EXISTS -- and CREATE TABLE IF NOT EXISTS is a complete no-op against a table
 * that already exists. So every REFERENCES ... ON DELETE CASCADE written inside one of those
 * blocks was only ever applied to databases where that table did not yet exist. On any table
 * that predates it, the constraint was never created and never will be.
 *
 * Demonstrated rather than reasoned: drop a foreign key from a fully reconciled database,
 * re-run db:reconcile, and it exits zero, prints "Schema reconciliation complete", and leaves
 * the constraint missing. A green deploy says nothing about whether constraints match.
 *
 * That is not a hypothetical either. storage.cleanupOrphanedVideoRows documents 1,078
 * workout_set_entries rows found on production with a video and a dead parent -- a state the
 * declared cascade makes impossible. It was treated as a one-off cleanup rather than as
 * evidence the constraint was absent, and by 2026-10-22 there were 1,213 of them. See
 * server/orphan-set-rows-cleanup.ts.
 *
 * NOTHING HERE REPAIRS ANYTHING, and that restraint belongs to the logic rather than to either
 * caller: adding a cascade to a table that has accumulated orphans will either fail outright or
 * start deleting rows that survived precisely because the constraint was missing, and that is a
 * decision for a person with the production data in front of them, not for a build step.
 *
 * Reads the declaration from Drizzle's own table metadata rather than by parsing schema.ts, so
 * it cannot drift from what the ORM actually believes.
 */
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import { PgTable as PgTableClass } from "drizzle-orm/pg-core";
import * as schema from "@shared/schema";

// Postgres spells these differently from Drizzle. Normalized to Drizzle's spelling so a
// mismatch reads in the vocabulary the schema is written in.
const PG_ACTION: Record<string, string> = {
  "NO ACTION": "no action",
  RESTRICT: "restrict",
  CASCADE: "cascade",
  "SET NULL": "set null",
  "SET DEFAULT": "set default",
};

const key = (t: string, cols: string[], rt: string) => `${t}(${cols.join(",")}) -> ${rt}`;

export type DeclaredFk = {
  table: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete: string;
};

export function declaredForeignKeys(): DeclaredFk[] {
  const out: DeclaredFk[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTableClass)) continue;
    const config = getTableConfig(value as PgTable);
    for (const fk of config.foreignKeys) {
      const ref = fk.reference();
      out.push({
        table: config.name,
        columns: ref.columns.map((c) => c.name),
        refTable: getTableConfig(ref.foreignTable as PgTable).name,
        refColumns: ref.foreignColumns.map((c) => c.name),
        // Drizzle leaves this undefined when the declaration omits it, which
        // Postgres treats as NO ACTION.
        onDelete: fk.onDelete ?? "no action",
      });
    }
  }
  return out;
}

export type ActualFk = {
  table_name: string;
  columns: string[];
  ref_table: string;
  ref_columns: string[];
  delete_rule: string;
};

/** The one query, so the CLI and the boot report cannot drift from each other about what they
 *  are comparing. `runQuery` is how the caller reaches the database: the CLI hands it `pool`,
 *  the boot job hands it drizzle, and neither has to know the other's client. */
export async function actualForeignKeys(
  runQuery: (text: string) => Promise<{ rows: ActualFk[] }>,
): Promise<ActualFk[]> {
  const { rows } = await runQuery(FK_QUERY);
  return rows;
}

const FK_QUERY = `
    -- attname is Postgres's own name type, and node-postgres ships no parser
    -- for an array of it: an uncast array_agg comes back as the literal
    -- string "{a,b}" rather than an array. Cast to text so the driver
    -- parses it.
    SELECT
      c.conrelid::regclass::text                                        AS table_name,
      array_agg(sa.attname::text ORDER BY u.ord)                              AS columns,
      c.confrelid::regclass::text                                       AS ref_table,
      array_agg(fa.attname::text ORDER BY u.ord)                              AS ref_columns,
      CASE c.confdeltype
        WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'   WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
      END                                                               AS delete_rule
    FROM pg_constraint c
    JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY AS u(att, fatt, ord) ON true
    JOIN pg_attribute sa ON sa.attrelid = c.conrelid  AND sa.attnum = u.att
    JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = u.fatt
    WHERE c.contype = 'f'
      AND c.connamespace = 'public'::regnamespace
    GROUP BY c.oid, c.conrelid, c.confrelid, c.confdeltype
`;

export type FkDrift = {
  declaredCount: number;
  missing: DeclaredFk[];
  wrongAction: { fk: DeclaredFk; found: string }[];
};

/** Pure: the declaration against the database, no I/O. Exported so the boot-time report
 *  (server/fk-drift-job.ts) reaches the same verdict as `npm run db:check-drift` -- the whole
 *  reason that report exists is that this check had never once run against PRODUCTION, where a
 *  fresh CI database passes it trivially. */
export function compareForeignKeys(declared: DeclaredFk[], actual: ActualFk[]): FkDrift {
  const actualByKey = new Map(actual.map((a) => [key(a.table_name, a.columns, a.ref_table), a]));
  const missing: DeclaredFk[] = [];
  const wrongAction: { fk: DeclaredFk; found: string }[] = [];
  for (const fk of declared) {
    const found = actualByKey.get(key(fk.table, fk.columns, fk.refTable));
    if (!found) {
      missing.push(fk);
      continue;
    }
    const foundAction = PG_ACTION[found.delete_rule] ?? found.delete_rule.toLowerCase();
    if (foundAction !== fk.onDelete) wrongAction.push({ fk, found: foundAction });
  }
  return { declaredCount: declared.length, missing, wrongAction };
}

export function describeFk(fk: DeclaredFk): string {
  return `${fk.table}.${fk.columns.join(",")} -> ${fk.refTable}.${fk.refColumns.join(",")} (on delete ${fk.onDelete})`;
}

/** Every table a delete on `table` would reach through DECLARED cascades, transitively.
 *
 * WHY THIS EXISTS, AND IT IS THE OPPOSITE OF WHAT THE DRIFT LIST FIRST LOOKED LIKE. On
 * 2026-10-23 the report named three missing keys on `assignment_correctives`, one of them with
 * ZERO orphans -- which reads as "free to add". It is not. The declaration is:
 *
 *   assignment_correctives.exercise_id -> exercises  ON DELETE CASCADE   (and .notNull())
 *   workout_log_entries.corrective_id -> assignment_correctives  ON DELETE CASCADE
 *   workout_set_entries.log_entry_id  -> workout_log_entries     ON DELETE CASCADE
 *
 * so adding that one key would make `storage.deleteExercise` -- a bare DELETE with no guard,
 * which an admin reaches from the exercise library -- destroy every logged set ever recorded
 * against that exercise, and the camera metrics on them. One column away,
 * `workoutLogEntries.exerciseId` is deliberately `onDelete: "set null"` with a comment about
 * historical reads resolving identity through it, so the schema's intent for deleting an
 * exercise is plainly NOT to erase the training. The missing constraint has been PROTECTING
 * production from its own declaration.
 *
 * That is the case `check-schema-drift.ts` could not express: an orphan count of zero says
 * adding a key will SUCCEED, and says nothing about what it would then permit. So the report
 * prints the cascade path too, and a reader sees `exercises -> assignment_correctives ->
 * workout_log_entries -> workout_set_entries` before deciding.
 *
 * PURE AND DECLARATION-ONLY: it reads Drizzle's metadata and touches no database, so it is the
 * same answer in CI, in a test and on production. Cycles are handled by visiting each table
 * once -- a self-referencing table (a thread's parent reply) would otherwise not terminate. */
export function cascadePathsFrom(table: string, declared = declaredForeignKeys()): string[][] {
  const childrenOf = new Map<string, DeclaredFk[]>();
  for (const fk of declared) {
    if (fk.onDelete !== "cascade") continue;
    const list = childrenOf.get(fk.refTable);
    if (list) list.push(fk);
    else childrenOf.set(fk.refTable, [fk]);
  }
  const paths: string[][] = [];
  const walk = (current: string, path: string[], seen: Set<string>) => {
    const children = childrenOf.get(current) ?? [];
    // A leaf of the cascade graph ends a path. A path of one is not a path, so it is dropped by
    // the caller rather than reported as "deleting this reaches itself".
    if (children.length === 0) {
      if (path.length > 1) paths.push(path);
      return;
    }
    let advanced = false;
    for (const fk of children) {
      if (seen.has(fk.table)) {
        // A cycle. Recorded with the repeat visible rather than dropped, because "deleting one of
        // these reaches others of the same kind" is a real property a reader wants (a thread's
        // parent reply, a corrective that references a corrective), and then NOT followed, which
        // is what makes this terminate.
        paths.push([...path, fk.table]);
        advanced = true;
        continue;
      }
      advanced = true;
      walk(fk.table, [...path, fk.table], new Set([...seen, fk.table]));
    }
    if (!advanced && path.length > 1) paths.push(path);
  };
  walk(table, [table], new Set([table]));
  return paths;
}

/** The longest cascade path a delete on `table` would follow, as a readable arrow chain, or null
 *  when a delete there reaches nothing else. The LONGEST rather than all of them because the
 *  question a reader has is how far this can go. */
export function deepestCascadePath(table: string, declared = declaredForeignKeys()): string | null {
  const paths = cascadePathsFrom(table, declared);
  if (paths.length === 0) return null;
  const deepest = paths.reduce((a, b) => (b.length > a.length ? b : a));
  return deepest.join(" -> ");
}
