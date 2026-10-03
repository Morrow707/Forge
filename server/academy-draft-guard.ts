/** THE DRAFT IS IN FORGE'S WORDS, NEVER THE BOOK'S.
 *
 * A Coaches Corner lesson drafted from the knowledge library teaches what a source teaches, in
 * its own words, with a citation under it. It never reproduces the source. The model is told
 * so; this is the check that the instruction held, because a prompt is a request and a sale is
 * a sale (docs/legal-open-questions.md, question 12).
 *
 * The rule is a longest shared run of words: a lesson that shares more than
 * MAX_SHARED_RUN_WORDS consecutive words with any passage it was drafted from is refused, and
 * the admin is told which lesson and how long the run was. Twelve words is long enough that
 * "the athlete's rate of force development" (a phrase any coach would write) passes, and short
 * enough that a lifted sentence does not. Punctuation and case are ignored so a copied sentence
 * with a comma moved is still a copied sentence. */

export const MAX_SHARED_RUN_WORDS = 12;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Longest run of consecutive words `candidate` shares with `source`, in words. */
export function longestSharedRun(candidate: string, source: string): number {
  const a = words(candidate);
  const b = words(source);
  if (a.length === 0 || b.length === 0) return 0;
  // Index every 4-gram of the source; extend each hit forward. Linear in practice.
  const K = 4;
  const index = new Map<string, number[]>();
  for (let j = 0; j + K <= b.length; j++) {
    const key = b.slice(j, j + K).join(" ");
    const list = index.get(key);
    if (list) list.push(j);
    else index.set(key, [j]);
  }
  let best = 0;
  for (let i = 0; i + K <= a.length; i++) {
    const hits = index.get(a.slice(i, i + K).join(" "));
    if (!hits) continue;
    for (const j of hits) {
      let n = K;
      while (i + n < a.length && j + n < b.length && a[i + n] === b[j + n]) n++;
      if (n > best) best = n;
    }
  }
  return best;
}

export type VerbatimFinding = { lessonIndex: number; run: number; sourceLabel: string };

/** The first lesson that copies a passage, or null when every lesson is in its own words. */
export function findVerbatimLesson(
  lessons: { content: string; title: string }[],
  passages: { text: string; label: string }[],
  max = MAX_SHARED_RUN_WORDS,
): VerbatimFinding | null {
  for (let i = 0; i < lessons.length; i++) {
    const text = `${lessons[i].title}\n${lessons[i].content}`;
    for (const p of passages) {
      const run = longestSharedRun(text, p.text);
      if (run > max) return { lessonIndex: i, run, sourceLabel: p.label };
    }
  }
  return null;
}
