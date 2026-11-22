/**
 * THE GAMES ON A COACH'S CALENDAR, FOR SEASON SETUP (2026-11-22). Scott: season setup reads the
 * first and last game off the calendar instead of only asking for them.
 *
 * Pure, so the server's read, the step's summary line and the tests all use the same rules.
 *
 * Which calendar entries count as a game:
 *   - a Forge event labelled "Game" always does;
 *   - a Forge event labelled "Other" does when its title or its own label reads like a game;
 *   - any other Forge label (Practice, Testing, Meeting, Travel) never does, whatever its title;
 *   - an imported event (Google, Apple, Outlook) has no label, so its title decides.
 *
 * Nothing here decides anything for the coach: the result only fills the first and last game
 * fields, which stay editable, and nothing is assigned until the coach confirms.
 */

/** Words that mark a title as a game, matched as whole words, any case. */
export const GAME_TITLE_WORDS = [
  "game",
  "games",
  "vs",
  "match",
  "meet",
  "tournament",
  "scrimmage",
  "invitational",
  "playoff",
  "playoffs",
  "championship",
  "championships",
] as const;

/** Words that mark a title as something around a game rather than the game itself. */
export const NOT_A_GAME_WORDS = ["practice", "film", "meeting", "dinner", "banquet", "tickets"] as const;

/** A run of games with no gap longer than this is one season; a longer gap starts the next one. */
export const SEASON_GAP_DAYS = 56;
/** How far ahead the step looks for games. */
export const GAME_LOOKAHEAD_DAYS = 365;

const MS_PER_DAY = 86_400_000;

// "vs." or "v." as a word, read as "vs": matches "vs." in "Varsity vs. Central" and "v." in
// "JV v. Lincoln"; rejects the "v." in "Lev." (no word start before the v).
// https://regex101.com/?regex=%5Cbvs%3F%5C.&flags=gi&testString=Varsity%20vs.%20Central%0AJV%20v.%20Lincoln%0ALev.
const VS_ABBREVIATION = /\bvs?\./gi;
// Anything but a letter, digit or at sign splits words: "vs-Central" splits at "-"; "@" is kept.
// https://regex101.com/?regex=%5B%5Ea-z0-9%40%5D%2B&testString=vs-Central%20%40Lincoln
const WORD_SPLIT = /[^a-z0-9@]+/;
// An at sign that starts a word and comes before a name: matches "@ Lincoln" and "Varsity @Lincoln";
// rejects "coach@school.org" (no space before the at sign).
// https://regex101.com/?regex=(%5E%7C%5Cs)%40%5Cs*%5Ba-z0-9%5D&flags=i&testString=%40%20Lincoln%0AVarsity%20%40Lincoln%0Acoach%40school.org
const AT_OPPONENT = /(^|\s)@\s*[a-z0-9]/i;
// A calendar date, "YYYY-MM-DD": matches "2026-09-04"; rejects "9/4/2026".
// https://regex101.com/?regex=%5E%5Cd%7B4%7D-%5Cd%7B2%7D-%5Cd%7B2%7D%24&testString=2026-09-04
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function words(title: string): string[] {
  return title.toLowerCase().replace(VS_ABBREVIATION, " vs ").split(WORD_SPLIT).filter(Boolean);
}

/** True when a title reads like a game: "vs Central", "@ Lincoln", "Regional Tournament". */
export function isGameTitle(title: string | null | undefined): boolean {
  const text = (title ?? "").trim();
  if (!text) return false;
  const w = words(text);
  if (w.some((x) => (NOT_A_GAME_WORDS as readonly string[]).includes(x))) return false;
  if (w.some((x) => (GAME_TITLE_WORDS as readonly string[]).includes(x))) return true;
  return AT_OPPONENT.test(text);
}

export type GameCandidate = {
  source: "forge" | "imported";
  label: string;
  customLabel?: string | null;
  title: string;
};

/** True when a calendar entry counts as a game (the rules at the top of this file). */
export function isGameEvent(e: GameCandidate): boolean {
  if (e.source === "forge") {
    if (e.label === "game") return true;
    if (e.label !== "other") return false;
    return isGameTitle(e.title) || isGameTitle(e.customLabel);
  }
  return isGameTitle(e.title);
}

export type SeasonGame = { date: string; title: string };

export type SeasonGamesSummary = {
  /** The games of the first season found, in date order. */
  games: SeasonGame[];
  firstGameDate: string | null;
  lastGameDate: string | null;
  /** Games found after a gap longer than SEASON_GAP_DAYS, so not counted in this season. */
  laterGames: number;
};

/**
 * The first season in a list of games: from the earliest game until the first gap longer than
 * SEASON_GAP_DAYS. A fall season and a spring season on one calendar are two seasons, and the
 * coach is planning the next one. Two entries on one day with one title count once.
 */
export function summarizeSeasonGames(all: readonly SeasonGame[]): SeasonGamesSummary {
  const seen = new Set<string>();
  const sorted = [...all]
    .filter((g) => ISO_DAY.test(g.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
    .filter((g) => {
      const key = `${g.date}|${g.title.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (sorted.length === 0) return { games: [], firstGameDate: null, lastGameDate: null, laterGames: 0 };
  const gapAt = sorted.findIndex(
    (g, i) => i > 0 && (Date.parse(`${g.date}T00:00:00Z`) - Date.parse(`${sorted[i - 1].date}T00:00:00Z`)) / MS_PER_DAY > SEASON_GAP_DAYS,
  );
  const games = gapAt === -1 ? sorted : sorted.slice(0, gapAt);
  return {
    games,
    firstGameDate: games[0].date,
    lastGameDate: games[games.length - 1].date,
    laterGames: sorted.length - games.length,
  };
}

/** "Sep 4" from "2026-09-04". */
export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The one line the step shows when games were found. */
export function foundGamesLine(s: SeasonGamesSummary): string | null {
  if (s.games.length === 0 || !s.firstGameDate || !s.lastGameDate) return null;
  const n = s.games.length;
  const range = n === 1 ? `on ${shortDate(s.firstGameDate)}` : `${shortDate(s.firstGameDate)} to ${shortDate(s.lastGameDate)}`;
  return `Found ${n} game${n === 1 ? "" : "s"} on your calendar, ${range}.`;
}
