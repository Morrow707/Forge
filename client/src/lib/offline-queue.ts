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
export function queueLog(dayKey: string, payload: unknown) {
  const entry: PendingLog = {
    id: crypto.randomUUID(),
    dayKey,
    payload,
    queuedAt: new Date().toISOString(),
  };
  writeQueue([...readQueue().filter((p) => p.dayKey !== dayKey), entry]);
  return entry;
}

async function flushPendingLogs() {
  const pending = readQueue();
  if (pending.length === 0) return;
  let syncedAny = false;
  for (const entry of pending) {
    try {
      await apiRequest("POST", "/api/athlete/log", entry.payload);
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
