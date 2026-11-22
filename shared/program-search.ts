/**
 * PROGRAM SEARCH: the exercise search's rules, pointed at a program list.
 *
 * Scott, 2026-11-22: one search finds everything, and that includes the programs. "soccer
 * preseason", "pitcher", "knee return" and "warmup ankle" have to find the program written for
 * that, the way "rdl" finds the Romanian Deadlift.
 *
 * The same scorer as shared/exercise-search.ts, word by word:
 *   - every word typed must be found somewhere on the program, so adding a word narrows;
 *   - the name counts most, then the description and the sport, then the tags (season phase,
 *     positions, joints, purposes);
 *   - a typo is allowed in the name the way it is for an exercise name, and in a tag from five
 *     letters; never in the description, whose many words would otherwise match nearly anything;
 *   - `TAG_NICKNAMES` and `SEASON_PHASE_NICKNAMES` turn what people say ("rehab", "pre season",
 *     "mid season") into the tag words.
 *
 * Pure: the program list page, the list routes' `?q=` and the tests all call the same function.
 */
import { SEASON_PHASE_NICKNAMES, TAG_NICKNAMES } from "./exercise-tags";
import {
  isFillerWord,
  normalizeSearchText,
  searchWords,
  tagTargetsOf,
  tagWordScore,
  withTagNicknames,
  wordScore,
} from "./exercise-search";

export type SearchableProgram = {
  name: string;
  description?: string | null;
  sport?: string | null;
  seasonPhase?: string | null;
  positions?: readonly string[] | null;
  joints?: readonly string[] | null;
  purposes?: readonly string[] | null;
};

/** A word matches the description or the sport as a beginning or better, never by typo. */
const DESCRIPTION_MIN_SCORE = 2;
/** The description and sport count for this much of a name match. */
const DESCRIPTION_WEIGHT = 0.5;
/** A typed word found in the name counts for at least this before the other fields are asked. */
const NAME_ENOUGH = 3;
/** The program named exactly what was typed goes first. */
const BONUS_EXACT_NAME = 100;
/** A name starting with what was typed comes next. */
const BONUS_NAME_STARTS = 20;
/** Every typed word found in the name beats a match leaning on the description or tags. */
const BONUS_ALL_IN_NAME = 5;
/** The words as typed count slightly more than a nickname's expansion of them. */
const BONUS_AS_TYPED = 0.5;

const PROGRAM_NICKNAMES: Record<string, string> = { ...TAG_NICKNAMES, ...SEASON_PHASE_NICKNAMES };

/** Every reading of the query: as typed, and with each tag or phase nickname swapped for its tag. */
export function programQueryReadings(query: string): string[] {
  const typed = normalizeSearchText(query);
  return typed ? withTagNicknames([typed], PROGRAM_NICKNAMES) : [];
}

type ProgramIndex = {
  name: string;
  nameWords: string[];
  otherWords: string[];
  tagWords: string[];
};

function indexProgram(p: SearchableProgram): ProgramIndex {
  const name = normalizeSearchText(p.name);
  return {
    name,
    nameWords: searchWords(name).filter((w) => !isFillerWord(w)),
    otherWords: [p.description ?? "", p.sport ?? ""].map(normalizeSearchText).flatMap(searchWords),
    tagWords: [...(p.seasonPhase ? [p.seasonPhase] : []), ...tagTargetsOf(p)],
  };
}

function scoreProgramReading(reading: string, ix: ProgramIndex): number | null {
  const typedWords = searchWords(reading).filter((w) => !isFillerWord(w));
  if (typedWords.length === 0) return null;
  const perWord = typedWords.map((typed, i) => {
    const last = i === typedWords.length - 1;
    const inName = ix.nameWords.reduce((best, w) => Math.max(best, wordScore(typed, w, last)), 0);
    if (inName >= NAME_ENOUGH) return { best: inName, inName: true };
    const inOther = ix.otherWords.reduce((best, w) => {
      const s = wordScore(typed, w, last);
      return s >= DESCRIPTION_MIN_SCORE ? Math.max(best, s * DESCRIPTION_WEIGHT) : best;
    }, 0);
    const inTags = tagWordScore(typed, ix.tagWords, last);
    return { best: Math.max(inName, inOther, inTags), inName: inName > 0 };
  });
  if (perWord.some((w) => w.best === 0)) return null;
  const total = perWord.reduce((sum, w) => sum + w.best, 0);
  const nameTests: { holds: boolean; bonus: number }[] = [
    { holds: ix.name === reading, bonus: BONUS_EXACT_NAME },
    { holds: ix.name.startsWith(reading), bonus: BONUS_NAME_STARTS },
  ];
  const nameBonus = nameTests.find((t) => t.holds)?.bonus ?? 0;
  const allInName = perWord.every((w) => w.inName) ? BONUS_ALL_IN_NAME : 0;
  return total / typedWords.length + nameBonus + allInName;
}

/** How well a program answers a query, or null when it does not. An empty query matches all. */
export function programMatchScore(p: SearchableProgram, query: string): number | null {
  if (!normalizeSearchText(query)) return 0;
  const ix = indexProgram(p);
  return programQueryReadings(query).reduce<number | null>((acc, reading, r) => {
    const s = scoreProgramReading(reading, ix);
    if (s == null) return acc;
    const weighted = r === 0 ? s + BONUS_AS_TYPED : s;
    return acc == null || weighted > acc ? weighted : acc;
  }, null);
}

/** The longest query a list route searches by; anything past it is cut, never refused. */
export const MAX_PROGRAM_QUERY_LENGTH = 200;

/**
 * A list route's `?q=`: the programs that answer it, best first, or the list unchanged when there
 * is no query. A repeated or non-string parameter reads as no query rather than an error.
 */
export function searchProgramsFromQueryParam<T extends SearchableProgram>(list: readonly T[], q: unknown): T[] {
  if (typeof q !== "string") return [...list];
  return searchPrograms(list, q.slice(0, MAX_PROGRAM_QUERY_LENGTH));
}

/** The programs that answer the query, best first. An empty query returns the list as given. */
export function searchPrograms<T extends SearchableProgram>(list: readonly T[], query: string): T[] {
  if (!normalizeSearchText(query)) return [...list];
  return list
    .map((p, at) => ({ p, at, score: programMatchScore(p, query) }))
    .filter((s): s is { p: T; at: number; score: number } => s.score != null)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name) || a.at - b.at)
    .map((s) => s.p);
}
