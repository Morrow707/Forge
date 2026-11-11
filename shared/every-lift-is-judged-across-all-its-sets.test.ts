import { describe, it, expect } from "vitest";
import { ACCURACY_LEDGER } from "./accuracy-ledger";
import {
  DIALED_IN_BAND_PCT,
  DIALED_IN_MIN_SETS,
  MIN_SETS_BEFORE_A_SETTING_MOVES,
  STANDING_ON_RECORD,
  ledgerStandings,
  standingOf,
  stepVerdict,
} from "./lift-standing";

/* A LIFT IS JUDGED ACROSS EVERY SET ON RECORD, NOT ITS NEWEST ONE (Scott, 2026-11-11: "every week
 * we start high, get it dialed in, then the next week they are high again"). See
 * shared/lift-standing.ts for the three rules. This file is the ratchet on them: a change that
 * moves any lift's average over its sets goes red here with the direction in the message. */

/** The precision `liveErrorPct` is pinned to in the ledger replay. */
const PINNED_TO_PCT = 0.05;
const HALF = 0.5;
const DOUBLE = 2;

describe("every lift is judged across all its sets", () => {
  const live = ledgerStandings();

  it("every lift in the ledger has a standing on record, and nothing on record is gone", () => {
    expect(Object.keys(STANDING_ON_RECORD).sort()).toEqual(Object.keys(live).sort());
  });

  it.each(Object.keys(STANDING_ON_RECORD))("%s: its average over every set is the one on record", (lift) => {
    const was = STANDING_ON_RECORD[lift];
    const now = live[lift];
    expect(now.sets, `${lift}: a set was added or removed; re-record its standing with it`).toBe(was.sets);
    const moved = now.meanAbsPct - was.meanAbsPct;
    const direction = moved > 0
      ? `WORSE: ${was.meanAbsPct}% -> ${now.meanAbsPct}% across ${now.sets} sets. That change does not ship.`
      : `better: ${was.meanAbsPct}% -> ${now.meanAbsPct}% across ${now.sets} sets. Lock it in on record.`;
    expect(Math.abs(moved), `${lift} ${direction}`).toBeLessThanOrEqual(PINNED_TO_PCT);
  });

  it("the standing is the ledger's own pinned numbers, sign kept for the lean", () => {
    const errs = [ACCURACY_LEDGER[0].liveErrorPct, -ACCURACY_LEDGER[0].liveErrorPct];
    const s = standingOf(errs);
    expect(s.biasPct).toBe(0);
    expect(s.meanAbsPct).toBeCloseTo(Math.abs(ACCURACY_LEDGER[0].liveErrorPct), 1);
  });

  it("dialed in needs enough sets AND every one inside the band", () => {
    const inside = DIALED_IN_BAND_PCT * HALF;
    const outside = DIALED_IN_BAND_PCT + 1;
    const enough = Array.from({ length: DIALED_IN_MIN_SETS }, () => inside);
    expect(standingOf(enough).dialedIn).toBe(true);
    expect(standingOf(enough.slice(1)).dialedIn).toBe(false);
    expect(standingOf([...enough.slice(1), outside]).dialedIn).toBe(false);
  });

  it("a setting does not move on fewer sets than the rule asks for, however good it looks", () => {
    const few = Array.from({ length: MIN_SETS_BEFORE_A_SETTING_MOVES - 1 }, () => DIALED_IN_BAND_PCT + 1);
    const verdict = stepVerdict(few, few.map(() => 0));
    expect(verdict.allowed).toBe(false);
    expect(verdict.why).toContain("film more");
  });

  it("with enough sets a step must lower the average over ALL of them", () => {
    const before = Array.from({ length: MIN_SETS_BEFORE_A_SETTING_MOVES }, (_, i) => i + 1);
    // Fixes the newest set and makes the rest worse: the old way of choosing a step.
    const fitsTheNewest = before.map((e, i) => (i === before.length - 1 ? 0 : e * DOUBLE));
    expect(stepVerdict(before, fitsTheNewest).allowed).toBe(false);
    const better = before.map((e) => e * HALF);
    expect(stepVerdict(before, better).allowed).toBe(true);
  });
});
