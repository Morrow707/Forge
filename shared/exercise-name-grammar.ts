/**
 * EXERCISE NAMES ARE A SMALL GRAMMAR, AND SO ARE THE TITLES WORTH MATCHING.
 *
 * The previous matcher reduced both sides to word sets and asked how much of the title the name
 * explained. That number cannot tell a harmless extra word from a movement-changing one:
 *
 *   harmless  "Triceps" in "Dumbbell Triceps Kickback", "Chest" in "Landmine Chest Press"
 *   fatal     "Wrist" in "Barbell Wrist Curl", "Scap" in "Scap Push-Up",
 *             "Kettlebell" in "Kettlebell Sumo Deadlift", "Jump" in "Squat Box Jump"
 *
 * Both look identical to a counter, so a threshold either accepts the wrong movement or throws
 * away the right one. At 0.75 it did the second: three channels with 3,900 videos produced zero
 * matches because their titles read "How to Perform Spider Curls - Big Biceps Arms Exercise".
 *
 * The shape that separates them is [modifier]* [equipment]? [muscle]* [head], and the library's
 * own ~800 names ARE that grammar. Parse both sides into slots and an extra word is no longer
 * "unexplained" -- it has a slot, and the slot decides whether it matters. A muscle word is
 * checked against the exercise's metadata; a modifier must match exactly; equipment must match
 * exactly. That is the whole idea.
 *
 * This file is the normaliser and the hand-typed tables. The vocabulary derived FROM the library
 * lives in exercise-vocabulary.ts, and the comparison in exercise-signature-match.ts.
 *
 * THE GOVERNING RULE, unchanged from the first matcher: a wrong video is much worse than none.
 * An unmatched exercise keeps a working search link; a wrong one shows a thirteen-year-old a
 * different movement under the confidence of a curated choice. Every rule here is asymmetric.
 */

/** Words that never distinguish one exercise in this library from another.
 *
 *  Pinned by a test against the library's real tokens: a filler word that is ALSO a library word
 *  would silently erase a real distinction, which is the expensive direction to be wrong in. */
export const FILLER = new Set([
  "how", "to", "do", "does", "perform", "performing", "doing", "form", "proper", "properly",
  "correct", "correctly", "technique", "tutorial", "guide", "demo", "demonstration", "exercise",
  "exercises", "movement", "library", "video", "the", "a", "an", "with", "for", "of", "and",
  "your", "you", "this", "on", "in", "at", "using", "variation", "variations", "basics", "basic",
  "beginner", "beginners", "explained", "execution", "tip", "tips", "is", "are", "it", "its",
  "my", "our", "one", "part", "ep", "episode", "series", "olympic", "weightlifting",
]);

/**
 * Abbreviations and naming variants, expanded during normalisation.
 *
 * An alias whose expansion carries a modifier makes that modifier IMPLIED on the library side
 * too, so "Skater Squat" and a title's "Single-Leg Skater Squat" parse to the same modifier set
 * rather than differing by one -- otherwise the alias would create the very mismatch it exists
 * to remove.
 */
export const ALIASES: Record<string, string> = {
  rdl: "romanian deadlift",
  sldl: "stifflegged deadlift",
  ohp: "overhead press",
  bb: "barbell",
  db: "dumbbell",
  dbs: "dumbbell",
  kb: "kettlebell",
  ssb: "safety bar",
  bss: "bulgarian split squat",
  ghd: "glute ham",
  ghr: "glute ham raise",
  rfess: "bulgarian split squat",
  tricep: "triceps",
  bicep: "biceps",
  flye: "fly",
  flyes: "fly",
  flys: "fly",
  abdominals: "abs",
  abdominal: "abs",
  pecs: "chest",
  pec: "chest",
  delts: "shoulders",
  delt: "shoulders",
  lats: "back",
  lat: "back",
  hams: "hamstrings",
  quad: "quads",
  calf: "calves",
  glute: "glutes",
  forearm: "forearms",
  med: "medicine",
};

/**
 * A title carrying any of these is refused before parsing.
 *
 * Each one is a real title from a dry run that parsed as a clean match and was not a
 * demonstration: a competition single ("Alyssa Back Squat 127 kg"), a joke ("How it feels to
 * PLANK"), an opinion piece ("The Meadows Row is Underrated!"), an advert ("Sign up for softball
 * throwing lessons!"). No slot logic catches these, because the words ARE the exercise -- what
 * marks them is the framing around it.
 */
export const RED_FLAG_WORDS = new Set([
  "pr", "max", "attempt", "attempts", "fail", "fails", "failed", "mistake", "mistakes", "stop",
  "never", "worst", "best", "top", "vs", "versus", "challenge", "workout", "workouts", "routine",
  "session", "program", "sucks", "underrated", "overrated", "advice", "hack", "hacks", "fix",
  "pain", "injury", "cheat", "secret", "ultimate", "insane", "crazy", "brutal", "sign", "lessons",
  "giveaway", "review", "reaction", "tips", "tip", "try", "truth", "myth", "myths", "wrong",
]);

export type RedFlag = { flagged: true; detail: string } | { flagged: false };

/** Checked on the RAW first segment, before normalisation strips the evidence. */
export function redFlag(
  rawFirstSegment: string,
  rawTitle: string,
  knownTokens: ReadonlySet<string> = new Set(),
): RedFlag {
  const seg = rawFirstSegment.trim();
  if (!seg) return { flagged: false };

  // A weight on the title means somebody's lift, not a demonstration of the movement.
  if (/\b\d+(\.\d+)?\s*(kg|kgs|lb|lbs|pounds|kilos)\b/i.test(rawTitle)) {
    return { flagged: true, detail: "a weight in the title -- somebody's lift, not a demo" };
  }
  if (/\b\d+\s*x\s*\d+\b/i.test(rawTitle)) {
    return { flagged: true, detail: "a set x rep scheme -- a training clip, not a demo" };
  }
  // Emoji. Unicode property escapes need the u flag.
  if (/\p{Extended_Pictographic}/u.test(seg)) {
    return { flagged: true, detail: "an emoji in the title" };
  }
  if (/[?!]/.test(seg)) {
    return { flagged: true, detail: "a question or exclamation -- commentary, not a demo" };
  }
  if (seg.includes("#")) {
    // Only in the FIRST segment: a trailing "#shorts" is boilerplate and is stripped elsewhere.
    return { flagged: true, detail: "a hashtag inside the exercise name itself" };
  }
  // Shouting is measured over the words the library does NOT use: "Hip CARs" is the exercise's
  // own name (CARs is an acronym the library spells that way), not a shouted title (2026-09-28).
  const shoutable = seg
    .split(/\s+/)
    .filter((w) => !knownTokens.has(w.toLowerCase().replace(/[^a-z0-9]/g, "")))
    .join(" ");
  const letters = shoutable.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 6) {
    const caps = shoutable.replace(/[^A-Z]/g, "").length;
    if (caps / letters.length > 0.5) {
      return { flagged: true, detail: "shouting -- more than half the first segment is capitals" };
    }
  }
  for (const word of seg.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ")) {
    // A word the library itself uses is never commentary: "hack" in "Machine Hack Squat" is a
    // movement, and the flag refused the exercise's own name for it (2026-09-28).
    if (RED_FLAG_WORDS.has(word) && !knownTokens.has(word)) {
      return { flagged: true, detail: `"${word}" -- commentary or a claim, not a demonstration` };
    }
  }
  return { flagged: false };
}

/** Compound pairs are DERIVED from the library's hyphenated names, never hand-typed -- see
 *  buildVocabulary. This is the fallback set for callers with no vocabulary in hand (the tests
 *  for normalize itself), and the derivation is asserted to cover it. */
export const BASE_COMPOUNDS = [
  "push-up", "pull-up", "chin-up", "sit-up", "step-up", "step-down", "t-bar", "trap-bar",
  "hex-bar", "single-leg", "single-arm", "close-grip", "wide-grip", "snatch-grip",
  "reverse-grip", "straight-legged", "stiff-legged", "glute-ham", "v-up",
];

const compoundKey = (pair: string) => pair.replace(/-/g, " ");
const compoundToken = (pair: string) => pair.replace(/-/g, "");

/**
 * Singularise by a rule set, not a stemmer.
 *
 * A stemmer turns "press" into "pres" and "glutes" into "glut", neither of which is a library
 * word -- that bug shipped once already. The rule is: strip a trailing s only when what remains
 * is itself a word the library uses.
 */
function singularise(token: string, known: Set<string>): string {
  if (token.length <= 3 || !token.endsWith("s") || token.endsWith("ss")) return token;
  const stem = token.slice(0, -1);
  if (known.has(stem)) return stem;
  if (token.endsWith("ies") && known.has(`${token.slice(0, -3)}y`)) return `${token.slice(0, -3)}y`;
  return token;
}

export type NormalizeOptions = {
  /** Every token the library uses, so singularisation only folds to real words. */
  knownTokens?: Set<string>;
  /** Hyphenated pairs from the library; space-separated forms fold to the same token. */
  compounds?: string[];
};

/**
 * One normaliser for both sides. Order matters and each step has a test.
 *
 * Compound folding happens BEFORE tokenising on spaces, because "push up" and "push-up" and
 * "pushup" have to become one token and only the raw text still knows they were adjacent.
 */
export function normalize(text: string, options: NormalizeOptions = {}): string[] {
  const known = options.knownTokens ?? new Set<string>();
  const compounds = options.compounds ?? BASE_COMPOUNDS;

  let working = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['‘’"“”]/g, "");

  // Aliases are expanded on the raw text too, so a compound can fold across one: "Med Ball
  // Slam" reads "medicine ball slam" and folds to the same token as the library's name. Before
  // this the token-level expansion below ran after folding and "ball" was left on its own.
  working = working.replace(/[a-z0-9]+/g, (word) => ALIASES[word] ?? word);

  // Fold the space form first, then the hyphen form; both land on the joined token.
  for (const pair of compounds) {
    const joined = compoundToken(pair);
    working = working.split(compoundKey(pair)).join(joined);
    working = working.split(pair).join(joined);
  }

  const tokens: string[] = [];
  for (const raw of working.replace(/[^a-z0-9/]+/g, " ").split(" ")) {
    if (!raw) continue;
    // A pure number longer than three digits is never part of a name (a rep count, a year, a
    // weight). "180" in Landmine 180 survives.
    if (/^\d+$/.test(raw) && raw.length > 3) continue;
    const alias = ALIASES[raw];
    if (alias) {
      for (const piece of alias.split(" ")) tokens.push(singularise(piece, known));
      continue;
    }
    tokens.push(singularise(raw, known));
  }
  return tokens;
}
