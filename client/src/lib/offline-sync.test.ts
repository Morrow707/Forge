import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// A localStorage stand-in -- these modules are pure logic over it, so the
// interesting behaviour is reachable under Node without a DOM.
class MemoryStorage {
  private map = new Map<string, string>();
  full = false;
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (this.full) throw new DOMException("QuotaExceededError");
    this.map.set(k, v);
  }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

const apiRequest = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();

vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  queryClient: { invalidateQueries: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message = "") {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), warning: (...a: unknown[]) => toastWarning(...a), success: vi.fn() },
}));
vi.mock("@capacitor/network", () => ({ Network: { addListener: vi.fn() } }));
vi.mock("@capacitor/app", () => ({ App: { addListener: vi.fn() } }));

let storageStub: MemoryStorage;

beforeEach(() => {
  vi.resetModules();
  apiRequest.mockReset();
  toastError.mockReset();
  toastWarning.mockReset();
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

describe("a queued workout belongs to the account that logged it", () => {
  it("stamps the owner at queue time", async () => {
    const m = await load();
    m.setQueueOwner(7);
    m.queueLog(DAY, URL, { sets: 1 });
    expect(m.getPendingLogs()[0].ownerId).toBe(7);
  });

  it("does not send one athlete's workout under another athlete's session", async () => {
    // The shared-device case, which the Family plan makes ordinary: athlete
    // A logs offline, signs out, athlete B signs in on the same phone.
    const m = await load();
    m.setQueueOwner(7);
    m.queueLog(DAY, URL, { sets: 1 });

    m.setQueueOwner(null); // logout
    await m.flushPendingLogs();
    expect(apiRequest).not.toHaveBeenCalled();

    m.setQueueOwner(9); // a different athlete signs in
    await m.flushPendingLogs();
    expect(apiRequest).not.toHaveBeenCalled();
    // Still theirs, still waiting -- not deleted at logout, which would be
    // throwing away somebody's unsynced workout.
    expect(m.getPendingLogs()).toHaveLength(1);

    m.setQueueOwner(7); // the owner comes back
    apiRequest.mockResolvedValue({});
    await m.flushPendingLogs();
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(m.getPendingLogs()).toHaveLength(0);
  });

  it("still flushes entries queued before owners were stamped", async () => {
    // Anything already on a real device has no ownerId. Stranding it would
    // abandon work that syncs fine today.
    const m = await load();
    localStorage.setItem(
      "forge:pending-logs",
      JSON.stringify([{ id: "legacy", dayKey: DAY, url: URL, payload: {}, queuedAt: new Date().toISOString() }]),
    );
    m.setQueueOwner(9);
    apiRequest.mockResolvedValue({});
    await m.flushPendingLogs();
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});

describe("two triggers firing at once do not send the same workout twice", () => {
  it("runs one flush at a time", async () => {
    const m = await load();
    m.setQueueOwner(7);
    m.queueLog(DAY, URL, { sets: 1 });

    let release: () => void = () => {};
    apiRequest.mockImplementation(() => new Promise<void>((r) => { release = () => r(); }));

    // A Wi-Fi reconnect fires "online" and networkStatusChange within
    // milliseconds of each other.
    const first = m.flushPendingLogs();
    const second = m.flushPendingLogs();
    release();
    await Promise.all([first, second]);

    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});

describe("the athlete finds out when a day will not sync", () => {
  it("warns once the day has failed enough times", async () => {
    const m = await load();
    m.setQueueOwner(7);
    m.queueLog(DAY, URL, { sets: 1 });
    apiRequest.mockRejectedValue(new Error("offline"));

    for (let i = 0; i < 4; i++) await m.flushPendingLogs();
    expect(toastError).not.toHaveBeenCalled();
    await m.flushPendingLogs();
    expect(toastError).toHaveBeenCalledTimes(1);
    // Once, not on every attempt after.
    await m.flushPendingLogs();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("keeps counting across the page claiming and re-queueing the day", async () => {
    // The regression this test exists for: the count used to live on the
    // queue entry, and the workout page takes that entry and queues a fresh
    // one every time it has the day open. Each visit reset the count, so the
    // athlete who kept opening the broken day was the one never warned.
    const m = await load();
    m.setQueueOwner(7);
    m.queueLog(DAY, URL, { sets: 1 });
    apiRequest.mockRejectedValue(new Error("offline"));

    for (let i = 0; i < 4; i++) {
      await m.flushPendingLogs();
      const taken = m.takePendingLog(DAY);
      expect(taken).not.toBeNull();
      m.queueLog(DAY, URL, taken!.payload);
    }
    expect(toastError).not.toHaveBeenCalled();
    await m.flushPendingLogs();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("forgets the count once the day finally syncs", async () => {
    const m = await load();
    m.setQueueOwner(7);
    m.queueLog(DAY, URL, { sets: 1 });
    apiRequest.mockRejectedValue(new Error("offline"));
    for (let i = 0; i < 4; i++) await m.flushPendingLogs();

    apiRequest.mockResolvedValue({});
    await m.flushPendingLogs();
    expect(m.getPendingLogs()).toHaveLength(0);

    // A later failure on the same day starts over rather than warning
    // immediately off a count from a problem that resolved.
    m.queueLog(DAY, URL, { sets: 2 });
    apiRequest.mockRejectedValue(new Error("offline"));
    await m.flushPendingLogs();
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe("the sync triggers", () => {
  it("registers all four, matching the video queue", async () => {
    const { Network } = await import("@capacitor/network");
    const { App } = await import("@capacitor/app");
    const m = await load();
    apiRequest.mockResolvedValue({});
    m.startOfflineLogSync();
    // App resume is the one that was missing: on iOS the app stays resident,
    // so an athlete reconnecting at home never crosses an offline-to-online
    // boundary with a listener running.
    expect(App.addListener).toHaveBeenCalledWith("resume", expect.any(Function));
    expect(Network.addListener).toHaveBeenCalledWith("networkStatusChange", expect.any(Function));
    expect((window as any).addEventListener).toHaveBeenCalledWith("online", expect.any(Function));
  });
});

// The video queue is the sharper of the two on a shared device: a log is
// refused by the server (it scopes the assignment) and dropped, but a video
// upload SUCCEEDS under whoever is signed in, is recorded as their file, and
// only the attach fails.
describe("the video queue is scoped and serialised the same way", () => {
  it("filters what the Video Bank offers to upload by owner", async () => {
    const { belongsToCurrentUser, setQueueOwner } = await import("@/lib/queue-owner");
    setQueueOwner(7);
    expect(belongsToCurrentUser(7)).toBe(true);
    expect(belongsToCurrentUser(9)).toBe(false);
    expect(belongsToCurrentUser(null)).toBe(true); // pre-stamping entries
    setQueueOwner(null);
    expect(belongsToCurrentUser(7)).toBe(false);
  });

  it("stamps, filters and serialises in the source", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "client", "src", "lib", "video-offline-store.ts"),
      "utf8",
    );
    // Stamped where the clip is persisted.
    expect(src).toContain("ownerId: getQueueOwner()");
    // Skipped in the flush, in the manual "Upload now", and in the listing
    // the Video Bank renders -- all three, since any one of them left open
    // is a route back into the other athlete's account.
    expect(src.match(/belongsToCurrentUser/g) ?? []).toHaveLength(4);
    // One upload at a time, because "online" and networkStatusChange both
    // fire on the same Wi-Fi reconnect.
    expect(src).toContain("if (videoFlushInFlight) return;");
  });
});
