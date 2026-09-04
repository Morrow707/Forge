// What "today" means for one athlete.
//
// Everything dated in this app used to take the server's date, and the
// server runs in UTC. For a US athlete that day flips somewhere between 4pm
// and 7pm local, so an evening session was filed under tomorrow: the
// check-in prompt came back, the streak broke, and the nutrition day, the
// ACWR windows and the trophy counts all landed on the wrong day.
//
// Kept in shared/ rather than server/ so it can be unit-tested without a
// database, and so the client can agree with the server about what day it
// is rather than each deciding separately.

/** The UTC calendar date, which is what every caller falls back to. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The calendar date in `timeZone` right now, as YYYY-MM-DD.
 *
 * Falls back to the UTC date when the zone is null (an account that predates
 * the column, or a client that never reported one) or unrecognized (a stored
 * zone the tz database has since dropped). Falling back rather than throwing
 * is deliberate: this sits under streaks, retention and trophy counts, and a
 * bad zone should cost an athlete an hours-wide edge case, not a 500.
 *
 * en-CA because its short date format is exactly YYYY-MM-DD. Intl is doing
 * the real work -- it knows the offset on this specific date, so this stays
 * correct across a daylight-saving boundary in a way a fixed offset would
 * not.
 */
export function todayInZone(timeZone: string | null | undefined, now: Date = new Date()): string {
  if (!timeZone) return utcToday(now);
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return utcToday(now);
  }
}

/**
 * Moves a YYYY-MM-DD date by whole calendar days.
 *
 * Used for the trailing windows an athlete's numbers are computed over --
 * the ACWR acute and chronic spans, load trends, streak lookbacks. Those
 * were all built by subtracting milliseconds from Date.now() and taking the
 * UTC date of the result, which drifts against a zone-aware "today" by up to
 * a day and lands an hour out across a daylight-saving change. Counting
 * calendar days from the athlete's own today keeps the window's ends
 * consistent with its start.
 *
 * Anchored at noon UTC so a whole-day step can never be knocked into the
 * neighbouring date by an offset shift partway through the range.
 */
export function shiftIsoDate(iso: string, days: number): string {
  const at = new Date(`${iso}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}
