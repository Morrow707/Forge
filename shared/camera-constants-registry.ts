/**
 * EVERY GUESSED THRESHOLD IN THE CAMERA PIPELINE, BESIDE THE EVIDENCE THAT WOULD REVISE IT.
 *
 * CLAUDE.md says it about the arbiter and it is true of all of them: "Every threshold here is an
 * admitted guess, and this was audited three times with no evidence to revise them against." The
 * guesses are not the problem -- you have to start somewhere. The problem is that the guess and
 * the thing that would correct it have never sat on the same page, so every tuning session began
 * by rediscovering what a constant was for and ended with another guess.
 *
 * This is that page. For each constant: what it decides, WHY it currently holds the value it
 * does, and the specific fleet measurement that would say it is wrong. The admin calibration
 * page renders the measurement next to the value.
 *
 * A constant with no `revisedBy` has no route to being checked, and that is worth seeing too --
 * it means we are flying on it.
 *
 * NOT the source of truth for the values. Each constant lives where it is used and this
 * restates it; camera-constants-registry.test.ts reads the real declarations and fails when the
 * two drift, the same treatment shared/schema-constants.ts already gets. A registry that can
 * quietly go stale is worse than none, because it is believed.
 */

export type CameraConstant = {
  name: string;
  value: number;
  unit: string;
  /** Where it actually lives. */
  file: string;
  /** What fires, and what happens when it does. */
  decides: string;
  /** Why this number. "Guess" is an acceptable and common answer -- say it plainly. */
  basis: string;
  /** The fleet measurement that would say this is wrong, or null when nothing can check it. */
  revisedBy: string | null;
};

export const CAMERA_CONSTANTS: CameraConstant[] = [
  {
    name: "MAX_PLAUSIBLE_LIFT_VELOCITY_MPS",
    value: 3,
    unit: "m/s",
    file: "client/src/lib/bar-tracking.ts",
    decides: "A frame reading faster than this is dropped from the peak-velocity pool.",
    basis:
      "Published velocity-based-training data puts an explosive empty-bar top end near 1.5-2.2 m/s. 3 sits above that on purpose: this is a glitch filter, not a judgement about the athlete, and it must not throw away real data.",
    revisedBy:
      "Self-contradiction. A ceiling set too high lets teleports into the velocity sum, which inflates implied travel above range of motion.",
  },
  {
    name: "VELOCITY_SMOOTHING_MS",
    value: 165,
    unit: "ms",
    file: "client/src/lib/bar-tracking.ts",
    decides: "The window position is smoothed over before velocity is differenced from it.",
    basis:
      "Chosen so a wandering point stops inflating path length while real motion survives: on one bench take it took the walked path from 1616cm to 841cm while the trace's own range barely moved, 147 to 132.",
    revisedBy:
      "Self-contradiction and wander together. Too small and the fleet stays self-contradictory; too large and range of motion starts shrinking with it.",
  },
  {
    name: "TORSO_STILL_MAX_SPREAD_GRIPS",
    value: 0.25,
    unit: "grip widths",
    file: "client/src/lib/bar-tracking.ts",
    decides:
      "Whether a take's torso held still, and so whether its stillness is usable as a reference against jumped pose reads.",
    basis:
      "A guess. It has to sit above a bench press's jitter and below a squat's real travel, and no take of a travelling lift has been measured yet.",
    revisedBy:
      "The measured torso spread, which every take now records. A bench and a squat should land either side of this with daylight between them; if they do not, the number is wrong.",
  },
  {
    name: "TORSO_ANCHOR_MAX_DRIFT_GRIPS",
    value: 0.35,
    unit: "grip widths",
    file: "client/src/lib/bar-tracking.ts",
    decides: "A frame whose torso sits further than this from its running median is a jumped pose read, and its bar point is dropped.",
    basis: "A guess, set loose enough not to fire on ordinary landmark jitter.",
    revisedBy:
      "How many bar points it drops per take. Past a small fraction it is eating real frames rather than jumps.",
  },
  {
    name: "GRIP_SPAN_PERCENTILE",
    value: 0.95,
    unit: "percentile",
    file: "client/src/lib/pose-tracking.ts",
    decides: "Which measured grip span is taken as the athlete's true one.",
    basis:
      "Foreshortening can only make a segment look shorter, so the largest reading is the squarest. Not the literal maximum, because one flown-off wrist would set the ruler for a whole set.",
    revisedBy:
      "Source agreement. A grip ruler that repeatedly disagrees with a plate, which needs no athlete data at all, says this is reading short or long.",
  },
  {
    name: "BIACROMIAL_HEIGHT_FRACTION",
    value: 0.23,
    unit: "fraction of height",
    file: "client/src/lib/pose-tracking.ts",
    decides: "Shoulder breadth, and through it the scale on every take where nothing else resolves.",
    basis:
      "A population average. It varies by build before anything goes wrong, and on one athlete across five stored takes it implied shoulders anywhere from 34cm to 47cm.",
    revisedBy:
      "Source agreement against a measured grip or a plate, both of which are exact for the athlete in frame. This is the constant most likely to be carrying the remaining error.",
  },
  {
    name: "PLATE_TO_GRIP_RATIO_HIGH",
    value: 2.0,
    unit: "ratio",
    file: "client/src/lib/pose-tracking.ts",
    decides: "A detection wider than this against the hand span is refused as not a plate.",
    basis:
      "Derived from geometry, not from footage: a 0.45m plate against grips of 0.40-0.81m lands at 0.56-1.13, and perspective pushes it to about 1.6 at 45 degrees off square. 2.0 keeps a margin above that.",
    revisedBy:
      "The object-lock telemetry's refusal counts and accepted distances. It is refusing almost everything today, which is correct on the takes seen so far -- one box was 3.4x the hand span and was a rack upright.",
  },
  {
    name: "MIN_PLAUSIBILITY_BASELINE_MS",
    value: 33,
    unit: "ms",
    file: "client/src/components/av-bar-tracker-dialog.tsx",
    decides: "How far back a bar point is compared against to judge whether it teleported.",
    basis:
      "One frame at 30fps. Small enough that a jump does not undo itself inside the window, large enough that a 120fps device is not measuring noise.",
    revisedBy:
      "The teleport rejection count per take, against the reps found. Rejections rising while reps fall means it is eating real motion.",
  },
  {
    name: "NORM_MIN_COHORT",
    value: 30,
    unit: "athletes",
    file: "shared/cohort-norms.ts",
    decides: "The smallest group a percentile may describe.",
    basis:
      "Not an anonymity floor -- that is 5 and answers a different question. Thirty is the minimum for a percentile to mean anything.",
    revisedBy: null,
  },
];
