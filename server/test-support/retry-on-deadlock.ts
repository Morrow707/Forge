/** POSTGRES ABORTS ONE SIDE OF A DEADLOCK, AND THE HARNESS'S TRUNCATE IS OFTEN THE SIDE IT PICKS.
 *
 * `resetDatabase` TRUNCATEs every table between tests, which needs an AccessExclusiveLock on all
 * of them at once. Several writes in this app are deliberately NOT awaited -- the AI usage
 * counter ("the write is best-effort and never awaited"), the session store's `touch()`, the
 * fire-and-forget notification sends -- so a request that has already returned 200 can still
 * have a statement in flight when the next test's `beforeEach` fires. If that statement holds a
 * lock on a late table and wants one on an early table while the TRUNCATE holds the early one
 * and wants the late one, Postgres detects the cycle and kills one of them with SQLSTATE 40P01.
 *
 * On 2026-10-09 it killed ours, on `a-purchased-tier-is-honoured-before-launch.itest.ts`, and
 * because `deploy` hangs off the integration job in `ci.yml` that one aborted TRUNCATE stopped
 * the commit reaching Render.
 *
 * **Retrying is the correct response here, and it is not "treating a flake as a cause."** The
 * cause is known and is deliberate product behaviour: a documented, intentional unawaited write.
 * The harness is what has to tolerate it. The competing statement completes in milliseconds, so
 * the retry finds the locks free -- which is the whole difference between this and a blind re-run
 * of a red job. It is bounded, it retries ONLY on 40P01, and anything else is rethrown
 * immediately so a genuine failure cannot hide behind it.
 *
 * Deliberately in its own module with NO import of `../db`: `server/db.ts` throws at import time
 * without `DATABASE_URL`, and the ratchet for this lives in the no-database suite so it runs on
 * every `npm test` rather than only where Postgres is installed.
 */

/** Postgres SQLSTATE for `deadlock_detected`. */
export const DEADLOCK_DETECTED = "40P01";

/** How many times a statement killed by a deadlock is re-sent before giving up.
 *
 *  Five, because the competing statement is a single unawaited INSERT or UPDATE that finishes in
 *  milliseconds: if five attempts spread over ~375ms all lose, something is holding locks for
 *  real and a thrown error is the honest answer rather than a longer wait. */
export const DEADLOCK_ATTEMPTS = 5;

/** Runs `statement`, re-sending it if Postgres aborted it to break a deadlock.
 *
 *  Returns whatever `statement` returns. Any error that is not a deadlock, and a deadlock on the
 *  final attempt, is rethrown unchanged -- the original error, not a wrapper, so a failure reads
 *  the same as it did before this existed.
 *
 *  `onRetry` exists for the ratchet and for a human reading CI output; nothing depends on it. */
export async function retryOnDeadlock<T>(
  statement: () => Promise<T>,
  options: {
    attempts?: number;
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (attempt: number, err: unknown) => void;
  } = {},
): Promise<T> {
  const attempts = options.attempts ?? DEADLOCK_ATTEMPTS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await statement();
    } catch (err) {
      const code = (err as { code?: unknown } | null | undefined)?.code;
      if (code !== DEADLOCK_DETECTED || attempt >= attempts) throw err;
      options.onRetry?.(attempt, err);
      // Linear, not exponential: the thing being waited for is one short statement, so the point
      // is to yield the lock queue briefly, not to back off from a loaded service.
      await sleep(25 * attempt);
    }
  }
}
