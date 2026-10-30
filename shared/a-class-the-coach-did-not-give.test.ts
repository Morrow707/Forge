import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classGateStateFor,
  chapterNeedsClassPass,
  OPEN_CLASS_ACCESS,
  type ClassAccessGate,
} from "./class-pricing-rule";

/**
 * A FREE AGENT WHO SELF-ENROLLED AND THEN JOINED A COACH READ EVERY PAID CHAPTER FREE.
 *
 * The gate was a boolean decided per ATHLETE, and it answered false for anybody with a coach --
 * sound reasoning at the time: the catalog is Free-Agent-only, so a coached athlete had no way to
 * hold a Forge enrolment their coach had not given them. Self-enrol first, join a program after,
 * and the enrolment survives the transition while the gate stops applying.
 *
 * The runtime half is server/class-pricing-rule.itest.ts, which drives the real routes against
 * real Postgres. This half is the decision on its own -- four combinations, no database -- plus
 * the scan that keeps the add-on ahead of the coach in classGateFor, which is the ordering that
 * stops the fix taking chapters away from somebody who paid for them.
 *
 * Found by the 2026-10-14 billing audit panel.
 */

const FREE_AGENT: ClassAccessGate = {
  tierGated: true,
  selfEnrolledGated: false,
  coachGivenStaysOpen: false,
};
const COACHED: ClassAccessGate = {
  tierGated: false,
  selfEnrolledGated: true,
  coachGivenStaysOpen: false,
};
/** A seat the coach PARKED for the off season (2026-10-29, shared/roster-hold.ts). Gated like a
 *  Free Agent -- they are one, for anything they would buy -- except that a class their coach
 *  gave them stays given. `classGateFor` builds exactly this from `getCoachSeatsForAthlete`. */
const HELD: ClassAccessGate = {
  tierGated: true,
  selfEnrolledGated: false,
  coachGivenStaysOpen: true,
};

const SELF = { athleteId: 7, coachId: 7 };
const GIVEN = { athleteId: 7, coachId: 42 };

describe("which paid chapters are withheld, and as what", () => {
  it("offers the add-on to a Free Agent", () => {
    expect(classGateStateFor(FREE_AGENT, SELF)).toBe("locked_tier");
  });

  it("withholds a coached athlete's SELF-enrolled class with no offer", () => {
    // Plain `locked`, not `locked_tier`: that state renders the All Classes buy card and
    // requireFreeAgent refuses that purchase to a coached athlete on both rails, so offering it
    // would be a dead button. The thing to do about this one is ask their coach.
    expect(classGateStateFor(COACHED, SELF)).toBe("locked");
  });

  it("leaves a class their coach enrolled them in wide open", () => {
    expect(classGateStateFor(COACHED, GIVEN)).toBeNull();
  });

  it("leaves everything open when nothing is gated", () => {
    expect(classGateStateFor(OPEN_CLASS_ACCESS, SELF)).toBeNull();
    expect(classGateStateFor(OPEN_CLASS_ACCESS, GIVEN)).toBeNull();
  });

  it("gates a Free Agent's enrolment whoever created it", () => {
    // A Free Agent's enrolment is always a self-enrolment today (enrollSelfInClass), but the
    // tier gate is about their PLAN and must not quietly start depending on provenance -- the
    // day a coach pre-enrols somebody who has not joined yet, their tier still decides.
    expect(classGateStateFor(FREE_AGENT, GIVEN)).toBe("locked_tier");
  });

  it("still only ever applies to a chapter past the free one in a Forge class", () => {
    // The gate says WHO; this says WHICH. A coach's own class is never gated, and chapter one of
    // a Forge class is the preview, so neither is reachable by any gate above.
    expect(chapterNeedsClassPass(1, true)).toBe(false);
    expect(chapterNeedsClassPass(2, true)).toBe(true);
    expect(chapterNeedsClassPass(9, false)).toBe(false);
  });
});

/** COMMENTS COME OFF BEFORE EVERY SOURCE SCAN BELOW, AND THIS FILE IS WHY (2026-10-29).
 *
 *  Three of the cases in this describe block were wrong in the two ways CLAUDE.md records as this
 *  repo's standing test-design traps, and the off-season roster hold is what exposed all three at
 *  once by replacing `athleteHasCoach` in `classGateFor` with a seat read that can tell a PARKED
 *  seat from no seat at all:
 *
 *  - Two cases asserted the EXACT OLD SPELLING (`athleteHasCoach`, and the literal
 *    `return { tierGated: !coached, selfEnrolledGated: coached };`), so they went RED on a change
 *    that served their purpose strictly better. "A scan that enumerates accepted forms fails on
 *    every correct change, then gets fixed by lengthening the list." They state the RULE now.
 *  - One asserted `server/storage.ts` does NOT contain `athleteHasCoach`, against raw source --
 *    and the hold's own doc comment on `getCoachesForAthlete` names that function while
 *    explaining what reads it. Prose about what the code no longer does is indistinguishable
 *    from the code still doing it.
 *  - AND THE ORDERING CASE WENT ON PASSING, on the replacement's own comment, which mentions the
 *    name it was replacing. That is the inverse and the worse half: prose turning a scan GREEN,
 *    where nothing announces it.
 *
 *  The strip is deliberately the cheap one (block comments, then `//` to end of line). It can
 *  shorten a string literal holding a `//`, which costs a false negative on a token after one;
 *  nothing these cases look for lives in a URL. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("the add-on is resolved before the coach", () => {
  const routes = readFileSync(resolve(import.meta.dirname, "../server/routes.ts"), "utf8");
  const fn = (() => {
    const at = routes.indexOf("async function classGateFor(");
    return routes.slice(at, routes.indexOf("\n}\n", at));
  })();
  const code = stripComments(fn);

  it("asks nothing about this athlete's roster until the add-on has been ruled out", () => {
    // ORDERING, and it is the half that keeps the fix from costing somebody something. All
    // Classes was sold as "the whole catalog, current and future, for any athlete on any plan or
    // with any coach", so an athlete who BOUGHT it and then joined a program keeps every
    // chapter. Asking about the coach first would gate them and take away what they paid for.
    expect(code).not.toBe("");
    expect(code).toMatch(/if \(access\.addOns\[ALL_CLASSES_ADD_ON_ID\] === true\) return OPEN_CLASS_ACCESS;/);
    // THE RULE RATHER THAN A SPELLING: no roster lookup of any name may precede that return.
    // This used to compare the index of `ALL_CLASSES_ADD_ON_ID` against the index of
    // `athleteHasCoach` -- so the 2026-10-29 hold, which replaced that call with
    // `storage.getCoachSeatsForAthlete`, would have reded it on a correct change, and in fact
    // left it GREEN on the replacement's own comment. Every way of asking about this athlete's
    // roster is a `storage.` call from here; `sportCoachAccessFor`, which is what produces
    // `access`, is not one.
    const addOn = code.indexOf("ALL_CLASSES_ADD_ON_ID");
    const firstRosterRead = code.indexOf("storage.");
    expect(addOn).toBeGreaterThan(-1);
    expect(firstRosterRead).toBeGreaterThan(-1);
    expect(addOn).toBeLessThan(firstRosterRead);
  });

  it("never returns open for an athlete who has a coach", () => {
    // The one-line mutation that restores the original bug is an early `if (coached) return
    // OPEN_CLASS_ACCESS`. Stated as a CLOSED COUNT of the opens rather than as the exact return
    // line this function happens to end with: there are exactly TWO legitimate ways out of here
    // wide open -- the caller is not an athlete, or they hold All Classes -- so a third is the
    // bug in whatever spelling somebody reaches for, and no correct rewrite of the rest can red
    // it. The literal it replaces was reded by the roster hold, which rewrote that very line.
    expect((code.match(/return OPEN_CLASS_ACCESS;/g) ?? []).length).toBe(2);
    expect(code).not.toMatch(/coached[\w]*\)\s*return OPEN_CLASS_ACCESS/);
    // And an actively coached athlete's answer is a GATE, not an open: what withholds a paid
    // chapter from them is a class they enrolled themselves in.
    expect(code).toMatch(/selfEnrolledGated: true/);
  });

  it("is the only decision point -- storage honours it and never re-derives it", () => {
    // Two copies of a three-way rule disagree silently, and the disagreement is visible only to
    // the athlete it strands. Same argument as useCameraAccess asking the server.
    //
    // THE COMMENT STRIP IS LOAD-BEARING HERE AND IS PROVEN, NOT ASSUMED: `getCoachesForAthlete`
    // in storage.ts carries a doc comment naming `athleteHasCoach` as the server-side reader of
    // its answer, so without the strip this case reds on prose describing the very separation it
    // is checking for.
    const storage = stripComments(
      readFileSync(resolve(import.meta.dirname, "../server/storage.ts"), "utf8"),
    );
    expect(storage).not.toContain("athleteHasCoach");
    expect(storage).not.toContain("ALL_CLASSES_ADD_ON_ID");
    // And both gate points resolve the state from the enrolment ROW, so what the progress read
    // reports and what the recompute activates cannot disagree.
    expect((storage.match(/classGateStateFor\(gate, enrollment\)/g) ?? []).length).toBe(2);
  });
});
