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

/** HOLD-AWARE IS DERIVED FROM THE CODE, never declared: a method has decided if its body reads
 *  `heldAt` ITSELF, or if it resolves the roster through `getRosterForCoach`, which filters parked
 *  seats for every caller (see its docblock in storage.ts).
 *
 *  THE SECOND CLAUSE IS NOT A LOOPHOLE AND THE SPELLING IS WHAT MAKES IT SAFE:
 *  `getRosterForCoachIncludingHeld(` does NOT contain the substring `getRosterForCoach(`, because
 *  the name runs on before the paren -- so a method that deliberately asks for parked seats cannot
 *  be certified hold-aware by this line and lands in the unclassified list instead. That is the
 *  one property of the pair's naming this test depends on, so it is asserted directly below rather
 *  than left to be noticed.
 *
 *  WHAT THIS CLAUSE DOES NOT CERTIFY, said plainly: delegation vouches for the ROSTER read only.
 *  A method can resolve the roster through the filtered helper and still run a coach_athletes
 *  query of its own that sees every seat -- `getCoachWeeklyDigest` is exactly that shape, and the
 *  reason its own query needs no filter (it inner-joins the check-ins it counts) is argued in its
 *  body and pinned by a named case below. A second method of that shape wants the same treatment,
 *  not a wider regex. */
const RESOLVES_THROUGH_FILTERED_ROSTER = /\bgetRosterForCoach\(|\bseatIsInSeason\(|\bbilledSeats\(/;
const holdAware = [...sitesByMethod.keys()]
  .filter((n) => bodyOf(n).includes("heldAt") || RESOLVES_THROUGH_FILTERED_ROSTER.test(bodyOf(n)))
  .sort();

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

/**
 * AND THE HALF THAT WOULD HAVE CAUGHT THE DEFECT THIS FILE'S FIRST VERSION SHIPPED WITH.
 *
 * Added 2026-10-30, before the hold was pushed. The block above discovers every `coach_athletes`
 * QUERY SITE and classifies it, and it passed on all 24 methods -- while **33 callers one hop
 * downstream read the roster through `getRosterForCoach` and not one of them read the flag.** A
 * scan over the queries cannot see a caller of a query, which is the same blind spot in a new
 * costume: `parental_notice` was invisible to a scan that iterated the set it was meant to police,
 * and the upload-directory list could not fail for a directory nobody added.
 *
 * What it cost is measured in `getRosterForCoach`'s own docblock: a guaranteed push AND email to
 * every parked athlete each time a coach tapped Nudge, "practice moved" announcements all off
 * season with `bypassEmailPref` set, guardians mailed, and sixty parked athletes listed as
 * "hasn't logged a workout" with a Send Nudge button on each. A sent email cannot be taken back.
 *
 * SO THE DEFAULT MOVED RATHER THAN THE CALL SITES: `getRosterForCoach` filters, and asking for the
 * parked seats means naming `getRosterForCoachIncludingHeld`, which this block holds to a stated
 * reason. The rule is about the EXCEPTION, never a list of the sites that were fixed -- the 12th
 * exception added next year fails here the day it is written, and an unclassified caller that
 * nobody thought about is SAFE rather than sending mail.
 */
describe("asking for the parked seats costs a sentence", () => {
  const FILES = ["./storage.ts", "./routes.ts"] as const;
  const raw = new Map(
    FILES.map((f) => [f, readFileSync(resolve(import.meta.dirname, f), "utf8")] as const),
  );

  /** THE ONE PROPERTY OF THE PAIR'S NAMING THE BLOCK ABOVE RESTS ON, asserted rather than
   *  noticed. If the variant were ever renamed to `getRosterForCoach(opts)` or
   *  `getRosterForCoach({ includingHeld: true })`, `RESOLVES_THROUGH_FILTERED_ROSTER` would
   *  certify every deliberate see-every-seat caller as hold-aware and this whole file would go
   *  quietly green on the bug it exists for. */
  it("cannot certify the including-held variant as hold-aware by accident", () => {
    expect("getRosterForCoachIncludingHeld(".includes("getRosterForCoach(")).toBe(false);
    expect(RESOLVES_THROUGH_FILTERED_ROSTER.test("await this.getRosterForCoachIncludingHeld(id)")).toBe(
      false,
    );
    expect(RESOLVES_THROUGH_FILTERED_ROSTER.test("await this.getRosterForCoach(id)")).toBe(true);
  });

  /** Call sites, comments LEFT IN on purpose: the reason is the thing being checked, so this is
   *  the one scan in the file that reads raw source. The DEFINITION and the one line inside
   *  `getRosterForCoach` that delegates to it are not callers. */
  function callSites(file: (typeof FILES)[number]) {
    const src = raw.get(file)!;
    const lines = src.split("\n");
    const out: { line: number; reason: string }[] = [];
    lines.forEach((l, i) => {
      if (!/getRosterForCoachIncludingHeld\(/.test(l)) return;
      if (/^\s*(?:\*|\/\/)/.test(l)) return; // prose about it is not a call
      if (/^\s*async getRosterForCoachIncludingHeld\(/.test(l)) return; // the definition
      // AND THE FILTER ITSELF IS NOT AN EXCEPTION. `getRosterForCoach` calls the variant and
      // filters its result -- that line IS the mechanism this block polices, so demanding a
      // "why must this see parked seats" sentence there would be asking the filter to justify
      // reading the thing it filters. Excluded by OWNER rather than by matching the line's text,
      // so rewriting the delegation cannot slip a second caller in beside it.
      let owner = "";
      for (let j = i - 1; j >= 0; j--) {
        const m = lines[j].match(/^  async ([A-Za-z0-9_]+)\s*\(/);
        if (m) {
          owner = m[1];
          break;
        }
      }
      if (owner === "getRosterForCoach") return;
      // The reason is the unbroken run of comment lines directly above the statement.
      const reason: string[] = [];
      for (let j = i - 1; j >= 0; j--) {
        const t = lines[j].trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) {
          reason.unshift(t.replace(/^(?:\/\/|\*\/?|\/\*\*?)\s*/, ""));
          continue;
        }
        break;
      }
      out.push({ line: i + 1, reason: reason.join(" ").trim() });
    });
    return out;
  }

  const sites = FILES.flatMap((f) => callSites(f).map((s) => ({ file: f, ...s })));

  it("found the callers at all -- a scan that matches nothing turns the rest of this green", () => {
    // CLAUDE.md records a brace matcher that silently found nothing and a comment strip that ate
    // half of routes.ts; the floor is what makes either one loud instead of reassuring.
    expect(sites.length).toBeGreaterThanOrEqual(16);
    expect(new Set(sites.map((s) => s.file)).size).toBe(2);
  });

  it("makes every one of them say why it must see a parked seat", () => {
    const unexplained = sites
      .filter((s) => !/INCLUDING HELD/.test(s.reason) || s.reason.length <= 80)
      .map((s) => `${s.file.slice(2)}:${s.line}`);
    expect(
      unexplained,
      "These call `getRosterForCoachIncludingHeld` with no reason above them. A caller wants the " +
        "parked seats for exactly one of three reasons (see the method's docblock): it SPLITS the " +
        "list itself, it is a VISIBILITY set for a read, or it is a MEMBERSHIP check whose " +
        "refusal must come from assertSeatIsNotHeld. Anything else wants plain getRosterForCoach.",
    ).toEqual([]);
  });

  /** THE FOUR SURFACES THAT SEND, named rather than derived, because what makes them the hazard is
   *  that they DELIVER something -- a push, an email, a guardian's email -- and a scan cannot see
   *  that a notifyUser downstream of a list is irreversible. Each must resolve the plain,
   *  filtered roster; switching any of them back to the including-held variant reds this. */
  it("keeps every sending surface on the filtered roster", () => {
    const routes = stripComments(raw.get("./routes.ts")!);
    // THE VERB IS PART OF THE KEY, and the first draft of this case left it out. Both team-board
    // paths are registered TWICE -- a GET that reads the posts and a POST that broadcasts them --
    // so `indexOf(path)` found the GET, which touches no roster, and the case went red on correct
    // code while being structurally unable to check the handler it was written for. **"The next
    // occurrence of a string" is not "the thing I meant"**, which is the character-window lesson
    // with a different ruler: a path is not an identifier, a path plus a verb is.
    for (const path of [
      'app.post("/api/coach/roster/nudge-wellness"',
      'app.post(\n    "/api/coach/legal-documents/:type/email-roster"',
      'app.post("/api/coach/team-board"',
      'app.post("/api/athlete/team-board"',
    ]) {
      const at = routes.indexOf(path);
      expect(at, `${path} is not a registered route any more`).toBeGreaterThan(-1);
      // Bounded by the next route registration, which is what "this handler" means -- never a
      // character window (CLAUDE.md: a fixed window also PASSES for a match belonging to an
      // unrelated handler further down the file).
      const next = routes.slice(at + path.length).search(/\n  app\.(?:get|post|patch|put|delete)\(/);
      const handler = routes.slice(at, next === -1 ? undefined : at + path.length + next);
      expect(handler, `${path} reads the roster and does not send to a parked athlete`).toMatch(
        /getRosterForCoach\(/,
      );
      expect(handler, `${path} must not ask for parked seats -- it DELIVERS`).not.toMatch(
        /getRosterForCoachIncludingHeld\(/,
      );
    }
  });

  /** `getCoachWeeklyDigest` is the one method certified hold-aware BY DELEGATION that also runs a
   *  coach_athletes query of its own, so the thing delegation does not vouch for is pinned here:
   *  its own query inner-joins the check-ins it counts, which is why it needs no filter. */
  it("pins the one method whose own query delegation does not vouch for", () => {
    const body = bodyOf("getCoachWeeklyDigest");
    expect(body).toMatch(/getRosterForCoach\(/);
    expect(body).toMatch(/innerJoin\(wellnessCheckins/);
    // And its missed-workout denominator takes the filtered list straight through: a second
    // filter over an already-filtered list is a claim the first one might not have run.
    expect(body).not.toMatch(/filter\(\s*\(a\)\s*=>\s*a\.heldAt/);
  });
});
