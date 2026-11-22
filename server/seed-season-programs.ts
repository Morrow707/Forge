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
import { exercises, programBlocks, programs } from "@shared/schema";
import { storage } from "./storage";
import { convertSeasonProgram, seasonBlockPhase, seasonProgramDescription, type FileProgram } from "./season-program-structure";
import { normalizePosition } from "@shared/exercise-tags";
import type { ProgramLayers } from "@shared/season-program-layers";
import { SEASON_PROGRAM_TEXT_BEFORE_2026_11_22 } from "./seed-data/season-program-text-before-2026-11-22";
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

/**
 * THE AGE LINES COME OUT OF THE PROGRAMS ALREADY IN THE DATABASE (2026-11-22). Scott: "age doesn't
 * matter in the weight room, its about weight room proficiency" / "yes change the line for the
 * underage athlete." The files carry the new text; production created these programs once and never
 * re-syncs them, so this rewrites each stored description, and the two kinds of layer note that
 * changed, ONLY where the stored text still equals what the old file text produced. An admin's own
 * edit is left alone and counted. Once, behind an applied_backfills marker.
 */
export const SEASON_PROGRAM_AGE_LINES_MARKER = "season_program_age_lines_2026_11_22";

export type AgeLineBackfillResult = { descriptions: number; layerNotes: number; leftAlone: number };

export async function rewriteSeasonProgramAgeLinesOnce(
  libraryOwnerId: number,
  files: string[] = seasonProgramFiles(),
): Promise<AgeLineBackfillResult | null> {
  const done = await db.execute(sql`SELECT 1 FROM applied_backfills WHERE key = ${SEASON_PROGRAM_AGE_LINES_MARKER}`);
  if (done.rows.length > 0) return null;
  const result: AgeLineBackfillResult = { descriptions: 0, layerNotes: 0, leftAlone: 0 };
  const entries = files.flatMap((file) => readSeasonProgramFile(file).programs);
  const changed = entries.filter((p) => SEASON_PROGRAM_TEXT_BEFORE_2026_11_22[p.name]);
  const stored =
    changed.length === 0
      ? []
      : await db
          .select({ id: programs.id, name: programs.name, description: programs.description, layers: programs.layers })
          .from(programs)
          .where(and(eq(programs.coachId, libraryOwnerId), inArray(programs.name, changed.map((p) => p.name))));
  const byName = new Map(stored.map((r) => [r.name, r]));

  await changed.reduce(async (prev, program) => {
    await prev;
    const row = byName.get(program.name);
    if (!row) return;
    const before = SEASON_PROGRAM_TEXT_BEFORE_2026_11_22[program.name];
    const oldProgram: FileProgram = { ...program, audience: before.audience ?? program.audience };
    const patch: { description?: string | null; layers?: ProgramLayers | null } = {};

    if (before.audience != null) {
      const oldDescription = seasonProgramDescription(oldProgram) || null;
      const newDescription = seasonProgramDescription(program) || null;
      if (row.description === oldDescription) {
        patch.description = newDescription;
        result.descriptions += 1;
      } else if (row.description !== newDescription) result.leftAlone += 1;
    }

    const layers = row.layers ? (JSON.parse(JSON.stringify(row.layers)) as ProgramLayers) : null;
    let layersChanged = false;
    if (layers && before.girlsTeamNote != null && layers.girlsTeam?.note != null) {
      if (layers.girlsTeam.note === before.girlsTeamNote) {
        layers.girlsTeam.note = program.girlsTeam?.note ?? null;
        layersChanged = true;
        result.layerNotes += 1;
      } else if (layers.girlsTeam.note !== program.girlsTeam?.note) result.leftAlone += 1;
    }
    Object.entries(before.positionNotes ?? {}).forEach(([label, oldNote]) => {
      const layer = layers?.positions[normalizePosition(label)];
      if (!layer || layer.note == null) return;
      if (layer.note === oldNote) {
        layer.note = program.positionLayers?.[label]?.note ?? null;
        layersChanged = true;
        result.layerNotes += 1;
      } else if (layer.note !== program.positionLayers?.[label]?.note) result.leftAlone += 1;
    });
    if (layersChanged) patch.layers = layers;

    if (Object.keys(patch).length > 0) await db.update(programs).set(patch).where(eq(programs.id, row.id));
  }, Promise.resolve());

  await db.execute(sql`INSERT INTO applied_backfills (key) VALUES (${SEASON_PROGRAM_AGE_LINES_MARKER}) ON CONFLICT DO NOTHING`);
  return result;
}


export const SEASON_BLOCK_PHASES_MARKER = "season_program_block_phases_2026_11_22";

/**
 * The season programs were first created with every training block at "No phase". This fills the
 * phase in on the programs already stored, once, behind an applied_backfills marker: only on the
 * library owner's program of that exact name, only on a block that still has the file's own name
 * and no phase, so an admin who renamed a block or picked a phase is never overridden.
 */
export async function fillSeasonBlockPhasesOnce(
  libraryOwnerId: number,
  files: string[] = seasonProgramFiles(),
): Promise<number | null> {
  const done = await db.execute(sql`SELECT 1 FROM applied_backfills WHERE key = ${SEASON_BLOCK_PHASES_MARKER}`);
  if (done.rows.length > 0) return null;
  let filled = 0;
  for (const file of files) {
    for (const program of readSeasonProgramFile(file).programs) {
      const wanted: { name: string; phase: "accumulation" | "intensification" | "realization" | "deload" }[] = [];
      if (program.postSeason) wanted.push({ name: "Active rest", phase: "deload" });
      else {
        (program.blocks ?? []).forEach((block, i) => {
          const phase = seasonBlockPhase(program.seasonPhase, i);
          if (phase) wanted.push({ name: block.name, phase });
        });
      }
      if (wanted.length === 0) continue;
      const [stored] = await db
        .select({ id: programs.id })
        .from(programs)
        .where(and(eq(programs.coachId, libraryOwnerId), eq(programs.name, program.name)));
      if (!stored) continue;
      for (const w of wanted) {
        const updated = await db
          .update(programBlocks)
          .set({ phase: w.phase })
          .where(and(eq(programBlocks.programId, stored.id), eq(programBlocks.name, w.name), isNull(programBlocks.phase)))
          .returning({ id: programBlocks.id });
        filled += updated.length;
      }
    }
  }
  await db.execute(sql`INSERT INTO applied_backfills (key) VALUES (${SEASON_BLOCK_PHASES_MARKER}) ON CONFLICT DO NOTHING`);
  return filled;
}
