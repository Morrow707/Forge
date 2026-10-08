/* WHAT A MOVEMENT PROFILE IS KEYED ON -- one answer, so the three places that ask cannot drift.
 *
 * THE LEARNING LOOP WAS SEVERED AT BOTH ENDS AND THE TWO HALVES WERE EXACTLY COMPLEMENTARY.
 * Found 2026-10-08. `movementType` names two different key spaces in this repo and they share
 * nothing but the word:
 *
 *   MOVEMENT PATTERNS -- "Squat", "Hinge", "Push", "Pull" ... what exercises.movementType holds
 *     (shared/exercise-taxonomy.ts MOVEMENT_TYPES).
 *   CAPTURE MODES -- "bar_path", "full", "jump", "sprint", "mechanics", "horizontal_load" ...
 *     what trackingLevelEnum holds.
 *
 * workout.tsx asks for a profile under BOTH, depending on the lift: a bar lift (trackingLevel
 * bar_path or full) asks under its PATTERN, and every other mode asks under its MODE. That is
 * deliberate and right -- a squat's knee threshold belongs to squatting, and a sprint's belongs
 * to sprinting.
 *
 * But PROFILED_MOVEMENT_TYPES -- the enum the admin apply route validates against -- was derived
 * from trackingLevelEnum alone. So:
 *
 *   - An admin could publish "bar_path" or "full", which NOTHING EVER ASKS FOR.
 *   - An admin could not publish "Squat", "Hinge" or any other pattern: 400.
 *   - So no barbell lift could have a movementProfile AT ALL. Every squat, bench, row, deadlift
 *     and press has been running on the hardcoded defaults -- minKneeAngleDeg 100,
 *     maxTorsoLeanDeg 45, barPathDeviationMaxCm 8, positionScaleCorrection absent -- with no way
 *     for the admin screen to change that, and a 201 coming back when they tried.
 *
 * And the evidence half failed the opposite way: summarizeScaleEvidenceForMovement filters on
 * exercises.movementType, so a PATTERN key returns captures and a MODE key returns none. The key
 * that could be applied returned no evidence, and the key with evidence could not be applied.
 * The loop could not complete for any movement, which is why it has never proposed anything.
 *
 * This file is the one definition. The client derives its key here, the apply route validates
 * against the same list, and the evidence query asks this module which space a key belongs to.
 */
import { MOVEMENT_TYPES } from "./exercise-taxonomy";

/** Whether a capture mode is its OWN profile key, rather than deferring to the exercise's
 *  movement pattern.
 *
 *  "none" has no profile. "bar_path" and "full" defer to the PATTERN (see movementProfileKeyFor),
 *  so a profile published under either would never be read by anything -- which is exactly what
 *  the admin apply route used to accept. Everything else -- jump, sprint, mechanics, golf_swing,
 *  baseball_swing, med_ball, kb_swing, horizontal_load -- is its own key, because the movement
 *  pattern of a box jump ("Combination") groups nothing useful.
 *
 *  Expressed as a PREDICATE over trackingLevelEnum rather than a hand-typed list, so a mode added
 *  to the enum is covered without anyone remembering to come here. Hand-listing is how the two
 *  key spaces drifted apart in the first place. */
export function isModeKeyedCaptureMode(trackingLevel: string): boolean {
  return trackingLevel !== "none" && trackingLevel !== "bar_path" && trackingLevel !== "full";
}

/** The movement PATTERNS a bar lift keys on -- what exercises.movementType holds. */
export const PATTERN_KEYS: string[] = [...MOVEMENT_TYPES];

/** Every key a profile may be published under, given the capture modes this installation has.
 *  Called from schema.ts, which is where trackingLevelEnum lives -- this module deliberately does
 *  not import it, so that schema.ts can import this one without a cycle. */
export function profileKeysFor(trackingLevels: readonly string[]): string[] {
  return [...PATTERN_KEYS, ...trackingLevels.filter(isModeKeyedCaptureMode)];
}

/** True when the key names a movement PATTERN, so the evidence query filters on
 *  exercises.movementType. False for a capture mode, which that column never holds. */
export function isPatternKey(key: string): boolean {
  return MOVEMENT_TYPES.includes(key);
}

/**
 * The profile key for a tracked set -- the one derivation, shared by the client that fetches a
 * profile and the server that reasons about one.
 *
 * A bar lift answers with its movement PATTERN: bench, squat, row and press are all the same
 * tracker, and what differs between them is the pattern, not the mode. Everything else answers
 * with its MODE, because the pattern of a box jump or a 40-yard dash is not a useful grouping.
 *
 * Returns null when there is nothing to key on -- an exercise saved with Movement left blank on
 * a bar lift. The caller fetches no profile and uses the defaults, which is what happens today.
 */
export function movementProfileKeyFor(
  trackingLevel: string | null | undefined,
  movementType: string | null | undefined,
): string | null {
  if (!trackingLevel || trackingLevel === "none") return null;
  if (trackingLevel === "bar_path" || trackingLevel === "full") return movementType || null;
  return trackingLevel;
}
