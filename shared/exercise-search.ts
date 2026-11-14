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
 * group, equipment and sports), so adding a word narrows and never widens.
 *
 * Pure and dependency-free: the picker, the library page and a test all call the same thing.
 */

export type SearchableExercise = {
  name: string;
  muscleGroup?: string | null;
  equipment?: string | null;
  sports?: string[] | null;
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
  return text
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Words nobody means anything by, and that the library drops or keeps inconsistently. */
const FILLER = new Set(["and", "the", "a", "with", "to", "of", "for", "s"]);

function words(normalized: string): string[] {
  return normalized.split(" ").filter((w) => w.length > 0);
}

/** How many single-letter edits apart, capped: anything past `max` returns max + 1. A swapped
 * neighbouring pair ("romainan") counts as one. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    rows.push([i]);
    for (let j = 1; j <= b.length; j++) {
      if (i === 0) {
        rows[0].push(j);
        continue;
      }
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2][j - 2] + 1);
      }
      rows[i].push(best);
    }
    if (Math.min(...rows[i]) > max) return max + 1;
  }
  return rows[a.length][b.length];
}

function allowedTypos(word: string): number {
  if (word.length >= 7) return 2;
  if (word.length >= 4) return 1;
  return 0;
}

/** A trailing "s" is not a different word ("squats", "curls"). */
function singular(word: string): string {
  return word.length > 2 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

/** How well one typed word matches one library word. 0 = not at all. */
function wordScore(typed: string, target: string, isLastTyped: boolean): number {
  if (typed === target || singular(typed) === singular(target)) return 3;
  // The word still being typed matches as a beginning at any length; a finished one needs two
  // letters, so "b" in the middle of a query does not match every word starting with b.
  if ((isLastTyped || typed.length >= 2) && target.startsWith(typed)) return 2;
  if (typed.length >= 4 && target.includes(typed)) return 1.5;
  const max = allowedTypos(typed);
  if (max === 0) return 0;
  if (editDistance(typed, target, max) <= max) return 1;
  // A typo in a word that is still being typed: compare against the same-length beginning.
  if (isLastTyped && target.length > typed.length) {
    if (editDistance(typed, target.slice(0, typed.length), max) <= max) return 0.8;
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
};

const indexCache = new WeakMap<object, Indexed>();

function indexOf(ex: SearchableExercise): Indexed {
  const cached = indexCache.get(ex);
  if (cached && cached.name === normalizeSearchText(ex.name)) return cached;
  const name = normalizeSearchText(ex.name);
  const nameWords = words(name);
  const joined: string[] = [];
  for (let i = 0; i + 1 < nameWords.length; i++) joined.push(nameWords[i] + nameWords[i + 1]);
  const other = [ex.muscleGroup ?? "", ex.equipment ?? "", ...(ex.sports ?? [])]
    .map(normalizeSearchText)
    .flatMap(words);
  const made: Indexed = {
    name,
    nameWords,
    nameTargets: nameWords.filter((w) => !FILLER.has(w)),
    joinedTargets: joined,
    otherTargets: other,
  };
  indexCache.set(ex, made);
  return made;
}

/** Every reading of the query: as typed, and with each nickname swapped for the library's words. */
export function queryReadings(query: string): string[] {
  const typed = normalizeSearchText(query);
  if (!typed) return [];
  const readings = new Set<string>([typed]);
  const keys = Object.keys(NICKNAMES).sort((a, b) => b.length - a.length);
  // One pass per reading is enough: nicknames expand to library words, not to other nicknames.
  for (const base of [typed]) {
    const padded = ` ${base} `;
    for (const key of keys) {
      const at = padded.indexOf(` ${key} `);
      if (at === -1) continue;
      for (const replacement of NICKNAMES[key]) {
        const swapped = (padded.slice(0, at) + ` ${replacement} ` + padded.slice(at + key.length + 2))
          .trim()
          .replace(/\s+/g, " ");
        readings.add(swapped);
      }
    }
  }
  return Array.from(readings);
}

function scoreReading(reading: string, ix: Indexed): number | null {
  const typedWords = words(reading).filter((w) => !FILLER.has(w));
  if (typedWords.length === 0) return null;
  let total = 0;
  let inName = 0;
  for (let i = 0; i < typedWords.length; i++) {
    const typed = typedWords[i];
    const last = i === typedWords.length - 1;
    let best = 0;
    for (const target of ix.nameTargets) best = Math.max(best, wordScore(typed, target, last));
    // Two name words run together ("pullup", "benchpress") match whole, or as the beginning of
    // the pair once the typing has gone past its first word. Never by typo: "squatt" is a
    // misspelt squat, not the start of "squat to".
    for (const target of ix.joinedTargets) {
      if (typed === target || singular(typed) === target) best = Math.max(best, 3);
      else if (last && typed.length >= 5 && target.startsWith(typed)) best = Math.max(best, 0.9);
    }
    if (best > 0) inName++;
    if (best < 3) {
      // Muscle group, equipment and sport count for less than the name does, and never by typo:
      // "barbel" should find barbell lifts by their names, not every exercise done with one.
      for (const target of ix.otherTargets) {
        const s = wordScore(typed, target, last);
        if (s >= 2) best = Math.max(best, s * 0.5);
      }
    }
    if (best === 0) return null;
    total += best;
  }
  let score = total / typedWords.length;
  if (ix.name === reading) score += 100;
  else if (ix.name.startsWith(reading + " ") || ix.name.startsWith(reading)) score += 20;
  else if (` ${ix.name} `.includes(` ${reading} `)) score += 10;
  // Every typed word found in the NAME beats a match leaning on muscle group or equipment.
  if (inName === typedWords.length) score += 5;
  // Between two names that match equally, the shorter is the plainer lift.
  score -= ix.nameWords.length * 0.05;
  return score;
}

/** The plain lift a query names, allowing the same typos a word is allowed ("squatt"). */
function firstChoiceFor(typed: string): string | undefined {
  if (FIRST_CHOICE[typed]) return FIRST_CHOICE[typed];
  const max = allowedTypos(typed);
  if (max === 0) return undefined;
  const near = Object.keys(FIRST_CHOICE).find((key) => editDistance(typed, key, 1) <= 1);
  return near ? FIRST_CHOICE[near] : undefined;
}

/** How well an exercise answers a query, or null when it does not. An empty query matches all. */
export function exerciseMatchScore(ex: SearchableExercise, query: string): number | null {
  const typed = normalizeSearchText(query);
  if (!typed) return 0;
  const ix = indexOf(ex);
  let best: number | null = null;
  const readings = queryReadings(query);
  for (let r = 0; r < readings.length; r++) {
    const s = scoreReading(readings[r], ix);
    if (s == null) continue;
    // The words as typed count slightly more than a nickname's expansion of them.
    const weighted = r === 0 ? s + 0.5 : s;
    if (best == null || weighted > best) best = weighted;
  }
  if (best == null) return null;
  if (firstChoiceFor(typed) === ix.name) best += 200;
  return best;
}

/** The exercises that answer the query, best first. An empty query returns the list as given. */
export function searchExercises<T extends SearchableExercise>(list: readonly T[], query: string): T[] {
  if (!normalizeSearchText(query)) return [...list];
  const scored: { ex: T; score: number; at: number }[] = [];
  list.forEach((ex, at) => {
    const score = exerciseMatchScore(ex, query);
    if (score != null) scored.push({ ex, score, at });
  });
  scored.sort((a, b) => b.score - a.score || a.ex.name.localeCompare(b.ex.name) || a.at - b.at);
  return scored.map((s) => s.ex);
}
