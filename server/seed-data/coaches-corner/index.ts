import type { SeedAcademyTrack } from "./types";
import { COACHES_CORNER_TRACKS_ORIGINAL } from "./original-seven";
import { ENERGY_SYSTEMS_TRACK } from "./energy-systems";
import { SPEED_AGILITY_TRACK } from "./speed-agility";
import { PLYOMETRICS_TRACK } from "./plyometrics";
import { WARMUP_RECOVERY_TRACK } from "./warmup-recovery";
import { TESTING_EVALUATION_TRACK } from "./testing-evaluation";
import { TECHNIQUE_SAFETY_TRACK } from "./technique-safety";
import { MUSCLE_AND_FORCE_TRACK } from "./muscle-and-force";
import { BIOMECHANICS_TRACK } from "./biomechanics";
import { ADAPTATION_TRACK } from "./adaptation";
import { HORMONES_SLEEP_STRESS_TRACK } from "./hormones-sleep-stress";
import { FUELING_TRACK } from "./fueling";
import { SUPPLEMENTS_SUBSTANCES_TRACK } from "./supplements-substances";
import { RESISTANCE_PROGRAMMING_TRACK } from "./resistance-programming";
import { AEROBIC_PROGRAMMING_TRACK } from "./aerobic-programming";
import { MIND_IN_PERFORMANCE_TRACK } from "./mind-in-performance";
import { WOMEN_OLDER_RETURNING_TRACK } from "./women-older-returning";
import { FACILITY_TRACK } from "./facility";

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

/** The 2026-10-04 tracks: the rest of the strength and conditioning field, in Forge's own
 * syllabus (Scott: "All of them. Every chapter"; counsel, question 14: Forge's outline first,
 * general knowledge across sources, no book's table of contents). Appended after the 2026-10
 * six. */
export const COACHES_CORNER_TRACKS_2026_10_04: SeedAcademyTrack[] = [
  MUSCLE_AND_FORCE_TRACK,
  BIOMECHANICS_TRACK,
  ADAPTATION_TRACK,
  HORMONES_SLEEP_STRESS_TRACK,
  FUELING_TRACK,
  SUPPLEMENTS_SUBSTANCES_TRACK,
  RESISTANCE_PROGRAMMING_TRACK,
  AEROBIC_PROGRAMMING_TRACK,
  MIND_IN_PERFORMANCE_TRACK,
  WOMEN_OLDER_RETURNING_TRACK,
  FACILITY_TRACK,
];

/** Every repo-written track, both batches, for the tests and anything that needs the lot. */
export const ALL_REPO_COACHES_CORNER_TRACKS: SeedAcademyTrack[] = [...COACHES_CORNER_TRACKS_2026_10, ...COACHES_CORNER_TRACKS_2026_10_04];

/** Every repo-written track, the original seven first: the order the seed creates them in. */
export const ALL_COACHES_CORNER_TRACKS: SeedAcademyTrack[] = [...COACHES_CORNER_TRACKS_ORIGINAL, ...ALL_REPO_COACHES_CORNER_TRACKS];

/** Learning paths (2026-10-03): ordered sets of the tracks above and the original seven, for
 * a kind of coach. Track titles, resolved at seed time; a title that does not exist is
 * skipped. */
export const COACHES_CORNER_PATHS_2026_10 = [
  {
    title: "The Science Behind the Program",
    audience: "A coach who wants to know why the program works, not only what to write.",
    description:
      "Muscle and force, the physics of a lift, how the body adapts, the chemistry the coach can influence, and fuel. Read these and every set, rep and rest in a program has a reason.",
    orderIndex: 3,
    trackTitles: [
      "How Muscle Produces Force",
      "Biomechanics for the Weight Room",
      "How the Body Adapts to Training",
      "Hormones, Sleep and Stress",
      "Fueling the Athlete",
      "Writing a Resistance Program",
    ],
  },
  {
    title: "Looking After the Whole Athlete",
    audience: "A coach responsible for more than the numbers on the bar.",
    description:
      "The mind in performance, supplements and the coach's line, female, older and returning athletes, and the facility and duty of care that sit under all of it.",
    orderIndex: 4,
    trackTitles: [
      "The Mind in Performance",
      "Supplements, Substances and the Coach's Line",
      "Training Women, Older Athletes and Athletes Coming Back",
      "Lifting Technique, Spotting & Weight Room Safety",
      "The Weight Room as a Facility",
    ],
  },
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
