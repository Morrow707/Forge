// Serialization + scheduling for the app's daily background jobs (see
// reflection-job.ts, data-retention-job.ts, video-retention-job.ts). Two of
// those jobs permanently delete athletes' video files, so the two failure
// modes this module exists to close are both destructive:
//
//   1. Two web instances (a rolling deploy's overlap, a scaled-out dyno)
//      running the same sweep at the same moment -- double-purging and
//      double-notifying.
//   2. A `setTimeout(job, 90_000)` boot pass, which made the purge run once
//      per DEPLOY rather than once per day. Ten deploys in an afternoon was
//      ten purge sweeps.
//
// (1) is closed by a Postgres advisory lock -- the same primitive
// storage.claimRosterSeat already uses for the roster-seat TOCTOU race,
// taken here against the pool from ./db directly rather than through
// storage.ts. (2) is closed by scheduleDailyJob below, which fires on a
// fixed wall-clock hour instead of "N seconds after this process booted";
// restarting the process no longer triggers a sweep at all.
//
// Both fail closed: a job that can't reach the database, or can't get the
// lock, declines to run and waits for tomorrow. A skipped purge is
// invisible and self-corrects on the next slot; a doubled purge is
// permanent data loss.

export type JobOutcome = "ran" | "failed" | "skipped_locked" | "skipped_unavailable";

// Advisory lock keys share one global namespace with every other
// pg_advisory_lock caller in the app, so these can't just be 1, 2, 3 --
// claimRosterSeat locks on a bare coachId, and small integers would collide
// with real coach IDs. FNV-1a over the job name, folded into the signed
// 64-bit range Postgres's bigint accepts, keeps the keys stable across
// deploys (they must be, or the lock stops meaning anything) while making a
// collision with a coach ID vanishingly unlikely.
export function jobLockKey(jobName: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < jobName.length; i++) {
    hash = (hash ^ BigInt(jobName.charCodeAt(i))) & mask;
    hash = (hash * prime) & mask;
  }
  // Reinterpret as signed 64-bit -- pg bigint is signed and rejects
  // anything above 2^63-1.
  const signed = hash >= 1n << 63n ? hash - (1n << 64n) : hash;
  return signed.toString();
}

/**
 * Runs `fn` while holding a session-level Postgres advisory lock named by
 * `jobName`, so at most one instance of the app runs it at a time.
 *
 * The lock is taken on a dedicated pooled client and released in a finally
 * block; if the process dies mid-run the connection drops and Postgres
 * releases the lock on its own, so a crash can't wedge the job forever.
 *
 * Never throws -- the outcome comes back as a value so callers (and the
 * logs) can tell "ran", "another instance had it", and "the database was
 * unreachable" apart from each other.
 */
// What a job counted, for the dashboard. A sweep returns whatever it
// tallied ({ purged: 3, warned: 1 }); returning nothing is fine and means
// the run is recorded with no detail.
export type JobSummary = Record<string, number> | void;

// Every scheduled job registers its hour here as it is scheduled, so the
// admin dashboard can work out that a job is OVERDUE. That is the case a
// run history alone cannot show: a job that never started writes no row,
// so its absence is only meaningful against the schedule it was supposed
// to keep.
const scheduleRegistry = new Map<string, number>();

export function getJobSchedule(): { jobName: string; hourUtc: number }[] {
  return [...scheduleRegistry.entries()]
    .map(([jobName, hourUtc]) => ({ jobName, hourUtc }))
    .sort((a, b) => a.hourUtc - b.hourUtc);
}

// Recording is best-effort and never allowed to change a job's outcome: a
// sweep that ran correctly must not be reported as failed because the
// bookkeeping insert afterwards did not land.
async function recordJobRun(
  jobName: string,
  outcome: JobOutcome,
  startedAt: number,
  summary?: JobSummary,
  err?: unknown,
): Promise<void> {
  try {
    const { pool } = await import("./db");
    await pool.query(
      `INSERT INTO job_runs (job_name, outcome, started_at, finished_at, duration_ms, detail, error)
       VALUES ($1, $2, $3, now(), $4, $5, $6)`,
      [
        jobName,
        outcome,
        new Date(startedAt),
        Date.now() - startedAt,
        summary && Object.keys(summary).length > 0 ? JSON.stringify(summary) : null,
        err === undefined ? null : err instanceof Error ? err.message : String(err),
      ],
    );
  } catch (recordErr) {
    console.error(`[job:${jobName}] could not record the run:`, recordErr);
  }
}

export async function runWithJobLock(
  jobName: string,
  fn: () => Promise<JobSummary>,
): Promise<JobOutcome> {
  const key = jobLockKey(jobName);
  const startedAt = Date.now();

  let client;
  try {
    // Imported lazily rather than at module load: ./db throws on import
    // when DATABASE_URL is unset, and the pure helpers here (jobLockKey,
    // msUntilNextUtcHour) are worth being able to import without a
    // database.
    const { pool } = await import("./db");
    client = await pool.connect();
  } catch (err) {
    console.error(`[job:${jobName}] skipped -- could not get a database connection:`, err);
    // Deliberately not recorded: the record would go to the database that
    // just refused a connection. The dashboard catches this case as an
    // overdue job instead, which is the only way it can be caught.
    return "skipped_unavailable";
  }

  let acquired = false;
  try {
    try {
      const res = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1::bigint) as locked", [key]);
      acquired = res.rows[0]?.locked === true;
    } catch (err) {
      // Deliberately does NOT fall through to running the job unlocked --
      // an unlocked purge is the exact thing this module exists to prevent.
      console.error(`[job:${jobName}] skipped -- failed to take the advisory lock:`, err);
      await recordJobRun(jobName, "skipped_unavailable", startedAt, undefined, err);
      return "skipped_unavailable";
    }

    if (!acquired) {
      // Expected and benign during a rolling deploy: the other instance is
      // running this same sweep right now.
      console.log(`[job:${jobName}] skipped -- another instance holds the lock.`);
      await recordJobRun(jobName, "skipped_locked", startedAt);
      return "skipped_locked";
    }

    console.log(`[job:${jobName}] start (${new Date(startedAt).toISOString()}).`);
    try {
      const summary = await fn();
      console.log(`[job:${jobName}] finished ok in ${Date.now() - startedAt}ms.`);
      await recordJobRun(jobName, "ran", startedAt, summary);
      return "ran";
    } catch (err) {
      // The jobs already swallow their own errors internally; this is the
      // backstop that keeps an unexpected throw from being silent, and
      // keeps it from skipping the unlock below.
      console.error(`[job:${jobName}] failed after ${Date.now() - startedAt}ms:`, err);
      await recordJobRun(jobName, "failed", startedAt, undefined, err);
      return "failed";
    }
  } finally {
    if (acquired) {
      try {
        await client.query("select pg_advisory_unlock($1::bigint)", [key]);
      } catch (err) {
        // Not fatal: releasing the client below drops the session, and
        // Postgres releases session-level advisory locks with it.
        console.error(`[job:${jobName}] failed to release the advisory lock (released with the session):`, err);
      }
    }
    client.release();
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function msUntilNextUtcHour(hourUtc: number, now: Date = new Date()): number {
  const next = new Date(now);
  next.setUTCHours(hourUtc, 0, 0, 0);
  let delay = next.getTime() - now.getTime();
  if (delay <= 0) delay += DAY_MS;
  return delay;
}

/**
 * Schedules `fn` to run once a day at a fixed UTC hour, under the job lock.
 *
 * Deliberately has no boot pass. The previous shape
 * (`setTimeout(fn, 90_000); setInterval(fn, DAY_MS)`) meant every deploy
 * restarted the clock and re-ran the sweep, so two of these jobs purged
 * video once per deploy instead of once per day. Anchoring to the wall
 * clock instead means a restart costs at most a delayed run, never an
 * extra one.
 *
 * Note the residual gap this does NOT close: nothing durable records that a
 * given day's run happened, so a process that restarts across its own slot
 * skips that day, and two processes whose slots don't overlap in time can
 * still each run once. Closing that needs a persisted run-history table
 * (a schema change, tracked separately); the advisory lock plus a fixed
 * slot is what's achievable without one, and it errs toward skipping.
 */
export function scheduleDailyJob(
  jobName: string,
  hourUtc: number,
  fn: () => Promise<JobSummary>,
): void {
  scheduleRegistry.set(jobName, hourUtc);
  const tick = () => {
    void runWithJobLock(jobName, fn);
  };
  const delay = msUntilNextUtcHour(hourUtc);
  console.log(
    `[job:${jobName}] scheduled daily at ${String(hourUtc).padStart(2, "0")}:00 UTC; first run in ${Math.round(delay / 60_000)} min.`,
  );
  setTimeout(() => {
    tick();
    setInterval(tick, DAY_MS);
  }, delay);
}

/**
 * A job is overdue once more than a day and a bit has passed since its last
 * recorded run, counted from its scheduled hour.
 *
 * The grace period is deliberate. A daily job that ran at 09:00 yesterday
 * is not late at 09:01 today -- the sweep itself takes time, the process
 * may have just restarted, and a badge that flickers red every morning is
 * a badge people learn to ignore. Two hours past the scheduled hour is
 * late enough to mean something.
 *
 * A job with no recorded run at all is judged from process start rather
 * than reported overdue immediately: a fresh deploy has legitimately never
 * run any of them yet.
 */
const GRACE_MS = 2 * 60 * 60 * 1000;
const processStartedAt = Date.now();

export function isOverdue(hourUtc: number, lastRunAt: Date | null, now: number): boolean {
  const reference = lastRunAt ? lastRunAt.getTime() : processStartedAt;
  // When the next scheduled firing after `reference` was due.
  const next = new Date(reference);
  next.setUTCHours(hourUtc, 0, 0, 0);
  let dueAt = next.getTime();
  while (dueAt <= reference) dueAt += DAY_MS;
  return now > dueAt + GRACE_MS;
}
