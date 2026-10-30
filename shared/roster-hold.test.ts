import { describe, it, expect } from "vitest";
import {
  seatIsHeld,
  seatIsBilled,
  coachMayReadSeat,
  coachMayAssignToSeat,
  seatCountsAsCoached,
  seatIsInSeason,
  heldSeatKeepsCoachGivenContent,
  billedSeats,
  heldSeats,
  seatIsDueBack,
  heldSeatRefusalMessage,
  type RosterSeatHoldState,
} from "./roster-hold";

/**
 * THE FIVE QUESTIONS A PARKED SEAT ANSWERS, CALLED RATHER THAN SCANNED.
 *
 * Scott, 2026-10-29: "we need to build a database where the coach can put the player on hold,
 * they don't get charged for it, and all of the players data remains for the coach when they come
 * back."
 *
 * These cases CALL the predicates instead of reading the source they are written with, and that
 * is the lesson `form-check-destination.ts` paid for: a scan over a decision can only see the
 * words the decision is written with, and cannot see which way the decision goes. A mutation that
 * routes one question into another's branch satisfies every spelling a scan could look for.
 *
 * The ratchet over the twenty-one `coach_athletes` query sites is the other half and lives in
 * server/every-roster-read-is-hold-aware.test.ts -- that one is a rule about the CALL SITES, which
 * no behavioural test here can reach.
 */

const ACTIVE: RosterSeatHoldState = { heldAt: null, heldUntil: null };
const PARKED: RosterSeatHoldState = { heldAt: "2026-06-01T00:00:00Z", heldUntil: "2026-08-15" };
const PARKED_NO_DATE: RosterSeatHoldState = { heldAt: new Date("2026-06-01"), heldUntil: null };

describe("the five questions a parked seat answers", () => {
  it("question 1: a parked seat is not billed, an active one is", () => {
    expect(seatIsBilled(ACTIVE)).toBe(true);
    expect(seatIsBilled(PARKED)).toBe(false);
    expect(seatIsBilled(PARKED_NO_DATE)).toBe(false);
  });

  it("question 2: the coach reads a parked athlete's history, which is the whole point", () => {
    // The one question whose answer is the other way, and the reason the feature exists. A
    // REMOVAL already preserved every row and took this away -- see athleteIsInCoachScope, where
    // the 2026-10-24 audit made a current roster seat part of being in scope.
    expect(coachMayReadSeat(PARKED)).toBe(true);
    expect(coachMayReadSeat(ACTIVE)).toBe(true);
  });

  it("question 3: nothing new is assigned to a parked seat -- reads widen, writes narrow", () => {
    expect(coachMayAssignToSeat(ACTIVE)).toBe(true);
    expect(coachMayAssignToSeat(PARKED)).toBe(false);
  });

  it("question 4: a parked athlete's own entitlements follow their own plan", () => {
    expect(seatCountsAsCoached(ACTIVE)).toBe(true);
    expect(seatCountsAsCoached(PARKED)).toBe(false);
  });

  it("question 5: a parked seat is out of the program's current views and caps", () => {
    expect(seatIsInSeason(ACTIVE)).toBe(true);
    expect(seatIsInSeason(PARKED)).toBe(false);
  });

  it("holds question 2 APART from the other four, which is why there are five names", () => {
    // THE PROPERTY A SINGLE isHeld() BOOLEAN CANNOT HAVE. Four of the five agree today; this is
    // the assertion that reds the day somebody collapses them, because collapsing them makes
    // question 2 agree too -- and a hold that hides the athlete from their coach is exactly the
    // removal this replaces. Stated as the DISAGREEMENT rather than as five separate values, so
    // it cannot be satisfied by any rewrite that keeps them all equal.
    expect(coachMayReadSeat(PARKED)).not.toBe(seatIsBilled(PARKED));
    expect(coachMayReadSeat(PARKED)).not.toBe(coachMayAssignToSeat(PARKED));
    expect(coachMayReadSeat(PARKED)).not.toBe(seatCountsAsCoached(PARKED));
    expect(coachMayReadSeat(PARKED)).not.toBe(seatIsInSeason(PARKED));
  });

  it("keeps question 4's exception, so a class the coach gave is not taken back", () => {
    // Without it, a hold locks every chapter past the first of a class the coach assigned in
    // April and draws a $19.99 buy card in front of a fifteen-year-old for content the program
    // already bought -- a withheld thing with no replacement, which Rule #1 refuses. The gate
    // that applies it is classGateStateFor; this pins that the rule has not been quietly
    // dropped to make question 4 a clean negation.
    expect(heldSeatKeepsCoachGivenContent).toBe(true);
  });
});

describe("reading a seat's state", () => {
  it("a row written before the hold existed reads as the active seat it is", () => {
    // The three columns are nullable with no default, so every pre-existing row answers null --
    // which is what makes the migration a migration of nothing. Proven against the real
    // reconciler on a non-fresh database in the server commit; this is the predicate half.
    expect(seatIsHeld({ heldAt: null })).toBe(false);
    expect(seatIsHeld({ heldAt: undefined as unknown as null })).toBe(false);
  });

  it("reads a timestamp from either a Date or the string a json response carries", () => {
    expect(seatIsHeld({ heldAt: new Date("2026-06-01") })).toBe(true);
    expect(seatIsHeld({ heldAt: "2026-06-01T00:00:00Z" })).toBe(true);
  });

  it("splits a mixed list both ways without losing anybody", () => {
    const seats = [ACTIVE, PARKED, PARKED_NO_DATE];
    expect(billedSeats(seats)).toEqual([ACTIVE]);
    expect(heldSeats(seats)).toEqual([PARKED, PARKED_NO_DATE]);
    expect(billedSeats(seats).length + heldSeats(seats).length).toBe(seats.length);
  });
});

describe("a stated return date prompts and never acts", () => {
  it("is due back on the day the coach named, and after it", () => {
    expect(seatIsDueBack(PARKED, "2026-08-15")).toBe(true);
    expect(seatIsDueBack(PARKED, "2026-09-01")).toBe(true);
  });

  it("is not due back before then", () => {
    expect(seatIsDueBack(PARKED, "2026-08-14")).toBe(false);
    expect(seatIsDueBack(PARKED, "2026-07-01")).toBe(false);
  });

  it("is never due back with no date set -- a hold with no plan is not a hold with a deadline", () => {
    expect(seatIsDueBack(PARKED_NO_DATE, "2030-01-01")).toBe(false);
  });

  it("is never due back for a seat that is not parked", () => {
    // An ACTIVE seat carrying a stale heldUntil must not read as due back: it is already back,
    // and a prompt to bring back somebody who is on the roster is a prompt about nothing.
    expect(seatIsDueBack({ heldAt: null, heldUntil: "2020-01-01" }, "2026-08-15")).toBe(false);
  });

  it("compares calendar dates as dates, not as moments", () => {
    // Both sides are YYYY-MM-DD and compare lexicographically, which is the whole reason the
    // column is `date` and the caller passes todayIso() rather than an ISO timestamp. A
    // timestamp on either side would make "due on the 15th" false all day on the 15th.
    expect(seatIsDueBack({ heldAt: "x", heldUntil: "2026-12-31" }, "2027-01-01")).toBe(true);
    expect(seatIsDueBack({ heldAt: "x", heldUntil: "2026-09-02" }, "2026-09-10")).toBe(true);
    expect(seatIsDueBack({ heldAt: "x", heldUntil: "2026-10-01" }, "2026-09-30")).toBe(false);
  });
});

describe("the refusal a write carries", () => {
  it("names the athlete, the hold and the way out of it", () => {
    const msg = heldSeatRefusalMessage("Jordan Reyes", "2026-08-15");
    expect(msg).toContain("Jordan Reyes");
    expect(msg).toContain("on hold");
    expect(msg).toContain("2026-08-15");
    // THE WAY OUT IS THE HALF THAT MAKES IT A REFUSAL RATHER THAN A WALL (Rule #1). A coach who
    // parked somebody in June has forgotten by August, and "not found" is the wrong sentence for
    // a seat sitting on their own roster screen under "On hold".
    expect(msg.toLowerCase()).toContain("bring them back");
  });

  it("still says what to do when no return date was ever set", () => {
    const msg = heldSeatRefusalMessage("Jordan Reyes", null);
    expect(msg).toContain("Jordan Reyes");
    expect(msg).toContain("on hold");
    expect(msg.toLowerCase()).toContain("bring them back");
    // No dangling "until" with nothing after it.
    expect(msg).not.toContain("until .");
    expect(msg).not.toContain("until null");
    expect(msg).not.toContain("undefined");
  });
});
