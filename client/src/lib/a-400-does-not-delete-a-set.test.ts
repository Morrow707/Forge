import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Build 569, 2026-09-29: the first bench set the camera ever counted right was refused with
// "String must contain at most 40 character(s)" -- our own schema, wrong about our own client
// -- and the save path filed a 400 as permanent. Ten reps and 4MB of traces, gone. A 400 is
// now HELD in the queue: kept, retried on a slow clock, given up on after a week. The fix that
// rescues it is a server deploy, which takes minutes; the set has to still be there when it
// lands.

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
class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message = "", code?: string) { super(message); this.status = status; this.code = code; }
}

vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  queryClient: { invalidateQueries: vi.fn() },
  ApiError,
}));
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), warning: vi.fn(), success: vi.fn() } }));
vi.mock("@capacitor/network", () => ({ Network: { addListener: vi.fn() } }));
vi.mock("@capacitor/app", () => ({ App: { addListener: vi.fn() } }));
vi.mock("@/lib/pending-log-files", () => ({
  pendingLogFilesSupported: () => false,
  pendingLogFilePath: (id: string) => `pending-logs/${id}.json`,
  writePendingLogFile: vi.fn(),
  readPendingLogFile: vi.fn(),
  deletePendingLogFile: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-29T19:00:00Z"));
  apiRequest.mockReset();
  toastError.mockReset();
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("crypto", { randomUUID: () => `id-${Math.random().toString(36).slice(2)}` });
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const DAY = "48:164:2026-09-29";
const URL = "/api/athlete/log";

describe("a 400 holds the set instead of deleting it", () => {
  it("keeps the entry, marks it held, and does not toast a re-enter message", async () => {
    const q = await import("@/lib/offline-queue");
    q.queueLog(DAY, URL, { entries: [{ reps: 10 }] });
    apiRequest.mockRejectedValueOnce(new ApiError(400, "String must contain at most 40 character(s)"));
    await q.flushPendingLogs();
    const [entry] = q.getPendingLogs();
    expect(entry).toBeDefined();
    expect(entry.heldSince).toBeTruthy();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("retries a held entry on a slow clock and lets a server fix rescue it", async () => {
    const q = await import("@/lib/offline-queue");
    q.queueLog(DAY, URL, { entries: [{ reps: 10 }] });
    apiRequest.mockRejectedValueOnce(new ApiError(400, "nope"));
    await q.flushPendingLogs();
    expect(apiRequest).toHaveBeenCalledTimes(1);
    // Twenty seconds later, the regular flush: not re-sent.
    vi.advanceTimersByTime(20_000);
    await q.flushPendingLogs();
    expect(apiRequest).toHaveBeenCalledTimes(1);
    // Past the retry interval, the server has been fixed: it lands and the queue clears.
    vi.advanceTimersByTime(q.HELD_RETRY_INTERVAL_MS);
    apiRequest.mockResolvedValueOnce({ json: async () => ({}) });
    await q.flushPendingLogs();
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(q.getPendingLogs()).toHaveLength(0);
  });

  it("gives up after a week, and says so once", async () => {
    const q = await import("@/lib/offline-queue");
    q.queueLog(DAY, URL, { entries: [{ reps: 10 }] });
    apiRequest.mockRejectedValue(new ApiError(400, "nope"));
    await q.flushPendingLogs();
    vi.advanceTimersByTime(q.HELD_MAX_AGE_MS + 60_000);
    await q.flushPendingLogs();
    expect(q.getPendingLogs()).toHaveLength(0);
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("still drops a 404 or 422 the way it always did", async () => {
    const q = await import("@/lib/offline-queue");
    q.queueLog(DAY, URL, { entries: [{ reps: 10 }] });
    apiRequest.mockRejectedValueOnce(new ApiError(404, "gone"));
    await q.flushPendingLogs();
    expect(q.getPendingLogs()).toHaveLength(0);
  });
});
