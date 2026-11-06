/**
 * ITEM 10: GROWTH RATE FROM DATED STANDING HEIGHTS -- AND MATURITY STATUS, WHICH FORGE CANNOT
 * COMPUTE AND SAYS SO.
 *
 * The best-evidenced youth variable in the 2026-11-06 pass, and the input is already collected:
 * `users.heightIn` exists, is typed by the athlete, and predates the camera. **This does not
 * reopen "the camera measures the athlete and the athlete never types a body measurement for it"**
 * -- that rule is about a field existing FOR THE CAMERA'S BENEFIT, and height is a training fact
 * that was on the profile first. Forge's own Coaches Corner already teaches the use: "Height
 * tracked every few months, a question about recent growth, and an eye for the athlete whose
 * coordination has suddenly gone are enough to adjust the program."
 *
 * WHY IT BELONGS IN THE ANVIL AT ALL. A growth spurt moves every number the Anvil reads, in the
 * direction a problem would: coordination temporarily worsens, limb lengths change faster than the
 * control of them. Without it, a 14-year-old in a spurt is an athlete the Anvil flags every week
 * for a reason that is not fatigue and that no amount of rest fixes. It is an EXCLUSION signal in
 * the sense `anvil-inputs.ts` already uses -- it says a finding is not about training.
 *
 * NOTHING HERE IS A THRESHOLD AND NOTHING FLAGS. It reports centimetres per year, or a stated
 * reason. Classifying a velocity as "rapid" needs reference data this repo does not hold, and
 * inventing a cut would be exactly the borrowed precision the camera work keeps unshipping.
 */

export type DatedHeight = { readonly onIso: string; readonly cm: number };

export type GrowthVelocity =
  | { readonly cmPerYear: number; readonly spanDays: number; readonly from: string; readonly to: string }
  | { readonly absent: GrowthAbsence };

export type GrowthAbsence =
  | "no_height_on_file"
  | "one_measurement_only"
  | "measurements_too_close_together"
  | "measurements_too_far_apart";

/**
 * The shortest span a velocity may be computed over. A height typed to the nearest half-inch is
 * about 1.3 cm of quantization, so over 30 days that alone is +/-15 cm/yr of apparent velocity --
 * a number that would swamp any real growth and read as an emergency. 120 days puts the same
 * quantization at about 4 cm/yr, which is still coarse and is why the span is reported beside the
 * number rather than hidden behind it.
 */
export const MIN_GROWTH_SPAN_DAYS = 120;

/**
 * And the longest. Past about two years a single velocity averages across a spurt and the plateau
 * either side of it, which is the one answer guaranteed to be wrong for a 14-year-old.
 */
export const MAX_GROWTH_SPAN_DAYS = 730;

/** Monthly is the asking cadence; it is NOT the measuring span. See MIN_GROWTH_SPAN_DAYS. */
export const HEIGHT_ASK_CADENCE_DAYS = 30;

const DAY_MS = 86_400_000;

export function growthVelocity(heights: readonly DatedHeight[]): GrowthVelocity {
  const valid = heights
    .filter((h) => Number.isFinite(h.cm) && h.cm > 0 && !Number.isNaN(Date.parse(h.onIso)))
    .slice()
    .sort((a, b) => Date.parse(a.onIso) - Date.parse(b.onIso));
  if (valid.length === 0) return { absent: "no_height_on_file" };
  if (valid.length === 1) return { absent: "one_measurement_only" };

  const latest = valid[valid.length - 1];
  // The OLDEST measurement still inside the window, so the span is as long as the window allows
  // and the quantization noise is as small as it can be. Taking the previous one instead would
  // compute a four-week velocity whenever an athlete answered twice in a month.
  const floor = Date.parse(latest.onIso) - MAX_GROWTH_SPAN_DAYS * DAY_MS;
  const inWindow = valid.filter((h) => Date.parse(h.onIso) >= floor);
  if (inWindow.length < 2) return { absent: "measurements_too_far_apart" };

  const earliest = inWindow[0];
  const spanDays = (Date.parse(latest.onIso) - Date.parse(earliest.onIso)) / DAY_MS;
  if (spanDays < MIN_GROWTH_SPAN_DAYS) return { absent: "measurements_too_close_together" };

  return {
    cmPerYear: ((latest.cm - earliest.cm) / spanDays) * 365.25,
    spanDays,
    from: earliest.onIso,
    to: latest.onIso,
  };
}

/**
 * MATURITY STATUS: NOT COMPUTABLE FROM WHAT FORGE COLLECTS, STATED RATHER THAN APPROXIMATED.
 *
 * Decision-list item 10 asked for growth rate AND maturity status. The rate is above. The status
 * is a published anthropometric estimate and every established method needs an input Forge does
 * not have:
 *
 *  - **Mirwald et al. 2002** (maturity offset, years from peak height velocity) needs SITTING
 *    HEIGHT, from which leg length is derived. Forge does not collect it, and asking for it is
 *    precisely the body measurement this repo declines to put on a profile.
 *  - **Khamis-Roche 1994** (predicted adult stature, percentage attained) needs BOTH PARENTS'
 *    HEIGHTS. Forge does not hold a parent's height and has no reason to.
 *  - **Moore et al. 2015** is a sitting-height-free variant of the first and would be computable
 *    from age, sex, height and mass, all of which Forge has. **It is NOT implemented here**,
 *    because its coefficients would be carried in from a secondary source, and a maturity estimate
 *    for a 13-year-old is the last place to ship a number nobody checked against the paper. It is
 *    the one real candidate if this is ever wanted.
 *
 * So a status returns the REASON and the missing input, which a coach can act on and a blank
 * cannot. The same shape as every absence in `anvil-inputs.ts`.
 */
export type MaturityStatus = {
  readonly absent: "not_computable_from_collected_inputs";
  readonly missing: readonly string[];
  readonly candidate: string;
};

export function maturityStatus(): MaturityStatus {
  return {
    absent: "not_computable_from_collected_inputs",
    missing: ["sitting height (Mirwald 2002)", "both parents' heights (Khamis-Roche 1994)"],
    candidate:
      "Moore et al. 2015 needs only age, sex, height and mass, all of which Forge holds; its " +
      "coefficients must be read off the paper before anything ships.",
  };
}
