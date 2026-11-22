/**
 * THROWING WORKLOAD (Scott, 2026-11-22): a pitcher's pitches and innings, read from ordinary
 * logged sets, beside Forge's notes from published guidance for youth pitchers. Reference text
 * only: nothing here blocks, limits or changes a program, and the athlete is shown nothing.
 *
 * HOW IT IS LOGGED, so no new screen is needed. Three library exercises (seeded by
 * server/seed-throwing-exercises.ts, Forge-official, owned by the library owner):
 *   - "Pitching (Game)": ONE SET PER INNING, reps = pitches thrown that inning. So innings is the
 *     number of sets and pitches is the sum of reps.
 *   - "Bullpen": one set, reps = pitches. Counts toward weekly pitches, never toward innings.
 *   - "Catching (Game)": one set per inning caught. Only used to notice pitching and catching in
 *     the same season.
 *
 * THE GUIDE LINES ARE FORGE'S NOTES, written from the research review (548 sources, the artifact
 * named in CLAUDE.md, 2026-11-22). They are reference numbers a coach reads, never a rule the app
 * enforces, and the app cites nothing:
 *   - more than 85 pitches in one game was linked with more injuries over a season;
 *   - more than 100 innings in a year was linked with about three and a half times the risk of a
 *     serious throwing injury;
 *   - pitching and catching in the same season was linked with about three times the risk.
 */

export const PITCHING_GAME_EXERCISE = "Pitching (Game)";
export const BULLPEN_EXERCISE = "Bullpen";
export const CATCHING_GAME_EXERCISE = "Catching (Game)";
export const THROWING_EXERCISE_NAMES = [PITCHING_GAME_EXERCISE, BULLPEN_EXERCISE, CATCHING_GAME_EXERCISE] as const;

/** A note when one game passes this many pitches. */
export const GAME_PITCHES_GUIDE = 85;
/** A note when innings over the last year pass this. */
export const YEAR_INNINGS_GUIDE = 100;
/** "The same season": pitching and catching both inside this many days. */
export const SAME_SEASON_DAYS = 120;
/** A year, in days, for the innings total. */
export const YEAR_DAYS = 365;
/** How recent a game has to be for its pitch count to raise a note on the Today card. */
export const RECENT_GAME_DAYS = 7;
/** How many weeks the coach's history shows. */
export const HISTORY_WEEKS = 16;

const ISO_DATE_LENGTH = 10;
const DAYS_IN_WEEK = 7;
const MONDAY_OFFSET_FROM_SUNDAY = 6;
const SUNDAY = 0;

/** The guide, as Forge's own reference text. Shown beside the history, never as a limit. */
export const THROWING_GUIDE_TEXT = [
  `Published guidance for youth pitchers, as Forge's notes: more than ${GAME_PITCHES_GUIDE} pitches in one game was linked with more arm injuries over a season.`,
  `More than ${YEAR_INNINGS_GUIDE} innings pitched in a year was linked with a higher risk of a serious throwing injury.`,
  "Pitching and catching in the same season was linked with a higher risk of shoulder and elbow injury.",
  "Reference only. Forge does not limit what an athlete throws; the coach decides.",
];

/** One logged set of one of the three exercises. */
export type ThrowingSet = { date: string; exerciseName: string; reps: number | null };

export type ThrowingDay = {
  date: string;
  gamePitches: number;
  gameInnings: number;
  bullpenPitches: number;
  catchingInnings: number;
};

export type ThrowingWeek = {
  /** The Monday that starts the week. */
  weekOf: string;
  pitches: number;
  gamePitches: number;
  bullpenPitches: number;
  innings: number;
  catchingInnings: number;
  /** The most pitches in one game that week. */
  topGamePitches: number;
};

export type ThrowingNote = { kind: "game_pitches" | "year_innings" | "pitch_and_catch"; text: string };

function addUtcDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, ISO_DATE_LENGTH);
}

function mondayOf(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addUtcDays(iso, day === SUNDAY ? -MONDAY_OFFSET_FROM_SUNDAY : 1 - day);
}

/** A typed reps value ("24", " 12 ") as a whole number, or null for anything else ("8-10", ""). */
export function pitchesFromReps(reps: string | number | null | undefined): number | null {
  if (typeof reps === "number") return Number.isFinite(reps) && reps >= 0 ? Math.round(reps) : null;
  const text = (reps ?? "").trim();
  // Whole digits only: "24" counts; "8-10", "AMRAP" and "" do not.
  // https://regex101.com/?regex=%5E%5Cd%2B%24&testString=24
  return /^\d+$/.test(text) ? Number(text) : null;
}

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}
const KEY = {
  game: nameKey(PITCHING_GAME_EXERCISE),
  bullpen: nameKey(BULLPEN_EXERCISE),
  catching: nameKey(CATCHING_GAME_EXERCISE),
};

/** Sets -> one row per day, oldest first. A set of an unrelated exercise is ignored. */
export function throwingDays(sets: readonly ThrowingSet[]): ThrowingDay[] {
  const days = new Map<string, ThrowingDay>();
  const dayFor = (date: string) => {
    const existing = days.get(date);
    if (existing) return existing;
    const fresh = { date, gamePitches: 0, gameInnings: 0, bullpenPitches: 0, catchingInnings: 0 };
    days.set(date, fresh);
    return fresh;
  };
  sets.forEach((s) => {
    const key = nameKey(s.exerciseName);
    const pitches = s.reps ?? 0;
    if (key === KEY.game) {
      const d = dayFor(s.date);
      d.gamePitches += pitches;
      d.gameInnings += 1;
    } else if (key === KEY.bullpen) {
      dayFor(s.date).bullpenPitches += pitches;
    } else if (key === KEY.catching) {
      dayFor(s.date).catchingInnings += 1;
    }
  });
  return Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** The last `weeks` weeks ending with the week holding `today`, oldest first, empty weeks included. */
export function throwingWeeks(days: readonly ThrowingDay[], today: string, weeks = HISTORY_WEEKS): ThrowingWeek[] {
  const thisMonday = mondayOf(today);
  return Array.from({ length: weeks }, (_, i) => addUtcDays(thisMonday, -(weeks - 1 - i) * DAYS_IN_WEEK)).map((weekOf) => {
    const end = addUtcDays(weekOf, DAYS_IN_WEEK);
    const inWeek = days.filter((d) => d.date >= weekOf && d.date < end);
    const gamePitches = inWeek.reduce((s, d) => s + d.gamePitches, 0);
    const bullpenPitches = inWeek.reduce((s, d) => s + d.bullpenPitches, 0);
    return {
      weekOf,
      pitches: gamePitches + bullpenPitches,
      gamePitches,
      bullpenPitches,
      innings: inWeek.reduce((s, d) => s + d.gameInnings, 0),
      catchingInnings: inWeek.reduce((s, d) => s + d.catchingInnings, 0),
      topGamePitches: inWeek.reduce((m, d) => Math.max(m, d.gamePitches), 0),
    };
  });
}

/** Innings pitched in the year ending `today`. */
export function inningsInLastYear(days: readonly ThrowingDay[], today: string): number {
  const from = addUtcDays(today, -YEAR_DAYS + 1);
  return days.filter((d) => d.date >= from && d.date <= today).reduce((s, d) => s + d.gameInnings, 0);
}

/**
 * The gentle notes for a coach, when a guide line is passed. Empty when nothing is. Each sentence
 * states what was logged and the guide beside it; none says what the athlete must do.
 */
export function throwingNotes(days: readonly ThrowingDay[], today: string, recentGameDays = RECENT_GAME_DAYS): ThrowingNote[] {
  const notes: ThrowingNote[] = [];
  const recentFrom = addUtcDays(today, -recentGameDays + 1);
  const bigGame = days
    .filter((d) => d.date >= recentFrom && d.date <= today)
    .reduce<ThrowingDay | null>((top, d) => (d.gamePitches > (top?.gamePitches ?? 0) ? d : top), null);
  if (bigGame && bigGame.gamePitches > GAME_PITCHES_GUIDE) {
    notes.push({
      kind: "game_pitches",
      text: `${bigGame.gamePitches} pitches in the game on ${bigGame.date}, past the ${GAME_PITCHES_GUIDE}-pitch line in Forge's notes.`,
    });
  }
  const innings = inningsInLastYear(days, today);
  if (innings > YEAR_INNINGS_GUIDE) {
    notes.push({
      kind: "year_innings",
      text: `${innings} innings pitched in the last year, past the ${YEAR_INNINGS_GUIDE}-inning line in Forge's notes.`,
    });
  }
  const seasonFrom = addUtcDays(today, -SAME_SEASON_DAYS + 1);
  const inSeason = days.filter((d) => d.date >= seasonFrom && d.date <= today);
  if (inSeason.some((d) => d.gameInnings > 0 || d.bullpenPitches > 0) && inSeason.some((d) => d.catchingInnings > 0)) {
    notes.push({
      kind: "pitch_and_catch",
      text: "Logged both pitching and catching this season. Forge's notes link that with more arm injuries.",
    });
  }
  return notes;
}
