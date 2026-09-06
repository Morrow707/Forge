import { todayInZone } from "@shared/athlete-day";

// The client's half of shared/athlete-day.ts.
//
// The server already stopped filing an evening session under tomorrow by
// asking what day it is in the athlete's own zone. The client kept deciding
// separately, and it decided with `todayIso()` --
// which is the UTC date. For a US athlete that flips somewhere between 4pm
// and 7pm local, so a form defaulted to tomorrow, a "today" comparison
// stopped matching, and a `max` bound on a date input let the athlete pick a
// day that had not started yet.
//
// The browser's own zone is the athlete's zone here (it is what the app
// reports to the server for the stored timeZone column in the first place),
// so these route through the same todayInZone the server uses rather than
// re-deriving the rule.

/** The IANA zone the browser is running in, or null if it cannot be read. */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Today's calendar date in the browser's zone, as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return todayInZone(browserTimeZone(), now);
}

/**
 * A specific instant's calendar date in the browser's zone, as YYYY-MM-DD.
 * The counterpart to todayIso for a date that is not now -- a range endpoint,
 * a stored timestamp being bucketed into a day.
 */
export function localIsoDate(date: Date): string {
  return todayInZone(browserTimeZone(), date);
}
