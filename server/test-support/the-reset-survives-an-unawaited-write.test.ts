import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEADLOCK_ATTEMPTS, DEADLOCK_DETECTED, retryOnDeadlock } from "./retry-on-deadlock";

/* A DEADLOCKED TRUNCATE BLOCKED A RENDER DEPLOY, AND `deploy` HANGS OFF THE INTEGRATION JOB.
 *
 * 2026-10-09, run 1757 on `b88d8850`: `resetDatabase` died with SQLSTATE 40P01 in
 * `a-purchased-tier-is-honoured-before-launch.itest.ts`. Postgres' own report named the cycle --
 * "Process 693 waits for AccessExclusiveLock on relation 20622; blocked by process 694. Process
 * 694 waits for AccessShareLock on relation 20606; blocked by process 693" -- so one side was
 * the harness's TRUNCATE (AccessExclusive on every table) and the other a plain reader.
 *
 * The cause is deliberate product behaviour, not a bug to fix in the server: several writes in
 * this app are documented as best-effort and never awaited, so a request that has already
 * returned can still have a statement in flight when the next test's `beforeEach` fires.
 *
 * THIS IS THE ONE PLACE A RETRY IS THE CAUSE-LEVEL FIX RATHER THAN A SHRUG. The competing
 * statement is one short INSERT or UPDATE; it completes in milliseconds; the re-sent TRUNCATE
 * finds the locks free. What makes it honest rather than a blind re-run is that it retries on
 * 40P01 ALONE, is bounded, and rethrows the original error untouched -- so nothing real can hide
 * behind it. Those three properties are what this file pins.
 *
 * Deliberately a `.test.ts` and not an `.itest.ts`: it needs no Postgres, so it runs on every
 * `npm test`, which is the suite somebody actually runs before pushing.
 */

/** An error shaped the way `pg` shapes one, which is all the retry inspects. */
const pgError = (code: string) => Object.assign(new Error(`pg says ${code}`), { code });

describe("retryOnDeadlock", () => {
  it("re-sends a statement Postgres killed to break a deadlock", async () => {
    let calls = 0;
    const result = await retryOnDeadlock(async () => {
      calls += 1;
      if (calls < 3) throw pgError(DEADLOCK_DETECTED);
      return "truncated";
    }, { sleep: async () => {} });
    expect(result).toBe("truncated");
    expect(calls).toBe(3);
  });

  it("does not retry anything that is not a deadlock", async () => {
    // The property that keeps a real failure real. A syntax error, a missing column, a closed
    // pool: each must surface on the first attempt, unchanged and unwrapped.
    for (const code of ["42P01", "23505", "08003", "57P01"]) {
      let calls = 0;
      await expect(
        retryOnDeadlock(async () => { calls += 1; throw pgError(code); }, { sleep: async () => {} }),
      ).rejects.toThrow(`pg says ${code}`);
      expect(calls, `${code} must not be retried`).toBe(1);
    }
  });

  it("does not retry an error with no code at all", async () => {
    let calls = 0;
    await expect(
      retryOnDeadlock(async () => { calls += 1; throw new Error("something else entirely"); },
        { sleep: async () => {} }),
    ).rejects.toThrow("something else entirely");
    expect(calls).toBe(1);
  });

  it("gives up, and rethrows the ORIGINAL error, when every attempt deadlocks", async () => {
    // A wrapper would make a persistent lock holder read as a harness bug. The error a human
    // sees in CI has to be Postgres' own, with its `detail` naming both processes.
    //
    // The statement switches to a SENTINEL after far more calls than the bound allows, instead
    // of deadlocking forever. That is deliberate: an unbounded retry whose sleep resolves
    // immediately is a tight async loop that starves the timer queue, so timeouts never fire and
    // the suite HANGS -- and a hang in CI is a twenty-five-minute job timeout that reads as
    // something else entirely. Rejecting with the sentinel is how an unbounded version fails
    // here, fast and legibly.
    let calls = 0;
    const err = pgError(DEADLOCK_DETECTED);
    await expect(
      retryOnDeadlock(async () => {
        calls += 1;
        if (calls > DEADLOCK_ATTEMPTS * 20) throw new Error("UNBOUNDED: the retry never gave up");
        throw err;
      }, { sleep: async () => {} }),
    ).rejects.toBe(err);
    expect(calls).toBe(DEADLOCK_ATTEMPTS);
  });

  it("is bounded, and the bound is small enough that a real hold fails fast", async () => {
    // Five attempts over ~375ms. A bound of hundreds would turn a genuine lock problem into a
    // test timeout, which reads as something else entirely.
    expect(DEADLOCK_ATTEMPTS).toBeGreaterThan(1);
    expect(DEADLOCK_ATTEMPTS).toBeLessThan(10);
    const waits: number[] = [];
    await retryOnDeadlock(async () => {
      // Same sentinel reasoning as the case above: an unbounded retry must not hang this file.
      if (waits.length > DEADLOCK_ATTEMPTS * 20) throw new Error("UNBOUNDED");
      throw pgError(DEADLOCK_DETECTED);
    }, {
      sleep: async (ms) => { waits.push(ms); },
    }).catch(() => {});
    expect(waits).toHaveLength(DEADLOCK_ATTEMPTS - 1);
    expect(waits.reduce((a, b) => a + b, 0)).toBeLessThan(1000);
  });

  it("does not sleep at all when the first attempt succeeds", async () => {
    // The overwhelmingly common case: this runs in a beforeEach before every integration test,
    // so a wait on the happy path would be paid hundreds of times per CI run.
    let slept = false;
    const r = await retryOnDeadlock(async () => "fine", { sleep: async () => { slept = true; } });
    expect(r).toBe("fine");
    expect(slept).toBe(false);
  });

  it("is the SQLSTATE Postgres actually reports, not a message match", async () => {
    // 40P01 is `deadlock_detected`. Matching on the words of an error message would break on a
    // Postgres upgrade or a non-English server, silently, and the symptom would be a blocked
    // deploy again.
    expect(DEADLOCK_DETECTED).toBe("40P01");
  });
});

describe("resetDatabase", () => {
  const fixtures = readFileSync(join(__dirname, "fixtures.ts"), "utf8");

  it("sends its TRUNCATE through the retry", () => {
    // `pool` cannot be reached without a DATABASE_URL (server/db.ts throws at import), so the
    // wiring is asserted by reading the source -- the same shape as the Swift arbiter's
    // constants. A retry nothing calls is a comment.
    const fn = /export async function resetDatabase[\s\S]*?\n}/.exec(fixtures);
    expect(fn, "resetDatabase should still be a top-level async function").not.toBeNull();
    expect(fn![0]).toContain("retryOnDeadlock");
    expect(fn![0]).toContain("TRUNCATE TABLE");
  });

  it("takes its table list in a deterministic order", () => {
    // Not a fix for the deadlock -- a reader takes locks in its own order whatever this does --
    // but an unordered pg_tables scan can return two different orders on two runs, which makes
    // the same race appear and vanish for no visible reason.
    const fn = /export async function resetDatabase[\s\S]*?\n}/.exec(fixtures)!;
    expect(fn[0]).toMatch(/ORDER BY\s+tablename/);
  });
});
