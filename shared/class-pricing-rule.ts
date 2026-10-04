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
