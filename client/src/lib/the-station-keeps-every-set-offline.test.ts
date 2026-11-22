import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* THE WEIGHT-ROOM STATION KEEPS EVERY SET WHEN THE WI-FI DROPS (2026-11-22).
 *
 * The station is one tablet under the coach's session logging FOR athletes. A save that cannot
 * reach the server is queued in the phone's own queue (offline-queue.ts) under a key that carries
 * the athlete, and replayed to the STATION's route. Driven here through the real queue with only
 * the network and storage faked: a transport failure queues, a replay lands and clears, a 409
 * catches up through the station's own read or holds, two athletes never mix, two saves for one
 * day merge, a reload keeps everything, and nothing is ever dropped (Rule #1). */

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

const apiRequest = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();
class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message = "", code?: string) { super(message); this.status = status; this.code = code; }
}
class NetworkError extends Error {
  readonly code = "network_unreachable";
  constructor(message = "Can't reach Forge") { super(message); this.name = "NetworkError"; }
}

vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  queryClient: { invalidateQueries: vi.fn() },
  ApiError,
}));
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), warning: (...a: unknown[]) => toastWarning(...a), success: vi.fn() } }));
vi.mock("@capacitor/network", () => ({ Network: { addListener: vi.fn() } }));
vi.mock("@capacitor/app", () => ({ App: { addListener: vi.fn() } }));
// The phone's file-backed bodies, faked as a map so the native path can be driven too.
const files = new Map<string, unknown>();
let filesSupported = false;
vi.mock("@/lib/pending-log-files", () => ({
  pendingLogFilesSupported: () => filesSupported,
  pendingLogFilePath: (id: string) => `pending-logs/${id}.json`,
  writePendingLogFile: async (id: string, payload: unknown) => { files.set(`pending-logs/${id}.json`, JSON.parse(JSON.stringify(payload))); return `pending-logs/${id}.json`; },
  readPendingLogFile: async (path: string) => files.get(path) ?? null,
  deletePendingLogFile: async (path: string) => { files.delete(path); },
}));

const COACH = 7;
const TEAM = 3;
const JORDAN = 41;
const CASEY = 42;
const DATE = "2026-11-22";

const save = (sets: { pe?: number; n: number; reps: string; weight: string }[], extra: Record<string, unknown> = {}) => ({
  assignmentId: 235,
  programDayId: 295,
  date: DATE,
  baseRevision: 4,
  sets: sets.map((s) => ({ programExerciseId: s.pe ?? 9, setNumber: s.n, reps: s.reps, weight: s.weight, weightUnit: "lbs" as const })),
  ...extra,
});

const read = (revision: number, logged: { n: number; filmed?: boolean }[]) => ({
  json: async () => ({
    displayName: "Jordan R.",
    date: DATE,
    blocked: null,
    workouts: [
      {
        assignmentId: 235,
        programDayId: 295,
        revision,
        exercises: [{ programExerciseId: 9, logged: logged.map((s) => ({ setNumber: s.n, filmed: s.filmed ?? false })) }],
      },
    ],
  }),
});

async function load() {
  const q = await import("@/lib/offline-queue");
  const s = await import("@/lib/station-save-queue");
  const r = await import("@/lib/station-save-rules");
  const owner = await import("@/lib/queue-owner");
  owner.setQueueOwner(COACH);
  return { q, s, r };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-22T16:00:00Z"));
  apiRequest.mockReset();
  toastError.mockReset();
  toastWarning.mockReset();
  files.clear();
  filesSupported = false;
  vi.stubGlobal("localStorage", new MemoryStorage());
  let n = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `id-${++n}` });
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const STATION_URL = (athlete: number) => `/api/coach/weight-room/station/${TEAM}/athletes/${athlete}/log`;

describe("which failures the station queues", () => {
  it("queues a dropped connection, a restarting server, a timeout and an expired session; shows a refusal", async () => {
    const { r } = await load();
    expect(r.stationSaveShouldQueue(new NetworkError())).toBe(true);
    for (const status of [500, 502, 503, 408, 429, 401]) expect(r.stationSaveShouldQueue(new ApiError(status))).toBe(true);
    for (const status of [400, 403, 404, 409]) expect(r.stationSaveShouldQueue(new ApiError(status))).toBe(false);
    expect(r.stationSaveShouldQueue(new Error("something else"))).toBe(false);
  });
});

describe("a station save queued on the tablet", () => {
  it("a transport failure is queued per athlete per day, to the station's own route, under the coach", async () => {
    const { q, s } = await load();
    expect(await s.queueStationSave(TEAM, JORDAN, save([{ n: 1, reps: "5", weight: "185" }]))).toBe(true);
    const [entry] = q.getPendingLogs();
    expect(entry.url).toBe(STATION_URL(JORDAN));
    expect(entry.url).not.toBe("/api/athlete/log");
    expect(entry.dayKey).toBe(`station:t${TEAM}:a${JORDAN}:235:295:${DATE}`);
    expect(entry.ownerId).toBe(COACH);
    expect(s.stationQueueSummary(TEAM)).toEqual({ athleteIds: [JORDAN], heldAthleteIds: [] });
    // Another team's station does not count it.
    expect(s.stationQueueSummary(TEAM + 1).athleteIds).toEqual([]);
  });

  it("the global flush replays it to the station route, and the queue and the mark clear", async () => {
    const { q, s } = await load();
    const body = save([{ n: 1, reps: "5", weight: "185" }]);
    await s.queueStationSave(TEAM, JORDAN, body);
    apiRequest.mockResolvedValueOnce({ json: async () => ({ revision: 5 }) });
    await q.flushPendingLogs();
    expect(apiRequest).toHaveBeenCalledWith("POST", STATION_URL(JORDAN), body);
    expect(q.getPendingLogs()).toHaveLength(0);
    expect(s.stationQueueSummary(TEAM).athleteIds).toEqual([]);
  });

  it("still offline: kept, retried, and the athlete-facing re-enter toast never fires on the tablet", async () => {
    const { q, s } = await load();
    await s.queueStationSave(TEAM, JORDAN, save([{ n: 1, reps: "5", weight: "185" }]));
    apiRequest.mockRejectedValue(new NetworkError());
    for (let i = 0; i < 8; i++) await q.flushPendingLogs();
    expect(q.getPendingLogs()).toHaveLength(1);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("a 409 re-reads the day through the station (for the queued date) and re-sends at the server's revision", async () => {
    const { q, s } = await load();
    await s.queueStationSave(TEAM, JORDAN, save([{ n: 1, reps: "5", weight: "185" }, { n: 2, reps: "5", weight: "205" }]));
    apiRequest
      .mockRejectedValueOnce(new ApiError(409, "stale"))
      // The server now holds set 1 (this tablet's own earlier save) and a FILMED set 3 from the
      // phone. The filmed set is the camera's and the merge never touches it, so the save is
      // still complete.
      .mockResolvedValueOnce(read(6, [{ n: 1 }, { n: 3, filmed: true }]))
      .mockResolvedValueOnce({ json: async () => ({ revision: 7 }) });
    await q.flushPendingLogs();
    expect(apiRequest.mock.calls[1]).toEqual(["GET", `/api/coach/weight-room/station/${TEAM}/athletes/${JORDAN}?date=${DATE}`]);
    expect(apiRequest.mock.calls[2][0]).toBe("POST");
    expect(apiRequest.mock.calls[2][1]).toBe(STATION_URL(JORDAN));
    expect(apiRequest.mock.calls[2][2]).toMatchObject({ baseRevision: 6 });
    expect(q.getPendingLogs()).toHaveLength(0);
  });

  it("a 409 where the server holds a set the save does not is HELD, kept, never dropped", async () => {
    const { q, s } = await load();
    await s.queueStationSave(TEAM, JORDAN, save([{ n: 1, reps: "5", weight: "185" }]));
    apiRequest
      .mockRejectedValueOnce(new ApiError(409, "stale"))
      .mockResolvedValueOnce(read(6, [{ n: 1 }, { n: 2 }]));
    await q.flushPendingLogs();
    expect(apiRequest).toHaveBeenCalledTimes(2);
    const [entry] = q.getPendingLogs();
    expect(entry).toBeDefined();
    expect(entry.heldSince).toBeTruthy();
    expect(s.stationQueueSummary(TEAM)).toEqual({ athleteIds: [JORDAN], heldAthleteIds: [JORDAN] });
    // A refusal of any other kind is held the same way.
    apiRequest.mockReset();
  });

  it("two athletes on the same workout and day never mix: two entries, each to its own route with its own sets", async () => {
    const { q, s } = await load();
    const jordan = save([{ n: 1, reps: "5", weight: "185" }]);
    const casey = save([{ n: 1, reps: "8", weight: "95" }]);
    await s.queueStationSave(TEAM, JORDAN, jordan);
    await s.queueStationSave(TEAM, CASEY, casey);
    expect(q.getPendingLogs()).toHaveLength(2);
    expect(s.stationQueueSummary(TEAM).athleteIds).toEqual([JORDAN, CASEY]);
    apiRequest.mockResolvedValue({ json: async () => ({ revision: 5 }) });
    await q.flushPendingLogs();
    const sent = apiRequest.mock.calls.map((c) => [c[1], c[2]]);
    expect(sent).toContainEqual([STATION_URL(JORDAN), jordan]);
    expect(sent).toContainEqual([STATION_URL(CASEY), casey]);
    expect(q.getPendingLogs()).toHaveLength(0);
  });

  it("a second offline save for the same athlete's day carries the first one's sets too", async () => {
    const { q, s } = await load();
    await s.queueStationSave(TEAM, JORDAN, save([{ n: 1, reps: "5", weight: "185" }, { n: 2, reps: "5", weight: "195" }]));
    await s.queueStationSave(TEAM, JORDAN, save([{ n: 2, reps: "4", weight: "205" }, { n: 3, reps: "3", weight: "215" }], { completed: true }));
    const entries = q.getPendingLogs();
    expect(entries).toHaveLength(1);
    const payload = (await q.loadPayload(entries[0])) as { sets: { setNumber: number; reps: string }[]; completed?: boolean };
    expect(payload.sets.map((x) => [x.setNumber, x.reps])).toEqual([[1, "5"], [2, "4"], [3, "3"]]);
    expect(payload.completed).toBe(true);
    expect(await s.queuedStationSaves(TEAM, JORDAN)).toHaveLength(1);
    expect(await s.queuedStationSaves(TEAM, CASEY)).toHaveLength(0);
  });

  it("survives a reload of the page: the queue is read back and sent", async () => {
    const first = await load();
    await first.s.queueStationSave(TEAM, JORDAN, save([{ n: 1, reps: "5", weight: "185" }]));
    vi.resetModules();
    const { q, s } = await load();
    expect(s.stationQueueSummary(TEAM).athleteIds).toEqual([JORDAN]);
    apiRequest.mockResolvedValueOnce({ json: async () => ({ revision: 5 }) });
    await q.flushPendingLogs();
    expect(apiRequest).toHaveBeenCalledWith("POST", STATION_URL(JORDAN), expect.objectContaining({ assignmentId: 235 }));
    expect(q.getPendingLogs()).toHaveLength(0);
  });

  it("on the phone the body goes to a file and a merge reads it back from there", async () => {
    filesSupported = true;
    const { q, s } = await load();
    await s.queueStationSave(TEAM, JORDAN, save([{ n: 1, reps: "5", weight: "185" }]));
    await vi.runAllTimersAsync();
    const [entry] = q.getPendingLogs();
    expect(entry.payloadFile).toBeTruthy();
    expect(entry.payload).toBeNull();
    await s.queueStationSave(TEAM, JORDAN, save([{ n: 2, reps: "5", weight: "195" }]));
    await vi.runAllTimersAsync();
    const [merged] = q.getPendingLogs();
    const body = (await q.loadPayload(merged)) as { sets: { setNumber: number }[] };
    expect(body.sets.map((x) => x.setNumber)).toEqual([1, 2]);
  });

  it("does not count another account's station entries (the coach who queued them signs in to send them)", async () => {
    const { s } = await load();
    await s.queueStationSave(TEAM, JORDAN, save([{ n: 1, reps: "5", weight: "185" }]));
    const owner = await import("@/lib/queue-owner");
    owner.setQueueOwner(COACH + 1);
    expect(s.stationQueueSummary(TEAM).athleteIds).toEqual([]);
  });
});

describe("the key and the URL", () => {
  it("a phone's own day key is not a station key, and a station key always names its athlete", async () => {
    const { r } = await load();
    expect(r.parseStationDayKey("48:164:2026-09-29")).toBeNull();
    const parts = { teamId: TEAM, athleteId: JORDAN, assignmentId: 235, programDayId: 295, date: DATE };
    expect(r.parseStationDayKey(r.stationDayKey(parts))).toEqual(parts);
    expect(r.stationDayKey(parts)).not.toBe(r.stationDayKey({ ...parts, athleteId: CASEY }));
    expect(r.isStationLogUrl("/api/athlete/log")).toBe(false);
    expect(r.isStationLogUrl(STATION_URL(JORDAN))).toBe(true);
  });
});

describe("what the station says", () => {
  it("never says saved without saying it is on the tablet", async () => {
    const { r } = await load();
    expect(r.waitingBanner(3, false)).toBe("Offline: 3 athletes' sets saved on this tablet, they will send when the connection is back.");
    expect(r.waitingBanner(1, true)).toMatch(/^1 athlete's sets saved on this tablet/);
    expect(r.leaveWithUnsentWarning(0)).toBeNull();
    expect(r.leaveWithUnsentWarning(2)).toMatch(/^2 athletes' sets have not been sent yet/);
  });

  it("the page queues a failed save, says where it is, and warns on leaving without blocking it", () => {
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    const page = strip(readFileSync(resolve(__dirname, "../pages/coach/weight-room-station.tsx"), "utf8"));
    expect(page).toMatch(/stationSaveShouldQueue\(err\)\)\s*\{[\s\S]*?queueStationSave\(teamId, athleteId, payload\)/);
    expect(page).toMatch(/saved on this tablet and will send when the connection is back/);
    expect(page).toMatch(/clearStationSave\(teamId, athleteId, payload\)/);
    expect(page).toMatch(/leaveWithUnsentWarning\(waitingCount\)/);
    // The unlock button is enabled on the password alone, never on an empty queue.
    expect(page).toMatch(/disabled=\{!password\}/);
    expect(page).toMatch(/setInterval\(\(\) => \{\s*if \(navigator\.onLine !== false\) void retryNow\(\);/);
  });
});
