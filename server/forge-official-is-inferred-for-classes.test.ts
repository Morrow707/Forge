import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* "FORGE OFFICIAL" IS AN EXPLICIT COLUMN FOR EXERCISES AND AN INFERENCE FOR CLASSES AND
 * PROGRAMS, AND THE COMMENTS SAID OTHERWISE.
 *
 * Found 2026-10-23. `shared/schema.ts` declares `isForgeOfficial` on exercises with a comment
 * arguing at length that it must be an explicit flag rather than "owned by an admin", because
 * every row has a `coachId`, admins included, so inferring it "would silently enrol an admin's
 * own personal exercise into the standards every athlete on the platform is measured against --
 * and nothing would say it had happened". That argument is right and that column is REAL:
 * `reconcile-schema.ts` adds it, BACKFILLS it true for admin-owned rows, and indexes it, and the
 * strength profile reads it.
 *
 * The comment then cites `classes.isForgeOfficial` as the precedent it follows -- and the
 * citation is circular. The classes column exists and is `NOT NULL DEFAULT false` and **nothing
 * has ever written it true**: no backfill, no seed, no route. So for classes and programs the
 * live answer is still `coach.role === "admin"`, computed at read time in several places, and two
 * response builders hardcode `isForgeOfficial: true` instead.
 *
 * WHY THIS IS RECORDED AND NOT FIXED, which is the part worth keeping. The obvious patch --
 * point the read sites at the column, as the comment claims they do -- makes EVERY Forge class
 * and program invisible to every coach on the platform, because the column is false on all of
 * them. That is a refusal shipped before its replacement, which this repo has done once already
 * and Rule #1 exists to refuse. The order is forced: backfill first (an `applied_backfills`
 * one-shot, proven on a throwaway database, as the Tests section requires of any reconciler
 * edit), then the read sites, with an itest per surface. Two commits, not a tidy-up.
 *
 * So this file makes the divergence LOUD instead of invisible: the inference sites are counted,
 * the unpopulated column is asserted as unpopulated, and the exercises column is asserted as
 * genuinely backfilled -- so the day somebody writes that backfill, this file tells them exactly
 * which sites are now free to move.
 */

const SCHEMA = readFileSync(join(process.cwd(), "shared", "schema.ts"), "utf8");
const STORAGE = readFileSync(join(process.cwd(), "server", "storage.ts"), "utf8");
const RECONCILE = readFileSync(join(process.cwd(), "server", "reconcile-schema.ts"), "utf8");

/** Prose about what the code no longer does is indistinguishable from the code still doing it,
 *  which CLAUDE.md records as the most repeated self-inflicted failure in this repo. Every
 *  negative assertion below runs on stripped source. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

describe("forge-official: one column that works, one that is decorative", () => {
  it("backfills the EXERCISES column, which is why the strength profile can trust it", () => {
    const sql = strip(RECONCILE);
    expect(sql).toMatch(/ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "is_forge_official"/);
    // The backfill itself: without it the column is false everywhere and the percentile gate
    // would score nobody against anything.
    expect(sql).toMatch(/UPDATE "exercises" SET "is_forge_official" = true/);
  });

  it("RECORDED: nothing has ever written classes.isForgeOfficial true, so the column is inert", () => {
    /* Asserted as the rule rather than as a count of writers: no DB write anywhere in the server
     * may set this column true WITHOUT a backfill beside it, because a column half-populated is
     * worse than one not populated at all -- the read sites would then be right for some rows
     * and wrong for others with nothing to say which. The day the backfill lands, this case is
     * the one that has to be rewritten, deliberately, and that is the point of it. */
    const sql = strip(RECONCILE);
    const backfillsClasses = /UPDATE "classes" SET "is_forge_official" = true/.test(sql);
    expect(
      backfillsClasses,
      `reconcile-schema.ts now backfills classes.is_forge_official. That is the prerequisite for ` +
        `the read sites below moving off \`coach.role === "admin"\` -- update this file and move ` +
        `them in the same change, or the column is populated and still unread.`,
    ).toBe(false);
  });

  it("counts the sites that infer it from ownership, so a new one cannot arrive unseen", () => {
    /* A count rather than a list of line numbers, which rot on the first edit above them. It is
     * a CEILING: a site removed is progress and fails nothing, a site added fails here. */
    /* TWO SIGNALS, because one regex over an EXPRESSION is a regex over one spelling of it.
     * The first draft summed two overlapping patterns (13 of 8 -- a ceiling inflated by double
     * counting admits five new sites in silence), and the second anchored `[\w.]*\.role` right
     * after the colon, which a mutation walked straight past by writing `cls!.coach.role`: the
     * `!` is not in the character class. Same trap as the ledger scan's ternary, one day apart.
     *
     * So: co-occurrence on a line (robust to any expression between the two halves), AND a
     * ceiling on EVERY `role === "admin"` in the file, which no spelling of a new inference can
     * get under. The second is cruder on purpose -- it also counts the four legitimate admin
     * checks, so it is a ceiling rather than an equality, and an honest over-count that cannot
     * be evaded beats a precise one that can. */
    const stripped = strip(STORAGE);
    const total = stripped
      .split("\n")
      .filter((l) => l.includes("isForgeOfficial") && l.includes('=== "admin"')).length;
    const everyAdminCheck = [...stripped.matchAll(/\.role\s*===\s*"admin"/g)].length;
    expect(
      everyAdminCheck,
      `${everyAdminCheck} \`role === "admin"\` checks in storage.ts, up from the 14 recorded on ` +
        `2026-10-23 (8 of them inferring "Forge official", 6 legitimate admin checks). This is ` +
        `the net that catches an inference written in a spelling the line test above misses.`,
    ).toBeLessThanOrEqual(14);
    expect(
      total,
      `${total} sites in storage.ts infer "Forge official" from \`role === "admin"\`, up from the ` +
        `8 recorded on 2026-10-23. Each one answers a visibility or a label question off ` +
        `OWNERSHIP while shared/schema.ts argues the opposite. Adding another widens the ` +
        `divergence; the fix is the backfill above, then the column.`,
    ).toBeLessThanOrEqual(8);
    // And a floor, so a regex that silently stops matching cannot turn this green.
    expect(total).toBeGreaterThanOrEqual(6);
  });

  it("and the schema's own comment no longer cites the inert column as the precedent", () => {
    // The circularity: the column that works justified itself by pointing at the one that does
    // not. Stated as what is forbidden -- the exercises comment may not present the classes
    // column as an established pattern -- rather than by matching the sentence that replaced it.
    const exercisesComment = SCHEMA.slice(
      Math.max(0, SCHEMA.indexOf("PLATFORM CONTENT, and the gate on strength scoring") - 200),
      SCHEMA.indexOf('isForgeOfficial: boolean("is_forge_official")') + 60,
    );
    expect(exercisesComment.length).toBeGreaterThan(400);
    expect(
      /same reason classes\.isForgeOfficial\s*\n?\s*\*?\s*is one/.test(exercisesComment),
      "the exercises column still cites classes.isForgeOfficial as the pattern it follows, and " +
        "that column is never written true -- so the citation argues from something that was " +
        "never built.",
    ).toBe(false);
  });
});
