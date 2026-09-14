/**
 * One place for every "the camera's numbers aren't trustworthy yet" string in
 * the app.
 *
 * This exists to be DELETED. Forge is launching with the camera pipeline
 * recording fine and its derived metrics uncalibrated (see
 * docs/camera-tracking-notes.md for what has actually been validated against
 * real footage -- four exercises -- and what has not). The disclosure that
 * goes with that has to appear in a dozen places: before purchase, after
 * signup, next to every number, and on anything that leaves the platform.
 *
 * Spread across a dozen hardcoded strings, that becomes a dozen things to
 * find and remove once calibration lands, and the failure mode is not a
 * compile error -- it is a stale warning still telling athletes their numbers
 * are wrong long after they aren't, which costs more trust than never having
 * warned them. One module means one deletion, and `tsc` names every site.
 *
 * The split between the three strings is about how much room the surface has,
 * never about how strong the claim is. All three say the same two things: the
 * VIDEO is fine, the NUMBERS are not.
 */

/** Full paragraph. For a dialog, or a banner with a whole row to itself. */
export const CAMERA_ACCURACY_LONG =
  "The camera records and saves your video normally. But right now, the numbers it calculates " +
  "from that video -- velocity, range of motion, power, and similar tracked metrics -- are not " +
  "accurate. We're actively calibrating the system. Don't make training decisions based on " +
  "these numbers until that's done.";

/** One or two lines. For a tier card, or under a chart. */
export const CAMERA_ACCURACY_SHORT =
  "Camera records fine, but tracked metrics (velocity, range of motion, power) aren't accurate " +
  "right now -- we're calibrating.";

/** Tightest form, for sitting directly against a number that is already on
 * screen. Assumes the reader can see what it is talking about. */
export const CAMERA_ACCURACY_INLINE = "Not accurate yet -- camera metrics are still being calibrated.";

/**
 * For the research extract's "Method and limitations" section.
 *
 * Deliberately stronger than the bullet it replaces, which said camera
 * measures should be read "as relative rather than absolute" on the grounds
 * that the TRUST SCORE thresholds were uncalibrated. That was true and is now
 * not the whole truth: a bench press tracked against an instrumented bar
 * reported range of motion 4x high and peak power 6.3x high (the field report
 * in docs/camera-tracking-notes.md). "Relative not absolute" reads as a
 * precision caveat. This is an accuracy failure, and a reader deciding whether
 * to use the data is entitled to the difference.
 */
export const CAMERA_ACCURACY_RESEARCH_BULLET =
  "Camera-derived measures (velocity, range of motion, power, jump height, bar path) are NOT " +
  "calibrated. The pipeline is in active development and has been validated against instrumented " +
  "reference equipment for only a small number of movements; where it has been checked, errors of " +
  "several multiples have been observed. Every camera-derived measure also carries a trust score, " +
  "whose own thresholds are likewise uncalibrated. These measures should not be treated as " +
  "measurements of the underlying quantity.";
