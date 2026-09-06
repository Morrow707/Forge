// Shared with the athlete workout page, which resolves this same syntax
// into an actual number for a given week. Kept here so both sides parse
// the exact same shape instead of two regexes drifting apart over time.

export type WeightUnit = "lbs" | "kg";

export type Progression = {
  baseText: string;
  amount: number;
  isPercent: boolean;
  // The unit the coach typed on the increment, when they typed one. It was
  // captured by the regex and then thrown away, used only to decide whether
  // the increment was a percentage -- so "+2.5 kg/week" reached the athlete
  // as an increment of 2.5 in whatever unit THEY were logging in. Null when
  // no unit was written, which still means "the reader's own unit", exactly
  // as before.
  unit: WeightUnit | null;
};

const LBS_PER_KG = 2.20462;

/** Converts between the two units. A null `from` means the value is already
 * in the reader's unit -- an unlabelled number is not evidence of anything,
 * so it is left alone rather than guessed at. */
export function convertWeight(
  value: number,
  from: WeightUnit | null,
  to: WeightUnit,
): number {
  if (from == null || from === to) return value;
  return to === "lbs" ? value * LBS_PER_KG : value / LBS_PER_KG;
}

/** The leading number of a prescribed weight, with the unit the coach wrote
 * beside it if they wrote one ("100 kg" -> 100 kg, "225" -> 225 unlabelled).
 *
 * The athlete's screen used to take the leading number alone and then render
 * it against the athlete's own unit, so a coach programming in kilograms had
 * their prescription relabelled as pounds -- a 100 kg squat shown as 100 lbs,
 * which is 45% of the intended load. */
export function parsePrescribedWeight(
  weightText: string | null | undefined,
): { value: number; unit: WeightUnit | null } | null {
  if (!weightText) return null;
  const match = weightText.match(/^\s*(\d+(?:\.\d+)?)\s*(lbs?|kgs?)?/i);
  if (!match) return null;
  const rawUnit = match[2]?.toLowerCase();
  return {
    value: parseFloat(match[1]),
    unit: rawUnit ? (rawUnit.startsWith("kg") ? "kg" : "lbs") : null,
  };
}

/** Matches an optional progression suffix on a prescribed weight, e.g.
 * "225 lbs +5 lbs/week" or "70% 1RM +2%/week". */
export function parseProgression(weightText: string | null | undefined): Progression | null {
  if (!weightText) return null;
  const match = weightText.match(/\+\s*(\d+(?:\.\d+)?)\s*(%|lbs|kg)?\s*\/\s*week/i);
  if (!match) return null;
  const suffixUnit = match[2]?.toLowerCase();
  return {
    baseText: weightText.slice(0, match.index).trim(),
    amount: parseFloat(match[1]),
    isPercent: (suffixUnit ?? "%") === "%",
    unit: suffixUnit === "kg" ? "kg" : suffixUnit === "lbs" ? "lbs" : null,
  };
}

export function stripProgression(weightText: string): string {
  return parseProgression(weightText)?.baseText ?? weightText;
}

export function composeProgression(
  baseText: string,
  amount: number,
  isPercent: boolean,
  unit: string,
): string {
  const suffix = isPercent ? `+${amount}%/week` : `+${amount} ${unit}/week`;
  return baseText.trim() ? `${baseText.trim()} ${suffix}` : suffix;
}
