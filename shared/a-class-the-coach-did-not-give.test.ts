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

const FREE_AGENT: ClassAccessGate = { tierGated: true, selfEnrolledGated: false };
const COACHED: ClassAccessGate = { tierGated: false, selfEnrolledGated: true };

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

describe("the add-on is resolved before the coach", () => {
  const routes = readFileSync(resolve(import.meta.dirname, "../server/routes.ts"), "utf8");
  const fn = (() => {
    const at = routes.indexOf("async function classGateFor(");
    return routes.slice(at, routes.indexOf("\n}\n", at));
  })();

  it("returns open on the add-on without ever asking about a coach", () => {
    // ORDERING, and it is the half that keeps the fix from costing somebody something. All
    // Classes was sold as "the whole catalog, current and future, for any athlete on any plan or
    // with any coach", so an athlete who BOUGHT it and then joined a program keeps every
    // chapter. Asking about the coach first would gate them and take away what they paid for.
    expect(fn).not.toBe("");
    const addOn = fn.indexOf("ALL_CLASSES_ADD_ON_ID");
    const coach = fn.indexOf("athleteHasCoach");
    expect(addOn).toBeGreaterThan(-1);
    expect(coach).toBeGreaterThan(-1);
    expect(addOn).toBeLessThan(coach);
    expect(fn).toMatch(/if \(access\.addOns\[ALL_CLASSES_ADD_ON_ID\] === true\) return OPEN_CLASS_ACCESS;/);
  });

  it("gates a coached athlete rather than returning open for them", () => {
    // The one-line mutation that restores the original bug: an early `if (coached) return
    // OPEN_CLASS_ACCESS`. Asserted as the exact return rather than as the absence of that line,
    // since a negative only catches the wording somebody thought of.
    expect(fn).toContain("return { tierGated: !coached, selfEnrolledGated: coached };");
    expect(fn).not.toMatch(/coached\)\s*return OPEN_CLASS_ACCESS/);
  });

  it("is the only decision point -- storage honours it and never re-derives it", () => {
    // Two copies of a three-way rule disagree silently, and the disagreement is visible only to
    // the athlete it strands. Same argument as useCameraAccess asking the server.
    const storage = readFileSync(resolve(import.meta.dirname, "../server/storage.ts"), "utf8");
    expect(storage).not.toContain("athleteHasCoach");
    expect(storage).not.toContain("ALL_CLASSES_ADD_ON_ID");
    // And both gate points resolve the state from the enrolment ROW, so what the progress read
    // reports and what the recompute activates cannot disagree.
    expect((storage.match(/classGateStateFor\(gate, enrollment\)/g) ?? []).length).toBe(2);
  });
});
