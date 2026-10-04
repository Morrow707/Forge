/** Reading-time estimate for a lesson (2026-10-04): words over a steady 200 a minute, which
 * is on the slow side of adult prose so a thirteen-year-old is not told a page is shorter
 * than it is. Markup characters are not words. */
export const WORDS_PER_MINUTE = 200;

export function countWords(text: string): number {
  return text
    .replace(/\*\*/g, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function estimateReadingMinutes(pages: { body: string }[]): number {
  const words = pages.reduce((n, p) => n + countWords(p.body ?? ""), 0);
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
