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
    matches.push({
      videoId: c.videoId,
      title: c.title,
      channel: c.channel,
      durationSeconds: c.durationSeconds,
      precision: inTitle.size > 0 ? Math.round((terms.length / inTitle.size) * 100) / 100 : 0,
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
