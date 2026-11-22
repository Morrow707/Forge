/* THE WEIGHT-ROOM STATION ON TOP OF THE PHONE'S SAVE QUEUE (2026-11-22).
 *
 * There is ONE queue (offline-queue.ts): the same storage (inline on the web, a file per body on
 * the phone through pending-log-files.ts), the same flush on `online`, `networkStatusChange` and
 * `resume`, the same held-and-retried rule for a refusal, the same 409 catch-up. This file only
 * adds what the station needs on top: its key (station-save-rules.ts), the merge of two saves for
 * one athlete's day, and a summary the station draws its banner and tile marks from. */
import { clearPendingLog, getPendingLogs, loadPayload, queueLog, type PendingLog } from "@/lib/offline-queue";
import { belongsToCurrentUser } from "@/lib/queue-owner";
import {
  mergeStationPayloads,
  parseStationDayKey,
  stationDayKey,
  stationLogUrl,
  type StationSavePayload,
} from "@/lib/station-save-rules";

/** Queue one athlete's station save on this tablet, merged with anything already queued for that
 * athlete's same workout and day. True when it is safely stored. */
export async function queueStationSave(teamId: number, athleteId: number, payload: StationSavePayload): Promise<boolean> {
  const dayKey = stationDayKey({ teamId, athleteId, ...payload });
  const existing = getPendingLogs().find((p) => p.dayKey === dayKey);
  const older = existing ? ((await loadPayload(existing)) as StationSavePayload | null) : null;
  return queueLog(dayKey, stationLogUrl(teamId, athleteId), mergeStationPayloads(older, payload)) != null;
}

/** A save for this athlete's day reached the server: nothing older for it is still waiting. */
export function clearStationSave(teamId: number, athleteId: number, payload: StationSavePayload): void {
  clearPendingLog(stationDayKey({ teamId, athleteId, ...payload }));
}

export type StationQueueSummary = {
  /** Athletes with at least one save waiting on this tablet. */
  athleteIds: number[];
  /** Of those, the ones the server has refused and the queue is holding (retried on a slow clock). */
  heldAthleteIds: number[];
};

function stationEntriesFor(teamId: number, entries: PendingLog[]) {
  return entries
    .map((entry) => ({ entry, parts: parseStationDayKey(entry.dayKey) }))
    .filter(({ entry, parts }) => parts != null && parts.teamId === teamId && belongsToCurrentUser(entry.ownerId));
}

/** What this team's station has waiting on the tablet, read from the shared queue. */
export function stationQueueSummary(teamId: number, entries: PendingLog[] = getPendingLogs()): StationQueueSummary {
  const mine = stationEntriesFor(teamId, entries);
  const ids = (list: typeof mine) => [...new Set(list.map(({ parts }) => parts?.athleteId ?? 0))].sort((a, b) => a - b);
  return { athleteIds: ids(mine), heldAthleteIds: ids(mine.filter(({ entry }) => entry.heldSince != null)) };
}

/** Every set waiting on this tablet for one athlete at one station, so reopening their tile shows
 * what was typed instead of an empty form that would be saved over it. */
export async function queuedStationSaves(teamId: number, athleteId: number): Promise<StationSavePayload[]> {
  const mine = stationEntriesFor(teamId, getPendingLogs()).filter(({ parts }) => parts?.athleteId === athleteId);
  const payloads = await Promise.all(mine.map(({ entry }) => loadPayload(entry)));
  return payloads.filter((p): p is StationSavePayload => p != null);
}
