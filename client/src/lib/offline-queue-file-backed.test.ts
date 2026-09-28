import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// The file-backed half of the offline save queue (pending-log-files.ts). Scott, 2026-09-28,
// after two tracked sets were lost to the 5MB localStorage quota during a server restart: "How
// do we avoid losing them in the future, we cannot have this happen." The body of a queued
// save goes to a file on the phone; only the index stays in localStorage. These tests drive
// the queue with the Filesystem stood in by a Map, so a 6MB body never meets the quota.

class MemoryStorage {
  private map = new Map<string, string>();
  maxBytes = Infinity;
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (v.length > this.maxBytes) throw new DOMException("QuotaExceededError");
    this.map.set(k, v);
  }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

const apiRequest = vi.fn();
const files = new Map<string, unknown>();
let writeFails = false;

vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  queryClient: { invalidateQueries: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message = "") { super(message); this.status = status; }
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));
vi.mock("@capacitor/network", () => ({ Network: { addListener: vi.fn() } }));
vi.mock("@capacitor/app", () => ({ App: { addListener: vi.fn() } }));
vi.mock("@/lib/pending-log-files", () => ({
  pendingLogFilesSupported: () => true,
  pendingLogFilePath: (id: string) => `pending-logs/${id}.json`,
  writePendingLogFile: async (id: string, payload: unknown) => {
    await Promise.resolve();
    if (writeFails) throw new Error("disk");
    files.set(`pending-logs/${id}.json`, payload);
    return `pending-logs/${id}.json`;
  },
  readPendingLogFile: async (path: string) => files.get(path) ?? null,
  deletePendingLogFile: async (path: string) => { files.delete(path); },
}));

let storageStub: MemoryStorage;

beforeEach(() => {
  vi.resetModules();
  apiRequest.mockReset();
  files.clear();
  writeFails = false;
  storageStub = new MemoryStorage();
  vi.stubGlobal("localStorage", storageStub);
  vi.stubGlobal("crypto", { randomUUID: () => `id-${Math.random().toString(36).slice(2)}` });
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

async function load() {
  const owner = await import("@/lib/queue-owner");
  const queue = await import("@/lib/offline-queue");
  return { ...owner, ...queue };
}

const DAY = "1:2:2026-09-05";
const URL = "/api/athlete/log";
// Six megabytes of "skeleton frames", which is what a tracked set actually queues.
const HEAVY = { sets: 1, skeletonFrames: "x".repeat(6 * 1024 * 1024) };

describe("a queued body lives in a file, so the localStorage quota cannot touch it", () => {
  it("keeps a 6MB body whole when localStorage would refuse it", async () => {
    const m = await load();
    storageStub.maxBytes = 5 * 1024 * 1024;
    m.setQueueOwner(7);
    const entry = m.queueLog(DAY, URL, HEAVY);
    expect(entry).not.toBeNull();
    expect(entry!.payloadFile).toMatch(/^pending-logs\/.*\.json$/);
    expect(entry!.payload).toBeNull();
    // The index is small; the body is in the file.
    expect(storageStub.getItem("forge:pending-logs")!.length).toBeLessThan(2000);

    apiRequest.mockResolvedValue({});
    await m.flushPendingLogs();
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls[0][2]).toEqual(HEAVY);
    expect(m.getPendingLogs()).toHaveLength(0);
    expect(files.size).toBe(0);
  });

  it("hands the page the full body when it claims the day, and deletes the file", async () => {
    const m = await load();
    m.setQueueOwner(7);
    m.queueLog(DAY, URL, HEAVY);
    const taken = await m.takePendingLog(DAY);
    expect(taken?.payload).toEqual(HEAVY);
    expect(taken?.payloadFile).toBeUndefined();
    expect(files.size).toBe(0);
  });

  it("flushes a body whose file write is still in flight", async () => {
    const m = await load();
    m.setQueueOwner(7);
    apiRequest.mockResolvedValue({});
    m.queueLog(DAY, URL, HEAVY);
    // No await between queue and flush: the reconnect listener can fire that fast.
    await m.flushPendingLogs();
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls[0][2]).toEqual(HEAVY);
  });

  it("falls back to the inline body when the file cannot be written", async () => {
    const m = await load();
    m.setQueueOwner(7);
    writeFails = true;
    m.queueLog(DAY, URL, { sets: 1 });
    await new Promise((r) => setTimeout(r, 0));
    const [entry] = m.getPendingLogs();
    expect(entry.payloadFile).toBeUndefined();
    expect(entry.payload).toEqual({ sets: 1 });
    apiRequest.mockResolvedValue({});
    await m.flushPendingLogs();
    expect(apiRequest.mock.calls[0][2]).toEqual({ sets: 1 });
  });

  it("re-queuing the same day forgets the older file", async () => {
    const m = await load();
    m.setQueueOwner(7);
    m.queueLog(DAY, URL, { sets: 1 });
    await new Promise((r) => setTimeout(r, 0));
    m.queueLog(DAY, URL, { sets: 2 });
    await new Promise((r) => setTimeout(r, 0));
    expect(files.size).toBe(1);
    expect(m.getPendingLogs()).toHaveLength(1);
  });

  it("drops an index entry whose file is gone instead of retrying it forever", async () => {
    const m = await load();
    m.setQueueOwner(7);
    m.queueLog(DAY, URL, { sets: 1 });
    await new Promise((r) => setTimeout(r, 0));
    files.clear(); // a reinstall wiped the data directory
    await m.flushPendingLogs();
    expect(apiRequest).not.toHaveBeenCalled();
    expect(m.getPendingLogs()).toHaveLength(0);
  });
});
