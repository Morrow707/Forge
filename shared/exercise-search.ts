/**
 * EXERCISE SEARCH: what somebody typed against what the library calls it.
 *
 * Scott, 2026-11-14: "Need to upgrade search menu to incorporate missed spelled words, guess?
 * Give exercise nicknames, rdl 4 romanian deadlift, shoulder press 4 barbell shoulder press."
 *
 * The search was a substring test on the name, so "rdl" found one combination lift, "pullup"
 * found nothing (the library spells it "Pull-Up"), and "romainian deadlift" found nothing.
 *
 * One function, three things it does that a substring cannot:
 *   1. NICKNAMES. `NICKNAMES` rewrites what people say in a weight room into the words the
 *      library uses, and the typed words still count too, so "rdl" finds both the Romanian
 *      Deadlift and "Single-Leg RDL to Row".
 *   2. TYPOS. A word of four letters or more may be one letter off, seven or more two off
 *      (a swapped pair counts as one). Shorter words must match exactly or as a beginning:
 *      at three letters, one-off matches nearly everything.
 *   3. AN ORDER. Results come back best first: the lift named outright, then names that start
 *      with what was typed, then names holding every word, then near-misses. `FIRST_CHOICE`
 *      puts the plain version on top of its own variations ("squat" -> Back Squat).
 *
 * Every word typed has to be found somewhere on the exercise (its name first, then its muscle
 * group, equipment and sports, then its tags: joints, purposes and positions), so adding a word
 * narrows and never widens.
 *
 * TAGS (2026-11-22, shared/exercise-tags.ts). Warm-up, joint-care and return-to-training drills
 * live in this same library, so "warmup ankle", "acl", "rotator cuff" and "pitcher" have to find
 * them here. `TAG_NICKNAMES` turns what people type into the tag words; a tag counts for less
 * than the name does, and may be one letter off only on a word of five letters or more
 * ("sholder", "wramup"), because a four-letter typo against eight joint words matches too much.
 *
 * Pure and dependency-free: the picker, the library page and a test all call the same thing.
 */

import { TAG_NICKNAMES } from "./exercise-tags";

export type SearchableExercise = {
  name: string;
  muscleGroup?: string | null;
  equipment?: string | null;
  sports?: string[] | null;
  joints?: readonly string[] | null;
  purposes?: readonly string[] | null;
  positions?: readonly string[] | null;
};

/**
 * What people type -> the library's words. Keys and values are already normalised (lowercase,
 * no punctuation). A value may hold several phrases; any of them may match.
 *
 * Every value names words that are really in the seeded library's names. The test checks that,
 * so a nickname cannot point at nothing.
 */
export const NICKNAMES: Record<string, string[]> = {
  rdl: ["romanian deadlift"],
  rdls: ["romanian deadlift"],
  "romanian dl": ["romanian deadlift"],
  sldl: ["stiff leg deadlift"],
  "straight leg deadlift": ["stiff leg deadlift"],
  dl: ["deadlift"],
  deads: ["deadlift"],
  "trap bar": ["hex bar", "trap bar"],
  "hex bar": ["hex bar", "trap bar"],
  ohp: ["shoulder press", "overhead press"],
  "overhead press": ["overhead press", "shoulder press"],
  "military press": ["shoulder press"],
  "strict press": ["shoulder press"],
  "standing press": ["barbell shoulder press"],
  bb: ["barbell"],
  db: ["dumbbell"],
  dbs: ["dumbbell"],
  dumbell: ["dumbbell"],
  dumbel: ["dumbbell"],
  kb: ["kettlebell"],
  kbs: ["kettlebell swing"],
  mb: ["med ball", "medicine ball"],
  "med ball": ["med ball", "medicine ball"],
  "medicine ball": ["medicine ball", "med ball"],
  bss: ["bulgarian split squat"],
  "rear foot elevated split squat": ["bulgarian split squat"],
  rfess: ["bulgarian split squat"],
  ghr: ["glute ham raise"],
  cgbp: ["close grip bench press"],
  bench: ["bench press"],
  "flat bench": ["bench press"],
  incline: ["incline"],
  "incline bench": ["incline barbell bench press", "incline dumbbell press"],
  squats: ["squat"],
  "high bar squat": ["back squat"],
  "low bar squat": ["back squat"],
  ssb: ["safety bar squat"],
  "hack squat": ["machine hack squat"],
  pullups: ["pull up"],
  pullup: ["pull up"],
  chinups: ["chin up"],
  chinup: ["chin up"],
  chins: ["chin up"],
  pushups: ["push up"],
  pushup: ["push up"],
  "press up": ["push up"],
  situp: ["sit up"],
  situps: ["sit up"],
  stepup: ["step up"],
  stepups: ["step up"],
  dips: ["dip"],
  skullcrusher: ["skull crusher"],
  skullcrushers: ["skull crusher"],
  "skull crushers": ["skull crusher"],
  "lying tricep extension": ["skull crusher"],
  "tricep pushdown": ["tricep rope pushdown", "straight arm pushdown"],
  pushdown: ["pushdown"],
  "lat pull": ["lat pulldown"],
  "lat pull down": ["lat pulldown"],
  pulldown: ["pulldown"],
  "bent over row": ["bent over row"],
  "barbell row": ["bent over row", "pendlay row"],
  "bb row": ["bent over row", "pendlay row"],
  "db row": ["single arm dumbbell row", "chest supported dumbbell row"],
  "dumbbell row": ["single arm dumbbell row", "chest supported dumbbell row"],
  "cable row": ["seated cable row"],
  "farmers walk": ["farmer s carry"],
  "farmer walk": ["farmer s carry"],
  "farmers carry": ["farmer s carry"],
  "farmer carry": ["farmer s carry"],
  "hip thruster": ["hip thrust"],
  thrusters: ["thruster"],
  "good morning": ["good morning"],
  gm: ["good morning"],
  cmj: ["countermovement jump"],
  "counter movement jump": ["countermovement jump"],
  "long jump": ["standing long jump", "broad jump"],
  "c j": ["clean jerk"],
  "clean and jerk": ["clean jerk"],
  cj: ["clean jerk"],
  tgu: ["turkish get up"],
  "get up": ["get up"],
  "nordic curl": ["nordic hamstring curl"],
  nordics: ["nordic hamstring curl"],
  "hamstring curl": ["leg curl", "nordic hamstring curl"],
  "leg curls": ["leg curl"],
  "leg extensions": ["leg extension"],
  "calf raises": ["calf raise"],
  "lateral raises": ["lateral raise"],
  "side raise": ["lateral raise"],
  "rear delt": ["rear delt"],
  "reverse fly": ["rear delt fly"],
  "chest fly": ["fly", "pec deck"],
  flys: ["fly"],
  flyes: ["fly"],
  flies: ["fly"],
  "pec fly": ["pec deck", "machine chest fly"],
  "bicep curls": ["curl"],
  curls: ["curl"],
  "ab wheel": ["ab wheel rollout"],
  "ab roller": ["ab wheel rollout"],
  ttb: ["toes to bar"],
  t2b: ["toes to bar"],
  "hanging knee raise": ["hanging leg raise"],
  "back raise": ["back extension"],
  hyperextension: ["back extension"],
  hyper: ["back extension", "reverse hyper"],
  "wall balls": ["wall ball"],
  "box jumps": ["box jump"],
  "kb swing": ["kettlebell swing"],
  "kettlebell swings": ["kettlebell swing"],
  "jump squat": ["squat jump"],
  prowler: ["prowler push", "sled push"],
  "sled pull": ["sled drag"],
  bike: ["assault bike"],
  rower: ["rowing machine"],
  erg: ["rowing machine", "ski erg"],
  "bird dogs": ["bird dog"],
  clamshells: ["clamshell"],
  "band walk": ["lateral band walk"],
  "monster walk": ["lateral band walk"],
  "face pulls": ["face pull"],
  shrugs: ["shrug"],
  lunges: ["lunge"],
};

/** The plain version of a lift, shown above its own variations when its nickname is typed. */
export const FIRST_CHOICE: Record<string, string> = {
  rdl: "romanian deadlift",
  rdls: "romanian deadlift",
  "romanian deadlift": "romanian deadlift",
  "shoulder press": "barbell shoulder press",
  ohp: "barbell shoulder press",
  "overhead press": "barbell shoulder press",
  "military press": "barbell shoulder press",
  "strict press": "barbell shoulder press",
  press: "barbell shoulder press",
  squat: "back squat",
  squats: "back squat",
  bench: "bench press",
  "bench press": "bench press",
  "flat bench": "bench press",
  deadlift: "deadlift",
  dl: "deadlift",
  deads: "deadlift",
  row: "bent over row",
  "barbell row": "bent over row",
  "bb row": "bent over row",
  clean: "power clean",
  "pull up": "pull up",
  pullup: "pull up",
  pullups: "pull up",
  "chin up": "chin up",
  chinup: "chin up",
  chins: "chin up",
  "push up": "push up",
  pushup: "push up",
  pushups: "push up",
  curl: "barbell curl",
  curls: "barbell curl",
  dip: "dip",
  dips: "dip",
  lunge: "walking lunge",
  lunges: "walking lunge",
  "hip thrust": "hip thrust",
  "split squat": "bulgarian split squat",
  bss: "bulgarian split squat",
  "lat pulldown": "lat pulldown",
  pulldown: "lat pulldown",
  "calf raise": "standing calf raise",
  "leg curl": "lying leg curl",
  jerk: "split jerk",
  snatch: "snatch",
  plank: "plank",
  "kb swing": "kettlebell swing",
  swing: "kettlebell swing",
};

/** Lowercase, punctuation to spaces ("Pull-Up" -> "pull up", "Farmer's" -> "farmer s"). */
export function normalizeSearchText(text: string): string {
  return (
    text
      .toLowerCase()
      // An ampersand reads as a word break: "clean & jerk" matches, "clean jerk" has none.
      // https://regex101.com/?regex=%26&flags=g&testString=clean%20%26%20jerk
      .replace(/&/g, " ")
      // Any run of characters that is not a letter or digit: "-" in "pull-up" and "'" in
      // "farmer's" match; "pullup" has none.
      // https://regex101.com/?regex=%5B%5Ea-z0-9%5D%2B&flags=g&testString=farmer's%20pull-up
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      // Any run of whitespace: the double space in "a  b" matches; "ab" has none.
      // https://regex101.com/?regex=%5Cs%2B&flags=g&testString=a%20%20b
      .replace(/\s+/g, " ")
  );
}

/** Words nobody means anything by, and that the library drops or keeps inconsistently. */
const FILLER = new Set(["and", "the", "a", "with", "to", "of", "for", "s"]);

/** Split normalised text into its words. */
export function searchWords(normalized: string): string[] {
  return words(normalized);
}

/** A word nobody means anything by ("and", "the"). */
export function isFillerWord(word: string): boolean {
  return FILLER.has(word);
}

function words(normalized: string): string[] {
  return normalized.split(" ").filter((w) => w.length > 0);
}

// ---- How a typed word is scored against a library word. ----
/** The same word (or the same once a plural "s" is dropped). */
const SCORE_EXACT = 3;
/** The library word begins with what was typed. */
const SCORE_PREFIX = 2;
/** The library word holds what was typed somewhere inside it. */
const SCORE_CONTAINS = 1.5;
/** One or two letters off. */
const SCORE_TYPO = 1;
/** A word still being typed, one or two letters off its library word's beginning. */
const SCORE_TYPO_PREFIX = 0.8;
/** Two name words run together, still being typed ("benchpr" for "bench press"). */
const SCORE_JOINED_PREFIX = 0.9;
/** A finished word needs this many letters before it may match as a beginning. */
const MID_QUERY_PREFIX_MIN_LENGTH = 2;
/** A word needs this many letters before it may match inside another word. */
const CONTAINS_MIN_LENGTH = 4;
/** A run-together pair needs this many letters typed before a beginning counts. */
const JOINED_PREFIX_MIN_LENGTH = 5;
/** From this length a word may be one letter off. */
const ONE_TYPO_MIN_LENGTH = 4;
/** From this length a word may be two letters off. */
const TWO_TYPO_MIN_LENGTH = 7;
const ONE_TYPO = 1;
const TWO_TYPOS = 2;
/** A word longer than this may lose a trailing plural "s" ("squats" -> "squat"; "abs" stays). */
const PLURAL_MIN_LENGTH = 2;
/** Muscle group, equipment and sport count for this much of a name match. */
const OTHER_MATCH_WEIGHT = 0.5;

// ---- How a whole reading is scored against an exercise. ----
const BONUS_EXACT_NAME = 100;
const BONUS_NAME_STARTS = 20;
const BONUS_NAME_CONTAINS = 10;
/** Every typed word found in the NAME beats a match leaning on muscle group, equipment or tags. */
const BONUS_ALL_IN_NAME = 5;
/** Between two names that match equally, the shorter is the plainer lift. */
const PENALTY_PER_NAME_WORD = 0.05;
/** The words as typed count slightly more than a nickname's expansion of them. */
const BONUS_AS_TYPED = 0.5;
/** The plain lift a nickname names goes first ("squat" -> Back Squat). */
const BONUS_FIRST_CHOICE = 200;
/** The two spaces padded around a key when a nickname is swapped in; also two letters back. */
const KEY_PADDING = 2;

/** How many single-letter edits apart, capped: anything past `max` returns max + 1. A swapped
 * neighbouring pair ("romainan") counts as one. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const firstRow = Array.from({ length: b.length + 1 }, (_, j) => j);
  const rows = Array.from(a).reduce<number[][]>(
    (acc, aChar, aAt) => {
      const i = aAt + 1;
      const prev = acc[i - 1];
      const row = Array.from(b).reduce<number[]>(
        (r, bChar, bAt) => {
          const j = bAt + 1;
          const cost = aChar === bChar ? 0 : 1;
          const edit = Math.min(prev[j] + 1, r[j - 1] + 1, prev[j - 1] + cost);
          const swapped =
            i > 1 && j > 1 && aChar === b[j - KEY_PADDING] && a[i - KEY_PADDING] === bChar
              ? acc[i - KEY_PADDING][j - KEY_PADDING] + 1
              : Number.POSITIVE_INFINITY;
          r.push(Math.min(edit, swapped));
          return r;
        },
        [i],
      );
      acc.push(row);
      return acc;
    },
    [firstRow],
  );
  return Math.min(rows[a.length][b.length], max + 1);
}

function allowedTypos(word: string): number {
  if (word.length >= TWO_TYPO_MIN_LENGTH) return TWO_TYPOS;
  if (word.length >= ONE_TYPO_MIN_LENGTH) return ONE_TYPO;
  return 0;
}

/** A trailing "s" is not a different word ("squats", "curls"). */
function singular(word: string): string {
  return word.length > PLURAL_MIN_LENGTH && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

/** How well one typed word matches one library word. 0 = not at all. */
export function wordScore(typed: string, target: string, isLastTyped: boolean): number {
  if (typed === target || singular(typed) === singular(target)) return SCORE_EXACT;
  // The word still being typed matches as a beginning at any length; a finished one needs two
  // letters, so "b" in the middle of a query does not match every word starting with b.
  if ((isLastTyped || typed.length >= MID_QUERY_PREFIX_MIN_LENGTH) && target.startsWith(typed)) return SCORE_PREFIX;
  if (typed.length >= CONTAINS_MIN_LENGTH && target.includes(typed)) return SCORE_CONTAINS;
  const max = allowedTypos(typed);
  if (max === 0) return 0;
  if (editDistance(typed, target, max) <= max) return SCORE_TYPO;
  // A typo in a word that is still being typed: compare against the same-length beginning.
  if (isLastTyped && target.length > typed.length) {
    if (editDistance(typed, target.slice(0, typed.length), max) <= max) return SCORE_TYPO_PREFIX;
  }
  return 0;
}

type Indexed = {
  name: string;
  nameWords: string[];
  nameTargets: string[];
  /** Each neighbouring pair of name words run together, so "pullup" finds "pull up". */
  joinedTargets: string[];
  otherTargets: string[];
  /** Joint and purpose tags as stored ("knee", "return_to_training"), plus position words. */
  tagTargets: string[];
};

/** How much a tag match counts against a name match (which is 1). */
export const TAG_MATCH_WEIGHT = 0.6;
/** A typed word must be at least this long before a typo may match a tag ("sholder" yes, "kne" no). */
export const TAG_TYPO_MIN_LENGTH = 5;

/**
 * How well one typed word matches a list of tag words, already weighted. A tag token typed through
 * a nickname ("return_to_training") matches exactly; a typed word matches as a beginning ("warm"
 * finds "warmup") and, from five letters, by a typo.
 */
export function tagWordScore(typed: string, tags: readonly string[], isLastTyped: boolean): number {
  return tags.reduce((best, tag) => {
    const s = wordScore(typed, tag, isLastTyped);
    const allowed = s >= SCORE_PREFIX || (s > 0 && typed.length >= TAG_TYPO_MIN_LENGTH);
    return allowed ? Math.max(best, s * TAG_MATCH_WEIGHT) : best;
  }, 0);
}

/** The words an exercise's tags offer the search. Positions split into words ("defensive end"). */
export function tagTargetsOf(fields: {
  joints?: readonly string[] | null;
  purposes?: readonly string[] | null;
  positions?: readonly string[] | null;
}): string[] {
  const positionWords = (fields.positions ?? []).map(normalizeSearchText).flatMap(words);
  return [...(fields.joints ?? []), ...(fields.purposes ?? []), ...positionWords];
}

/** `padded` (the reading with a space either side) with the key found at `at` replaced. */
function swapAt(padded: string, at: number, key: string, replacement: string): string {
  return (
    (padded.slice(0, at) + ` ${replacement} ` + padded.slice(at + key.length + KEY_PADDING))
      .trim()
      // Collapse the doubled spaces a swap leaves behind: "a  b" matches, "a b" has none to collapse.
      // https://regex101.com/?regex=%5Cs%2B&flags=g&testString=a%20%20b
      .replace(/\s+/g, " ")
  );
}

/**
 * Every reading with each tag nickname it contains swapped for its tag, in every combination
 * ("rotator cuff warm up" -> "shoulder warmup"). Tag tokens are never themselves nicknames, so the
 * expansion ends. Capped, so a pathological query cannot multiply readings without bound.
 */
export const MAX_QUERY_READINGS = 32;
export function withTagNicknames(readings: readonly string[], nicknames: Record<string, string>): string[] {
  const keys = Object.keys(nicknames).sort((a, b) => b.length - a.length);
  return keys.reduce((acc, key) => {
    const swapped = acc.flatMap((reading) => {
      const padded = ` ${reading} `;
      const at = padded.indexOf(` ${key} `);
      return at === -1 ? [] : [swapAt(padded, at, key, nicknames[key])];
    });
    return Array.from(new Set([...acc, ...swapped])).slice(0, MAX_QUERY_READINGS);
  }, [...readings]);
}

const indexCache = new WeakMap<object, Indexed>();

function indexOf(ex: SearchableExercise): Indexed {
  const cached = indexCache.get(ex);
  const tags = tagTargetsOf(ex);
  if (cached && cached.name === normalizeSearchText(ex.name) && cached.tagTargets.join(" ") === tags.join(" ")) {
    return cached;
  }
  const name = normalizeSearchText(ex.name);
  const nameWords = words(name);
  const joined = nameWords.slice(1).map((next, at) => nameWords[at] + next);
  const other = [ex.muscleGroup ?? "", ex.equipment ?? "", ...(ex.sports ?? [])]
    .map(normalizeSearchText)
    .flatMap(words);
  const made: Indexed = {
    name,
    nameWords,
    nameTargets: nameWords.filter((w) => !FILLER.has(w)),
    joinedTargets: joined,
    otherTargets: other,
    tagTargets: tags,
  };
  indexCache.set(ex, made);
  return made;
}

/** Every reading of the query: as typed, and with each nickname swapped for the library's words. */
export function queryReadings(query: string): string[] {
  const typed = normalizeSearchText(query);
  if (!typed) return [];
  const keys = Object.keys(NICKNAMES).sort((a, b) => b.length - a.length);
  // One pass is enough: nicknames expand to library words, not to other nicknames.
  const padded = ` ${typed} `;
  const swapped = keys.flatMap((key) => {
    const at = padded.indexOf(` ${key} `);
    return at === -1 ? [] : NICKNAMES[key].map((replacement) => swapAt(padded, at, key, replacement));
  });
  return withTagNicknames(Array.from(new Set([typed, ...swapped])), TAG_NICKNAMES);
}

/** How well one typed word matches an exercise, and whether that match was in its name. */
function typedWordScore(typed: string, ix: Indexed, last: boolean): { best: number; inName: boolean } {
  const fromName = ix.nameTargets.reduce((best, target) => Math.max(best, wordScore(typed, target, last)), 0);
  // Two name words run together ("pullup", "benchpress") match whole, or as the beginning of
  // the pair once the typing has gone past its first word. Never by typo: "squatt" is a
  // misspelt squat, not the start of "squat to".
  const fromJoined = ix.joinedTargets.reduce((best, target) => {
    if (typed === target || singular(typed) === target) return Math.max(best, SCORE_EXACT);
    if (last && typed.length >= JOINED_PREFIX_MIN_LENGTH && target.startsWith(typed)) {
      return Math.max(best, SCORE_JOINED_PREFIX);
    }
    return best;
  }, 0);
  const inName = Math.max(fromName, fromJoined);
  if (inName >= SCORE_EXACT) return { best: inName, inName: true };
  // Muscle group, equipment and sport count for less than the name does, and never by typo:
  // "barbel" should find barbell lifts by their names, not every exercise done with one.
  const fromOther = ix.otherTargets.reduce((best, target) => {
    const s = wordScore(typed, target, last);
    return s >= SCORE_PREFIX ? Math.max(best, s * OTHER_MATCH_WEIGHT) : best;
  }, 0);
  const fromTags = tagWordScore(typed, ix.tagTargets, last);
  return { best: Math.max(inName, fromOther, fromTags), inName: inName > 0 };
}

function scoreReading(reading: string, ix: Indexed): number | null {
  const typedWords = words(reading).filter((w) => !FILLER.has(w));
  if (typedWords.length === 0) return null;
  const perWord = typedWords.map((typed, i) => typedWordScore(typed, ix, i === typedWords.length - 1));
  if (perWord.some((w) => w.best === 0)) return null;
  const total = perWord.reduce((sum, w) => sum + w.best, 0);
  const inName = perWord.filter((w) => w.inName).length;
  // The first that holds wins: the name exactly, the name starting with it, the name holding it.
  const nameTests: { holds: boolean; bonus: number }[] = [
    { holds: ix.name === reading, bonus: BONUS_EXACT_NAME },
    { holds: ix.name.startsWith(reading), bonus: BONUS_NAME_STARTS },
    { holds: ` ${ix.name} `.includes(` ${reading} `), bonus: BONUS_NAME_CONTAINS },
  ];
  const nameBonus = nameTests.find((t) => t.holds)?.bonus ?? 0;
  const allInName = inName === typedWords.length ? BONUS_ALL_IN_NAME : 0;
  return total / typedWords.length + nameBonus + allInName - ix.nameWords.length * PENALTY_PER_NAME_WORD;
}

/** The plain lift a query names, allowing the same typos a word is allowed ("squatt"). */
function firstChoiceFor(typed: string): string | undefined {
  if (FIRST_CHOICE[typed]) return FIRST_CHOICE[typed];
  const max = allowedTypos(typed);
  if (max === 0) return undefined;
  const near = Object.keys(FIRST_CHOICE).find((key) => editDistance(typed, key, ONE_TYPO) <= ONE_TYPO);
  return near ? FIRST_CHOICE[near] : undefined;
}

/** How well an exercise answers a query, or null when it does not. An empty query matches all. */
export function exerciseMatchScore(ex: SearchableExercise, query: string): number | null {
  const typed = normalizeSearchText(query);
  if (!typed) return 0;
  const ix = indexOf(ex);
  const best = queryReadings(query).reduce<number | null>((acc, reading, r) => {
    const s = scoreReading(reading, ix);
    if (s == null) return acc;
    const weighted = r === 0 ? s + BONUS_AS_TYPED : s;
    return acc == null || weighted > acc ? weighted : acc;
  }, null);
  if (best == null) return null;
  return firstChoiceFor(typed) === ix.name ? best + BONUS_FIRST_CHOICE : best;
}

/** The exercises that answer the query, best first. An empty query returns the list as given. */
export function searchExercises<T extends SearchableExercise>(list: readonly T[], query: string): T[] {
  if (!normalizeSearchText(query)) return [...list];
  return list
    .map((ex, at) => ({ ex, at, score: exerciseMatchScore(ex, query) }))
    .filter((s): s is { ex: T; at: number; score: number } => s.score != null)
    .sort((a, b) => b.score - a.score || a.ex.name.localeCompare(b.ex.name) || a.at - b.at)
    .map((s) => s.ex);
}
