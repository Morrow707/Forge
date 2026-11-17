/* A QUEUED WORKOUT SAVE IS NEVER DROPPED. A 409 IS ANSWERED BY CATCHING UP, NOT BY GIVING UP.
 *
 * 2026-11-17, round twenty, bench set 2: the save carrying it landed (200), the NEXT save landed
 * too but its response was lost in transit ("Load failed"), so the phone queued it with the old
 * revision. Every retry of that queued save met a 409 -- "updated somewhere else", where the
 * somewhere else was this phone's own landed save -- and at the next app open the queue DROPPED
 * it. The catch-up that recognises exactly this case only ran on a first send, never a replay.
 * Scott: "NOTHING SHOULD BE REJECTED ITS THE FIRST FUCKING RULE" / "The server should have kept
 * trying until it was successful, periodic end of story."
 *
 * The rule now: on a 409, re-read the day. A save replaces the whole day, so it is re-sent at the
 * server's revision whenever it still carries EVERY set the server holds -- then nothing on the
 * server can be lost by it (capture columns and clips a payload omits are carried forward by the
 * server, keyed by exercise and set). If the server holds a set the queued save does not -- a
 * genuine edit somewhere else -- the queued save is HELD and tried again later, never deleted. */

type SetLike = { setNumber?: number | null };
type EntryLike = { programExerciseId?: number | null; correctiveId?: number | null; sets?: SetLike[] | null };
export type QueuedSavePayload = {
  assignmentId?: number;
  programDayId?: number;
  date?: string;
  baseRevision?: number;
  entries?: EntryLike[];
} & Record<string, unknown>;
export type DayLog = { revision?: number | null; entries?: EntryLike[] | null } | null | undefined;

function entryKey(e: EntryLike): string | null {
  if (e.programExerciseId != null) return `e${e.programExerciseId}`;
  if (e.correctiveId != null) return `c${e.correctiveId}`;
  return null;
}

function setKeys(entries: EntryLike[] | null | undefined): Set<string> {
  return new Set(
    (entries ?? []).flatMap((e) => {
      const k = entryKey(e);
      return k == null
        ? []
        : (e.sets ?? []).filter((s) => s.setNumber != null).map((s) => `${k}:${s.setNumber}`);
    }),
  );
}

/** Every set the server holds for the day is also in the queued save. */
export function payloadCoversDay(payload: QueuedSavePayload, log: DayLog): boolean {
  const ours = setKeys(payload.entries);
  return [...setKeys(log?.entries)].every((key) => ours.has(key));
}

/** The day URL that matches a queued save's `/log` URL. */
export function dayUrlFor(logUrl: string, payload: QueuedSavePayload): string | null {
  if (!logUrl.endsWith("/log") || payload.assignmentId == null || payload.programDayId == null || !payload.date) return null;
  const base = logUrl.slice(0, -"/log".length);
  return `${base}/day?assignmentId=${payload.assignmentId}&programDayId=${payload.programDayId}&date=${payload.date}`;
}

export type RebaseDecision =
  | { kind: "resend"; payload: QueuedSavePayload; serverRevision: number }
  | { kind: "hold"; why: string };

/** Decide what a 409'd save does next, from the day as the server holds it now. Pure. */
export function rebaseDecision(payload: QueuedSavePayload, log: DayLog): RebaseDecision {
  const serverRevision = log?.revision;
  if (typeof serverRevision !== "number") return { kind: "hold", why: "the server's day carries no revision" };
  if (!payloadCoversDay(payload, log)) {
    return { kind: "hold", why: "the server holds a set this save does not, so it waits rather than overwrite it" };
  }
  return { kind: "resend", payload: { ...payload, baseRevision: serverRevision }, serverRevision };
}
