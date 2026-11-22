/**
 * THE SERVER HALF OF A DAY'S WARM-UP (2026-11-22). The rules are in shared/program-day-warmup.ts;
 * this file reads the database for them:
 *   - `resolveWarmupBlocks` turns stored blocks into what a screen draws (each item with its
 *     exercise's name; an item whose exercise was deleted from the library drops out);
 *   - `warmupCandidatesFor` is the list a drafted warm-up may choose from: exercises tagged
 *     purpose "warmup", that this weight room CAN do (no fallback to the whole library, unlike a
 *     main-lift draft: a warm-up drill the room lacks is never drafted) and that suit the age;
 *   - `fillMissingWarmups` drafts a RAMP warm-up onto every training day of a structure that has
 *     none (the AI draft, the AI chat's new days, the import);
 *   - `warmupFactsFor` says, per athlete-day, how many sessions had a warm-up and how many had
 *     the athlete's tick: the coach's Today card, the Week tab and the parent email read it.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { exercises, programDays, workoutLogWarmups, workoutLogs } from "@shared/schema";
import {
  buildRampWarmup,
  isTaggedWarmup,
  normalizeWarmupBlock,
  warmupDayContextOf,
  warmupHasItems,
  type ResolvedWarmupBlock,
  type WarmupBlock,
  type WarmupCandidate,
  type WarmupCompletion,
} from "@shared/program-day-warmup";
import { roomAllows, type ExerciseForNeeds } from "@shared/exercise-needs";
import { keepForAge } from "@shared/exercise-tags";
import type { EquipmentRoom } from "@shared/equipment-profile";

type StoredBlock = WarmupBlock | null | undefined;

/** Every block handed in, resolved against the library in ONE read. Same order, null for none. */
export async function resolveWarmupBlocks(blocks: readonly StoredBlock[]): Promise<Array<ResolvedWarmupBlock | null>> {
  const ids = [...new Set(blocks.flatMap((b) => (b?.items ?? []).map((i) => i.exerciseId)))];
  const rows = ids.length
    ? await db
        .select({
          id: exercises.id,
          name: exercises.name,
          category: exercises.category,
          equipment: exercises.equipment,
          videoUrl: exercises.videoUrl,
        })
        .from(exercises)
        .where(inArray(exercises.id, ids))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return blocks.map((b) => {
    const block = normalizeWarmupBlock(b ?? null);
    if (!block) return null;
    const items = block.items
      .filter((i) => byId.has(i.exerciseId))
      .map((i) => ({ ...i, exercise: byId.get(i.exerciseId) ?? null }));
    return items.length === 0 && block.note == null ? null : { note: block.note, items };
  });
}

/** One block, resolved. */
export async function resolveWarmupBlock(block: StoredBlock): Promise<ResolvedWarmupBlock | null> {
  const [resolved] = await resolveWarmupBlocks([block]);
  return resolved ?? null;
}

/** A program read (getProgramFull and its kin) with every day's warm-up resolved in place. */
export async function withResolvedWarmups<P extends { weeks: Array<{ days: Array<{ warmup?: StoredBlock }> }> }>(program: P): Promise<P> {
  const days = program.weeks.flatMap((w) => w.days);
  const resolved = await resolveWarmupBlocks(days.map((d) => d.warmup));
  const byDay = new Map(days.map((d, i) => [d, resolved[i]]));
  return {
    ...program,
    weeks: program.weeks.map((w) => ({ ...w, days: w.days.map((d) => ({ ...d, warmup: byDay.get(d) ?? null })) })),
  };
}

type LibraryRow = WarmupCandidate & ExerciseForNeeds & { youthSafe?: boolean | null; retiredAt?: Date | null };

/** The drills a drafted warm-up may use: tagged warm-up, possible in this room, right for the age. */
export function warmupCandidatesFor<T extends LibraryRow>(library: readonly T[], room: EquipmentRoom | null, age: number | null): T[] {
  return keepForAge(
    // A drill hidden by the library review (retiredAt) is never drafted into a new warm-up.
    library.filter((ex) => !ex.retiredAt && isTaggedWarmup(ex) && roomAllows(ex, room)),
    age,
  );
}

type DraftDay = {
  isRestDay: boolean;
  warmup?: WarmupBlock | null;
  exercises: ReadonlyArray<{ exerciseId: number }>;
};

/**
 * A drafted RAMP warm-up on every training day that has none, from `candidates`, aimed at what
 * each day's main exercises load (`library` supplies their joints and regions). A day that already
 * has one (the coach's, or the source's), a rest day, and every day when nothing is tagged, are
 * left exactly as they were.
 */
export function fillMissingWarmups<D extends DraftDay>(
  days: readonly D[],
  candidates: readonly WarmupCandidate[],
  library: ReadonlyArray<{ id: number; joints?: readonly string[] | null; bodyRegion?: string | null; muscleGroup?: string | null }>,
): D[] {
  if (candidates.length === 0) return [...days];
  const byId = new Map(library.map((e) => [e.id, e]));
  return days.map((d) => {
    if (d.isRestDay || warmupHasItems(d.warmup)) return d;
    const main = d.exercises.map((ex) => byId.get(ex.exerciseId)).filter((e): e is NonNullable<typeof e> => !!e);
    const drafted = buildRampWarmup(candidates, warmupDayContextOf(main));
    return drafted ? { ...d, warmup: drafted } : d;
  });
}

/** A calendar occurrence, as the attendance and parent reads hold it. */
export type WarmupOccurrence = { athleteId: number; assignmentId: number; programDayId: number; date: string };

const occurrenceKey = (o: { assignmentId: number; programDayId: number; date: string }) => `${o.assignmentId}:${o.programDayId}:${o.date}`;

/**
 * Per athlete and date: of the sessions handed in, how many had a warm-up with items and how many
 * of those the athlete ticked "Warm-up done". Two reads, whatever the range.
 */
export async function warmupFactsFor(occurrences: readonly WarmupOccurrence[]): Promise<Map<string, WarmupCompletion>> {
  const out = new Map<string, WarmupCompletion>();
  if (occurrences.length === 0) return out;
  const dayIds = [...new Set(occurrences.map((o) => o.programDayId))];
  const athleteIds = [...new Set(occurrences.map((o) => o.athleteId))];
  const dates = [...new Set(occurrences.map((o) => o.date))];
  const [days, ticks] = await Promise.all([
    db.select({ id: programDays.id, warmup: programDays.warmup }).from(programDays).where(inArray(programDays.id, dayIds)),
    db
      .select({ assignmentId: workoutLogs.assignmentId, programDayId: workoutLogs.programDayId, date: workoutLogs.date })
      .from(workoutLogWarmups)
      .innerJoin(workoutLogs, eq(workoutLogWarmups.workoutLogId, workoutLogs.id))
      .where(and(inArray(workoutLogs.athleteId, athleteIds), inArray(workoutLogs.date, dates))),
  ]);
  const withWarmup = new Set(days.filter((d) => warmupHasItems(d.warmup)).map((d) => d.id));
  const ticked = new Set(ticks.map((t) => occurrenceKey({ ...t, date: String(t.date) })));
  occurrences
    .filter((o) => withWarmup.has(o.programDayId))
    .forEach((o) => {
      const key = `${o.athleteId}:${o.date}`;
      const prev = out.get(key) ?? { withWarmup: 0, done: 0 };
      out.set(key, { withWarmup: prev.withWarmup + 1, done: prev.done + (ticked.has(occurrenceKey(o)) ? 1 : 0) });
    });
  return out;
}

/** The sum of several completions. */
export function sumWarmupCompletions(list: Iterable<WarmupCompletion>): WarmupCompletion {
  return [...list].reduce((acc, c) => ({ withWarmup: acc.withWarmup + c.withWarmup, done: acc.done + c.done }), { withWarmup: 0, done: 0 });
}
