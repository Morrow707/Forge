/**
 * THE FORGE SEASON PROGRAMS (2026-11-22), SEEDED FROM server/seed-data/season-programs/.
 *
 * Every `*.json` file in that folder is read (the folder is the list, so another group file
 * dropped in needs no code change) and every entry in it becomes a Forge program owned by the library
 * owner, the way the flagship program is owned, and UNPOSTED (`is_published` false) so Scott posts
 * each one himself from the admin program card. The conversion is server/season-program-structure.ts.
 *
 * CREATE ONCE, BY EXACT NAME UNDER THE LIBRARY OWNER. A program of that name the owner already has
 * is never touched again: not re-synced, not re-posted, not re-layered. That is the simpler of the
 * two patterns CLAUDE.md records (the Coaches Corner shipped-hash re-sync is the other), chosen
 * because nothing here has shipped yet, so there is no earlier version to recognise. It means a
 * correction to a file reaches only a database that does not yet hold that program; to correct
 * one that does, an admin edits it in the builder (or it is renamed, deleted and re-seeded).
 *
 * EVERY EXERCISE NAME MUST RESOLVE to a VISIBLE library exercise (the owner's row, not hidden by
 * the library review). In tests an unresolved name throws, loudly; in production the one exercise
 * is skipped and the seed log names it, so one typo never stops a deploy.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { exercises, programs } from "@shared/schema";
import { storage } from "./storage";
import { convertSeasonProgram } from "./season-program-structure";
import { readSeasonProgramFile, seasonProgramFiles } from "./season-program-files";

/** Strict (throw on an unresolved name) under vitest; lenient (log and skip) everywhere else. */
const strictByDefault = () => process.env.VITEST === "true" || process.env.NODE_ENV === "test";

export type SeasonProgramSeedResult = {
  created: { file: string; name: string }[];
  skippedExisting: number;
  unresolved: { program: string; name: string; where: string }[];
};

export async function seedSeasonPrograms(
  libraryOwnerId: number,
  opts: { files?: string[]; strict?: boolean } = {},
): Promise<SeasonProgramSeedResult> {
  const strict = opts.strict ?? strictByDefault();
  const files = opts.files ?? seasonProgramFiles();
  const visible = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(and(eq(exercises.coachId, libraryOwnerId), isNull(exercises.retiredAt)));
  const idByName = new Map(visible.map((e) => [e.name, e.id]));
  const existing = new Set(
    (await db.select({ name: programs.name }).from(programs).where(eq(programs.coachId, libraryOwnerId))).map((p) => p.name),
  );

  const result: SeasonProgramSeedResult = { created: [], skippedExisting: 0, unresolved: [] };
  const entries = files.flatMap((file) => readSeasonProgramFile(file).programs.map((program) => ({ file, program })));
  // Sequential on purpose: each creation is its own transaction, and a strict failure should stop
  // at the first program that cannot be built rather than half-way through several.
  await entries.reduce(async (prev, { file, program }) => {
    await prev;
    if (existing.has(program.name)) {
      result.skippedExisting += 1;
      return;
    }
    const converted = convertSeasonProgram(program, (name) => idByName.get(name));
    if (converted.unresolved.length > 0) {
      const listed = converted.unresolved.map((u) => `"${u.name}" (${u.where})`).join(", ");
      if (strict) throw new Error(`Season program "${program.name}": exercise names not in the visible library: ${listed}`);
      console.warn(`Season program "${program.name}": skipped exercise names not in the visible library: ${listed}`);
      result.unresolved.push(...converted.unresolved);
    }
    converted.clampedDurations.forEach((c) =>
      console.warn(`Season program "${c.program}": warm-up item "${c.name}" is ${c.seconds}s, shortened to the most a warm-up item holds.`),
    );
    await storage.createProgramWithStructure(libraryOwnerId, converted.structure, {
      isPublished: false,
      layers: converted.layers,
    });
    existing.add(program.name);
    result.created.push({ file, name: program.name });
  }, Promise.resolve());
  return result;
}

/** Scott posted every season program on 2026-11-22 ("post all the programs"). Applied once, behind an
 * applied_backfills marker, so an admin who later unposts one is never overridden by a redeploy, and a
 * program added to the files after this date still arrives unposted for Scott to post himself. */
export const POST_SEASON_PROGRAMS_MARKER = "post_season_programs_2026_11_22";

export async function postSeasonProgramsOnce(libraryOwnerId: number, files: string[] = seasonProgramFiles()): Promise<number | null> {
  const done = await db.execute(sql`SELECT 1 FROM applied_backfills WHERE key = ${POST_SEASON_PROGRAMS_MARKER}`);
  if (done.rows.length > 0) return null;
  const names = files.flatMap((file) => readSeasonProgramFile(file).programs.map((program) => program.name));
  const posted =
    names.length === 0
      ? []
      : await db
          .update(programs)
          .set({ isPublished: true })
          .where(and(eq(programs.coachId, libraryOwnerId), inArray(programs.name, names), eq(programs.isPublished, false)))
          .returning({ id: programs.id });
  await db.execute(sql`INSERT INTO applied_backfills (key) VALUES (${POST_SEASON_PROGRAMS_MARKER}) ON CONFLICT DO NOTHING`);
  return posted.length;
}
