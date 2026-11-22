import { describe, expect, it } from "vitest";
import {
  BULLPEN_EXERCISE,
  CATCHING_GAME_EXERCISE,
  GAME_PITCHES_GUIDE,
  PITCHING_GAME_EXERCISE,
  YEAR_INNINGS_GUIDE,
  inningsInLastYear,
  pitchesFromReps,
  throwingDays,
  throwingNotes,
  throwingWeeks,
  type ThrowingSet,
} from "./throwing-workload";

const TODAY = "2027-04-14"; // a Wednesday

function game(date: string, pitchesPerInning: number[]): ThrowingSet[] {
  return pitchesPerInning.map((reps) => ({ date, exerciseName: PITCHING_GAME_EXERCISE, reps }));
}

describe("throwing workload", () => {
  it("reads reps as whole pitches only", () => {
    expect(pitchesFromReps("24")).toBe(24);
    expect(pitchesFromReps(" 12 ")).toBe(12);
    expect(pitchesFromReps("8-10")).toBeNull();
    expect(pitchesFromReps("")).toBeNull();
  });

  it("counts a game's innings as its sets and its pitches as the sum of reps", () => {
    const days = throwingDays([...game("2027-04-12", [15, 18, 20]), { date: "2027-04-13", exerciseName: BULLPEN_EXERCISE, reps: 30 }]);
    expect(days).toEqual([
      { date: "2027-04-12", gamePitches: 53, gameInnings: 3, bullpenPitches: 0, catchingInnings: 0 },
      { date: "2027-04-13", gamePitches: 0, gameInnings: 0, bullpenPitches: 30, catchingInnings: 0 },
    ]);
    const weeks = throwingWeeks(days, TODAY, 2);
    expect(weeks[1]).toMatchObject({ weekOf: "2027-04-12", pitches: 83, innings: 3, topGamePitches: 53 });
    expect(weeks[0].pitches).toBe(0);
  });

  it("says nothing under the guide lines", () => {
    expect(throwingNotes(throwingDays(game("2027-04-12", [20, 20, 20])), TODAY)).toEqual([]);
  });

  it("notes a recent game past the pitch line", () => {
    const notes = throwingNotes(throwingDays(game("2027-04-12", Array(6).fill(15))), TODAY);
    expect(GAME_PITCHES_GUIDE).toBeLessThan(90);
    expect(notes.map((n) => n.kind)).toEqual(["game_pitches"]);
  });

  it("notes a year past the innings line", () => {
    const sets = Array.from({ length: 17 }, (_, i) => game(`2027-0${1 + Math.floor(i / 6)}-${String(1 + (i % 6) * 4).padStart(2, "0")}`, Array(6).fill(5))).flat();
    const days = throwingDays(sets);
    expect(inningsInLastYear(days, TODAY)).toBeGreaterThan(YEAR_INNINGS_GUIDE);
    expect(throwingNotes(days, TODAY).map((n) => n.kind)).toContain("year_innings");
  });

  it("notes pitching and catching in the same season", () => {
    const days = throwingDays([...game("2027-03-01", [10]), { date: "2027-04-01", exerciseName: CATCHING_GAME_EXERCISE, reps: null }]);
    expect(throwingNotes(days, TODAY).map((n) => n.kind)).toEqual(["pitch_and_catch"]);
  });
});
