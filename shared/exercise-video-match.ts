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
  /** Set when this candidate is ONE CHAPTER of a longer video: the title is the chapter's own
   *  label, durationSeconds is the chapter's length, and the clip plays from startSeconds to
   *  endSeconds. See parseChapters. */
  startSeconds?: number;
  endSeconds?: number;
  /** The whole video's title, for a chapter; what a reviewer reads to judge the source. */
  videoTitle?: string;
};

/**
 * CHAPTERS, SO ONE ROUTINE VIDEO CAN BE MANY DEMOS (2026-11-17).
 *
 * Stretching channels post routines, not one stretch per video, so the title rule could never
 * reach a Lizard Stretch. Scott chose to read chapters: a description whose lines run
 * "0:00 Intro / 2:15 Lizard Stretch / 2:50 Pigeon Stretch" is cut into candidates titled by
 * the chapter's own label, each as long as its chapter, each played from its own start.
 *
 * YouTube's own rule for what counts as chapters, so a stray timestamp in prose is not one: at
 * least three timestamps, the first at 0:00, ascending. Each chapter must end before the video
 * does. Returns [] for anything else.
 */
export type Chapter = { label: string; startSeconds: number; endSeconds: number };

export function parseChapters(description: string, videoDurationSeconds: number): Chapter[] {
  if (!description || !(videoDurationSeconds > 0)) return [];
  const marks: Array<{ at: number; label: string }> = [];
  for (const line of description.split(/\r?\n/)) {
    const m = /^\s*(?:[-*\u2022]\s*)?\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*[-\u2013\u2014:|.)]?\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const parts = m[1].split(":").map(Number);
    const at = parts.reduce((acc, n) => acc * 60 + n, 0);
    const label = m[2].replace(/\s*[-\u2013\u2014|]\s*$/, "").trim();
    if (!label) continue;
    marks.push({ at, label });
  }
  if (marks.length < 3 || marks[0].at !== 0) return [];
  for (let i = 1; i < marks.length; i++) if (marks[i].at <= marks[i - 1].at) return [];
  if (marks[marks.length - 1].at >= videoDurationSeconds) return [];
  return marks.map((mark, i) => ({
    label: mark.label,
    startSeconds: mark.at,
    endSeconds: i + 1 < marks.length ? marks[i + 1].at : videoDurationSeconds,
  }));
}

/** The clip window a saved demo URL carries (?t= and &end=), or nulls for a whole video. */
export function clipWindowFromUrl(url: string): { start: number | null; end: number | null } {
  try {
    const u = new URL(url);
    const num = (v: string | null) => {
      if (v == null) return null;
      const n = Number(v.replace(/s$/, ""));
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
    };
    return { start: num(u.searchParams.get("t")), end: num(u.searchParams.get("end")) };
  } catch {
    return { start: null, end: null };
  }
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
