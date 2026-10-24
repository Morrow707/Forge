import { testOutbox } from "../email";

/** A TEST THAT READS THE OUTBOX THE INSTANT A RESPONSE LANDS IS RACING THE SEND.
 *
 * `sendEmail` pushes to `testOutbox` only AFTER an await chain, and with `brandForUserId` set
 * that chain is two awaits deep before the push ever happens:
 *
 *     const { storage } = await import("./storage");            // a real module load, once
 *     brand = await storage.getEffectiveBrandingForUser(id);    // a query
 *     ...
 *     testOutbox.push({ to, subject, html, from });             // only now is it readable
 *
 * And route handlers call `sendEmail(...)` WITHOUT awaiting it. That is deliberate, documented
 * product behaviour -- the same family of intentional unawaited writes `retry-on-deadlock.ts`
 * beside this file exists for ("the write is best-effort and never awaited"). A send must never
 * be able to fail a request, so nothing waits for it, which means the HTTP response can return
 * while the push is still pending.
 *
 * So the read has to wait, and the wait belongs in the HARNESS rather than in the product: the
 * alternative is awaiting the sends in the handlers, which would make a mail outage able to fail
 * a signup.
 *
 * WHAT THIS COST, so the shape is not mistaken for ceremony. 2026-10-24:
 * `a-claimed-athlete-is-told-they-have-a-coach.itest.ts` read the outbox directly and turned CI
 * red for six consecutive runs on both refs. It had been latent for five runs before that,
 * invisible because step 9 (the production npm audit) was failing and CI never reached step 16 --
 * so the commit that introduced it was unproven by the integration suite, exactly as CLAUDE.md
 * warns a commit that dies early is. Reproduced locally at roughly one run in three.
 *
 * **ONLY THE FIRST of that file's four cases ever failed**, which is the tell and is worth
 * keeping: the first call is the one where `await import("./storage")` is a real filesystem load
 * and compile rather than a cache hit, so it is the only call slow enough to lose. A race whose
 * loser is always the first test in a worker reads as "this one test is broken" rather than as a
 * race, which is how it survived review.
 */

/** How long to wait for a fire-and-forget send before calling it absent.
 *
 *  The push is behind one module load and one indexed query, so it lands in milliseconds on a
 *  warm worker and in tens of milliseconds on a cold one. Five seconds is three orders of
 *  magnitude of headroom, and it is still two hundred times shorter than the job timeout -- a
 *  genuinely missing email fails this test in five seconds rather than stalling CI for 25
 *  minutes and reading as something else. */
export const EMAIL_WAIT_TIMEOUT_MS = 5_000;

/** Gap between polls. Short enough to add nothing measurable to a passing test. */
export const EMAIL_POLL_INTERVAL_MS = 25;

export type OutboxMessage = (typeof testOutbox)[number];

/** Waits for a message matching `match` and returns it.
 *
 *  **Bounded, and it THROWS rather than returning undefined.** That is the property that keeps
 *  this from masking the bug class it sits next to: a route that sends NO email still fails the
 *  test, and fails with the recipients and subjects the outbox actually held, which is what
 *  somebody reading CI needs. A helper that waited and then returned undefined would turn every
 *  missing-email bug into a silent pass -- the exact inversion this repo keeps having to
 *  relearn.
 *
 *  The sleep is a real timer, never an immediately-resolving one: `retry-on-deadlock.ts` records
 *  what that costs -- a loop whose sleep resolves at once starves the timer queue, so the suite
 *  HANGS instead of failing, and a hang in CI is a job timeout that reads as another fault
 *  entirely.
 *
 *  `what` is for the failure message alone; nothing branches on it. */
export async function waitForEmail(
  match: (message: OutboxMessage) => boolean,
  options: {
    what?: string;
    timeoutMs?: number;
    intervalMs?: number;
    outbox?: OutboxMessage[];
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {},
): Promise<OutboxMessage> {
  const outbox = options.outbox ?? testOutbox;
  const timeoutMs = options.timeoutMs ?? EMAIL_WAIT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? EMAIL_POLL_INTERVAL_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? (() => Date.now());

  const startedAt = now();
  for (;;) {
    const found = outbox.find(match);
    if (found) return found;
    if (now() - startedAt >= timeoutMs) {
      const held = outbox.map((m) => `${m.to} / ${m.subject}`);
      throw new Error(
        `No email matching ${options.what ?? "the given predicate"} after ${timeoutMs}ms. ` +
          (held.length
            ? `The outbox held ${held.length}: ${held.join("; ")}.`
            : "The outbox was empty.") +
          " If the route really does send one, it is a slower send and not an absent one -- raise" +
          " EMAIL_WAIT_TIMEOUT_MS rather than reading the outbox directly.",
      );
    }
    await sleep(intervalMs);
  }
}

/** The common case: one recipient, one subject. */
export function waitForEmailTo(
  to: string,
  subject: string,
  options: Parameters<typeof waitForEmail>[1] = {},
): Promise<OutboxMessage> {
  return waitForEmail((m) => m.to === to && String(m.subject) === subject, {
    what: `"${subject}" to ${to}`,
    ...options,
  });
}
