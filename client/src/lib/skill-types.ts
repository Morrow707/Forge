import type { SkillExercise } from "@shared/schema";

export type SkillExerciseWithOwnership = SkillExercise & {
  ownerLabel: string;
  isForgeOfficial: boolean;
  editable: boolean;
  isFavorite?: boolean;
  /** Last time this coach placed it into a program/class they built -- see
   * skillExerciseUsageLog's schema comment. Null if never used. */
  lastUsedAt?: string | null;
};
