import { apiRequest, queryClient } from "@/lib/queryClient";

// Lets the athlete workout page keep working -- viewing and logging -- in a
// gym with no signal, the single most common complaint about apps like
// this. Two pieces: a local snapshot of the last-loaded day so it can still
// render offline, and a queue of log submissions that failed to reach the
// server, retried automatically once the connection comes back.

const DAY_CACHE_PREFIX = "forge:day-cache:";
const PENDING_LOGS_KEY = "forge:pending-logs";

export function dayCacheKey(assignmentId: string, programDayId: string, date: string) {
  return `${assignmentId}:${programDayId}:${date}`;
}

export function saveDayCache(key: string, data: unknown) {
  try {
    localStorage.setItem(DAY_CACHE_PREFIX + key, JSON.stringify(data));
  } catch {
    // Storage full/unavailable (private browsing, etc) -- the cache is a
    // nice-to-have fallback, not something worth surfacing an error for.
  }
}

export function loadDayCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(DAY_CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export type PendingLog = {
  id: string;
  dayKey: string;
  // Which endpoint this was meant for -- /api/athlete/log for an athlete,
  // /api/coach/my/log or /api/admin/my/log for a coach/admin logging their
  // own self-assigned training (see WorkoutPage's shared apiBase). Recorded
  // per-entry rather than assumed, so the generic flush below retries
  // against the SAME endpoint the save actually needed instead of always
  // hitting the athlete one regardless of who queued it.
  url: string;
  payload: unknown;
  queuedAt: string;
};

function readQueue(): PendingLog[] {
  try {
    const raw = localStorage.getItem(PENDING_LOGS_KEY);
    return raw ? (JSON.parse(raw) as PendingLog[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(entries: PendingLog[]) {
  try {
    localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify(entries));
  } catch {
    // best-effort
  }
}

export function getPendingLogs(): PendingLog[] {
  return readQueue();
}

export function hasPendingLog(dayKey: string): boolean {
  return readQueue().some((p) => p.dayKey === dayKey);
}

/** Only the most recent queued save per day matters -- an older queued
 * attempt for the same day is stale the moment a newer one exists. */
export function queueLog(dayKey: string, url: string, payload: unknown) {
  const entry: PendingLog = {
    id: crypto.randomUUID(),
    dayKey,
    url,
    payload,
    queuedAt: new Date().toISOString(),
  };
  writeQueue([...readQueue().filter((p) => p.dayKey !== dayKey), entry]);
  return entry;
}

// WorkoutPage runs its own in-flight save queue (saveInFlightRef/
// pendingSaveRef) so at most one /log POST for the day it has open is ever
// outstanding at once -- the server does a full delete-and-reinsert per
// request, so two unserialized requests racing on network timing alone
// would let whichever one *finishes* last win outright, silently reverting
// to older data even if it started first. flushPendingLogs below is a
// SEPARATE code path (fired on the global "online" event, unaware of any
// mounted page's queue) that would reintroduce exactly that race if it
// ever POSTed a stale queued snapshot while the page's own queue was
// concurrently resolving a fresher save for the same day. Claiming a day
// here while its page is mounted tells the generic flush to leave that
// day's queued entry alone -- see takePendingLog, which is how the owning
// page picks it up and resolves it through its own queue instead.
const claimedDayKeys = new Set<string>();

export function claimDayKeyForFlush(dayKey: string): void {
  claimedDayKeys.add(dayKey);
}

export function releaseDayKeyForFlush(dayKey: string): void {
  claimedDayKeys.delete(dayKey);
}

/** Removes and returns the queued entry for a day, if any -- lets the page
 * that claimed that day (see claimDayKeyForFlush) resolve it through its
 * own serialized save queue instead of leaving it to the generic flush. */
export function takePendingLog(dayKey: string): PendingLog | null {
  const queue = readQueue();
  const entry = queue.find((p) => p.dayKey === dayKey);
  if (!entry) return null;
  writeQueue(queue.filter((p) => p.id !== entry.id));
  return entry;
}

async function flushPendingLogs() {
  const pending = readQueue();
  if (pending.length === 0) return;
  let syncedAny = false;
  for (const entry of pending) {
    // Left for the owning page's own queue to resolve -- see
    // claimDayKeyForFlush's own comment.
    if (claimedDayKeys.has(entry.dayKey)) continue;
    try {
      await apiRequest("POST", entry.url, entry.payload);
      writeQueue(readQueue().filter((p) => p.id !== entry.id));
      syncedAny = true;
    } catch {
      // Still offline, or the server rejected it -- leave it queued and
      // try again on the next flush rather than losing the athlete's data.
    }
  }
  if (syncedAny) {
    queryClient.invalidateQueries({ queryKey: ["/api/athlete/calendar"] });
    queryClient.invalidateQueries({ queryKey: ["/api/athlete/day"] });
  }
}

/** Call once at app startup. */
export function startOfflineLogSync() {
  flushPendingLogs();
  window.addEventListener("online", flushPendingLogs);
}
