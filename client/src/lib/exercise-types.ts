import type { Exercise } from "@shared/schema";

export type ExerciseWithOwnership = Exercise & {
  ownerLabel: string;
  isForgeOfficial: boolean;
  editable: boolean;
  hasOpenReport?: boolean;
  isFavorite?: boolean;
  /** Last time this coach placed it into a program they built -- see
   * exerciseUsageLog's schema comment. Null if never used. */
  lastUsedAt?: string | null;
};
