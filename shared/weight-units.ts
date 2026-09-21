/**
 * ONE CONVERSION, USED EVERYWHERE A LOGGED LOAD IS SHOWN IN A UNIT IT WAS NOT LOGGED IN.
 *
 * Scott, 2026-09-21: "if they want to see kg let them see kilos, even if the other athletes put
 * it in lbs the conversion is 2.2."
 *
 * The factor here is 2.20462 rather than 2.2, and the difference matters in exactly one place
 * that an athlete can see: a set LOGGED in kilos is stored normalised to pounds
 * (`workout_set_entries.weight_lbs`, via toComparableLbs, which has always used 2.20462), so
 * showing it back in kilos is a round trip. At 2.2 a 100 kg lift comes back as 100.2 kg -- the
 * athlete typed 100 and Forge shows them a number they never lifted. At 2.20462 it comes back
 * as 100. That is the whole reason for the extra digits; nothing else about the rule changes.
 *
 * The better answer, where it is available, is not to convert at all: the as-logged weight and
 * its unit are both stored, so a set shown in the unit it was logged in is the athlete's own
 * number, untouched. Convert only across units.
 */
export const LBS_PER_KG = 2.20462;

export type WeightUnit = "lbs" | "kg";

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value;
  return to === "kg" ? value / LBS_PER_KG : value * LBS_PER_KG;
}

/**
 * Rounded for reading, not for arithmetic. A tenth is finer than any gym plate and coarse
 * enough that a converted number does not read as false precision; a whole number stays whole.
 */
export function formatWeight(value: number, unit: WeightUnit): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${unit}`;
}
