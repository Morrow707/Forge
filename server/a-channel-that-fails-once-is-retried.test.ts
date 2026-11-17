import { beforeEach, describe, expect, it, vi } from "vitest";

/* 2026-11-17: Kettlebell Kings (1,475 videos the run before) came back "0 (API error)" between
 * two channels that loaded, and the report could not say whether that was a spent quota or a
 * one-off. A one-off now gets a retry; a spent quota does not, and both say which they were. */
const channelCatalogue = vi.fn();
vi.mock("./youtube-catalog", () => ({
  channelCatalogue: (...a: unknown[]) => channelCatalogue(...a),
  searchVideosFor: vi.fn(),
  newQuotaLedger: () => ({ units: 0, calls: 0 }),
}));

const { loadChannel } = await import("./exercise-video-backfill");
const ledger = () => ({ units: 0, calls: 0 });
const catalogue = { channel: "Kettlebell Kings", videos: [], truncated: false };
let n = 0;
const handle = () => `retry-test-${process.pid}-${Date.now()}-${n++}`; // never a cache hit

describe("a channel whose load fails once", () => {
  beforeEach(() => {
    channelCatalogue.mockReset();
  });

  it("is retried and loads", async () => {
    channelCatalogue.mockRejectedValueOnce(new Error("YouTube playlistItems failed: 500")).mockResolvedValueOnce(catalogue);
    const r = await loadChannel(handle(), ledger(), undefined, 0);
    expect(r.status).toBe("ok");
    expect(r.result?.channel).toBe("Kettlebell Kings");
    expect(channelCatalogue).toHaveBeenCalledTimes(2);
  });

  it("is not retried when the day's quota is gone, and says so", async () => {
    channelCatalogue.mockRejectedValue(new Error("YouTube playlistItems failed: 403 (quotaExceeded)"));
    const r = await loadChannel(handle(), ledger(), undefined, 0);
    expect(r.status).toBe("error");
    expect(r.errorDetail).toBe("403 (quotaExceeded)");
    expect(channelCatalogue).toHaveBeenCalledTimes(1);
  });

  it("reports YouTube's reason when both tries fail", async () => {
    channelCatalogue.mockRejectedValue(new Error("YouTube channels failed: 500"));
    const r = await loadChannel(handle(), ledger(), undefined, 0);
    expect(r.status).toBe("error");
    expect(r.errorDetail).toBe("500");
    expect(channelCatalogue).toHaveBeenCalledTimes(2);
  });

  it("a handle that does not resolve is not an error", async () => {
    channelCatalogue.mockResolvedValue(null);
    const r = await loadChannel(handle(), ledger(), undefined, 0);
    expect(r.status).toBe("handle_not_found");
    expect(channelCatalogue).toHaveBeenCalledTimes(1);
  });
});

describe("a channel named by search", () => {
  it("skips the handle and finds the channel by name", async () => {
    const { resolveChannel } = await vi.importActual<typeof import("./youtube-catalog")>("./youtube-catalog");
    const calls: string[] = [];
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.stubGlobal("fetch", async (url: URL) => {
      calls.push(`${url.pathname.split("/").pop()}?${[...url.searchParams].filter(([k]) => k !== "key").map(([k, v]) => `${k}=${v}`).join("&")}`);
      const body = url.pathname.endsWith("/search")
        ? { items: [{ id: { channelId: "UCaaaaaaaaaaaaaaaaaaaaaa" } }] }
        : { items: [{ id: "UCaaaaaaaaaaaaaaaaaaaaaa", snippet: { title: "elitefts" }, contentDetails: { relatedPlaylists: { uploads: "UU1" } } }] };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const ch = await resolveChannel("search:EliteFTS", { units: 0, calls: 0 });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    expect(ch?.uploadsPlaylistId).toBe("UU1");
    expect(calls.some((c) => c.includes("forHandle"))).toBe(false);
    expect(calls[0]).toContain("q=EliteFTS");
  });
});
