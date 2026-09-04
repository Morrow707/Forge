import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
// Pure, and kept that way so it can be unit-tested with no DOM -- see its own comment.
import { dropHeavyFields } from "@/lib/log-payload-trim";

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
  // Bumped on every failed sync attempt (network failure or a server
  // rejection alike) -- see flushPendingLogs' own comment for why this
  // exists and why it's never a reason to drop the entry outright.
  failureCount?: number;
  notifiedStale?: boolean;
};

function readQueue(): PendingLog[] {
  try {
    const raw = localStorage.getItem(PENDING_LOGS_KEY);
    return raw ? (JSON.parse(raw) as PendingLog[]) : [];
  } catch {
    return [];
  }
}


function trySetQueue(entries: PendingLog[]): boolean {
  try {
    localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

/** Everything cached purely as a rendering convenience -- the offline day
 * snapshots. Evicting these to make room for a queued LOG is always the
 * right trade: a lost day cache means a screen renders empty until the
 * connection comes back, a lost log means a workout the athlete actually
 * did never reaches the server. */
function evictDayCaches(): boolean {
  let removedAny = false;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(DAY_CACHE_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      localStorage.removeItem(key);
      removedAny = true;
    }
  } catch {
    // Storage unavailable entirely -- nothing to evict, and the caller's
    // next attempt will fail the same way it already did.
  }
  return removedAny;
}


// Writes that MUST NOT silently vanish go through queueLog/writeQueueOrWarn
// below; this stays the plain best-effort write for the paths where losing
// the change is genuinely harmless (marking an entry's failure count,
// removing a synced entry).
function writeQueue(entries: PendingLog[]) {
  trySetQueue(entries);
}

export function getPendingLogs(): PendingLog[] {
  return readQueue();
}

export function hasPendingLog(dayKey: string): boolean {
  return readQueue().some((p) => p.dayKey === dayKey);
}

/** Only the most recent queued save per day matters -- an older queued
 * attempt for the same day is stale the moment a newer one exists.
 *
 * CAM-5: this used to be one best-effort setItem. A camera-tracked set's
 * payload carries skeletonFrames (one full landmark set per recorded frame)
 * plus the traces, and a single tracked set can exceed a browser's whole
 * 5-10MB localStorage allowance on its own -- so the write that failed
 * silently was, disproportionately often, the one for the athlete who just
 * filmed a whole session in a gym with no signal. Which is the exact
 * scenario this queue exists for.
 *
 * So a full store is no longer a shrug. In order, giving up the least
 * valuable thing first, and stopping the moment the entry is safely stored:
 *   1. Evict the day caches -- pure render convenience, always worth trading.
 *   2. Drop the older queued days, newest first: an unsynced day already at
 *      risk is still worth less than the one just logged, and each is a
 *      whole day's payload.
 *   3. Strip the capture replay detail (skeletonFrames, traces) from THIS
 *      payload. Every number the athlete actually logged survives; the
 *      skeleton overlay does not.
 *   4. Tell the athlete, loudly, that this one did not save -- because at
 *      that point it genuinely has not, and silence is the failure mode this
 *      whole change exists to remove.
 * Returns the stored entry, or null when even step 4 was reached. */
export function queueLog(dayKey: string, url: string, payload: unknown): PendingLog | null {
  const entry: PendingLog = {
    id: crypto.randomUUID(),
    dayKey,
    url,
    payload,
    queuedAt: new Date().toISOString(),
  };
  const others = readQueue().filter((p) => p.dayKey !== dayKey);

  if (trySetQueue([...others, entry])) return entry;

  if (evictDayCaches() && trySetQueue([...others, entry])) return entry;

  // Oldest first, so each pass gives up the least recent day still queued.
  const byAge = [...others].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  for (let drop = 1; drop <= byAge.length; drop++) {
    if (trySetQueue([...byAge.slice(drop), entry])) {
      toast.warning(
        "Ran out of offline storage -- an older unsynced day was dropped to make room for this one.",
        { duration: 10000 },
      );
      return entry;
    }
  }

  const trimmed = dropHeavyFields(payload);
  if (trimmed) {
    const trimmedEntry = { ...entry, payload: trimmed };
    if (trySetQueue([trimmedEntry])) {
      toast.warning(
        "Ran out of offline storage -- your set was saved, but the skeleton replay for it was dropped.",
        { duration: 10000 },
      );
      return trimmedEntry;
    }
  }

  toast.error(
    "Out of offline storage -- this workout could NOT be saved on your device. Write your numbers down, or reconnect and log them again before closing the app.",
    { duration: 30000 },
  );
  return null;
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

const STALE_FAILURE_THRESHOLD = 5;

export async function flushPendingLogs() {
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
    } catch (err) {
      // CAM-8: a permanent rejection is not a network failure and must not
      // be retried for the life of the install. A 4xx that isn't 401 (an
      // expired session that the 30-day cookie usually renews), 408, or 429
      // (both explicitly "try again") means the server has looked at this
      // payload and will keep refusing it -- the day it targeted was
      // deleted, the assignment was reassigned, the body no longer
      // validates. Re-POSTing it on every "online" event forever accomplishes
      // nothing except hiding the failure behind one warning at the fifth
      // attempt. Drop it and say so plainly, once, while the athlete can
      // still do something about it.
      const status = err instanceof ApiError ? err.status : null;
      const permanentlyRejected =
        status != null && status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
      if (permanentlyRejected) {
        writeQueue(readQueue().filter((p) => p.id !== entry.id));
        toast.error(
          "A workout you logged offline was rejected by the server and can't be synced -- open that day and re-enter it.",
          { duration: 20000 },
        );
        continue;
      }
      // Still offline, or the server rejected it -- leave it queued and try
      // again on the next flush rather than losing the athlete's data (an
      // outright drop here risks discarding a real set over what might just
      // be an expired session that gets renewed, or a brief server outage).
      // But retrying forever in total silence has its own failure mode: if
      // the rejection turns out to be permanent (the program day it
      // targeted got deleted, say), the athlete never finds out their
      // offline-logged set never actually made it to the server. Re-read
      // fresh rather than trust the loop's own snapshot -- the owning page
      // may have claimed and taken this exact entry while this request was
      // in flight.
      const queue = readQueue();
      const current = queue.find((p) => p.id === entry.id);
      if (!current) continue;
      const failureCount = (current.failureCount ?? 0) + 1;
      const shouldNotify = failureCount === STALE_FAILURE_THRESHOLD && !current.notifiedStale;
      writeQueue(
        queue.map((p) =>
          p.id === entry.id ? { ...p, failureCount, notifiedStale: p.notifiedStale || shouldNotify } : p,
        ),
      );
      if (shouldNotify) {
        toast.error(
          "A workout log saved while you were offline still hasn't synced -- check that day and re-enter it if it's missing.",
          { duration: 15000 },
        );
      }
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
