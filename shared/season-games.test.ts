import { describe, expect, it } from "vitest";
import { SEASON_GAP_DAYS, foundGamesLine, isGameEvent, isGameTitle, summarizeSeasonGames } from "./season-games";

const MS_PER_DAY = 86_400_000;
const ISO_DATE_LENGTH = 10;
const THREE_GAMES = 3;
const TWO_LATER = 2;

describe("isGameTitle", () => {
  it.each([
    "vs Central",
    "Varsity vs. Central",
    "JV v. Lincoln",
    "@ Lincoln",
    "Varsity @Lincoln",
    "Home game",
    "GAME DAY",
    "Regional Tournament",
    "Fall Scrimmage",
    "Conference Invitational",
    "Swim meet",
    "State Playoffs",
    "District Championship",
    "Match: Eastside",
  ])("reads %j as a game", (title) => {
    expect(isGameTitle(title)).toBe(true);
  });

  it.each([
    "Practice",
    "Team dinner",
    "Team meeting",
    "Game film review",
    "Practice vs scout team",
    "Awards banquet",
    "Email coach@school.org",
    "Lift",
    "",
    "Gameplan session",
  ])("does not read %j as a game", (title) => {
    expect(isGameTitle(title)).toBe(false);
  });
});

describe("isGameEvent", () => {
  it("counts a Forge event labelled Game whatever its title", () => {
    expect(isGameEvent({ source: "forge", label: "game", title: "Friday night" })).toBe(true);
  });
  it("never counts a Forge practice, even one titled like a game", () => {
    expect(isGameEvent({ source: "forge", label: "practice", title: "vs Central walkthrough" })).toBe(false);
    expect(isGameEvent({ source: "forge", label: "travel", title: "Bus to @ Lincoln" })).toBe(false);
  });
  it("reads a Forge Other event by its title or its own label", () => {
    expect(isGameEvent({ source: "forge", label: "other", title: "vs Central" })).toBe(true);
    expect(isGameEvent({ source: "forge", label: "other", customLabel: "Scrimmage", title: "Friday" })).toBe(true);
    expect(isGameEvent({ source: "forge", label: "other", title: "Picture day" })).toBe(false);
  });
  it("reads an imported event by its title", () => {
    expect(isGameEvent({ source: "imported", label: "other", title: "Football @ Lincoln" })).toBe(true);
    expect(isGameEvent({ source: "imported", label: "other", title: "Booster club" })).toBe(false);
  });
});

describe("summarizeSeasonGames", () => {
  it("is empty with no games", () => {
    expect(summarizeSeasonGames([])).toEqual({ games: [], firstGameDate: null, lastGameDate: null, laterGames: 0 });
    expect(foundGamesLine(summarizeSeasonGames([]))).toBeNull();
  });

  it("takes the earliest and latest game of one season, sorted", () => {
    const s = summarizeSeasonGames([
      { date: "2026-10-02", title: "vs B" },
      { date: "2026-09-04", title: "vs A" },
      { date: "2026-11-06", title: "@ C" },
    ]);
    expect(s.firstGameDate).toBe("2026-09-04");
    expect(s.lastGameDate).toBe("2026-11-06");
    expect(s.games).toHaveLength(THREE_GAMES);
    expect(foundGamesLine(s)).toBe("Found 3 games on your calendar, Sep 4 to Nov 6.");
  });

  it("stops at a gap longer than the season gap and counts what is after it", () => {
    const s = summarizeSeasonGames([
      { date: "2026-09-04", title: "vs A" },
      { date: "2026-10-20", title: "vs B" },
      { date: "2027-03-20", title: "vs C" },
      { date: "2027-04-01", title: "vs D" },
    ]);
    expect(s.lastGameDate).toBe("2026-10-20");
    expect(s.laterGames).toBe(TWO_LATER);
  });

  it("keeps a gap of exactly the season gap inside the season", () => {
    const first = "2026-09-01";
    const next = new Date(Date.parse(`${first}T00:00:00Z`) + SEASON_GAP_DAYS * MS_PER_DAY).toISOString().slice(0, ISO_DATE_LENGTH);
    const s = summarizeSeasonGames([{ date: first, title: "vs A" }, { date: next, title: "vs B" }]);
    expect(s.lastGameDate).toBe(next);
  });

  it("counts the same game on two calendars once", () => {
    const s = summarizeSeasonGames([
      { date: "2026-09-04", title: "vs Central" },
      { date: "2026-09-04", title: "VS CENTRAL " },
    ]);
    expect(s.games).toHaveLength(1);
    expect(foundGamesLine(s)).toBe("Found 1 game on your calendar, on Sep 4.");
  });
});
