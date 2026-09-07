import { createHash } from "crypto";
import type { Pool } from "pg";

/**
 * In-app recording of things that broke, so the admin dashboard can answer
 * "is anything wrong right now" without anyone reading a log stream.
 *
 * This does not replace Sentry -- every one of these still reaches Sentry
 * through the existing paths. It closes a different gap: Sentry only helps
 * if its DSN was pasted into the Render dashboard and someone is watching
 * the alerts. Both DSNs are `sync: false` in render.yaml, meaning Render
 * will not populate them, so the honest default assumption is that nobody
 * is being notified. A red badge on a page the operator already opens is
 * the fallback that needs no configuration at all.
 *
 * Three rules shape everything below:
 *
 *   1. Never throw. Every entry point is called from a catch block or an
 *      error handler, and a health recorder that raises inside error
 *      handling turns a handled failure into a crash. All database work is
 *      wrapped and swallowed.
 *   2. Never block. Callers fire and forget; nothing awaits a write on the
 *      request path.
 *   3. Fold, don't append. A provider rejecting every send for six hours is
 *      one row with a count, not six hundred rows burying everything else.
 *
 * The database handle is reached through a dynamic import rather than a
 * top-level one, and that is load-bearing rather than stylistic. This module
 * is imported by email.ts, ai.ts and job-errors.ts, which the unit suite
 * imports in turn -- and `./db` throws at module scope when DATABASE_URL is
 * unset. A static import here would mean `npm test` required Postgres, which
 * the two-suite split in CLAUDE.md exists specifically to prevent.
 */

let cachedPool: Pool | null = null;

async function withPool<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  if (!cachedPool) {
    const db = await import("./db");
    cachedPool = db.pool;
  }
  return fn(cachedPool);
}

export type SystemEventSource =
  | "ai"
  | "email"
  | "webPush"
  | "apns"
  | "usdaFoodLookup"
  | "database"
  | "storage"
  | "billing"
  | "request"
  | "job";

export type SystemEventSeverity = "warning" | "error";

// Anything older than this stops counting against a badge. A failure from
// last week is history, not a current outage -- it stays readable in the
// list, but the badge returns to green on its own so one ancient blip does
// not leave the dashboard permanently red and therefore ignored.
export const ACTIVE_WINDOW_HOURS = 24;

// Message text is folded into the fingerprint so two genuinely different
// failures on the same source stay separate rows. The volatile parts of a
// message (ids, counts, byte sizes) are stripped first, or every occurrence
// would look unique and folding would never happen.
function fingerprintFor(source: string, message: string): string {
  const normalized = message
    .toLowerCase()
    .replace(/[0-9]+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  return createHash("sha1")
    .update(source + " " + normalized)
    .digest("hex");
}

// Whatever was thrown, rendered as one line an operator can act on. Stack
// traces belong in Sentry; this is the sentence that appears on a card.
function describe(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err).slice(0, 500);
  } catch {
    return String(err);
  }
}

/**
 * Record a failure against `source`. Safe to call from anywhere, including
 * inside an error handler; returns immediately and never rejects.
 */
export function recordSystemFailure(
  source: SystemEventSource | string,
  message: string,
  options?: { severity?: SystemEventSeverity; detail?: unknown }
): void {
  const severity = options?.severity ?? "error";
  const detail = options?.detail === undefined ? null : describe(options.detail);
  const fingerprint = fingerprintFor(source, message);

  // ON CONFLICT rather than select-then-update: two instances during a
  // rolling deploy can record the same failure at the same moment, and the
  // unique index on fingerprint is what makes that safe. `cleared_at` is
  // reset to NULL on conflict so a recurrence un-dismisses a row an admin
  // had already waved away -- if it is happening again, it is not handled.
  void withPool((pool) =>
    pool.query(
      `INSERT INTO system_events (source, severity, message, detail, fingerprint, count, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, 1, now(), now())
       ON CONFLICT (fingerprint) DO UPDATE SET
         count = system_events.count + 1,
         last_seen_at = now(),
         severity = EXCLUDED.severity,
         detail = COALESCE(EXCLUDED.detail, system_events.detail),
         cleared_at = NULL`,
      [source, severity, message.slice(0, 500), detail, fingerprint]
    )
  ).catch((err) => {
    // The database being unreachable is itself one of the things this
    // module reports, and it cannot report that to the database. stderr
    // is the floor; /healthz is what actually catches that case.
    console.error("recordSystemFailure could not write:", err);
  });
}

/**
 * Record that `source` just worked. Clears its outstanding failures, so a
 * badge turns green again on evidence rather than on a timer -- a mail
 * provider that starts accepting sends again goes green on the next
 * successful send, not 24 hours later.
 */
export function recordSystemSuccess(source: SystemEventSource | string): void {
  void withPool((pool) =>
    pool.query(
      `UPDATE system_events SET cleared_at = now() WHERE source = $1 AND cleared_at IS NULL`,
      [source]
    )
  ).catch((err) => {
    console.error("recordSystemSuccess could not write:", err);
  });
}

export type SystemEventRow = {
  id: number;
  source: string;
  severity: SystemEventSeverity;
  message: string;
  detail: string | null;
  count: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

/** Uncleared failures inside the active window, newest first. */
export async function getActiveSystemEvents(limit = 20): Promise<SystemEventRow[]> {
  const { rows } = await withPool((pool) =>
    pool.query(
      `SELECT id, source, severity, message, detail, count, first_seen_at, last_seen_at
     FROM system_events
     WHERE cleared_at IS NULL
       AND last_seen_at > now() - ($1 || ' hours')::interval
     ORDER BY last_seen_at DESC
     LIMIT $2`,
      [String(ACTIVE_WINDOW_HOURS), limit]
    )
  );
  return rows.map(mapRow);
}

/** Everything recorded lately, cleared or not -- the "recent problems" history. */
export async function getRecentSystemEvents(
  limit = 50
): Promise<(SystemEventRow & { clearedAt: Date | null })[]> {
  const { rows } = await withPool((pool) =>
    pool.query(
      `SELECT id, source, severity, message, detail, count, first_seen_at, last_seen_at, cleared_at
     FROM system_events
     ORDER BY last_seen_at DESC
     LIMIT $1`,
      [limit]
    )
  );
  return rows.map((r) => ({ ...mapRow(r), clearedAt: r.cleared_at }));
}

/** Dismiss one event by id. Returns false if it was already gone. */
export async function clearSystemEvent(id: number): Promise<boolean> {
  const { rowCount } = await withPool((pool) =>
    pool.query(`UPDATE system_events SET cleared_at = now() WHERE id = $1 AND cleared_at IS NULL`, [
      id,
    ])
  );
  return (rowCount ?? 0) > 0;
}

/** Sources with an active failure, for turning badges red. */
export async function getFailingSources(): Promise<Map<string, SystemEventRow>> {
  const events = await getActiveSystemEvents(100);
  const worst = new Map<string, SystemEventRow>();
  for (const e of events) {
    const existing = worst.get(e.source);
    // Errors outrank warnings; within a severity the most recent wins, and
    // the list is already newest-first so the first one seen is the newest.
    if (!existing || (existing.severity === "warning" && e.severity === "error")) {
      worst.set(e.source, e);
    }
  }
  return worst;
}

function mapRow(r: any): SystemEventRow {
  return {
    id: r.id,
    source: r.source,
    severity: r.severity,
    message: r.message,
    detail: r.detail,
    count: r.count,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
  };
}

// Exported for tests -- fingerprint stability is the whole basis of folding.
export const __testing = { fingerprintFor, describe };
