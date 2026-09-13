import type { Pool } from "pg";
import { aiEnabled } from "./ai";
import { emailEnabled } from "./email";
import { pushEnabled } from "./push";
import { apnsEnabled } from "./apns";
import { usdaFoodLookupEnabled } from "./food-lookup";
import { getFailingSources, type SystemEventRow } from "./system-events";
import { getUploadsDiskUsage } from "./uploaded-files";
import { getJobSchedule, isOverdue } from "./job-lock";

/**
 * The live half of the admin dashboard's status panel.
 *
 * The panel used to report five booleans meaning "an API key was present
 * when the server booted". This module answers the question that was
 * actually being asked -- is it working -- from three kinds of evidence,
 * in descending order of how much they can be trusted:
 *
 *   1. A real probe. Only the database and the uploads disk get one, and
 *      only because both are free, local, and instant.
 *   2. Measured delivery. Push and email are judged on what fraction of
 *      recent sends actually landed, which is stronger than any probe: it
 *      is the real traffic, not a synthetic ping.
 *   3. Recorded failures. Everything else reports whether it has failed
 *      recently, via system-events.
 *
 * There is deliberately no synthetic probe against Claude, Resend, APNs or
 * USDA. A dashboard that polls every minute would turn each open admin tab
 * into a standing bill against a metered API and, for Resend, a stream of
 * real messages -- to check something the app's own traffic already
 * reports through (2) and (3). Paying per page view to learn what the
 * error path already knows is a bad trade.
 *
 * Everything is cached for a minute, so several admins with the panel open
 * cost one round of checks rather than one each.
 */

export type ProbeState = "ok" | "warning" | "failing" | "off";

export type ProbeResult = {
  state: ProbeState;
  message?: string;
  count?: number;
  lastSeenAt?: Date;
};

const CACHE_MS = 60_000;

// Below this many attempts in the window, a failure ratio is noise: one
// athlete with a dead push subscription should not turn the badge red for
// the whole platform.
const MIN_ATTEMPTS_FOR_RATE = 20;

// Under 50% delivery is a real outage; under 80% is worth looking at. Both
// are judgement calls rather than measured thresholds -- push in particular
// always loses some share to expired subscriptions, and what "normal" looks
// like here will only be known after this has run against real traffic for
// a while.
const FAILING_DELIVERY_RATE = 0.5;
const WARNING_DELIVERY_RATE = 0.8;

let cache: { at: number; value: HealthSnapshot } | null = null;

async function withPool<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const { pool } = await import("./db");
  return fn(pool);
}

export type DeliveryRate = {
  attempted: number;
  delivered: number;
  rate: number | null;
};

export type JobHealth = {
  jobName: string;
  hourUtc: number;
  lastRunAt: Date | null;
  lastOutcome: string | null;
  lastDetail: Record<string, number> | null;
  lastError: string | null;
  durationMs: number | null;
  // True when the job's scheduled hour has come and gone by a comfortable
  // margin with no run recorded. This is the case a run history alone
  // cannot show: a job that never started writes no row at all, so only
  // the schedule reveals its absence.
  overdue: boolean;
};

export type HealthSnapshot = {
  integrations: Record<string, ProbeResult>;
  delivery: { push: DeliveryRate; email: DeliveryRate; apns: DeliveryRate };
  jobs: JobHealth[];
  storage: { freeBytes: number; totalBytes: number; usedFraction: number; state: ProbeState } | null;
};

/** Record one notification send attempt against today's counters. */
export function recordDeliveryAttempt(channel: "push" | "email" | "apns", delivered: boolean): void {
  void withPool((pool) =>
    pool.query(
      `INSERT INTO notification_delivery_daily (channel, day, attempted, delivered)
       VALUES ($1, current_date, 1, $2)
       ON CONFLICT (channel, day) DO UPDATE SET
         attempted = notification_delivery_daily.attempted + 1,
         delivered = notification_delivery_daily.delivered + $2`,
      [channel, delivered ? 1 : 0],
    ),
  ).catch((err) => {
    // Counting deliveries must never be able to break delivering them.
    console.error("recordDeliveryAttempt could not write:", err);
  });
}

async function getDeliveryRates(): Promise<{
  push: DeliveryRate;
  email: DeliveryRate;
  apns: DeliveryRate;
}> {
  const empty: DeliveryRate = { attempted: 0, delivered: 0, rate: null };
  const fallback = { push: empty, email: empty, apns: empty };
  try {
    const { rows } = await withPool((pool) =>
      pool.query(
        `SELECT channel, SUM(attempted)::int AS attempted, SUM(delivered)::int AS delivered
         FROM notification_delivery_daily
         WHERE day >= current_date - 1
         GROUP BY channel`,
      ),
    );
    const byChannel: Record<string, DeliveryRate> = { push: empty, email: empty, apns: empty };
    for (const row of rows) {
      const attempted = Number(row.attempted) || 0;
      const delivered = Number(row.delivered) || 0;
      byChannel[row.channel] = {
        attempted,
        delivered,
        rate: attempted > 0 ? delivered / attempted : null,
      };
    }
    return {
      push: byChannel.push ?? empty,
      email: byChannel.email ?? empty,
      apns: byChannel.apns ?? empty,
    };
  } catch (err) {
    console.error("Delivery rate lookup failed:", err);
    return fallback;
  }
}

async function probeDatabase(): Promise<ProbeResult> {
  try {
    await withPool((pool) => pool.query("SELECT 1"));
    return { state: "ok" };
  } catch (err) {
    return {
      state: "failing",
      message: err instanceof Error ? err.message : "Database is not responding",
    };
  }
}

// A recorded failure, rendered for a badge.
function fromEvent(event: SystemEventRow | undefined): ProbeResult {
  if (!event) return { state: "ok" };
  return {
    state: event.severity === "warning" ? "warning" : "failing",
    message: event.message,
    count: event.count,
    lastSeenAt: event.lastSeenAt,
  };
}

// A channel judged on what actually reached people, falling back to
// recorded failures when there is not enough traffic to form a ratio.
function fromDelivery(
  configured: boolean,
  rate: DeliveryRate,
  event: SystemEventRow | undefined,
  channelLabel: string,
): ProbeResult {
  if (!configured) return { state: "off" };
  if (rate.attempted >= MIN_ATTEMPTS_FOR_RATE && rate.rate !== null) {
    const percent = Math.round(rate.rate * 100);
    if (rate.rate < FAILING_DELIVERY_RATE) {
      return {
        state: "failing",
        message: `Only ${percent}% of ${channelLabel} reached anyone in the last 24 hours`,
      };
    }
    if (rate.rate < WARNING_DELIVERY_RATE) {
      return {
        state: "warning",
        message: `${percent}% of ${channelLabel} delivered in the last 24 hours`,
      };
    }
    // Measured success outranks an old recorded failure: if 95% of sends
    // are landing right now, the provider is working whatever went wrong
    // earlier in the window.
    return { state: "ok", message: `${percent}% delivered (${rate.attempted} sent)` };
  }
  return fromEvent(event);
}

async function getJobHealth(): Promise<JobHealth[]> {
  const schedule = getJobSchedule();
  if (schedule.length === 0) return [];
  try {
    // One row per job: its most recent run of any outcome. DISTINCT ON is
    // the cheap way to say that in Postgres.
    const { rows } = await withPool((pool) =>
      pool.query(
        `SELECT DISTINCT ON (job_name) job_name, outcome, started_at, duration_ms, detail, error
         FROM job_runs
         WHERE job_name = ANY($1)
         ORDER BY job_name, started_at DESC`,
        [schedule.map((s) => s.jobName)],
      ),
    );
    const byName = new Map(rows.map((r) => [r.job_name, r]));
    const now = Date.now();
    return schedule.map(({ jobName, hourUtc }) => {
      const row = byName.get(jobName);
      const lastRunAt = row ? new Date(row.started_at) : null;
      let detail: Record<string, number> | null = null;
      if (row?.detail) {
        try {
          detail = JSON.parse(row.detail);
        } catch {
          detail = null;
        }
      }
      return {
        jobName,
        hourUtc,
        lastRunAt,
        lastOutcome: row?.outcome ?? null,
        lastDetail: detail,
        lastError: row?.error ?? null,
        durationMs: row?.duration_ms ?? null,
        overdue: isOverdue(hourUtc, lastRunAt, now),
      };
    });
  } catch (err) {
    console.error("Job health lookup failed:", err);
    return schedule.map(({ jobName, hourUtc }) => ({
      jobName,
      hourUtc,
      lastRunAt: null,
      lastOutcome: null,
      lastDetail: null,
      lastError: null,
      durationMs: null,
      overdue: false,
    }));
  }
}

/** The whole live picture, cached for a minute. */
export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const [failing, delivery, jobs, disk, database] = await Promise.all([
    getFailingSources().catch(() => new Map<string, SystemEventRow>()),
    getDeliveryRates(),
    getJobHealth(),
    getUploadsDiskUsage(),
    probeDatabase(),
  ]);

  const configured = (key: string, isConfigured: boolean): ProbeResult =>
    isConfigured ? fromEvent(failing.get(key)) : { state: "off" };

  const value: HealthSnapshot = {
    integrations: {
      ai: configured("ai", aiEnabled),
      email: fromDelivery(emailEnabled, delivery.email, failing.get("email"), "emails"),
      webPush: fromDelivery(pushEnabled, delivery.push, failing.get("webPush"), "push messages"),
      // Judged on its own measured deliveries now, the same way webPush and
      // email are -- it used to fall back to configured()/fromEvent() only,
      // which meant a real native-push outage never turned this badge red
      // unless something had also called recordSystemFailure("apns", ...)
      // by hand (nothing does). Before this, apns's actual traffic was
      // folded into the "push" counter and judged under the webPush badge
      // instead -- see notify.ts and push.ts.
      apns: fromDelivery(apnsEnabled, delivery.apns, failing.get("apns"), "native push messages"),
      usdaFoodLookup: configured("usdaFoodLookup", usdaFoodLookupEnabled),
      database,
    },
    delivery,
    jobs,
    storage: disk
      ? {
          ...disk,
          // 90% is where an upload of a few hundred megabytes starts being
          // at real risk of not fitting.
          state: disk.usedFraction >= 0.9 ? "failing" : disk.usedFraction >= 0.75 ? "warning" : "ok",
        }
      : null,
  };

  cache = { at: Date.now(), value };
  return value;
}

/** Drops the cache, so a test or an admin refresh sees current state. */
export function resetHealthCache(): void {
  cache = null;
}

export const __testing = { fromDelivery, MIN_ATTEMPTS_FOR_RATE };
