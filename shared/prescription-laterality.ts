/* "3 × 5" on a unilateral exercise means 3 × 5 EACH SIDE, and the screen has to say so.
 *
 * Scott, 2026-10-05, on the Medicine Ball Rotational Throw filmed beside the OVR: "It says
 * 3x5, but I really need to do them on both sides, so we need to change the verbiage on the
 * exercise." The exercise has carried `laterality: "unilateral"` since the seed was written
 * (server/seed.ts) and only the TRACKERS ever read it -- the athlete's prescription line
 * printed the bare "3 × 5", so a rotational throw read as five reps total rather than five
 * a side.
 *
 * This is display only. The prescription is unchanged, the logged set is unchanged, and
 * nothing here decides how many reps a tracker expects to find: a unilateral set filmed in
 * one take still hands the segmenter whatever it filmed (Rule #1).
 */
export function eachSideSuffix(laterality: string | null | undefined): string {
  return laterality === "unilateral" ? " each side" : "";
}
