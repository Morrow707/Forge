/**
 * MATCHING AN EXERCISE NAME TO A VIDEO TITLE, WITHOUT THE API.
 *
 * The expensive half of the YouTube work is FINDING videos: search.list costs 100 quota units a
 * call, so 400 exercises is 40,000 units and four days of free quota. Pulling a channel's whole
 * catalogue costs 1 unit per 50 videos, so ten channels is about 100 units -- and then the
 * matching happens here, locally, for nothing.
 *
 * That is the entire reason this file exists as a pure function: the cheap path only works if
 * the matching is ours rather than Google's, and something this fiddly has to be testable
 * without a network.
 *
 * WHAT MAKES A MATCH. Exercise names and video titles describe the same movement in different
 * registers -- "Barbell Bench Press" against "How To Bench Press (PERFECT FORM)". So both sides
 * are reduced to a set of meaningful words and compared on coverage: every word of the exercise
 * name has to appear in the title. Not the other way round, because a title carries noise the
 * exercise name never will.
 *
 * FILLER WORDS ARE DROPPED FROM THE TITLE AND KEPT IN THE NAME. "How", "tutorial", "perfect",
 * "form" tell you nothing about which movement it is. But an exercise called "Close Grip Bench
 * Press" needs every one of those four words to match, or it collects the plain bench press
 * video and the athlete gets shown the wrong lift with total confidence.
 *
 * EQUIPMENT WORDS ARE LOAD-BEARING, NOT NOISE. "Dumbbell Bench Press" and "Barbell Bench Press"
 * are different exercises in this library and share three words out of four. Dropping equipment
 * words would make them indistinguishable, which is the most likely way this feature ships
 * something wrong.
 */

/** Words that appear in titles to sell the video rather than to describe the movement. */
const TITLE_FILLER = new Set([
  "how", "to", "the", "a", "an", "and", "or", "for", "with", "your", "you", "do", "doing",
  "proper", "perfect", "correct", "best", "worst", "guide", "tutorial", "exercise", "exercises",
  "workout", "training", "form", "technique", "tips", "tip", "demo", "demonstration", "part",
  "ep", "episode", "vs", "explained", "mistakes", "avoid", "stop", "why", "what", "must",
  "should", "every", "this", "that", "is", "are", "in", "on", "of", "at", "by", "from",
]);

/** Trailing-plural only, and never after an s.
 *
 * "Rows" has to meet "Row". But "Press" is not a plural, and folding it to "pres" quietly broke
 * every pressing exercise in the library -- the two sides stemmed identically so matching still
 * worked, which is exactly why it would have survived unnoticed until somebody read a term dump.
 * No English plural -s follows an s, so excluding that case costs nothing. */
function fold(word: string): string {
  if (word.length <= 3) return word;
  if (!word.endsWith("s") || word.endsWith("ss")) return word;
  return word.slice(0, -1);
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    // Punctuation, brackets, pipes and emoji all become separators. A title like
    // "Bench Press | 3 Cues (2024)" has to reduce to the same words as "bench press".
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** The exercise name's words, ALL of them kept -- see the file comment on close grip. */
export function exerciseTerms(name: string): string[] {
  // Plurals only -- see fold().
  return words(name).map(fold);
}

export function titleTerms(title: string): Set<string> {
  return new Set(
    words(title)
      .filter((w) => !TITLE_FILLER.has(w))
      .map(fold),
  );
}

export type VideoCandidate = {
  videoId: string;
  title: string;
  channel: string;
  durationSeconds: number;
  embeddable: boolean;
};

export type VideoMatch = {
  videoId: string;
  title: string;
  channel: string;
  durationSeconds: number;
  /** How much of the title was ALSO explained by the exercise name. 1 means the title says
   *  nothing the exercise name did not, which is the tightest possible match. */
  precision: number;
};

/**
 * The best video for one exercise, or null.
 *
 * SHORTEST WINS, NOT BEST-SCORING. Scott's rule, and it is the right one: "we need shorts, where
 * it gets straight to the how to, not 18 minute videos of someone talking." A 45-second demo of
 * a bench press beats a six-minute breakdown of the same lift for an athlete mid-set, every
 * time. Precision only breaks ties between videos of similar length.
 *
 * A NON-EMBEDDABLE VIDEO IS NOT A CANDIDATE. It would play nowhere inside Forge, so however well
 * it matches it is worse than leaving the search link alone.
 */
/**
 * HOW MUCH OF THE TITLE THE EXERCISE NAME HAD TO EXPLAIN.
 *
 * Found on the first real dry run, 2026-09-27. "Step-Up" reduces to step + up, and matched
 * "Ready to step up your game? Sign up for softball throwing lessons!" -- every word of the
 * exercise name WAS in that title, so the coverage rule was satisfied and the result was an
 * advert for throwing lessons filed against a lower-body lift.
 *
 * Coverage alone cannot catch that: a short name made of common words is a substring of ordinary
 * English. What separates the two cases is how much of the title is left over. "How to Perform
 * Dumbbell Triceps Kickback Exercise" says almost nothing the name did not (0.5); the softball
 * advert says nine things the name did not (0.22).
 *
 * 0.3, and it is a judgement call: "Jerk Balance | Olympic Weightlifting Exercise Library" sits
 * at 0.4 and has to survive, because that library is the single best source of short clean demos
 * in the whole run. A floor is also the SAFE direction to be wrong in -- too high loses a video
 * and leaves a working search link, too low shows an athlete the wrong movement with the
 * confidence of a chosen one.
 */
export const MIN_TITLE_PRECISION = 0.3;

export function bestVideoForExercise(
  exerciseName: string,
  candidates: VideoCandidate[],
  maxDurationSeconds: number,
): VideoMatch | null {
  const terms = exerciseTerms(exerciseName);
  if (terms.length === 0) return null;

  const matches: VideoMatch[] = [];
  for (const c of candidates) {
    if (!c.embeddable) continue;
    if (!(c.durationSeconds > 0) || c.durationSeconds > maxDurationSeconds) continue;
    const inTitle = titleTerms(c.title);
    // EVERY word of the exercise name, or it is a different exercise -- see the file comment.
    if (!terms.every((t) => inTitle.has(t))) continue;
    const precision = inTitle.size > 0 ? terms.length / inTitle.size : 0;
    if (precision < MIN_TITLE_PRECISION) continue;
    matches.push({
      videoId: c.videoId,
      title: c.title,
      channel: c.channel,
      durationSeconds: c.durationSeconds,
      precision: Math.round(precision * 100) / 100,
    });
  }
  if (matches.length === 0) return null;

  matches.sort(
    (a, b) =>
      a.durationSeconds - b.durationSeconds ||
      b.precision - a.precision ||
      a.title.localeCompare(b.title),
  );
  return matches[0];
}

/** ISO 8601 durations, which is the only format the API returns them in. */
export function parseIsoDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m;
  return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
}

/** A seeded placeholder, which is the ONLY thing the backfill may overwrite. Anything else is a
 *  URL somebody chose on purpose and replacing it would be taking their work away. */
export function isSeededSearchPlaceholder(url: string | null | undefined): boolean {
  if (!url) return true;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") === "youtube.com" && u.pathname === "/results";
  } catch {
    return false;
  }
}


/**
 * A VIDEO BELONGS TO THE EXERCISE IT DESCRIBES BEST, NOT TO WHICHEVER ASKS FIRST.
 *
 * The first real dry run (2026-09-27) matched "Barbell Wrist Curl | Olympic Weightlifting
 * Exercise Library" to the exercise BARBELL CURL. Every word of "Barbell Curl" is in that title,
 * so coverage passed and precision passed -- and the athlete would have been shown a wrist curl
 * for a bicep curl. The same shape produced "Plank" -> Star Side Plank, "Box Squat" -> Squat Box
 * Jump, "Dumbbell Curl" -> Dumbbell Spider Curl, "Push-Up" -> Scap Push-Up.
 *
 * No per-exercise rule can catch it, because nothing is wrong with the pair in isolation. What
 * is wrong is GLOBAL: Forge also has an exercise called Barbell Wrist Curl, and that video is
 * plainly its. So the assignment is decided across the whole library at once -- each video is
 * claimed by the exercise that explains the most of its title, and an exercise only keeps a
 * video no better-fitting exercise wanted.
 *
 * MORE TERMS COVERED WINS, because a longer name is a more specific claim: "Barbell Wrist Curl"
 * covers three words of that title and "Barbell Curl" two. Precision breaks ties.
 *
 * THE LOSER GETS NOTHING, NOT A SECOND-BEST. Barbell Curl ends the run on its search link, which
 * is the honest outcome -- no video in the pool was actually of a barbell curl. Handing it the
 * runner-up would put it straight back where it started.
 */
export function assignVideosToExercises(
  exerciseNames: string[],
  candidates: VideoCandidate[],
  maxDurationSeconds: number,
): Map<string, VideoMatch> {
  // Title terms are computed once per video rather than once per (video, exercise) pair: the
  // library is ~800 names against several thousand videos, and the naive order is millions of
  // redundant string splits.
  const usable = candidates
    .filter((c) => c.embeddable && c.durationSeconds > 0 && c.durationSeconds <= maxDurationSeconds)
    .map((c) => ({ video: c, inTitle: titleTerms(c.title) }));

  const termsByName = new Map(exerciseNames.map((n) => [n, exerciseTerms(n)] as const));

  type Claim = { name: string; covered: number; precision: number };
  const claims: Array<{ video: VideoCandidate; best: Claim | null; ties: Claim[] }> = [];

  for (const { video, inTitle } of usable) {
    if (inTitle.size === 0) continue;
    const fits: Claim[] = [];
    for (const [name, terms] of termsByName) {
      if (terms.length === 0) continue;
      if (!terms.every((t) => inTitle.has(t))) continue;
      const precision = terms.length / inTitle.size;
      if (precision < MIN_TITLE_PRECISION) continue;
      fits.push({ name, covered: terms.length, precision });
    }
    if (fits.length === 0) continue;
    fits.sort((a, b) => b.covered - a.covered || b.precision - a.precision);
    const top = fits[0];
    // A genuine tie means two exercises describe this title equally well -- most often a naming
    // duplicate. Giving it to neither is safer than picking by array order, which is arbitrary.
    const tied = fits.filter((f) => f.covered === top.covered && f.precision === top.precision);
    claims.push({ video, best: tied.length === 1 ? top : null, ties: tied });
  }

  const byExercise = new Map<string, VideoMatch[]>();
  for (const claim of claims) {
    if (!claim.best) continue;
    const list = byExercise.get(claim.best.name) ?? [];
    list.push({
      videoId: claim.video.videoId,
      title: claim.video.title,
      channel: claim.video.channel,
      durationSeconds: claim.video.durationSeconds,
      precision: Math.round(claim.best.precision * 100) / 100,
    });
    byExercise.set(claim.best.name, list);
  }

  const chosen = new Map<string, VideoMatch>();
  for (const [name, list] of byExercise) {
    // Shortest wins, same rule as ever -- see bestVideoForExercise.
    list.sort(
      (a, b) =>
        a.durationSeconds - b.durationSeconds ||
        b.precision - a.precision ||
        a.title.localeCompare(b.title),
    );
    chosen.set(name, list[0]);
  }
  return chosen;
}
