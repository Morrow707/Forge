/* THE WEIGHT-ROOM STATION'S QUEUED SAVES: THE RULES, PURE (2026-11-22).
 *
 * Weight rooms have bad signal. A station save that cannot reach the server is queued on the
 * tablet through the SAME queue the phone's workout screen uses (offline-queue.ts), and the global
 * flush replays it when the connection returns. Three things are different about a station entry,
 * and all three are decided here so they can be tested with no DOM and no network:
 *
 *  - THE KEY. The station logs FOR athletes under the COACH's session, so the queue's owner stamp
 *    is the coach and cannot tell two athletes apart. The day key carries the athlete id (and the
 *    team, the assignment, the program day and the date), so one athlete's queued sets can never
 *    replace, or be replayed as, another's. The URL carries the athlete id too, and is the
 *    station's own route, never the athlete's /api/athlete/log.
 *  - THE CATCH-UP. A 409 re-reads the athlete's day through the station's own read (with the
 *    queued day's date, which may no longer be today) and applies the shared rule in
 *    queued-save-rebase.ts: re-send at the server's revision when the save still carries every set
 *    the server holds, otherwise HOLD. A set filmed on the athlete's phone is left out of that
 *    comparison because the station's merge never touches one.
 *  - TWO SAVES FOR ONE DAY MERGE. The station sends only the sets typed on it and the server
 *    merges them over the day, so a second offline save for the same athlete and day must carry
 *    the first one's sets too, or replacing the queued entry would lose them. */
import { rebaseDecision, type DayLog, type QueuedSavePayload } from "@/lib/queued-save-rebase";

export const STATION_DAY_KEY_PREFIX = "station:";

export type StationSet = {
  programExerciseId: number;
  setNumber: number;
  reps: string | null;
  weight: string | null;
  weightUnit: "lbs" | "kg";
};

export type StationSavePayload = {
  assignmentId: number;
  programDayId: number;
  date: string;
  baseRevision?: number;
  completed?: boolean;
  sets: StationSet[];
};

export type StationDayKeyParts = {
  teamId: number;
  athleteId: number;
  assignmentId: number;
  programDayId: number;
  date: string;
};

/** The queue key for one athlete's one workout on one day, at one team's station. */
export function stationDayKey(p: StationDayKeyParts): string {
  return `${STATION_DAY_KEY_PREFIX}t${p.teamId}:a${p.athleteId}:${p.assignmentId}:${p.programDayId}:${p.date}`;
}

// "station:t3:a41:235:295:2026-11-22" matches; "48:164:2026-09-29" (a phone day key) and
// "station:t3:235:295:2026-11-22" (no athlete) do not.
// https://regex101.com/?regex=%5Estation%3At(%5Cd%2B)%3Aa(%5Cd%2B)%3A(%5Cd%2B)%3A(%5Cd%2B)%3A(%5Cd%7B4%7D-%5Cd%7B2%7D-%5Cd%7B2%7D)%24&testString=station%3At3%3Aa41%3A235%3A295%3A2026-11-22
const STATION_DAY_KEY_RE = /^station:t(\d+):a(\d+):(\d+):(\d+):(\d{4}-\d{2}-\d{2})$/;

/** The parts of a station key, or null for any other queue entry (a phone's own day). */
export function parseStationDayKey(key: string): StationDayKeyParts | null {
  const m = STATION_DAY_KEY_RE.exec(key);
  if (!m) return null;
  return {
    teamId: Number(m[1]),
    athleteId: Number(m[2]),
    assignmentId: Number(m[3]),
    programDayId: Number(m[4]),
    date: m[5],
  };
}

export function stationLogUrl(teamId: number, athleteId: number): string {
  return `/api/coach/weight-room/station/${teamId}/athletes/${athleteId}/log`;
}

// "/api/coach/weight-room/station/3/athletes/41/log" matches; "/api/athlete/log" and
// "/api/coach/weight-room/station/3/athletes/41" do not.
// https://regex101.com/?regex=%5E%2Fapi%2Fcoach%2Fweight-room%2Fstation%2F%5Cd%2B%2Fathletes%2F%5Cd%2B%2Flog%24&testString=%2Fapi%2Fcoach%2Fweight-room%2Fstation%2F3%2Fathletes%2F41%2Flog
const STATION_LOG_URL_RE = /^\/api\/coach\/weight-room\/station\/\d+\/athletes\/\d+\/log$/;

export function isStationLogUrl(url: string): boolean {
  return STATION_LOG_URL_RE.test(url);
}

/** The station read that matches a station save URL, for the queued day's date. */
export function stationDayUrl(logUrl: string, date: string): string | null {
  if (!isStationLogUrl(logUrl)) return null;
  return `${logUrl.slice(0, -"/log".length)}?date=${encodeURIComponent(date)}`;
}

const setKey = (s: { programExerciseId: number; setNumber: number }) => `${s.programExerciseId}:${s.setNumber}`;

/** Two saves for one athlete's one day, queued one after the other: every set from both, the
 * newer typing winning a set both carry, the newer read's revision, and finished if either said
 * finished. Never loses a set from the older one. */
export function mergeStationPayloads(older: StationSavePayload | null, newer: StationSavePayload): StationSavePayload {
  if (!older) return newer;
  // Later entries in the list win the Map key, so the newer typing wins a set both carry.
  const bySet = new Map<string, StationSet>([...older.sets, ...newer.sets].map((s) => [setKey(s), s]));
  const sets = [...bySet.values()].sort((a, b) => a.programExerciseId - b.programExerciseId || a.setNumber - b.setNumber);
  const completed = Boolean(older.completed) || Boolean(newer.completed);
  const baseRevision = newer.baseRevision ?? older.baseRevision;
  return {
    assignmentId: newer.assignmentId,
    programDayId: newer.programDayId,
    date: newer.date,
    ...(baseRevision !== undefined ? { baseRevision } : {}),
    ...(completed ? { completed: true } : {}),
    sets,
  };
}

/** What the station's own read says about one workout (the part this rule needs). */
export type StationDayRead = {
  workouts?: {
    assignmentId: number;
    programDayId: number;
    revision: number | null;
    exercises: { programExerciseId: number; logged: { setNumber: number; filmed: boolean }[] }[];
  }[];
} | null;

function asQueuedShape(payload: StationSavePayload): QueuedSavePayload {
  const byExercise = payload.sets.reduce(
    (map, s) => map.set(s.programExerciseId, [...(map.get(s.programExerciseId) ?? []), { setNumber: s.setNumber }]),
    new Map<number, { setNumber: number }[]>(),
  );
  return {
    assignmentId: payload.assignmentId,
    programDayId: payload.programDayId,
    date: payload.date,
    ...(payload.baseRevision !== undefined ? { baseRevision: payload.baseRevision } : {}),
    entries: [...byExercise].map(([programExerciseId, sets]) => ({ programExerciseId, sets })),
  };
}

function asDayLog(payload: StationSavePayload, read: StationDayRead): DayLog {
  const workout = read?.workouts?.find(
    (w) => w.assignmentId === payload.assignmentId && w.programDayId === payload.programDayId,
  );
  if (!workout) return null;
  return {
    revision: workout.revision,
    // A filmed set is the camera's and the station's merge never touches it, so it is not a set
    // this save could overwrite and is left out of "does the save carry every set".
    entries: workout.exercises.map((ex) => ({
      programExerciseId: ex.programExerciseId,
      sets: ex.logged.filter((s) => !s.filmed).map((s) => ({ setNumber: s.setNumber })),
    })),
  };
}

export type StationRebaseDecision =
  | { kind: "resend"; payload: StationSavePayload; serverRevision: number }
  | { kind: "hold"; why: string };

/** What a 409'd station save does next, from the station's fresh read of that athlete's day. The
 * shared rule (queued-save-rebase.ts), applied to the station's shapes. Pure. */
export function stationRebaseDecision(payload: StationSavePayload, read: StationDayRead): StationRebaseDecision {
  const log = asDayLog(payload, read);
  if (!log) return { kind: "hold", why: "the workout is not on the athlete's day as the server reads it" };
  const decision = rebaseDecision(asQueuedShape(payload), log);
  if (decision.kind === "hold") return decision;
  return {
    kind: "resend",
    payload: { ...payload, baseRevision: decision.serverRevision },
    serverRevision: decision.serverRevision,
  };
}

/** The station's banner. "Saved" is only ever said beside "on this tablet" until the server has it. */
export function waitingBanner(count: number, online: boolean): string {
  const who = count === 1 ? "1 athlete's sets" : `${count} athletes' sets`;
  return online
    ? `${who} saved on this tablet and waiting to send. The tablet keeps trying.`
    : `Offline: ${who} saved on this tablet, they will send when the connection is back.`;
}

/** What the coach reads before leaving the station with saves still on the tablet. Leaving is
 * never blocked: the saves stay queued and send once the tablet is back online. */
export function leaveWithUnsentWarning(count: number): string | null {
  if (count === 0) return null;
  const who = count === 1 ? "1 athlete's sets have" : `${count} athletes' sets have`;
  return `${who} not been sent yet. They stay saved on this tablet and send when it is back online, so keep Forge on this tablet until they do.`;
}

const STATUS_TIMEOUT = 408;
const STATUS_UNAUTHORIZED = 401;
const STATUS_TOO_MANY = 429;
const STATUS_SERVER_ERROR_FLOOR = 500;

/** Whether a failed live station save is queued on the tablet rather than shown as an error. A
 * dropped connection (`NetworkError`, which is deliberately not an ApiError: see CLAUDE.md "A set
 * that was logged and a set that reached the server"), a server that is restarting (5xx), a
 * timeout or rate limit, and an expired session all mean "try again later". A refusal the server
 * gave on purpose (a 400, a 403 gate, a 404) is shown, because the coach can act on it now. */
export function stationSaveShouldQueue(err: unknown): boolean {
  if (err instanceof Error && err.name === "NetworkError") return true;
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status !== "number") return false;
  return (
    status >= STATUS_SERVER_ERROR_FLOOR ||
    status === STATUS_TIMEOUT ||
    status === STATUS_TOO_MANY ||
    status === STATUS_UNAUTHORIZED
  );
}
