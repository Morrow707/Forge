import { MUSCLE_GROUPS } from "./exercise-taxonomy";

/**
 * THE STRENGTH SCORE: what it is measured from, and what it is never measured from.
 *
 * Scott's rules, 2026-09-21, and they are the whole design:
 *
 *  - **Forge-official exercises only.** A coach's own "Heavy Squat Variation" is not a
 *    standard anybody can be measured against, and including it would make every percentile
 *    on the platform a little bit wrong in a way nobody could see.
 *  - **Logged weight for a set number of reps.** Never a camera number. Everything the camera
 *    produces carries CAMERA_ACCURACY_PURCHASE_WARNING because it is uncalibrated; a score
 *    built on it would inherit that caveat and the feature would ship with an asterisk. Hand
 *    logged load is the one measurement in this app that is simply true, and that is the
 *    entire reason this feature can make a claim at all.
 *  - **Bodyweight movements count**, as long as the exercise is Forge-official: a strict
 *    pull-up is load, it is just load you already carry.
 */

/** Muscle groups a score is reported for. A deliberate subset of MUSCLE_GROUPS: these are the
 * ones a barbell or bodyweight movement actually loads hard enough to rank. "Full Body" is not
 * a muscle and "Ankle" is not trained for strength, so neither is scored. */
export const SCORABLE_MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Lats",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Forearms",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Core",
  "Abs",
  "Lower Back",
] as const;

export type ScorableMuscleGroup = (typeof SCORABLE_MUSCLE_GROUPS)[number];

export function isScorableMuscleGroup(group: string): group is ScorableMuscleGroup {
  return (SCORABLE_MUSCLE_GROUPS as readonly string[]).includes(group);
}

/** Every scorable group is a real muscle group -- the two lists cannot drift apart silently. */
export const SCORABLE_GROUPS_ARE_REAL = SCORABLE_MUSCLE_GROUPS.every((g) =>
  (MUSCLE_GROUPS as readonly string[]).includes(g),
);

/**
 * The bands, lowest to highest. Roman numerals inside a band are thirds of it, which is what
 * makes "Intermediate II" mean something more specific than "Intermediate" without inventing a
 * second axis.
 */
export const STRENGTH_BANDS = [
  { key: "beginner", label: "Beginner", min: 0, color: "#ef4444" },
  { key: "novice", label: "Novice", min: 20, color: "#f59e0b" },
  { key: "intermediate", label: "Intermediate", min: 40, color: "#22c55e" },
  { key: "advanced", label: "Advanced", min: 60, color: "#3b82f6" },
  { key: "elite", label: "Elite", min: 80, color: "#a855f7" },
  { key: "world_class", label: "World Class", min: 95, color: "#ec4899" },
] as const;

export type StrengthBandKey = (typeof STRENGTH_BANDS)[number]["key"];

export type StrengthBand = {
  key: StrengthBandKey;
  label: string;
  /** "Intermediate II" -- the band plus which third of it. */
  display: string;
  color: string;
};

/** A 0-100 score to its band and sub-tier. */
export function bandForScore(score: number): StrengthBand {
  const clamped = Math.max(0, Math.min(100, score));
  let chosen: (typeof STRENGTH_BANDS)[number] = STRENGTH_BANDS[0];
  for (const b of STRENGTH_BANDS) if (clamped >= b.min) chosen = b;
  const index = STRENGTH_BANDS.indexOf(chosen);
  const next = STRENGTH_BANDS[index + 1];
  const span = (next?.min ?? 100) - chosen.min;
  // Thirds of the band. A band with no room left (World Class) is always I.
  const third = span > 0 ? Math.min(2, Math.floor(((clamped - chosen.min) / span) * 3)) : 0;
  const numeral = ["I", "II", "III"][third];
  return { key: chosen.key, label: chosen.label, display: `${chosen.label} ${numeral}`, color: chosen.color };
}

/**
 * WHAT THE OVERALL SCORE IS, said in one place because the UI has to be able to explain it.
 *
 * The mean of the groups that HAVE a score, never a mean over all fourteen with zeros for the
 * rest. An athlete who has never trained calves is not a person with zero calf strength; they
 * are a person we have not measured. Averaging in a zero would punish them for the shape of
 * their log rather than the state of their training, and it would make every beginner's overall
 * score creep upward purely by logging more kinds of exercise.
 */
export function overallScore(scores: { score: number | null }[]): number | null {
  const present = scores.map((s) => s.score).filter((s): s is number => s != null);
  if (present.length === 0) return null;
  return Math.round(present.reduce((a, b) => a + b, 0) / present.length);
}

/**
 * The coaching line under the score (Scott: "I really like how it gives ideas ... verbiage like
 * that to keep a free agent on track").
 *
 * FRAMED AS MOVEMENT, NEVER AS A BODY PART TO IMPROVE. Forge has thirteen-year-olds on it, and
 * "bring up your abs" said to a child is a sentence about their body; "your pressing is behind
 * your pulling" is a sentence about their training. Same information, and only one of them is
 * something a coach would actually say.
 */
export function balanceHint(
  strongest: { group: string; score: number } | null,
  weakest: { group: string; score: number } | null,
): string | null {
  if (!strongest || !weakest) return null;
  if (strongest.group === weakest.group) return null;
  // Under a real gap there is nothing to say, and inventing an imbalance out of four points
  // teaches people to chase noise.
  if (strongest.score - weakest.score < 12) {
    return `Your ${MOVEMENT_FOR_GROUP[weakest.group] ?? weakest.group.toLowerCase()} and ${
      MOVEMENT_FOR_GROUP[strongest.group] ?? strongest.group.toLowerCase()
    } are tracking together. Keep both moving.`;
  }
  const behind = MOVEMENT_FOR_GROUP[weakest.group] ?? weakest.group.toLowerCase();
  const ahead = MOVEMENT_FOR_GROUP[strongest.group] ?? strongest.group.toLowerCase();
  return `Your ${behind} is behind your ${ahead}. Bring it up while you hold ${ahead} where it is.`;
}

/** Muscle group -> the MOVEMENT that trains it, so every hint is about training rather than
 * anatomy. See balanceHint for why that distinction is not cosmetic. */
export const MOVEMENT_FOR_GROUP: Record<string, string> = {
  Chest: "pressing",
  Shoulders: "overhead pressing",
  Triceps: "lockout strength",
  Back: "pulling",
  Lats: "vertical pulling",
  Biceps: "curling strength",
  Forearms: "grip",
  Quads: "squatting",
  Hamstrings: "hinging",
  Glutes: "hip drive",
  Calves: "lower-leg drive",
  Core: "trunk bracing",
  Abs: "trunk flexion",
  "Lower Back": "spinal bracing",
};

/**
 * ESTIMATED ONE-REP MAX, Epley. `w * (1 + reps/30)`.
 *
 * A score has to compare a heavy triple against a set of ten, so the two need a common unit,
 * and this is the one every strength standard is written in. Epley rather than Brzycki because
 * it degrades more gracefully past ten reps, which is where a lot of accessory logging lives.
 *
 * CAPPED AT 12 REPS. Past that the formula is extrapolating from muscular endurance into a
 * maximal-strength claim it cannot support -- a set of thirty bodyweight squats is not a 3x
 * bodyweight single, and without the cap it would score as one.
 */
export const MAX_SCORING_REPS = 12;

export function estimatedOneRepMax(weightLbs: number, reps: number): number | null {
  if (!(weightLbs > 0) || !(reps > 0)) return null;
  if (reps > MAX_SCORING_REPS) return null;
  if (reps === 1) return weightLbs;
  return weightLbs * (1 + reps / 30);
}

/**
 * The comparable number: estimated 1RM as a multiple of bodyweight.
 *
 * Relative rather than absolute, because a 135lb athlete and a 240lb athlete pressing the same
 * bar are not doing the same thing, and an age-banded comparison of teenagers is mostly a
 * comparison of how far through puberty they are unless bodyweight is divided out.
 *
 * Returns null without a bodyweight rather than guessing one. A score computed against an
 * assumed weight is a number that looks exactly like a real one.
 */
export function strengthRatio(
  weightLbs: number,
  reps: number,
  bodyweightLbs: number | null | undefined,
): number | null {
  if (!bodyweightLbs || bodyweightLbs <= 0) return null;
  const e1rm = estimatedOneRepMax(weightLbs, reps);
  if (e1rm == null) return null;
  return e1rm / bodyweightLbs;
}

// ---------------------------------------------------------------------------
// The comparison cohort (2026-09-21)
// ---------------------------------------------------------------------------

/**
 * WHICH ATHLETES THIS ONE IS BEING MEASURED AGAINST.
 *
 * The default is the broadest honest group: everyone on Forge in the same age band, whatever
 * their sport, wherever they are. The athlete can NARROW it from there -- a seventeen-year-old
 * can ask to stand against other seventeen-year-old males, or other seventeen-year-old male
 * swimmers -- which is what makes the number fair to a distance runner instead of measuring
 * them against linemen and calling it strength.
 *
 * WHY A FILTER IS SAFE HERE, when the Query Engine's differencing warning exists:
 * that warning is about an ADMIN with arbitrary predicates and fifty queries a day, who can
 * build two cohorts differing by one person. An athlete has two preset toggles. They cannot
 * express "everyone except this teammate", and the 30 floor applies to EVERY view including
 * the narrowed ones -- so the smallest group any comparison can describe is thirty people, and
 * the difference between two views is a fact about aggregates rather than about anybody.
 *
 * Age band is NOT optional. It is the axis that makes the comparison mean anything at all: a
 * fourteen-year-old measured against adults is not being given a percentile, they are being
 * given a discouragement.
 */
export const COHORT_FILTERS = ["gender", "sport"] as const;
export type CohortFilter = (typeof COHORT_FILTERS)[number];

export type CohortSelection = {
  /** Narrow to athletes of the same gender. */
  gender: boolean;
  /** Narrow to athletes playing the same sport. */
  sport: boolean;
};

export const BROADEST_COHORT: CohortSelection = { gender: false, sport: false };

/**
 * What the card says it compared against. Written as a sentence rather than assembled from
 * chips in the UI, so the claim and the query cannot drift into describing different groups.
 */
export function cohortDescription(
  selection: CohortSelection,
  parts: { ageBand: string | null; gender?: string | null; sport?: string | null },
): string {
  if (!parts.ageBand) return "athletes on Forge";
  const bits: string[] = [];
  if (selection.gender && parts.gender) bits.push(readableGender(parts.gender));
  if (selection.sport && parts.sport) bits.push(parts.sport);
  const who = bits.length > 0 ? `${bits.join(" ")} athletes` : "athletes";
  return `${who} aged ${parts.ageBand}`;
}

/** The enum values are storage words; these are the words a person would use. */
export function readableGender(value: string): string {
  switch (value) {
    case "male":
      return "male";
    case "female":
      return "female";
    default:
      // non_binary and prefer_not_to_say are never used to narrow a cohort -- see
      // canNarrowByGender. This exists so a stray value renders as something rather than
      // "non_binary" appearing in a sentence about a child.
      return "";
  }
}

/**
 * Whether the gender filter can be offered at all.
 *
 * Only male and female can narrow, and NOT because the other answers are less valid -- because
 * a cohort of athletes who chose "prefer not to say" is a group defined by a privacy choice,
 * and measuring somebody against it would turn that choice into a category. Those athletes get
 * the broad comparison, which is the one everybody gets by default anyway.
 */
export function canNarrowByGender(gender: string | null | undefined): boolean {
  return gender === "male" || gender === "female";
}
