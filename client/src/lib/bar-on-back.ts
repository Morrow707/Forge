/**
 * ON A BACK SQUAT THE BAR RIDES ON THE SHOULDERS, AND THE SHOULDERS ARE THE WITNESS.
 *
 * Scott, build 555, 2026-09-28, squat set 1 filmed head-on beside OVR: sensor 29.6in of range,
 * Forge 9.1in. The stored trace moved about 20cm per rep where the bar moved 75. Every frame
 * had a body and both wrists at 0.8 confidence -- and on a back squat filmed from the front
 * the wrists are BEHIND THE HEAD, so Vision places them near the shoulders and they barely
 * move. The plate was edge-on (941 candidates, none usable) and the bar class is regressed,
 * so the equipment could not vote either. Three sensors, and the one that never lost the bar
 * was the shoulders: on this family of lifts the bar sits on them, so their midpoint travels
 * exactly as the bar does, from any angle, with no hand in view needed.
 *
 * This is the body tracker doing its own job -- where the athlete is -- and the bar's position
 * being derived from the joint that actually carries it. The wrists still measure grip width
 * (overwatch's yardstick) and still corroborate; they just stop being the position source
 * on lifts where they cannot see the bar.
 */
const BAR_ON_BACK = /\b(back squat|high[- ]bar|low[- ]bar|box squat|pause squat|tempo squat|good morning|split squat|lunge|step[- ]up)\b/i;
const NOT_ON_BACK = /\b(front|overhead|zercher|press|thruster|safety bar|ssb|goblet|landmine)\b/i;

/** Whether this lift carries the bar on the shoulders. Name-based, like postureForExercise:
 *  a squat filmed from the front cannot tell us where the bar is, the name can. */
export function barRidesOnShoulders(exerciseName: string | null | undefined, equipment?: string | null): boolean {
  if (!exerciseName) return false;
  if (equipment && equipment !== "Barbell") return false;
  if (NOT_ON_BACK.test(exerciseName)) return false;
  return BAR_ON_BACK.test(exerciseName);
}
