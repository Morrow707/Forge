/* eslint-disable ts-patterns/no-loop-statements, ts-patterns/no-magic-numbers, ts-patterns/require-regex-example -- written in this repo's own style; the rules that matter here (never auto-match a guess) are pinned by program-import.test.ts and mutation-tested */
/**
 * IMPORT A PROGRAM: the draft a coach reviews, and how each row finds its exercise.
 *
 * The model (server/program-import.ts) reads a coach's spreadsheet, PDF or photo and reports
 * what it saw, row by row, with each exercise name AS WRITTEN. This module turns that report
 * into the draft the review dialog draws. It is pure so the matching rule can be driven
 * directly by a test rather than read off source.
 *
 * THE MATCHING RULE, which is the part that must not drift: a row is MATCHED to a library
 * exercise only when the name as written IS that exercise's name -- the same words once case,
 * punctuation and a plural are set aside, or a nickname the library already defines
 * (`NICKNAMES` in shared/exercise-search.ts: "RDL" is the Romanian Deadlift) that lands on
 * exactly one exercise. Everything else is FLAGGED, with the search's best guesses offered as
 * suggestions, and the coach picks. That includes a near-miss spelling and the model's own
 * guess: "Bench" on a whiteboard may be a flat, an incline or a close-grip press, and the only
 * person who knows is the coach. A row is never dropped and never put on a guessed exercise.
 */
import type { ResolvedWarmupBlock } from "./program-day-warmup";
import { NICKNAMES, normalizeSearchText, searchExercises } from "./exercise-search";

/** What the model reports for one row. Every field but the name is optional: a sheet that does
 * not say how many sets leaves it out rather than the model inventing a default. */
export type RawImportedExercise = {
  nameAsWritten: string;
  /** The model's guess at the library exercise, offered to the coach as a suggestion only. */
  libraryName?: string | null;
  sets?: number | null;
  reps?: string | null;
  load?: string | null;
  percent1RM?: number | null;
  restSeconds?: number | null;
  tempo?: string | null;
  notes?: string | null;
  supersetGroup?: string | null;
};

export type RawImportedDay = {
  label?: string | null;
  order?: number | null;
  date?: string | null;
  isRestDay?: boolean | null;
  exercises?: RawImportedExercise[] | null;
};

export type RawImportDraft = {
  name?: string | null;
  note?: string | null;
  days: RawImportedDay[];
  /** Text the model saw and could not place as an exercise row (a heading it did not
   * understand, a scribble). Shown to the coach so nothing on the page vanishes unsaid. */
  notPlaced?: string[] | null;
};

export type LibraryExercise = {
  id: number;
  name: string;
  category?: string | null;
  muscleGroup?: string | null;
  equipment?: string | null;
  videoEligible?: boolean | null;
};

export type ImportMatch =
  | { status: "matched"; how: "exact" | "nickname"; exercise: LibraryExercise }
  | { status: "flagged"; suggestions: LibraryExercise[] };

export type ImportedExerciseRow = {
  nameAsWritten: string;
  match: ImportMatch;
  /** Null when the source did not say; the builder then needs a number and shows it as assumed. */
  sets: number | null;
  reps: string | null;
  /** A load as written ("135", "60 kg") or a percentage of a 1RM ("75% 1RM"). */
  weight: string | null;
  restSeconds: number | null;
  /** The row's own notes, with a tempo in front of them when the source gave one -- Forge's
   * program exercise has no tempo column, so a tempo travels in the note rather than vanishing. */
  notes: string | null;
  /** Rows that share a token are one superset, in the order they appear. */
  supersetGroup: string | null;
};

export type ImportedDay = {
  title: string;
  isRestDay: boolean;
  exercises: ImportedExerciseRow[];
  /** A warm-up Forge drafted for the day from tagged warm-up drills (2026-11-22), added by the
   * import route after the read. The file's own rows are never moved into it. */
  warmup?: ResolvedWarmupBlock | null;
};

export type ImportDraft = {
  name: string | null;
  note: string | null;
  days: ImportedDay[];
  notPlaced: string[];
  /** How many rows the coach has to decide before the draft can go into the builder. */
  flaggedCount: number;
};

export const MAX_SUGGESTIONS = 4;

/** One word to its singular for comparison only, so "Romanian Deadlifts" is the Romanian
 * Deadlift. Applied to BOTH sides, so it cannot create a match the library's own words lack. */
function comparable(name: string): string {
  return normalizeSearchText(name)
    .split(" ")
    .map((w) => (w.length > 2 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
}

/** Find the library exercise a row names, or flag it. See the module comment for the rule. */
export function matchImportedExercise(
  nameAsWritten: string,
  modelGuess: string | null | undefined,
  library: readonly LibraryExercise[],
): ImportMatch {
  const written = comparable(nameAsWritten);
  if (written) {
    const exact = library.filter((ex) => comparable(ex.name) === written);
    if (exact.length === 1) return { status: "matched", how: "exact", exercise: exact[0] };

    // A nickname the library defines, swapped whole ("rdl" -> "romanian deadlift"), naming
    // exactly one exercise. Only a WHOLE-name nickname counts here: "db bench" expanding to
    // "dumbbell bench" names a family of lifts, not one of them.
    const nickname = NICKNAMES[normalizeSearchText(nameAsWritten)];
    if (nickname && exact.length === 0) {
      const hits = new Map<number, LibraryExercise>();
      for (const phrase of nickname) {
        for (const ex of library) if (comparable(ex.name) === comparable(phrase)) hits.set(ex.id, ex);
      }
      if (hits.size === 1) return { status: "matched", how: "nickname", exercise: [...hits.values()][0] };
    }
  }

  const suggestions: LibraryExercise[] = [];
  const add = (ex: LibraryExercise | undefined) => {
    if (ex && !suggestions.some((s) => s.id === ex.id)) suggestions.push(ex);
  };
  if (modelGuess) add(library.find((ex) => comparable(ex.name) === comparable(modelGuess)));
  for (const ex of searchExercises(library, nameAsWritten)) {
    if (suggestions.length >= MAX_SUGGESTIONS) break;
    add(ex);
  }
  return { status: "flagged", suggestions: suggestions.slice(0, MAX_SUGGESTIONS) };
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

function cleanPositiveInt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function weightFor(ex: RawImportedExercise): string | null {
  const load = cleanText(ex.load);
  const pct = typeof ex.percent1RM === "number" && Number.isFinite(ex.percent1RM) && ex.percent1RM > 0
    ? ex.percent1RM
    : null;
  if (load && pct != null && !load.includes("%")) return `${load} (${pct}% 1RM)`;
  if (load) return load;
  if (pct != null) return `${pct}% 1RM`;
  return null;
}

function notesFor(ex: RawImportedExercise): string | null {
  const tempo = cleanText(ex.tempo);
  const notes = cleanText(ex.notes);
  if (tempo && notes) return `Tempo ${tempo}. ${notes}`;
  if (tempo) return `Tempo ${tempo}`;
  return notes;
}

function dayTitle(day: RawImportedDay, index: number): string {
  const label = cleanText(day.label);
  const date = cleanText(day.date);
  const base = label ?? `Day ${index + 1}`;
  return date && !base.includes(date) ? `${base} (${date})` : base;
}

/** The model's report to the review draft. Days keep the source's order (its own numbering
 * first, then a date, then the order they were reported in). */
export function buildImportDraft(raw: RawImportDraft, library: readonly LibraryExercise[]): ImportDraft {
  const ordered = raw.days
    .map((day, at) => ({ day, at }))
    .sort((a, b) => {
      const ao = typeof a.day.order === "number" ? a.day.order : null;
      const bo = typeof b.day.order === "number" ? b.day.order : null;
      if (ao != null && bo != null && ao !== bo) return ao - bo;
      const ad = cleanText(a.day.date);
      const bd = cleanText(b.day.date);
      if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
      return a.at - b.at;
    });

  let flaggedCount = 0;
  const days: ImportedDay[] = ordered.map(({ day }, i) => {
    const exercises: ImportedExerciseRow[] = (day.exercises ?? [])
      .filter((ex) => cleanText(ex?.nameAsWritten))
      .map((ex) => {
        const nameAsWritten = cleanText(ex.nameAsWritten)!;
        const match = matchImportedExercise(nameAsWritten, cleanText(ex.libraryName), library);
        if (match.status === "flagged") flaggedCount++;
        return {
          nameAsWritten,
          match,
          sets: cleanPositiveInt(ex.sets),
          reps: cleanText(ex.reps),
          weight: weightFor(ex),
          restSeconds: cleanPositiveInt(ex.restSeconds),
          notes: notesFor(ex),
          supersetGroup: cleanText(ex.supersetGroup),
        };
      });
    return {
      title: dayTitle(day, i),
      isRestDay: day.isRestDay === true && exercises.length === 0,
      exercises,
    };
  });

  return {
    name: cleanText(raw.name),
    note: cleanText(raw.note),
    days,
    notPlaced: (raw.notPlaced ?? []).map(cleanText).filter((t): t is string => t != null),
    flaggedCount,
  };
}
