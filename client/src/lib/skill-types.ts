import type { SkillExercise } from "@shared/schema";

export type SkillExerciseWithOwnership = SkillExercise & {
  ownerLabel: string;
  isForgeOfficial: boolean;
  editable: boolean;
  isFavorite?: boolean;
  /** Last time this coach placed it into a program/class they built -- see
   * skillExerciseUsageLog's schema comment. Null if never used. */
  lastUsedAt?: string | null;
  /** True when a Free Agent hasn't unlocked this drill's sport yet (see
   * getVisibleSkillExercisesForFreeAgent) -- always undefined for a coach's
   * own view, which has no paywall. A locked drill is still fully visible
   * (name, sport, instructions), just not selectable into a program. */
  locked?: boolean;
};
