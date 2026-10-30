import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * EVERY `coach_athletes` QUERY IS CLASSIFIED, AND A NEW ONE FAILS UNTIL SOMEBODY CLASSIFIES IT.
 *
 * Added 2026-10-29 with the off-season hold. `coach_athletes` is queried from 24 methods across
 * 31 sites in storage.ts, and **a hold flag that only half of them read is worse than no hold at
 * all**: it would bill a parked seat on some paths and not others, with nothing on any screen to
 * show the difference. That is the defect shape CLAUDE.md has recorded eight times -- a correction
 * wired to one of two paths, invisible because the path that IS taken looks like it worked.
 *
 * THE DIRECTION IS THE POINT, and it is the lesson `parental_notice` and the upload-directory
 * list each cost a separate bug. This does NOT iterate a list of sites that were fixed -- such a
 * list cannot fail for a site nobody put on it, which is exactly the omission it would look like
 * it covered. It DISCOVERS every query from the source, derives the hold-aware ones from the code
 * (a body that reads `heldAt`), and requires every remaining one to be listed below with a reason.
 * The 25th query added next year is a failure on the day it is written.
 *
 * The behavioural half is shared/roster-hold.test.ts (the five questions, called rather than
 * scanned) and server/an-off-season-hold.itest.ts (the real routes on real Postgres). This half
 * is a rule about the CALL SITES, which neither of those can reach.
 */

const storageSrc = readFileSync(resolve(import.meta.dirname, "./storage.ts"), "utf8");

/** Comments off before anything is matched. A NEGATIVE assertion over raw source cannot tell
 *  prose about what the code no longer does from the code still doing it, and the comment
 *  explaining a fix is exactly where the old form gets quoted -- CLAUDE.md calls this the most
 *  repeated self-inflicted failure in this repo. Newlines are preserved inside stripped blocks so
 *  reported line numbers stay usable.
 *
 *  **AND IT IS DEFENSIVE TODAY RATHER THAN LOAD-BEARING -- SAID, NOT IMPLIED.** Removing the
 *  strip was mutation-tested and changed nothing: every negative assertion in this file bounds to
 *  a method's own BODY, and no body currently holds a comment naming `heldAt` (the long docblock
 *  arguing that getStaffRosterAthleteIds deliberately includes parked seats sits ABOVE its
 *  signature, outside the bound). Six other mutations are each caught by the right case; this one
 *  is not, and the strip stays because the next assertion added here will not know that -- the
 *  sibling scan in shared/a-class-the-coach-did-not-give.test.ts reads a whole FILE and reds
 *  without it. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) ?? []).length))
    .replace(/\/\/[^\n]*/g, "");
}

const code = stripComments(storageSrc);

/** A storage method's own body, bounded by MATCHING ITS OWN BRACKETS and never by a character
 *  count (CLAUDE.md: a fixed window fails for prose and, worse, PASSES for a match that belongs
 *  to an unrelated method further down the file).
 *
 *  TWO TRAPS THIS AVOIDS, BOTH RECORDED IN CLAUDE.md AS PAID FOR TWICE:
 *  - "the next `{` after the name" lands inside a `params: { ... }` PARAMETER TYPE.
 *  - and inside a `Promise<{ ... }>` RETURN TYPE, which holds none of the code. So the signature's
 *    parens are matched first, and then the first `{` at angle-bracket depth zero. Half of
 *    storage.ts's methods carry such a return type, so without this the classification would read
 *    type annotations and call them bodies. */
function methodBodies(src: string): { name: string; start: number; end: number; body: string }[] {
  const name = /^ {2}(?:async\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>\n]*>)?\(/gm;
  const out: { name: string; start: number; end: number; body: string }[] = [];
  for (const m of src.matchAll(name)) {
    let i = src.indexOf("(", m.index);
    let depth = 0;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) break;
    }
    let angle = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "<") angle++;
      else if (c === ">") angle = Math.max(0, angle - 1);
      else if (c === "{" && angle === 0) break;
    }
    const start = i;
    depth = 0;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) {
        i++;
        break;
      }
    }
    out.push({ name: m[1], start, end: i, body: src.slice(start, i) });
  }
  return out;
}

const methods = methodBodies(code);

/** Every way storage reaches the table, read or write. */
const QUERY_SITE =
  /(?:\.from|innerJoin|leftJoin|\.update|\.insert|\.delete)\(coachAthletes|db\.query\.coachAthletes|tx\.(?:update|insert|delete)\(coachAthletes/g;

/** Each site attributed to the INNERMOST method whose body contains it, so a query inside a
 *  nested callback (claimRosterSeat's transaction) is credited to the method it is written in
 *  rather than to an enclosing one. */
function methodOwning(index: number): string | null {
  let best: { name: string; start: number } | null = null;
  for (const m of methods) {
    if (m.start <= index && index < m.end && (!best || m.start > best.start)) {
      best = { name: m.name, start: m.start };
    }
  }
  return best?.name ?? null;
}

const sitesByMethod = new Map<string, number>();
for (const s of code.matchAll(QUERY_SITE)) {
  const owner = methodOwning(s.index);
  if (!owner) continue;
  sitesByMethod.set(owner, (sitesByMethod.get(owner) ?? 0) + 1);
}

const bodyOf = (name: string) => methods.find((m) => m.name === name)?.body ?? "";

/** HOLD-AWARE IS DERIVED FROM THE CODE, never declared: a method whose body reads `heldAt` has
 *  decided. Declaring it instead would let a classification be a lie. */
const holdAware = [...sitesByMethod.keys()].filter((n) => bodyOf(n).includes("heldAt")).sort();

/**
 * THE METHODS THAT DELIBERATELY SEE EVERY SEAT, PARKED OR NOT, each with the reason.
 *
 * Adding an entry costs a sentence that shows up in a grep -- the same shape as
 * `NOT_PUBLIC_ON_PURPOSE` and `FITTED_OVERRIDES`. **Most of these need no filter for one measured
 * reason rather than by oversight:** they INNER JOIN the activity they report on, so a parked
 * athlete generates no rows either way, and filtering them would be worse than neutral -- an
 * athlete who did train or did check in produced real data their coach should see.
 */
const SEES_EVERY_SEAT: Record<string, string> = {
  getStaffRosterAthleteIds:
    "QUESTION 2, AND THE ONE THAT MUST NEVER FILTER. Every coach read in the app resolves through " +
    "athleteIsInCoachScope / athleteIdsInCoachScope and both resolve through this, so a parked " +
    "athlete staying in it is what keeps their analytics, history, leaderboard rows, recent PRs, " +
    "calendar and training-history export readable. Filtering here reproduces exactly what a " +
    "REMOVAL does, which is the thing the hold exists to avoid.",
  getRosterWellnessToday:
    "Inner-joins wellness_checkins, so a parked athlete who did not check in contributes no row " +
    "and one who did produced a real reading their coach should see. Filtering would change " +
    "nothing except to hide that reading.",
  getRosterFlaggedTrend:
    "Same inner join as getRosterWellnessToday over a week rather than a day, and correct for the " +
    "same reason: it counts check-ins that exist, never roster members who owe one.",
  getRosterAcwrSummary:
    "Inner-joins workout_logs through to set entries, so a parked athlete with no sessions " +
    "contributes nothing; if they did train, the acute:chronic read is real and is theirs.",
  getRosterLoadTrend:
    "Inner-joins workout_logs exactly as getRosterAcwrSummary does -- it sums load that was " +
    "logged, so an absent athlete is absent rather than counted as a zero.",
  removeAthleteFromCoach:
    "A PARKED SEAT IS STILL REMOVABLE, deliberately: a hold is for an athlete coming back and a " +
    "removal is for one who is not, so a coach who parked a squad in June must be able to remove " +
    "the five who graduated without first bringing them back onto the bill.",
  pruneTeamMembershipsAfterStaffSplit:
    "About whose staff an athlete belongs to, which is orthogonal to whether their seat is " +
    "parked. Narrowing it would stop cleaning up for a parked athlete and leave them an orphaned " +
    "team member nobody can see or remove through the roster.",
  setAthleteGroup:
    "A roster group is a LABEL, not an assignment, so question 3 does not reach it -- and the " +
    "roster screen lists parked athletes in their own section, so re-grouping one before the " +
    "season starts is a thing a coach legitimately does.",
};

describe("every coach_athletes query has decided about the hold", () => {
  it("found the queries at all -- the scan is the whole guard, so it cannot be silently empty", () => {
    // A bounding bug that matches nothing turns every case below green. CLAUDE.md records a
    // brace matcher that followed a brace-LESS loop body hundreds of lines to the wrong place;
    // the floor is what makes that loud.
    expect(methods.length).toBeGreaterThan(200);
    expect(sitesByMethod.size).toBeGreaterThanOrEqual(24);
    expect([...sitesByMethod.values()].reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(31);
  });

  it("classifies every one of them -- hold-aware by its code, or listed with a reason", () => {
    const unclassified = [...sitesByMethod.keys()]
      .filter((n) => !holdAware.includes(n) && !(n in SEES_EVERY_SEAT))
      .sort();
    expect(unclassified,
      "These storage methods query coach_athletes and neither read `heldAt` nor appear in " +
        "SEES_EVERY_SEAT. Decide which: filter the hold (shared/roster-hold.ts says which of the " +
        "five questions applies), or add an entry saying why this one must see parked seats too.",
    ).toEqual([]);
  });

  it("keeps the two sets disjoint, so nothing is both filtered and exempted", () => {
    const both = holdAware.filter((n) => n in SEES_EVERY_SEAT).sort();
    expect(both).toEqual([]);
  });

  it("makes every exemption cost a real sentence", () => {
    // Eighty characters, the same bar NOT_PUBLIC_ON_PURPOSE sets: enough that "n/a" or "not
    // needed" is not an exemption, and the reason shows up in a grep.
    for (const [name, reason] of Object.entries(SEES_EVERY_SEAT)) {
      expect(reason.length, `${name}'s exemption needs a real reason`).toBeGreaterThan(80);
    }
  });

  it("lists nothing that no longer queries the table", () => {
    // A rotted exemption is how this file comes to certify a method that was deleted or rewritten.
    const stale = Object.keys(SEES_EVERY_SEAT).filter((n) => !sitesByMethod.has(n)).sort();
    expect(stale).toEqual([]);
  });
});

describe("the three rules the hold would be broken without", () => {
  it("the billed-seat count filters the hold -- this is the one that moves money", () => {
    // Question 1, and the only place a hold reaches the bill: getBilledAthleteCountForCoach is
    // max(this, plannedAthleteCount) and the band is derived from it.
    expect(bodyOf("getRosterSeatCountForCoach")).toMatch(/isNull\(coachAthletes\.heldAt\)/);
  });

  it("the Free Agent predicate filters the hold -- this is the one that decides question 4", () => {
    // Both sides of the app resolve "does this athlete have a coach" through getCoachesForAthlete:
    // the server via athleteHasCoach, the client via useIsFreeAgent -> /api/athlete/coaches. One
    // WHERE clause, and every derived answer downstream follows it in both directions.
    expect(bodyOf("getCoachesForAthlete")).toMatch(/isNull\(coachAthletes\.heldAt\)/);
  });

  it("the scope helper does NOT filter the hold -- the coach keeps every read", () => {
    // THE FORBIDDEN FORM, and the direction whose absence would break the whole feature while
    // leaving every other case here green. Comments are stripped, which matters: the method's own
    // docblock explains at length that holds are deliberately included.
    expect(bodyOf("getStaffRosterAthleteIds")).not.toContain("heldAt");
    expect(bodyOf("getStaffRosterAthleteIds")).not.toBe("");
  });
});

describe("the hold columns have exactly the writers they were given", () => {
  /** Discovered from the source, never listed: a `heldAt` write is `heldAt: null` (lifting) or
   *  `heldAt: new Date()` (parking). */
  const writers = methods
    .filter((m) => /heldAt:\s*(?:null|new Date\(\))/.test(m.body))
    .map((m) => m.name)
    .sort();

  it("is the two writers plus the two join paths that lift a hold, and nothing else", () => {
    // holdAthlete / unholdAthlete are the pair; linkAthleteToCoach and claimRosterSeat LIFT a
    // hold rather than returning the parked row, which is how an athlete who types the coach code
    // in August lands straight back on their own history. A fifth writer is a second place this
    // fact lives, which is the billing sweep's whole lesson.
    expect(writers).toEqual([
      "claimRosterSeat",
      "holdAthlete",
      "linkAthleteToCoach",
      "unholdAthlete",
    ]);
  });

  it("writes every one of the staff's links, so holding one row of two cannot look like success", () => {
    // One row per coach-athlete LINK and a staff has several coaches, so an athlete whom two of
    // them linked has two rows -- and ANY active link is an active seat. Scoping either writer to
    // a single coachId would leave the athlete billed, coached and off the "On hold" list while
    // the coach's button reported success. Both resolve the whole staff.
    for (const name of ["holdAthlete", "unholdAthlete"]) {
      expect(bodyOf(name), name).toMatch(/inArray\(coachAthletes\.coachId, coachIds\)/);
      expect(bodyOf(name), name).not.toMatch(/eq\(coachAthletes\.coachId/);
    }
  });

  it("checks team scope before parking or lifting, so a narrowed coach cannot reach past it", () => {
    for (const name of ["holdAthlete", "unholdAthlete"]) {
      expect(bodyOf(name), name).toContain("athleteIsInCoachScope");
    }
  });
});

describe("nothing new lands on a parked seat", () => {
  it("guards the assignment MECHANISM rather than the routes that reach it", () => {
    // createAssignment has four call sites and createSkillAssignment its own; guarding the routes
    // is how the fifth one added next year misses it. Both writers call the assertion in the same
    // loop that already fails closed for a minor with no guardian.
    for (const name of ["createAssignment", "createSkillAssignment"]) {
      expect(bodyOf(name), name).toContain("assertSeatIsNotHeld");
      expect(bodyOf(name), name).toContain("assertMinorHasActiveGuardian");
    }
  });

  it("never refuses an athlete assigning their own program", () => {
    // An athlete self-assigning passes their OWN id as the coach, and a parked athlete is a Free
    // Agent who may still build and self-assign -- refusing them here would take away the one
    // thing the off season leaves them, for a reason that is about their coach.
    expect(bodyOf("assertSeatIsNotHeld")).toMatch(/requestedBy === athleteId/);
  });

  it("refuses only for a hold, leaving 'not your athlete' to the check that owns it", () => {
    // An athlete who is not on this staff's roster at all is a different refusal; widening this
    // would turn every one of those into a sentence about a hold.
    expect(bodyOf("assertSeatIsNotHeld")).toMatch(/seats\.length === 0/);
    // ANY active link is an active seat -- the same rule getCoachesForAthlete applies, so one
    // staff cannot disagree with itself about whether an athlete may be assigned to.
    expect(bodyOf("assertSeatIsNotHeld")).toMatch(/seats\.some\(/);
  });
});
