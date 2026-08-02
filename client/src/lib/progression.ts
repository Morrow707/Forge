// Shared with the athlete workout page, which resolves this same syntax
// into an actual number for a given week. Kept here so both sides parse
// the exact same shape instead of two regexes drifting apart over time.

export type Progression = {
  baseText: string;
  amount: number;
  isPercent: boolean;
};

/** Matches an optional progression suffix on a prescribed weight, e.g.
 * "225 lbs +5 lbs/week" or "70% 1RM +2%/week". */
export function parseProgression(weightText: string | null | undefined): Progression | null {
  if (!weightText) return null;
  const match = weightText.match(/\+\s*(\d+(?:\.\d+)?)\s*(%|lbs|kg)?\s*\/\s*week/i);
  if (!match) return null;
  return {
    baseText: weightText.slice(0, match.index).trim(),
    amount: parseFloat(match[1]),
    isPercent: (match[2] ?? "%").toLowerCase() === "%",
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
