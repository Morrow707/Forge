/**
 * THE TWO DESTRUCTIVE JOBS' LOG LINES, AND WHAT THEY MAY NOT CONTAIN.
 *
 * Added 2026-10-22 beside server/orphan-set-rows-cleanup.ts (which deletes rows) and
 * server/fk-drift-job.ts (which reports on the schema that let them accumulate). The behaviour
 * is covered against real Postgres in orphan-set-rows-cleanup.itest.ts; what is covered HERE is
 * the part an itest cannot see: the sentence a person reads in the Render deploy log, and the
 * promise that neither job puts athlete data in it.
 *
 * Same shape and the same reason as database-size-job.test.ts: that log is read by whoever has
 * the dashboard, so sizes, counts and constraint names are the only things allowed in it.
 */
import { describe, expect, it, vi } from "vitest";

// Both modules import the live pool; `npm test` runs with no database (CLAUDE.md, Tests).
vi.mock("./db", () => ({ db: {} }));
vi.mock("./job-lock", () => ({ scheduleDailyJob: vi.fn(), runWithJobLock: vi.fn() }));
vi.mock("./uploaded-files", () => ({ deleteUploadedFile: vi.fn() }));
import fs from "node:fs";
import path from "node:path";
import { formatOrphanCleanup, ORPHAN_SET_ROWS_MARKER, SET_ENTRY_PARENT_FK } from "./orphan-set-rows-cleanup";
import { formatCascadeExposure, formatFkDrift, formatOrphanCensus } from "./fk-drift-job";
import { cascadePathsFrom, deepestCascadePath } from "./foreign-key-drift";

/** Source with comments removed, for a NEGATIVE assertion. CLAUDE.md's most repeated
 *  self-inflicted failure: prose about what the code does not do is indistinguishable from the
 *  code doing it, and both files below quote the old SQL in their comments at length. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

const CLEANUP = fs.readFileSync(path.join(__dirname, "orphan-set-rows-cleanup.ts"), "utf8");
const DRIFT = fs.readFileSync(path.join(__dirname, "fk-drift-job.ts"), "utf8");

describe("the orphan cleanup's log line", () => {
  it("says what it removed, what it left, and whether the cascade went on", () => {
    const line = formatOrphanCleanup({
      status: "cleaned",
      orphansBefore: 19683,
      orphansAfter: 0,
      framesHeld: 1213,
      filesDeleted: 4,
      rowsDeleted: 19683,
      constraintAdded: true,
      constraintPresentBefore: false,
      note: "the declared cascade is on the table now, so this cannot recur",
    });
    // The four numbers somebody checks the run against, and the verdict on the constraint.
    expect(line).toContain("19683 orphan set rows deleted");
    expect(line).toContain("1213 held skeleton frames");
    expect(line).toContain("4 files removed");
    expect(line).toContain("0 remain");
    expect(line).toContain("foreign key ADDED");
  });

  it("distinguishes 'already present' from 'not added', because they mean opposite things", () => {
    // "not added" on a table with no cascade is the guard having fired and wants a look;
    // "already present" is an ordinary no-op. A line that said the same for both would make the
    // one case worth reading invisible.
    const base = {
      status: "nothing_to_do",
      orphansBefore: 0,
      orphansAfter: 0,
      framesHeld: 0,
      filesDeleted: 0,
      rowsDeleted: 0,
      note: "",
    };
    expect(formatOrphanCleanup({ ...base, constraintAdded: false, constraintPresentBefore: true })).toContain(
      "foreign key already present",
    );
    expect(formatOrphanCleanup({ ...base, constraintAdded: false, constraintPresentBefore: false })).toContain(
      "foreign key not added",
    );
  });

  it("the marker is dated, so a future cleanup of this class is a new key and not an edit", () => {
    // cleanupOrphanedVideoRows' mistake was being a cleanup with no record that it had already
    // happened once -- 1,078 rows in 2026-08 came back as 1,213.
    expect(ORPHAN_SET_ROWS_MARKER).toMatch(/_\d{4}_\d{2}_\d{2}$/);
  });

  it("the constraint name is the one the reconciler's CREATE TABLE produces", () => {
    // Held against the reconciler's own text rather than retyped: a different spelling would add
    // a SECOND cascade to a database that already has one.
    const reconciler = fs.readFileSync(path.join(__dirname, "reconcile-schema.ts"), "utf8");
    expect(SET_ENTRY_PARENT_FK).toBe("workout_set_entries_log_entry_id_workout_log_entries_id_fk");
    expect(reconciler).toContain('"workout_set_entries"');
  });

  it("deletes NOTHING outside the orphan predicate", () => {
    // The assertion stated as what is FORBIDDEN rather than as the shape of today's query: any
    // DELETE in this file must be qualified by the predicate. An unqualified
    // `DELETE FROM workout_set_entries` would have emptied the table, and the itest's
    // live-row case is what catches that at runtime -- this catches it at a glance.
    const code = codeOnly(CLEANUP);
    const deletes = [...code.matchAll(/DELETE FROM (\w+)/g)].map((m) => m[0]);
    expect(deletes.length).toBeGreaterThan(0);
    for (const d of deletes) {
      if (d.includes("workout_set_entries")) {
        const at = code.indexOf(d);
        expect(code.slice(at, at + 160)).toContain("ORPHAN_PREDICATE");
      }
    }
  });

  it("names only its own table: it is not a general-purpose row remover", () => {
    const code = codeOnly(CLEANUP);
    const tables = new Set([...code.matchAll(/DELETE FROM (\w+)/g)].map((m) => m[1]));
    // applied_backfills is not in it: the marker is INSERTed, never cleared, or the one-shot
    // would run again.
    expect([...tables]).toEqual(["workout_set_entries"]);
  });
});

describe("the foreign-key drift report", () => {
  it("says nothing is wrong when nothing is", () => {
    expect(formatFkDrift({ declaredCount: 212, missing: [], wrongAction: [] })).toBe(
      "[job:foreign-key-drift-report] no foreign-key drift: all 212 declared keys are on the database.",
    );
  });

  it("names the missing keys and counts them, and says it repaired nothing", () => {
    const line = formatFkDrift({
      declaredCount: 212,
      missing: [
        {
          table: "workout_set_entries",
          columns: ["log_entry_id"],
          refTable: "workout_log_entries",
          refColumns: ["id"],
          onDelete: "cascade",
        },
      ],
      wrongAction: [],
    });
    expect(line).toContain("1 of 212 declared foreign keys are MISSING");
    expect(line).toContain("workout_set_entries.log_entry_id -> workout_log_entries.id (on delete cascade)");
    // The restraint is part of the message: a reader must not think the deploy fixed it.
    expect(line).toContain("NOT repaired here");
  });

  it("truncates the NAMES and never the COUNT", () => {
    // The count is what decides whether anybody has to act, so it survives a list too long to
    // print. A report that said "25 missing" when 90 were missing would be worse than silence.
    const many = Array.from({ length: 90 }, (_, i) => ({
      table: `t${i}`,
      columns: ["a"],
      refTable: "u",
      refColumns: ["id"],
      onDelete: "cascade",
    }));
    const line = formatFkDrift({ declaredCount: 212, missing: many, wrongAction: [] });
    expect(line).toContain("90 of 212 declared foreign keys are MISSING");
    expect(line).toContain("(+65 more)");
  });

  it("says what each missing key would take with it, which is what makes the list actionable", () => {
    const line = formatOrphanCensus([
      {
        fk: { table: "assignment_correctives", columns: ["assignment_id"], refTable: "assignments", refColumns: ["id"], onDelete: "cascade" },
        orphans: 0,
      },
      {
        fk: { table: "workout_set_entries", columns: ["log_entry_id"], refTable: "workout_log_entries", refColumns: ["id"], onDelete: "cascade" },
        orphans: 19683,
      },
    ]);
    expect(line).toContain("assignment_correctives.assignment_id -> assignments: 0 orphan row(s)");
    expect(line).toContain("workout_set_entries.log_entry_id -> workout_log_entries: 19683 orphan row(s)");
    // The summary is the decision: a key with nothing behind it is a one-line migration; one
    // with 19,683 rows behind it is a deletion that needs its own commit and its own count.
    expect(line).toContain("1 of 2 would be ADDABLE with nothing to clean up first");
  });

  it("a count that could not be taken is NOT reported as zero", () => {
    // "No orphans" and "could not look" must not read the same. That conflation is what the
    // optional-flags defect of 2026-10-22 was made of: a flag that was not computed and a flag
    // that did not apply were the same value, so a live leak certified as absent.
    const line = formatOrphanCensus([
      {
        fk: { table: "later_table", columns: ["x_id"], refTable: "x", refColumns: ["id"], onDelete: "cascade" },
        orphans: null,
      },
    ]);
    expect(line).toContain("could not count");
    expect(line).not.toContain("0 orphan row(s)");
    expect(line).toContain("0 of 1 would be ADDABLE");
  });

  it("A ZERO ORPHAN COUNT IS NOT A GREEN LIGHT, and the report says so next to the count", () => {
    // The whole reason the cascade line exists. 2026-10-23's census said
    // assignment_correctives.exercise_id -> exercises had ZERO orphans, which reads as free to
    // add -- and the declaration behind it makes storage.deleteExercise (an unguarded DELETE an
    // admin reaches from the exercise library) cascade through correctives into logged entries,
    // logged sets and their camera metrics, where the column one line away is deliberately
    // `set null` to preserve exactly that history.
    const census = formatOrphanCensus([
      {
        fk: { table: "assignment_correctives", columns: ["exercise_id"], refTable: "exercises", refColumns: ["id"], onDelete: "cascade" },
        orphans: 0,
      },
    ]);
    expect(census).toContain("would be ADDABLE");
    expect(census).toContain("not\nthe same as safe".replace("\n", " "));

    const exposure = formatCascadeExposure([
      { table: "assignment_correctives", columns: ["exercise_id"], refTable: "exercises", refColumns: ["id"], onDelete: "cascade" },
    ]);
    // Read off the real declaration, not a fixture: if somebody changes one of these cascades to
    // `set null` or `restrict`, this path shortens and the case says so.
    expect(exposure).toContain("exercises -> assignment_correctives -> workout_log_entries");
    expect(exposure).toContain("never that the cascade is wanted");
  });

  it("the cascade walk terminates on a cycle and ignores a one-hop key", () => {
    // A self-referencing table would otherwise not terminate, and a key whose parent cascades
    // nowhere interesting tells a reader nothing -- so it is dropped rather than printed.
    const selfRef = [
      { table: "t", columns: ["parent_id"], refTable: "t", refColumns: ["id"], onDelete: "cascade" },
    ];
    expect(() => cascadePathsFrom("t", selfRef)).not.toThrow();
    expect(deepestCascadePath("t", selfRef)).toBe("t -> t");

    const oneHop = [
      { table: "leaf", columns: ["x_id"], refTable: "x", refColumns: ["id"], onDelete: "cascade" },
    ];
    expect(formatCascadeExposure(oneHop)).toBe("");

    // And a non-cascade rule is not a cascade: `set null` must not appear in a path.
    const setNull = [
      { table: "keeps_history", columns: ["x_id"], refTable: "x", refColumns: ["id"], onDelete: "set null" },
      { table: "goes", columns: ["kh_id"], refTable: "keeps_history", refColumns: ["id"], onDelete: "cascade" },
    ];
    expect(deepestCascadePath("x", setNull)).toBeNull();
  });

  it("the census counts and never changes anything", () => {
    // Its queries are built by concatenation from Drizzle's table metadata, so the shape of
    // what it may emit is worth stating as a rule: SELECT count only.
    const code = codeOnly(DRIFT);
    const at = code.indexOf("countOrphansForMissingKeys");
    expect(at).toBeGreaterThan(0);
    const body = code.slice(at, code.indexOf("export function formatOrphanCensus"));
    expect(body).toContain("SELECT count(*)");
    for (const forbidden of [/\bINSERT\b/i, /\bUPDATE\b/i, /\bDELETE\b/i, /\bALTER\b/i, /\bDROP\b/i]) {
      expect(body, `the census must not ${forbidden}`).not.toMatch(forbidden);
    }
    // Identifiers are quoted even though they come from the declaration rather than a request:
    // a query assembled by concatenation should not need its provenance to be safe.
    expect(body).toContain('replace(/"/g');
  });

  it("repairs nothing: no ALTER, no DROP, no DELETE anywhere in it", () => {
    // check-schema-drift.ts's own reason, quoted in that file: adding a cascade to a table that
    // has accumulated orphans either fails or starts deleting rows that survived because the
    // constraint was missing, "and that is a decision for a person with the production data in
    // front of them, not for a build step." A boot job IS a build step.
    const code = codeOnly(DRIFT);
    expect(code).not.toMatch(/ALTER TABLE/i);
    expect(code).not.toMatch(/DROP\s+CONSTRAINT/i);
    expect(code).not.toMatch(/DELETE FROM/i);
  });

  it("reads the catalog and no application table", () => {
    // Same promise as the size report: constraint names are schema, not somebody's data.
    const checker = fs.readFileSync(path.join(__dirname, "foreign-key-drift.ts"), "utf8");
    const froms = [...checker.matchAll(/\bFROM\s+([\w"]+)/g)].map((m) => m[1]);
    expect(froms.every((f) => f.startsWith("pg_"))).toBe(true);
  });

  it("NOTHING THE SERVER IMPORTS MAY EXIT THE PROCESS", () => {
    // The bug this caught, before it shipped: the job first imported check-schema-drift.ts,
    // which is a CLI -- it calls main() at module scope and process.exit(1) on drift. Importing
    // it from server/index.ts would have connected, compared, and killed the process on any
    // database that actually had drift. Production HAS drift, which is the entire reason the
    // report exists, so the deploy would have crash-looped. Seen as an unhandled
    // "process.exit unexpectedly called with 1" in the unit run.
    //
    // Stated as what is FORBIDDEN, over the whole chain the server pulls in, rather than as the
    // shape of today's imports: the logic module must stay side-effect free, and the job must
    // not reach the CLI by any route.
    const logic = fs.readFileSync(path.join(__dirname, "foreign-key-drift.ts"), "utf8");
    for (const [name, src] of [
      ["foreign-key-drift.ts", logic],
      ["fk-drift-job.ts", DRIFT],
      ["orphan-set-rows-cleanup.ts", CLEANUP],
    ] as const) {
      const code = codeOnly(src);
      expect(code, `${name} must not exit the process`).not.toMatch(/process\.exit/);
      // A bare top-level `main()` is the shape that runs on import.
      expect(code, `${name} must not run anything on import`).not.toMatch(/^\s*main\(\)/m);
      expect(code, `${name} must not import the CLI`).not.toContain("check-schema-drift");
    }
    // And the CLI keeps both, because for a CLI they are correct.
    const cli = fs.readFileSync(path.join(__dirname, "check-schema-drift.ts"), "utf8");
    expect(cli).toMatch(/process\.exit\(1\)/);
    expect(cli).toContain("./foreign-key-drift");
  });

  it("shares ONE query and ONE comparison with the CLI, so the two cannot disagree", () => {
    // The whole reason this job exists is that `npm run db:check-drift` had never run against
    // production -- a fresh CI database passes it trivially. A second, hand-copied query here
    // would reintroduce exactly the divergence it was written to close.
    expect(DRIFT).toContain(`from "./foreign-key-drift"`);
    expect(DRIFT).toContain("compareForeignKeys");
    expect(DRIFT).toContain("declaredForeignKeys");
    expect(codeOnly(DRIFT)).not.toMatch(/pg_constraint/);
  });
});
