/**
 * WHAT SURVIVED THE V2 MATCHER: the two helpers that were never the problem.
 *
 * This file used to hold the word-set matcher -- coverage plus a precision ratio. It has been
 * replaced by exercise-signature-match.ts, which parses both sides into slots, because no
 * version of a ratio could tell a harmless extra title word ("Triceps" in "Dumbbell Triceps
 * Kickback") from one that changes the movement ("Kettlebell" in "Kettlebell Sumo Deadlift").
 * Loose, it took the wrong videos; strict, it threw away three channels holding 3,900 videos.
 *
 * The matcher is deleted rather than left beside the new one. A second matcher nobody calls is
 * the failure CLAUDE.md records twice -- code that reads as working because it is still there.
 * Its fixtures were not lost: every wrong match it produced is a row in
 * exercise-signature-match.test.ts, asserted against the parser that now refuses it.
 *
 * What remains is the duration parser and the placeholder test, neither of which had anything to
 * do with matching.
 */

export type VideoCandidate = {
  videoId: string;
  title: string;
  channel: string;
  durationSeconds: number;
  embeddable: boolean;
};

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
