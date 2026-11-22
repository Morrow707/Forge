/**
 * THE WARM-UP ON A PROGRAM DAY (2026-11-22). Scott: "I want every single workout plan ... have
 * warmups, I really want to see it."
 *
 * A program day carries a warm-up BLOCK: an ordered list of ordinary library exercises (the same
 * library every lift lives in; "warmup" is a purpose tag, see shared/exercise-tags.ts), each with
 * its own sets, reps or time and an optional note, plus one note for the block. It is stored on
 * the day (`program_days.warmup`) and saved by the reconciling save like every other day field.
 *
 * The athlete sees it first on the workout screen and ticks ONE "Warm-up done" for the block (a
 * fact about the day, kept on the workout log; see `workout_log_warmups`). The tick never blocks
 * the main work. The coach's Today card, the Week tab, the parent's weekly email and the printed
 * sheet all read the block and the tick.
 *
 * Pure, no zod and no database: the client imports the types and the formatting, the server the
 * same, and `npm test` covers all of it without Postgres. The zod input schema is in
 * shared/schema.ts beside programDayInputSchema, and `normalizeWarmupBlock` below is the one place
 * a parsed block becomes a stored one (every-program-exercise-field-is-saved.test.ts holds every
 * field the item schema declares against it).
 */

/** The most items one warm-up block holds. A real warm-up is five to eight; this stops a paste. */
export const MAX_WARMUP_ITEMS = 20;
/** The longest note on one item or on the block, in characters. */
export const MAX_WARMUP_NOTE_LENGTH = 500;
/** The longest a reps field may be ("10 each side", "30s"), in characters. */
export const MAX_WARMUP_REPS_LENGTH = 40;
/** The most sets one warm-up item may ask for. */
export const MAX_WARMUP_SETS = 10;
/** The longest one timed warm-up item may be: ten minutes, in seconds. */
export const MAX_WARMUP_DURATION_SECONDS = 600;

export type WarmupItem = {
  exerciseId: number;
  /** Null when the item is one continuous piece (three minutes on the bike). */
  sets: number | null;
  /** As written: "10", "8 each side". Null for a timed item. */
  reps: string | null;
  /** A timed item, in seconds. Null for a counted one. */
  durationSeconds: number | null;
  note: string | null;
};

export type WarmupBlock = {
  note: string | null;
  items: WarmupItem[];
};

/** What a read hands the screens: each item with its exercise (null when it was deleted). */
export type ResolvedWarmupItem = WarmupItem & {
  exercise: {
    id: number;
    name: string;
    category: string | null;
    equipment: string | null;
    videoUrl: string | null;
  } | null;
};
export type ResolvedWarmupBlock = { note: string | null; items: ResolvedWarmupItem[] };

/** Loosely typed input: what a parsed request, a draft or an old row hands in. */
type WarmupItemLike = {
  exerciseId: number;
  sets?: number | null;
  reps?: string | null;
  durationSeconds?: number | null;
  note?: string | null;
};
type WarmupBlockLike = { note?: string | null; items?: WarmupItemLike[] | null };

const trimmedOrNull = (value: string | null | undefined, max: number): string | null => {
  const t = (value ?? "").trim();
  return t ? t.slice(0, max) : null;
};
const positiveIntOrNull = (value: number | null | undefined, max: number): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(Math.round(value), max) : null;

/**
 * The block as it is stored. Null when there is nothing in it (no item and no note), so "no
 * warm-up" has one spelling in the database. Every item field is written here by name, on
 * purpose: a field added to the input schema and forgotten here fails
 * every-program-exercise-field-is-saved.test.ts.
 */
export function normalizeWarmupBlock(input: WarmupBlockLike | null | undefined): WarmupBlock | null {
  if (!input) return null;
  const items = (input.items ?? [])
    .filter((item) => Number.isInteger(item.exerciseId) && item.exerciseId > 0)
    .slice(0, MAX_WARMUP_ITEMS)
    .map(
      (item): WarmupItem => ({
        exerciseId: item.exerciseId,
        sets: positiveIntOrNull(item.sets, MAX_WARMUP_SETS),
        reps: trimmedOrNull(item.reps, MAX_WARMUP_REPS_LENGTH),
        durationSeconds: positiveIntOrNull(item.durationSeconds, MAX_WARMUP_DURATION_SECONDS),
        note: trimmedOrNull(item.note, MAX_WARMUP_NOTE_LENGTH),
      }),
    );
  const note = trimmedOrNull(input.note, MAX_WARMUP_NOTE_LENGTH);
  if (items.length === 0 && note == null) return null;
  return { note, items };
}

/** Whether a day has a warm-up an athlete can do: at least one item. A note alone is not one. */
export function warmupHasItems(block: { items?: unknown[] | null } | null | undefined): boolean {
  return Array.isArray(block?.items) && block.items.length > 0;
}

const SECONDS_PER_MINUTE = 60;

/** "45s", "3 min", "1 min 30s". */
export function formatWarmupDuration(seconds: number): string {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const rest = seconds % SECONDS_PER_MINUTE;
  if (minutes === 0) return `${rest}s`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest}s`;
}

/** One item's prescription in words: "2 × 10", "3 min", "2 × 30s", "10". Empty when nothing is set. */
export function warmupItemPrescription(item: Pick<WarmupItem, "sets" | "reps" | "durationSeconds">): string {
  const amount = item.durationSeconds != null ? formatWarmupDuration(item.durationSeconds) : item.reps ?? "";
  if (!amount) return item.sets != null ? `${item.sets} sets` : "";
  return item.sets != null && item.sets > 1 ? `${item.sets} × ${amount}` : amount;
}

/** The line a printed sheet carries for one item: "Jumping Jacks 2 × 20". */
export function warmupItemLine(item: Pick<WarmupItem, "sets" | "reps" | "durationSeconds">, name: string): string {
  const prescription = warmupItemPrescription(item);
  return prescription ? `${name} ${prescription}` : name;
}

/* ================================================================ how long it takes */

/** Seconds a counted rep takes in a warm-up drill, roughly. Only used to size a draft. */
const SECONDS_PER_WARMUP_REP = 3;
/** Seconds to move from one set or one drill to the next. */
const WARMUP_TRANSITION_SECONDS = 20;
/** The reps a counted item is assumed to be when its reps field is not a number ("each side"). */
const ASSUMED_REPS_WHEN_UNREADABLE = 10;

// The first whole number in a reps field: "10" -> 10, "8 each side" -> 8, "30s" -> 30.
// https://regex101.com/?regex=%5Cd%2B&testString=8%20each%20side
const FIRST_NUMBER = /\d+/;

/** About how long one item takes, in seconds. A rough size for a draft, never shown as a fact. */
export function estimateWarmupItemSeconds(item: Pick<WarmupItem, "sets" | "reps" | "durationSeconds">): number {
  const sets = item.sets ?? 1;
  const perSet =
    item.durationSeconds ??
    Number(item.reps?.match(FIRST_NUMBER)?.[0] ?? ASSUMED_REPS_WHEN_UNREADABLE) * SECONDS_PER_WARMUP_REP;
  return sets * perSet + sets * WARMUP_TRANSITION_SECONDS;
}

/** About how long the whole block takes, in whole minutes. */
export function estimateWarmupMinutes(items: readonly Pick<WarmupItem, "sets" | "reps" | "durationSeconds">[]): number {
  const seconds = items.reduce((sum, item) => sum + estimateWarmupItemSeconds(item), 0);
  return Math.round(seconds / SECONDS_PER_MINUTE);
}

/* ================================================================ a drafted RAMP warm-up */

/**
 * RAMP: Raise (get warm), Activate (wake up the muscles the day uses), Mobilize (move the joints
 * through the ranges the day needs), Potentiate (a few fast, light efforts before the heavy work).
 * Forge drafts one only from exercises tagged purpose "warmup", and only ones the weight room can
 * do (the caller filters for the room and for age before handing them in). With nothing tagged,
 * it drafts nothing: an honest empty block, never a guess from the main lifts.
 */
export const RAMP_PHASES = ["raise", "activate", "mobilize", "potentiate"] as const;
export type RampPhase = (typeof RAMP_PHASES)[number];

export type WarmupCandidate = {
  id: number;
  name: string;
  category?: string | null;
  movementType?: string | null;
  bodyRegion?: string | null;
  muscleGroup?: string | null;
  joints?: readonly string[] | null;
  purposes?: readonly string[] | null;
};

/** The day the warm-up is for: what its main exercises are about. */
export type WarmupDayContext = {
  joints: readonly string[];
  bodyRegions: readonly string[];
  muscleGroups: readonly string[];
};

/** Whether an exercise is tagged as a warm-up drill. */
export function isTaggedWarmup(ex: { purposes?: readonly string[] | null }): boolean {
  return Array.isArray(ex.purposes) && ex.purposes.includes("warmup");
}

/** The library category each RAMP phase is read from; anything else is activation work. */
const RAMP_PHASE_BY_CATEGORY: Record<string, RampPhase> = {
  conditioning: "raise",
  mobility: "mobilize",
  plyometric: "potentiate",
  olympic: "potentiate",
};

/** Which part of RAMP an exercise fills, from its library category. */
export function rampPhaseOf(ex: Pick<WarmupCandidate, "category">): RampPhase {
  return RAMP_PHASE_BY_CATEGORY[ex.category ?? ""] ?? "activate";
}

/** How many of each phase a drafted warm-up starts with. */
const ONE_PICK = 1;
const TWO_PICKS = 2;
const RAMP_PICKS: Record<RampPhase, number> = { raise: ONE_PICK, activate: TWO_PICKS, mobilize: TWO_PICKS, potentiate: ONE_PICK };
/** The prescription each phase is drafted with. */
const RAMP_RAISE_SECONDS = 180;
const RAMP_ACTIVATE_SETS = 2;
const RAMP_ACTIVATE_REPS = "10";
const RAMP_MOBILIZE_SETS = 1;
const RAMP_MOBILIZE_REPS = "8";
/** Reps are always a number (Scott, 2026-11-06), so "each side" travels as the drill's note. */
const RAMP_MOBILIZE_NOTE = "Each side";
const RAMP_POTENTIATE_SETS = 2;
const RAMP_POTENTIATE_REPS = "3";
const RAMP_PRESCRIPTION: Record<RampPhase, Omit<WarmupItem, "exerciseId" | "note">> = {
  raise: { sets: null, reps: null, durationSeconds: RAMP_RAISE_SECONDS },
  activate: { sets: RAMP_ACTIVATE_SETS, reps: RAMP_ACTIVATE_REPS, durationSeconds: null },
  mobilize: { sets: RAMP_MOBILIZE_SETS, reps: RAMP_MOBILIZE_REPS, durationSeconds: null },
  potentiate: { sets: RAMP_POTENTIATE_SETS, reps: RAMP_POTENTIATE_REPS, durationSeconds: null },
};
/** The length a drafted warm-up aims for, in minutes (Scott's 8 to 15). */
export const RAMP_MIN_MINUTES = 8;
export const RAMP_MAX_MINUTES = 15;
const RAMP_MAX_SECONDS = RAMP_MAX_MINUTES * SECONDS_PER_MINUTE;
const RAMP_MIN_SECONDS = RAMP_MIN_MINUTES * SECONDS_PER_MINUTE;
/** The block note a drafted warm-up carries, so the coach knows where it came from. */
export const RAMP_DRAFT_NOTE = "Drafted by Forge from your tagged warm-up drills. Change anything.";

const JOINT_MATCH_WEIGHT = 2;
const REGION_MATCH_WEIGHT = 1;
const MUSCLE_MATCH_WEIGHT = 1;

const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** How well a drill suits the day: shared joints count most, then body region, then muscle. */
function relevance(c: WarmupCandidate, day: WarmupDayContext): number {
  const dayJoints = new Set(day.joints.map(lower));
  const joints = (c.joints ?? []).filter((j) => dayJoints.has(lower(j))).length * JOINT_MATCH_WEIGHT;
  const region = day.bodyRegions.map(lower).includes(lower(c.bodyRegion)) && c.bodyRegion ? REGION_MATCH_WEIGHT : 0;
  const muscle = day.muscleGroups.map(lower).includes(lower(c.muscleGroup)) && c.muscleGroup ? MUSCLE_MATCH_WEIGHT : 0;
  return joints + region + muscle;
}

/** The day's context, read off its main exercises. */
export function warmupDayContextOf(
  exercises: ReadonlyArray<{ joints?: readonly string[] | null; bodyRegion?: string | null; muscleGroup?: string | null }>,
): WarmupDayContext {
  return {
    joints: [...new Set(exercises.flatMap((e) => e.joints ?? []))],
    bodyRegions: [...new Set(exercises.map((e) => e.bodyRegion).filter((r): r is string => !!r))],
    muscleGroups: [...new Set(exercises.map((e) => e.muscleGroup).filter((m): m is string => !!m))],
  };
}

/**
 * A RAMP warm-up for one day, from the tagged warm-up drills handed in (already narrowed to the
 * room and the athlete's age by the caller). Each phase takes its best-suited drills; if that
 * comes in under RAMP_MIN_MINUTES and drills are left, the best of the rest are added until it
 * does, never past RAMP_MAX_MINUTES. Null when no tagged drill was handed in.
 */
export function buildRampWarmup(candidates: readonly WarmupCandidate[], day: WarmupDayContext): WarmupBlock | null {
  const tagged = candidates.filter(isTaggedWarmup);
  if (tagged.length === 0) return null;
  const ranked = [...tagged].sort((a, b) => relevance(b, day) - relevance(a, day) || a.name.localeCompare(b.name) || a.id - b.id);
  const itemFor = (c: WarmupCandidate): WarmupItem => {
    const phase = rampPhaseOf(c);
    return { exerciseId: c.id, note: phase === "mobilize" ? RAMP_MOBILIZE_NOTE : null, ...RAMP_PRESCRIPTION[phase] };
  };

  const firstPass = RAMP_PHASES.flatMap((phase) => ranked.filter((c) => rampPhaseOf(c) === phase).slice(0, RAMP_PICKS[phase]));
  const fitting = firstPass.reduce<WarmupCandidate[]>((kept, c) => {
    const seconds = [...kept, c].reduce((s, k) => s + estimateWarmupItemSeconds(itemFor(k)), 0);
    return seconds <= RAMP_MAX_SECONDS ? [...kept, c] : kept;
  }, []);
  const chosenIds = new Set(fitting.map((c) => c.id));
  const topUp = ranked
    .filter((c) => !chosenIds.has(c.id))
    .reduce<WarmupCandidate[]>((kept, c) => {
      const seconds = [...kept].reduce((s, k) => s + estimateWarmupItemSeconds(itemFor(k)), 0);
      if (seconds >= RAMP_MIN_SECONDS) return kept;
      const withIt = seconds + estimateWarmupItemSeconds(itemFor(c));
      return withIt <= RAMP_MAX_SECONDS ? [...kept, c] : kept;
    }, fitting);
  // Back in RAMP order, so the athlete raises before they potentiate.
  const ordered = RAMP_PHASES.flatMap((phase) => topUp.filter((c) => rampPhaseOf(c) === phase));
  return { note: RAMP_DRAFT_NOTE, items: ordered.map(itemFor) };
}

/* ================================================================ "Use a warm-up program" */

/** A day of a program tagged as a warm-up, as the builder's picker reads it. */
export type WarmupProgramDay = {
  exercises: ReadonlyArray<{ exerciseId: number; sets: number; reps: string; notes: string | null }>;
};

/**
 * A warm-up block copied from the days of a warm-up program: every exercise of the given days, in
 * order, with the program's own sets, reps and notes. The coach chose which days; a drill that
 * appears on two of them is copied once.
 */
export function warmupFromProgramDays(days: readonly WarmupProgramDay[]): WarmupBlock | null {
  const seen = new Set<number>();
  const items = days
    .flatMap((d) => d.exercises)
    .filter((ex) => (seen.has(ex.exerciseId) ? false : (seen.add(ex.exerciseId), true)))
    .map((ex) => ({ exerciseId: ex.exerciseId, sets: ex.sets, reps: ex.reps, durationSeconds: null, note: ex.notes }));
  return normalizeWarmupBlock({ note: null, items });
}

/* ================================================================ completion, for the coach and the parent */

export type WarmupCompletion = { withWarmup: number; done: number };

/** "4 of 5". */
export function warmupCompletionLine(c: WarmupCompletion): string {
  return `${c.done} of ${c.withWarmup}`;
}

/** The team's rate as a whole percent, or null with nothing to count. */
export function warmupRatePercent(c: WarmupCompletion): number | null {
  const PERCENT = 100;
  return c.withWarmup > 0 ? Math.round((c.done / c.withWarmup) * PERCENT) : null;
}
