import type { SkillExercise } from "@shared/schema";

export type SkillExerciseWithOwnership = SkillExercise & {
  ownerLabel: string;
  isForgeOfficial: boolean;
  editable: boolean;
  isFavorite?: boolean;
};
