// AN ANSWER ALREADY PAID FOR IS NOT PAID FOR TWICE.
//
// For a model call whose whole input is the cache key: the same key returns the answer the
// first call got. It lives in this process's memory, so a deploy forgets it and the next
// request asks once more -- which costs one call, never a wrong answer. A null (the model was
// unavailable, or the answer was discarded) is never kept, so a failure is retried on the next
// request instead of being remembered as the answer.
//
// Two requests for the same key at the same moment share ONE call: the promise is what is
// stored, and it is removed again if it comes back empty or throws.

export const AI_ANSWER_CACHE_MAX_ENTRIES = 500;
export const AI_ANSWER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Entry = { at: number; value: Promise<unknown> };
const answers = new Map<string, Entry>();

export async function rememberedAiAnswer<T>(
  key: string,
  ask: () => Promise<T | null>,
  now: () => number = Date.now,
): Promise<T | null> {
  const held = answers.get(key);
  if (held && now() - held.at < AI_ANSWER_CACHE_TTL_MS) {
    // Re-inserted so the map's own order is least-recently-used first.
    answers.delete(key);
    answers.set(key, held);
    return held.value as Promise<T | null>;
  }
  const value = ask();
  answers.set(key, { at: now(), value });
  if (answers.size > AI_ANSWER_CACHE_MAX_ENTRIES) {
    const oldest = answers.keys().next().value;
    if (oldest !== undefined) answers.delete(oldest);
  }
  const forget = () => {
    if (answers.get(key)?.value === value) answers.delete(key);
  };
  try {
    const answer = await value;
    if (answer == null) forget();
    return answer;
  } catch (err) {
    forget();
    throw err;
  }
}

/** Test support: an empty cache. */
export function clearRememberedAiAnswers(): void {
  answers.clear();
}
