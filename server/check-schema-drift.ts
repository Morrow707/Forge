import "dotenv/config";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import { PgTable as PgTableClass } from "drizzle-orm/pg-core";
import { pool } from "./db";
import * as schema from "@shared/schema";

// Does the live database actually have the foreign keys shared/schema.ts
// declares?
//
// This exists because the answer turned out to be no, and nothing anywhere
// would have said so. server/reconcile-schema.ts is additive-only by design
// -- CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS -- and
// CREATE TABLE IF NOT EXISTS is a complete no-op against a table that
// already exists. So every REFERENCES ... ON DELETE CASCADE written inside
// one of those blocks was only ever applied to databases where that table
// did not yet exist. On any table that predates it, the constraint was
// never created and never will be.
//
// Demonstrated rather than reasoned: drop a foreign key from a fully
// reconciled database, re-run db:reconcile, and it exits zero, prints
// "Schema reconciliation complete", and leaves the constraint missing. A
// green deploy says nothing about whether constraints match.
//
// That is not a hypothetical either. storage.cleanupOrphanedVideoRows
// documents 1,078 workout_set_entries rows found on production with a video
// and a dead parent -- a state the declared cascade makes impossible. It was
// treated as a one-off cleanup rather than as evidence the constraint was
// absent.
//
// So this reports the gap. It deliberately does NOT repair anything: adding
// a cascade to a table that has accumulated orphans will either fail
// outright or start deleting rows that survived precisely because the
// constraint was missing, and that is a decision for a person with the
// production data in front of them, not for a build step.
//
// Reads the declaration from Drizzle's own table metadata rather than by
// parsing schema.ts, so it cannot drift from what the ORM actually believes.

type DeclaredFk = {
  table: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete: string;
};

// Postgres spells these differently from Drizzle. Normalized to Drizzle's
// spelling so a mismatch reads in the vocabulary the schema is written in.
const PG_ACTION: Record<string, string> = {
  "NO ACTION": "no action",
  RESTRICT: "restrict",
  CASCADE: "cascade",
  "SET NULL": "set null",
  "SET DEFAULT": "set default",
};

function declaredForeignKeys(): DeclaredFk[] {
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

async function actualForeignKeys() {
  const { rows } = await pool.query<{
    table_name: string;
    columns: string[];
    ref_table: string;
    ref_columns: string[];
    delete_rule: string;
  }>(`
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
  `);
  return rows;
}

const key = (t: string, cols: string[], rt: string) => `${t}(${cols.join(",")}) -> ${rt}`;

async function main() {
  const declared = declaredForeignKeys();
  const actual = await actualForeignKeys();
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

  console.log(`Declared foreign keys: ${declared.length}`);
  console.log(`Present in database:   ${declared.length - missing.length}`);

  for (const fk of missing) {
    console.error(
      `MISSING  ${fk.table}.${fk.columns.join(",")} -> ${fk.refTable}.${fk.refColumns.join(",")} (on delete ${fk.onDelete})`,
    );
  }
  for (const { fk, found } of wrongAction) {
    console.error(
      `WRONG    ${fk.table}.${fk.columns.join(",")} -> ${fk.refTable}: declared "on delete ${fk.onDelete}", database has "on delete ${found}"`,
    );
  }

  await pool.end();

  if (missing.length > 0 || wrongAction.length > 0) {
    console.error(
      `\n${missing.length} missing, ${wrongAction.length} with the wrong delete rule.\n` +
        `Not repaired automatically: adding a cascade to a table that has already\n` +
        `accumulated orphans either fails outright or starts deleting rows that\n` +
        `survived because the constraint was absent. See this file's own comment.`,
    );
    process.exit(1);
  }
  console.log("No foreign-key drift.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
