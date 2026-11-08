/**
 * WHICH PHONE A TAKE CAME OFF, AND WHETHER THE PIPELINE TRUSTED IT.
 *
 * The two derivations `shared/anvil-athlete-state.ts` deliberately refused. Its `CaptureRow`
 * comment says why: `deviceKey` is "derived there rather than here because the blob's shape is the
 * native pipeline's business and this file should not grow a second reader of it." Both read a
 * JSON blob a capture wrote, both are pure, and both are here rather than in
 * `server/anvil-state-source.ts` for one reason -- that module imports `./db`, which throws at
 * import time without a DATABASE_URL, and `npm test` is the suite that must never need Postgres.
 */

/**
 * THE THREE THINGS THAT CHANGE WHAT A VELOCITY MEANS, AS ONE KEY.
 *
 * Model, lens and negotiated format -- not the OS version, not the focus mode, not the telemetry
 * counters. `comparableCaptures`' own comment names the reason: "the lens, the negotiated format
 * and the delivered frame rate all differ, and this pipeline's own measured take-to-take spread on
 * ONE device and ONE lift reaches 1.68x". A key that also moved on an iOS point release would make
 * every athlete's history incomparable with itself after an update, for no measurement reason.
 *
 * Null for a blob that names none of the three, which includes every set logged before
 * `captureDeviceInfo` existed and every take from the web tracker. `comparableCaptures` reads a
 * null key as comparable, deliberately and in the direction that costs the athlete nothing.
 */
export function captureDeviceKeyFrom(blob: unknown): string | null {
  if (!blob || typeof blob !== "object") return null;
  const b = blob as Record<string, unknown>;
  const parts = [b.deviceModel, b.lens, b.activeFormat]
    .map((v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null))
    .filter((v): v is string => v != null);
  return parts.length === 0 ? null : parts.join(" | ");
}

/**
 * Whether the capture pipeline itself said it could not trust this take.
 *
 * `trackingDiagnostics.outcome` is the pipeline's own word, and `"tracked"` is the only value that
 * means a clean read: the four `empty_*` outcomes produced no usable metres at all,
 * `scale_free_only` produced reps and tempo with no scale, and `scale_suspect` is the pipeline
 * stating a doubt about the scale on a take whose numbers it saved anyway. Every Anvil capture
 * signal except ground contact is scale-dependent, so a stated doubt about the scale is a stated
 * doubt about the signal.
 *
 * **THIS IS NOT RULE #1 IN REVERSE, AND THE DISTINCTION IS THE WHOLE POINT.** Rule #1 is about
 * what a take is allowed to WITHHOLD from the athlete: a capture always writes its numbers, caveat
 * and diagnostics attached, and this function changes none of that -- the set keeps its velocity,
 * its row and its clip. What it decides is narrower and is `anvil-athlete-state.ts`'s own stated
 * job: whether the Anvil may COMPARE that number with the same athlete's other mornings. The
 * answer is carried as `capture_not_comparable`, a stated absence with a sentence on it, never as
 * a blank.
 *
 * **A TAKE WITH NO DIAGNOSTICS AT ALL IS NOT REFUSED.** Null means a hand-logged set (which has no
 * velocity to compare anyway) or a camera set from before the blob existed (which has real numbers
 * and no account of itself). Reading null as a refusal would silently discard the older half of
 * every athlete's history, which is the opposite of the direction the device rule above takes.
 */
export function captureWasRefused(diagnostics: unknown): boolean {
  if (!diagnostics || typeof diagnostics !== "object") return false;
  const outcome = (diagnostics as Record<string, unknown>).outcome;
  if (typeof outcome !== "string") return false;
  return outcome !== "tracked";
}
