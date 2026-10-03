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

/** Learning paths (2026-10-03): ordered sets of the tracks above and the original seven, for
 * a kind of coach. Track titles, resolved at seed time; a title that does not exist is
 * skipped. */
export const COACHES_CORNER_PATHS_2026_10 = [
  {
    title: "New to Strength Coaching",
    audience: "Your first season responsible for a weight room.",
    description:
      "The order to learn it in: program design, how to teach and spot the lifts, how to warm a roster up and read its fatigue, and how to test so you can tell whether any of it worked.",
    orderIndex: 0,
    trackTitles: [
      "Strength & Conditioning Fundamentals",
      "Lifting Technique, Spotting & Weight Room Safety",
      "Warm-Up, Mobility & Recovery",
      "Testing & Evaluation That Means Something",
      "Coaching Communication & Culture",
    ],
  },
  {
    title: "Running an In-Season Program",
    audience: "A head coach keeping a roster strong, fast and healthy through a schedule.",
    description:
      "Season planning, the conditioning that matches the game, speed that stays sharp, power without the knee injuries, and the recovery habits that keep athletes available in week ten.",
    orderIndex: 1,
    trackTitles: [
      "Season & Practice Planning",
      "Energy Systems & Conditioning Design",
      "Speed & Agility Development",
      "Plyometrics & Power Development",
      "Warm-Up, Mobility & Recovery",
      "Reading Forge's Own Analytics",
    ],
  },
  {
    title: "Youth and Middle School",
    audience: "Coaching athletes who are still growing.",
    description:
      "Long-term development, jumping and sprinting as skill and play, arm care for the throwing athletes, and the lifting technique that has to be right before load is.",
    orderIndex: 2,
    trackTitles: [
      "Youth Long-Term Athletic Development (LTAD)",
      "Plyometrics & Power Development",
      "Speed & Agility Development",
      "Sport-Specific Arm Care & Pitching Development",
      "Lifting Technique, Spotting & Weight Room Safety",
    ],
  },
];
