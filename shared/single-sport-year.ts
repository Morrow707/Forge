/**
 * YEAR-ROUND SINGLE SPORT (Scott, 2026-11-22): a gentle note on the COACH's athlete page when the
 * programs assigned to an athlete have been for one sport, and one sport only, for more than 8 of
 * the last 12 months. Nothing is said to the athlete and nothing is blocked.
 *
 * Why 8 months: the research review's specialization definition is "a main sport, the others
 * dropped, training more than 8 months a year", and playing more than 8 months a year was linked
 * with about twice the odds of an overuse injury. Forge's own note, not a citation.
 *
 * What counts: an assignment covers every calendar month it touches, from its start date to the
 * end of its last week (and any later day the coach moved a session to). A program with no sport
 * tag is general training and says nothing about a sport either way, so it is ignored. Two or more
 * sports in the window means no note.
 */

/** A note when one sport covers more than this many months of the window. */
export const SINGLE_SPORT_MONTHS_GUIDE = 8;
/** The window, in months, ending with the current month. */
export const SINGLE_SPORT_WINDOW_MONTHS = 12;

const ISO_MONTH_LENGTH = 7;
const ISO_DATE_LENGTH = 10;
const MONTHS_PER_YEAR = 12;
const DAYS_PER_WEEK = 7;
/** A month number written with its leading zero: "03". */
const MONTH_DIGITS = 2;

export type AssignedSpan = {
  sport: string | null | undefined;
  startDate: string;
  /** How many weeks the assignment runs in all (program weeks x repeats). */
  totalWeeks: number;
  /** The latest date any day was moved to, when later than the grid's end. */
  latestOverride?: string | null;
};

export type SingleSportNote = { sport: string; months: number; text: string };

function monthKey(iso: string): string {
  return iso.slice(0, ISO_MONTH_LENGTH);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, ISO_DATE_LENGTH);
}

/** Every YYYY-MM from `from` to `to` inclusive. */
function monthsBetween(from: string, to: string): string[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const count = (ty - fy) * MONTHS_PER_YEAR + (tm - fm) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const index = fm - 1 + i;
    const y = fy + Math.floor(index / MONTHS_PER_YEAR);
    const m = (index % MONTHS_PER_YEAR) + 1;
    return `${y}-${String(m).padStart(MONTH_DIGITS, "0")}`;
  });
}

/** The YYYY-MM months of the window ending with `today`'s month. */
export function windowMonths(today: string, months = SINGLE_SPORT_WINDOW_MONTHS): string[] {
  const [y, m] = today.split("-").map(Number);
  const startIndex = y * MONTHS_PER_YEAR + (m - 1) - (months - 1);
  const start = `${Math.floor(startIndex / MONTHS_PER_YEAR)}-${String((startIndex % MONTHS_PER_YEAR) + 1).padStart(MONTH_DIGITS, "0")}`;
  return monthsBetween(`${start}-01`, today);
}

function normalizeSport(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** The note, or null. `today` is YYYY-MM-DD. */
export function singleSportNote(spans: readonly AssignedSpan[], today: string): SingleSportNote | null {
  const window = new Set(windowMonths(today));
  const monthsBySport = new Map<string, { label: string; months: Set<string> }>();
  spans.forEach((s) => {
    const key = normalizeSport(s.sport);
    if (!key || s.startDate > today) return;
    const gridEnd = addDays(s.startDate, Math.max(1, s.totalWeeks) * DAYS_PER_WEEK - 1);
    const end = s.latestOverride && s.latestOverride > gridEnd ? s.latestOverride : gridEnd;
    const last = end > today ? today : end;
    const entry = monthsBySport.get(key) ?? { label: (s.sport ?? "").trim(), months: new Set<string>() };
    monthsBetween(monthKey(s.startDate) + "-01", last).filter((mo) => window.has(mo)).forEach((mo) => entry.months.add(mo));
    monthsBySport.set(key, entry);
  });
  const withMonths = Array.from(monthsBySport.values()).filter((e) => e.months.size > 0);
  if (withMonths.length !== 1) return null;
  const only = withMonths[0];
  if (only.months.size <= SINGLE_SPORT_MONTHS_GUIDE) return null;
  return {
    sport: only.label,
    months: only.months.size,
    text: `Programs for ${only.label} only in ${only.months.size} of the last ${SINGLE_SPORT_WINDOW_MONTHS} months. Forge's notes link more than ${SINGLE_SPORT_MONTHS_GUIDE} months a year in one sport with more overuse injuries; time in other sports or off is worth a thought.`,
  };
}
