/**
 * A SEASON PROGRAM FILE TURNED INTO A PROGRAM STRUCTURE (2026-11-22). Pure: the caller hands in a
 * name -> exercise id resolver, so the whole conversion is unit-tested without Postgres.
 *
 * The files are server/seed-data/season-programs/group-*.json, written to the authoring spec
 * (sport programs by phase, post-season plans, standalone warm-ups, game-day kits and
 * return-to-training plans). server/seed-season-programs.ts reads and seeds them.
 *
 * How one entry maps onto Forge's program builder:
 *   - each block becomes a training block; its weeks become program weeks, each holding the
 *     block's days. The block's lighter week is named "(lighter week)" and the block's notes say
 *     what lighter means. A block with no weeks (a return-to-training stage, which moves on
 *     criteria, never the calendar) becomes ONE week named for the stage, its criteria in the
 *     block's notes;
 *   - a day's `warmup` becomes the day's warm-up block, its `focus` and `skillNotes` the block's
 *     note (the stop rule of a return-to-training day lives in its focus, so it is shown first);
 *   - `exercises` become the day's exercises in order (load into the weight field, rest parsed to
 *     seconds, `supersetWithNext` into a shared superset token), then `care` after them, each with
 *     the note "End-of-session care";
 *   - a post-season entry becomes a short program of `postSeason.weeks` weeks whose days are the
 *     optional sessions, and the guidance goes in the description;
 *   - `positionLayers` and `girlsTeam` become the program's layers (shared/season-program-layers.ts).
 */
import type { ProgramStructureInput } from "@shared/schema";
import type { WarmupItem } from "@shared/program-day-warmup";
import { MAX_WARMUP_DURATION_SECONDS } from "@shared/program-day-warmup";
import {
  EXERCISE_JOINTS,
  EXERCISE_PURPOSES,
  MAX_POSITION_LENGTH,
  MAX_TAGGED_POSITIONS,
  PROGRAM_SEASON_PHASES,
  normalizePosition,
  type ExerciseJoint,
  type ExercisePurpose,
  type ProgramSeasonPhase,
} from "@shared/exercise-tags";
import type { LayerCareItem, LayerSwap, PositionLayer, ProgramLayers } from "@shared/season-program-layers";

/* ================================================================ the file's shape */

export type FileWarmupItem = { exercise: string; sets?: number | null; reps?: string | null; seconds?: number | null; note?: string | null };
export type FileExercise = {
  exercise: string;
  sets?: number | null;
  reps?: string | null;
  load?: string | null;
  rest?: string | null;
  note?: string | null;
  supersetWithNext?: boolean | null;
};
export type FileCare = { exercise: string; sets?: number | null; reps?: string | null; load?: string | null; rest?: string | null };
export type FileDay = {
  title: string;
  focus?: string | null;
  warmup?: FileWarmupItem[] | null;
  exercises?: FileExercise[] | null;
  care?: FileCare[] | null;
  skillNotes?: string | null;
};
export type FileBlock = {
  name: string;
  weeks?: number[] | null;
  lighterWeek?: number | null;
  lighterWeekNote?: string | null;
  note?: string | null;
  days: FileDay[];
};
export type FileSwap = { replace: string; with: string; reason?: string | null };
export type FilePositionLayer = { swaps?: FileSwap[] | null; addCare?: FileCare[] | null; note?: string | null };
export type FileProgram = {
  name: string;
  sport?: string | null;
  seasonPhase?: string | null;
  purposes?: string[] | null;
  positions?: string[] | null;
  joints?: string[] | null;
  weeks?: number | null;
  daysPerWeek?: number | null;
  audience?: string | null;
  note?: string | null;
  blocks?: FileBlock[] | null;
  positionLayers?: Record<string, FilePositionLayer> | null;
  girlsTeam?: { addWarmup?: FileWarmupItem[] | null; note?: string | null } | null;
  postSeason?: { weeks?: number | null; guidance?: string[] | null; optionalSessions?: FileDay[] | null } | null;
  evidence?: string[] | null;
};
export type SeasonProgramFile = { group?: string; programs: FileProgram[] };

/* ================================================================ every name a file uses */

/** Every exercise name an entry uses, in all its places (days, care, layers, post-season). */
export function exerciseNamesIn(program: FileProgram): string[] {
  const days = [...(program.blocks ?? []).flatMap((b) => b.days), ...(program.postSeason?.optionalSessions ?? [])];
  const fromDays = days.flatMap((d) => [
    ...(d.warmup ?? []).map((w) => w.exercise),
    ...(d.exercises ?? []).map((e) => e.exercise),
    ...(d.care ?? []).map((c) => c.exercise),
  ]);
  const fromLayers = Object.values(program.positionLayers ?? {}).flatMap((l) => [
    ...(l.swaps ?? []).flatMap((s) => [s.replace, s.with]),
    ...(l.addCare ?? []).map((c) => c.exercise),
  ]);
  const fromGirls = (program.girlsTeam?.addWarmup ?? []).map((w) => w.exercise);
  return [...new Set([...fromDays, ...fromLayers, ...fromGirls])];
}

/* ================================================================ small parsers */

const SECONDS_PER_MINUTE = 60;

// A rest as written: "2 min", "90 s", "2-3 min" (the lower bound), "2.5 min", "45 sec". Rejects
// "as needed" and "" (no number and unit), which read as no rest set.
// Group 1 is the first number, group 2 the unit.
// https://regex101.com/?regex=%5E%5Cs*(%5Cd%2B(%3F%3A%5C.%5Cd%2B)%3F)(%3F%3A%5Cs*-%5Cs*%5Cd%2B(%3F%3A%5C.%5Cd%2B)%3F)%3F%5Cs*(min%7Cs%7Csec)&flags=i&testString=2-3%20min
const REST_PATTERN = /^\s*(\d+(?:\.\d+)?)(?:\s*-\s*\d+(?:\.\d+)?)?\s*(min|s|sec)/i;

/** A written rest in whole seconds, or null when it cannot be read. */
export function parseRestSeconds(rest: string | null | undefined): number | null {
  const match = rest?.match(REST_PATTERN);
  if (!match) return null;
  const amount = Number(match[1]);
  const seconds = match[2].toLowerCase() === "min" ? amount * SECONDS_PER_MINUTE : amount;
  return Math.round(seconds);
}

const oneOf = <T extends string>(list: readonly T[], value: string | null | undefined): T | null =>
  value != null && (list as readonly string[]).includes(value) ? (value as T) : null;
const allOf = <T extends string>(list: readonly T[], values: readonly string[] | null | undefined): T[] | null => {
  const kept = (values ?? []).filter((v): v is T => (list as readonly string[]).includes(v));
  return kept.length > 0 ? [...new Set(kept)] : null;
};

/** The note every care drill carries, so the athlete reads it as the end of the session. */
export const CARE_NOTE = "End-of-session care";
/** What a lighter week means when the block does not say. */
export const DEFAULT_LIGHTER_WEEK_NOTE = "Lighter week: one set fewer on every lift and about 90% of the previous week's load.";

/* ================================================================ the conversion */

/** What a missing name is reported as. The caller decides whether that throws or is logged. */
export type UnresolvedName = { program: string; name: string; where: string };

export type ConvertedProgram = {
  structure: ProgramStructureInput;
  layers: ProgramLayers | null;
  unresolved: UnresolvedName[];
  /** Warm-up items longer than a warm-up item may be, shortened to the most it may hold. */
  clampedDurations: { program: string; name: string; seconds: number }[];
};

type Resolver = (name: string) => number | undefined;

export function convertSeasonProgram(program: FileProgram, resolve: Resolver): ConvertedProgram {
  const unresolved: UnresolvedName[] = [];
  const clampedDurations: ConvertedProgram["clampedDurations"] = [];
  const idFor = (name: string, where: string): number | undefined => {
    const id = resolve(name);
    if (id == null) unresolved.push({ program: program.name, name, where });
    return id;
  };

  const warmupItems = (items: readonly FileWarmupItem[] | null | undefined, where: string): WarmupItem[] =>
    (items ?? []).flatMap((w) => {
      const exerciseId = idFor(w.exercise, where);
      if (exerciseId == null) return [];
      if (w.seconds != null && w.seconds > MAX_WARMUP_DURATION_SECONDS) {
        clampedDurations.push({ program: program.name, name: w.exercise, seconds: w.seconds });
      }
      return [{
        exerciseId,
        sets: w.sets ?? null,
        reps: w.reps ?? null,
        durationSeconds: w.seconds == null ? null : Math.min(w.seconds, MAX_WARMUP_DURATION_SECONDS),
        note: w.note ?? null,
      }];
    });

  const day = (d: FileDay, dayNumber: number, where: string) => {
    const noteParts = [d.focus?.trim(), d.skillNotes?.trim() ? `Skill work: ${d.skillNotes.trim()}` : null].filter(
      (p): p is string => !!p,
    );
    const items = warmupItems(d.warmup, `${where}, warm-up`);
    const main = (d.exercises ?? []).flatMap((e, i) => {
      const exerciseId = idFor(e.exercise, `${where}, exercises`);
      return exerciseId == null ? [] : [{ e, i, exerciseId }];
    });
    // A run of supersetWithNext links shares one token, the way the builder writes it.
    const tokens = main.reduce<(string | null)[]>((acc, { e }, i) => {
      const linkedFromPrev = i > 0 && main[i - 1].e.supersetWithNext === true;
      const linksNext = e.supersetWithNext === true && i < main.length - 1;
      if (linkedFromPrev) return [...acc, acc[i - 1]];
      return [...acc, linksNext ? `ss-${dayNumber}-${i}` : null];
    }, []);
    const care = (d.care ?? []).flatMap((c) => {
      const exerciseId = idFor(c.exercise, `${where}, care`);
      return exerciseId == null ? [] : [{ c, exerciseId }];
    });
    const exercises = [
      ...main.map(({ e, exerciseId }, i) => ({
        exerciseId,
        orderIndex: i,
        sets: e.sets ?? 1,
        reps: e.reps ?? "1",
        weight: e.load ?? null,
        restSeconds: parseRestSeconds(e.rest),
        notes: e.note ?? null,
        supersetGroup: tokens[i],
        restAfterGroupOnly: false,
      })),
      ...care.map(({ c, exerciseId }, i) => ({
        exerciseId,
        orderIndex: main.length + i,
        sets: c.sets ?? 1,
        reps: c.reps ?? "1",
        weight: c.load ?? null,
        restSeconds: parseRestSeconds(c.rest),
        notes: CARE_NOTE,
        supersetGroup: null,
        restAfterGroupOnly: false,
      })),
    ];
    return {
      dayNumber,
      title: d.title,
      isRestDay: false,
      warmup: items.length > 0 || noteParts.length > 0 ? { note: noteParts.join(" ") || null, items } : null,
      exercises,
    };
  };

  const blocks: ProgramStructureInput["blocks"] = [];
  const weeks: ProgramStructureInput["weeks"] = [];
  let weekNumber = 0;

  if (program.postSeason) {
    // Converted once and shared by every week, so a missing name is reported once.
    const sessionDays = (program.postSeason.optionalSessions ?? []).map((sd, i) => day(sd, i + 1, `post-season session ${i + 1}`));
    const count = Math.max(1, program.postSeason.weeks ?? 1);
    blocks.push({ name: "Active rest", notes: "Every session is optional. Easy effort; finish fresher than you started." });
    Array.from({ length: count }).forEach(() => {
      weekNumber += 1;
      weeks.push({
        weekNumber,
        name: `Week ${weekNumber}: active rest`,
        blockIndex: 0,
        days: sessionDays,
      });
    });
  } else {
    (program.blocks ?? []).forEach((block, blockIndex) => {
      const lighterNote = block.lighterWeek != null ? block.lighterWeekNote ?? DEFAULT_LIGHTER_WEEK_NOTE : null;
      const notes = [block.note?.trim(), lighterNote].filter((n): n is string => !!n).join(" ") || null;
      blocks.push({ name: block.name, notes });
      const blockWeeks = block.weeks && block.weeks.length > 0 ? block.weeks : null;
      // Converted once and shared by every week of the block, so a missing name is reported once.
      const blockDays = block.days.map((d, i) => day(d, i + 1, `${block.name}, ${d.title}`));
      if (!blockWeeks) {
        // A stage that moves on criteria: one week, named for the stage.
        weekNumber += 1;
        weeks.push({
          weekNumber,
          name: block.name,
          blockIndex,
          days: blockDays,
        });
        return;
      }
      blockWeeks.forEach((n) => {
        weekNumber += 1;
        weeks.push({
          weekNumber,
          name: n === block.lighterWeek ? `Week ${n} (lighter week)` : `Week ${n}`,
          blockIndex,
          days: blockDays,
        });
      });
    });
  }

  const description = [
    program.audience?.trim(),
    program.note?.trim(),
    ...(program.postSeason?.guidance?.length ? [program.postSeason.guidance.map((g) => `- ${g}`).join("\n")] : []),
    program.evidence?.length ? `Research: ${program.evidence.join(", ")}` : null,
  ]
    .filter((p): p is string => !!p)
    .join("\n\n");

  const positions = (program.positions ?? [])
    .map(normalizePosition)
    .filter((p) => p.length > 0 && p.length <= MAX_POSITION_LENGTH)
    .slice(0, MAX_TAGGED_POSITIONS);

  const structure: ProgramStructureInput = {
    name: program.name,
    description: description || null,
    sport: program.sport?.trim() ? program.sport.trim().slice(0, MAX_POSITION_LENGTH) : null,
    seasonPhase: oneOf<ProgramSeasonPhase>(PROGRAM_SEASON_PHASES, program.seasonPhase),
    positions: positions.length > 0 ? positions : null,
    joints: allOf<ExerciseJoint>(EXERCISE_JOINTS, program.joints),
    purposes: allOf<ExercisePurpose>(EXERCISE_PURPOSES, program.purposes),
    blocks,
    weeks,
  };

  return { structure, layers: convertLayers(program, idFor, warmupItems), unresolved, clampedDurations };
}

function convertLayers(
  program: FileProgram,
  idFor: (name: string, where: string) => number | undefined,
  warmupItems: (items: readonly FileWarmupItem[] | null | undefined, where: string) => WarmupItem[],
): ProgramLayers | null {
  const entries = Object.entries(program.positionLayers ?? {}).flatMap(([label, layer]): [string, PositionLayer][] => {
    const key = normalizePosition(label);
    if (!key) return [];
    const where = `position layer "${label}"`;
    const swaps: LayerSwap[] = (layer.swaps ?? []).flatMap((s) => {
      const replaceExerciseId = idFor(s.replace, `${where}, swap`);
      const withExerciseId = idFor(s.with, `${where}, swap`);
      return replaceExerciseId == null || withExerciseId == null ? [] : [{ replaceExerciseId, withExerciseId, reason: s.reason ?? null }];
    });
    const addCare: LayerCareItem[] = (layer.addCare ?? []).flatMap((c) => {
      const exerciseId = idFor(c.exercise, `${where}, care`);
      return exerciseId == null
        ? []
        : [{ exerciseId, sets: c.sets ?? null, reps: c.reps ?? null, load: c.load ?? null, restSeconds: parseRestSeconds(c.rest) }];
    });
    return [[key, { label, swaps, addCare, note: layer.note ?? null }]];
  });
  const positions: Record<string, PositionLayer> = Object.fromEntries(entries);
  const girls = program.girlsTeam;
  const girlsTeam = girls ? { addWarmup: warmupItems(girls.addWarmup, "girls' team warm-up"), note: girls.note ?? null } : null;
  const hasGirls = !!girlsTeam && (girlsTeam.addWarmup.length > 0 || girlsTeam.note != null);
  if (Object.keys(positions).length === 0 && !hasGirls) return null;
  return { positions, girlsTeam: hasGirls ? girlsTeam : null };
}
