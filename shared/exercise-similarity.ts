// Deciding whether two exercise names are the same movement wearing different words.
//
// The library already had one form of this: detectTrendingExercises groups by
// lower(btrim(name)), which surfaces a name two coaches typed IDENTICALLY. That catches the
// easy case and misses the one that actually matters for review. Coaches do not usually retype
// "Bench Press" -- they type "Barbell Bench Press (Flat)", "Flat BB Bench", "Bench Press -
// Barbell". None of those collide under an exact match, and each opens its own row.
//
// Pure, dependency-free, and no SQL: this runs in Node over a list the admin route already
// loaded, so it needs no pg_trgm extension on a database the deploy does not control.

// Abbreviations coaches actually type. Expanded before tokenising so "Flat BB Bench" and
// "Flat Barbell Bench" reduce to the same token set rather than scoring as two words apart.
const ABBREVIATIONS: [RegExp, string][] = [
  [/\bbb\b/g, "barbell"],
  [/\bdb\b/g, "dumbbell"],
  [/\bkb\b/g, "kettlebell"],
  [/\bohp\b/g, "overhead press"],
  [/\brdl\b/g, "romanian deadlift"],
  [/\bsldl\b/g, "stiff leg deadlift"],
  [/\bbw\b/g, "bodyweight"],
  [/\bsl\b/g, "single leg"],
  [/\bdl\b/g, "deadlift"],
  [/\bsq\b/g, "squat"],
  [/\bgm\b/g, "good morning"],
  [/\bpu\b/g, "pull up"],
  [/\b1\s*arm\b/g, "single arm"],
  [/\b2\s*arm\b/g, "double arm"],
  [/\b1\s*leg\b/g, "single leg"],
  [/\bs\/?a\b/g, "single arm"],
  [/\bs\/?l\b/g, "single leg"],
];

// Words that carry no movement meaning. Dropping them stops "Bench Press (Flat) - Barbell"
// from looking different to "Barbell Flat Bench Press" purely on filler.
const NOISE_WORDS = new Set([
  "the", "a", "an", "and", "or", "with", "for", "to", "of", "on", "in",
  "exercise", "movement", "variation", "version", "style", "drill", "reps", "rep", "set", "sets",
]);

/** Lowercase, expand abbreviations, strip punctuation, drop filler, collapse whitespace. */
export function normalizeExerciseName(name: string): string {
  let n = name.toLowerCase();
  n = n.replace(/&/g, " and ");
  n = n.replace(/[‐-―]/g, "-");
  // Apostrophes are DELETED rather than turned into a space, so "Farmer's" becomes "farmers"
  // rather than the two tokens "farmer" and "s".
  n = n.replace(/['‘’]/g, "");
  n = n.replace(/[^a-z0-9\s]/g, " ");
  for (const [pattern, replacement] of ABBREVIATIONS) n = n.replace(pattern, replacement);
  const words = n
    .split(/\s+/)
    .filter((w) => w && !NOISE_WORDS.has(w))
    .map(singularize);
  return words.join(" ");
}

// Crude, deliberately. A coach writing "Bulgarian Split Squats" means the same lift as one
// writing "Bulgarian Split Squat", and no amount of fuzzy scoring downstream should have to
// rediscover that. Guarded so it does not maul a word that legitimately ends in s: "press"
// keeps its double s, and only a long enough word loses a trailing one.
function singularize(word: string): string {
  if (word.length > 4 && /(?:s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function nameTokens(name: string): Set<string> {
  const normalized = normalizeExerciseName(name);
  return new Set(normalized ? normalized.split(" ") : []);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

/** 0 to 1, where 1 is "these are certainly the same movement".
 *
 * Two signals, taken at their maximum rather than averaged, because each catches a different way
 * of rewording and a strong hit on either is enough to be worth an admin's glance:
 *
 *   Jaccard over tokens catches a reordering ("Bench Press - Barbell" vs "Barbell Bench Press").
 *   Containment catches an elaboration ("Bench Press" inside "Barbell Bench Press Flat"), which
 *     Jaccard scores badly precisely because the longer name has more words. Weighted slightly
 *     below a full match, since a subset is suggestive rather than conclusive.
 *
 * Tokens match fuzzily so a spelling drift still counts as the same word, but the comparison is
 * per-token and never over the whole string. Whole-string edit distance was tried first and is
 * actively wrong here: "Incline Bench Press" and "Decline Bench Press" differ by two characters
 * in nineteen, which reads as a typo and scores 0.89, yet they are different lifts filmed from
 * different setups. Per-token, "incline" against "decline" is two edits in seven and falls below
 * the bar, while "bench" and "press" match exactly -- so the pair scores on its shared words
 * alone, which is the honest answer.
 */
const TOKEN_MATCH_THRESHOLD = 0.8;
// Below this length a single edit is too large a share of the word for fuzzy matching to mean
// anything -- "row" and "raw" would pair.
const MIN_FUZZY_TOKEN_LENGTH = 4;

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < MIN_FUZZY_TOKEN_LENGTH || b.length < MIN_FUZZY_TOKEN_LENGTH) return false;
  const longest = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / longest >= TOKEN_MATCH_THRESHOLD;
}

export function nameSimilarity(a: string, b: string): number {
  const ta = [...nameTokens(a)];
  const tb = [...nameTokens(b)];
  if (!ta.length || !tb.length) return 0;
  // Greedy one-to-one pairing: each token on the right may only be claimed once, so a name that
  // repeats a word cannot inflate its own score.
  const claimed = new Set<number>();
  let shared = 0;
  for (const left of ta) {
    for (let i = 0; i < tb.length; i++) {
      if (claimed.has(i)) continue;
      if (tokensMatch(left, tb[i])) {
        claimed.add(i);
        shared++;
        break;
      }
    }
  }
  const union = ta.length + tb.length - shared;
  const jaccard = union > 0 ? shared / union : 0;
  const containment = shared / Math.min(ta.length, tb.length);
  return Math.max(jaccard, containment * 0.9);
}

// Chosen so a genuine reword clears it and a shared movement family does not. "Back Squat" and
// "Front Squat" score 0.45 here and must NOT be flagged -- they are different lifts that happen
// to share a word. "Bench Press" and "Barbell Bench Press (Flat)" score 0.9 and must be.
export const SIMILAR_NAME_THRESHOLD = 0.7;

export function namesAreSimilar(a: string, b: string): boolean {
  return nameSimilarity(a, b) >= SIMILAR_NAME_THRESHOLD;
}

export type SimilarityCandidate = { id: number; name: string };

export type SimilarityMatch<T extends SimilarityCandidate> = {
  item: T;
  score: number;
};

/** For each candidate, the entries it most resembles, best first.
 *
 * Quadratic, and deliberately so: the admin review list is coach-authored exercises, which is
 * hundreds of rows rather than millions, and a blocking index would have to live in the database
 * this is specifically avoiding depending on. Capped per item so one very generic name ("Press")
 * cannot return a page of everything. */
export function findSimilar<T extends SimilarityCandidate>(
  needle: SimilarityCandidate,
  haystack: T[],
  limit = 5,
): SimilarityMatch<T>[] {
  const matches: SimilarityMatch<T>[] = [];
  for (const item of haystack) {
    if (item.id === needle.id) continue;
    const score = nameSimilarity(needle.name, item.name);
    if (score >= SIMILAR_NAME_THRESHOLD) matches.push({ item, score });
  }
  matches.sort((x, y) => y.score - x.score);
  return matches.slice(0, limit);
}
