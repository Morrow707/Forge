/** ONE PRICING RULE FOR EVERY FORGE CLASS (2026-10-04). First shape, Scott's "yes 14": chapter
 * one free, the rest with the camera plan. Second shape the same evening, after seeing the
 * catalog's size: "make it a monthly purchase of $19.99", the whole catalog, current and
 * future, for any athlete on any plan or with any coach. That is the All Classes add-on
 * (shared/free-agent-tiers.ts, ALL_CLASSES_ADD_ON_ID), one Apple product, one Stripe price.
 *
 * The rule: chapter one of every Forge-official class is free to any athlete, as the preview;
 * every chapter after it needs All Classes. A coach's own class is never gated. Beta, a trial
 * and enforcement-off unlock it like every other add-on. No chapter carries a price of its
 * own any more; the per-lesson purchase machinery stays in the code, unused. */
export const FREE_CHAPTERS_PER_FORGE_CLASS = 1;

export function chapterNeedsClassPass(lessonNumber: number, isForgeOfficial: boolean): boolean {
  return isForgeOfficial && lessonNumber > FREE_CHAPTERS_PER_FORGE_CLASS;
}

/** The sentence every surface uses to say it. */
export const CLASS_PRICING_LINE =
  "Chapter 1 of every Forge class is free to try. All Classes, $19.99 a month, opens every chapter of every class, now and as new ones are added.";

/**
 * WHO IS BEING GATED, AND WHAT THEY SHOULD BE SHOWN INSTEAD.
 *
 * A boolean could not express the case that was missing (found by the 2026-10-14 audit panel). The
 * old `tierGated` flag was decided per ATHLETE and answered "is this a Free Agent without All
 * Classes", short-circuiting to false for anybody with a coach -- which was the whole gate, since
 * the catalog is Free-Agent-only, so a coached athlete had no way to be enrolled in a Forge class
 * they had not been GIVEN.
 *
 * Except one: a Free Agent self-enrols (chapter one free), then joins a coach. The enrolment
 * survives, the short-circuit now applies, and they read every paid chapter of it for nothing.
 * Scott's rule is about what the COACH gave -- "they have access to the classes, but only the ones
 * their coach gives to them" -- and a class they enrolled themselves in is not one of those.
 *
 * So the decision is per ENROLMENT, and `classEnrollments.coachId` already carries the provenance:
 * it equals athleteId for a self-enrolment and is the coach's id otherwise.
 *
 * AND THE STATE MATTERS AS MUCH AS THE GATE. `locked_tier` renders the All Classes buy card, and
 * `requireFreeAgent` refuses that purchase to a coached athlete on both rails -- so gating them
 * that way would put a dead buy button in front of them. They get `locked`, the ordinary
 * not-open-yet state, because the thing to do about it is ask their coach.
 *
 * `holdsAllClasses` is honoured either way: the add-on was sold as "the whole catalog, current and
 * future, for any athlete on any plan or with any coach" (see the rule above), so an athlete who
 * BOUGHT it and then joined a coach keeps every chapter. Taking away chapters somebody paid for
 * in order to close a free-access hole would be the worse bug.
 */
export interface ClassAccessGate {
  /** A Free Agent without All Classes: paid chapters read `locked_tier` and offer the add-on. */
  tierGated: boolean;
  /** A coached athlete without All Classes: paid chapters of a class they enrolled THEMSELVES in
   *  read `locked`, with no offer, because they cannot buy it. A class their coach enrolled them
   *  in is never gated. */
  selfEnrolledGated: boolean;
  /** AN OFF-SEASON HOLD KEEPS WHAT THE COACH GAVE (2026-10-29, shared/roster-hold.ts).
   *
   *  A held athlete is a Free Agent for everything they would BUY -- the camera, the skills side,
   *  the AI, and the Forge catalog -- because in the off season they are training on their own.
   *  So they arrive here `tierGated`, like any uncoached athlete, and **that alone would lock
   *  every chapter past chapter one of a class their coach assigned them in April, and draw a
   *  $19.99 buy card in front of a fifteen-year-old for content their program already bought.**
   *  That is a withheld thing with no replacement, which is what Rule #1 in CLAUDE.md refuses.
   *
   *  So this is the exception, and it is a third flag rather than a special case inside
   *  `tierGated` because the two facts are independent: whether they may buy the catalog, and
   *  whether what they were given stays given. `classEnrollments.coachId` already carries which
   *  is which (it equals the athleteId for a self-enrolment), so no new column is needed.
   *
   *  DELIBERATELY FALSE FOR A REMOVED ATHLETE, which is not the same case and is not an
   *  oversight. A held seat still EXISTS -- the relationship is paused, not ended -- and the
   *  class was given inside a relationship that is still live. A removal ends it, and widening
   *  this to cover removals would change what somebody removed months ago can read, which is its
   *  own decision with its own blast radius. Recorded rather than quietly included. */
  coachGivenStaysOpen: boolean;
}

export const OPEN_CLASS_ACCESS: ClassAccessGate = {
  tierGated: false,
  selfEnrolledGated: false,
  coachGivenStaysOpen: false,
};

/** Does this enrolment's paid chapters get withheld, and as which state? Null means open.
 *  `enrollment` is the row; a self-enrolment is the one whose coachId is the athlete. */
export function classGateStateFor(
  gate: ClassAccessGate,
  enrollment: { athleteId: number; coachId: number },
): "locked_tier" | "locked" | null {
  // THE ORDER IS LOAD-BEARING AND IS WHAT THE TEST PINS. The coach-given exception has to be
  // asked BEFORE `tierGated`, because a held athlete is tierGated -- putting it after would read
  // as present and do nothing, which is the shape of defect this repo has recorded eight times.
  // Same reasoning as `holdsAllClasses` being checked before the coach, one rule up.
  if (gate.coachGivenStaysOpen && enrollment.coachId !== enrollment.athleteId) return null;
  if (gate.tierGated) return "locked_tier";
  if (gate.selfEnrolledGated && enrollment.coachId === enrollment.athleteId) return "locked";
  return null;
}
