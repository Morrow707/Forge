/** ONE PRICING RULE FOR EVERY FORGE CLASS (2026-10-04). Scott, on "one pricing rule across all
 * eight classes": yes. The rule: the first chapter of every Forge-official class is free to
 * any athlete, and the rest come with the plan that has the camera (a coached athlete has it
 * through their coach; a Free Agent through AI Coach + Video, the same entitlement that gates
 * the skill sessions the drill days run on). No chapter carries a price of its own any more;
 * the hitting class's $49.99 second chapter was the last one and the seed clears it.
 *
 * The per-lesson purchase machinery (classLessons.priceCents, the lesson checkout) stays in the
 * code, unused by any seeded class, so a priced lesson is one admin edit away if the rule ever
 * changes. Read by the server (state "locked_tier") and by the screens that explain it. */
export const FREE_CHAPTERS_PER_FORGE_CLASS = 1;

export function chapterNeedsCameraTier(lessonNumber: number, isForgeOfficial: boolean): boolean {
  return isForgeOfficial && lessonNumber > FREE_CHAPTERS_PER_FORGE_CLASS;
}

/** The sentence every surface uses to say it. */
export const CLASS_PRICING_LINE =
  "Chapter 1 of every Forge class is free. The rest of each class comes with the AI Coach + Video plan, or with your coach.";
