import type { Exercise } from "@shared/schema";

export type ExerciseWithOwnership = Exercise & {
  ownerLabel: string;
  isForgeOfficial: boolean;
  editable: boolean;
};
