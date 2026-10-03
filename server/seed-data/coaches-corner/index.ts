import type { SeedAcademyTrack } from "./types";
import { ENERGY_SYSTEMS_TRACK } from "./energy-systems";
import { SPEED_AGILITY_TRACK } from "./speed-agility";
import { PLYOMETRICS_TRACK } from "./plyometrics";
import { WARMUP_RECOVERY_TRACK } from "./warmup-recovery";
import { TESTING_EVALUATION_TRACK } from "./testing-evaluation";
import { TECHNIQUE_SAFETY_TRACK } from "./technique-safety";

/** The 2026-10-03 Coaches Corner tracks, appended after the original seven in server/seed.ts.
 * Order here is catalog order. */
export const COACHES_CORNER_TRACKS_2026_10: SeedAcademyTrack[] = [
  ENERGY_SYSTEMS_TRACK,
  SPEED_AGILITY_TRACK,
  PLYOMETRICS_TRACK,
  WARMUP_RECOVERY_TRACK,
  TESTING_EVALUATION_TRACK,
  TECHNIQUE_SAFETY_TRACK,
];
