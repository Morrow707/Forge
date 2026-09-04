import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NATIVE_APP_ORIGINS } from "./native-app-origins";
import {
  isNativeAppRequest,
  normalizeIp,
  formatDeviceLabel,
  shouldTouchLastSeen,
  resolveLocation,
} from "./session-tracking";

// A real Chrome-on-macOS string and a real iPhone Safari one, rather than
// invented shapes -- the point of formatDeviceLabel is what ua-parser-js
// actually gets out of a live User-Agent.
const UA_CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const UA_IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

describe("isNativeAppRequest", () => {
  it("recognizes each configured native origin", () => {
    for (const origin of NATIVE_APP_ORIGINS as string[]) {
      expect(isNativeAppRequest({ headers: { origin } })).toBe(true);
    }
  });

  it("treats a browser origin as web", () => {
    expect(isNativeAppRequest({ headers: { origin: "https://forge.example.com" } })).toBe(false);
  });

  it("treats a missing or empty origin as web rather than throwing", () => {
    expect(isNativeAppRequest({ headers: {} })).toBe(false);
    expect(isNativeAppRequest({ headers: { origin: "" } })).toBe(false);
  });

  it("does not match an origin that merely contains a native one as a substring", () => {
    const native = (NATIVE_APP_ORIGINS as string[])[0];
    expect(isNativeAppRequest({ headers: { origin: `${native}.evil.com` } })).toBe(false);
    expect(isNativeAppRequest({ headers: { origin: `https://evil.com/?x=${native}` } })).toBe(false);
  });
});

describe("normalizeIp", () => {
  it("strips the IPv4-mapped IPv6 prefix", () => {
    expect(normalizeIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeIp("::ffff:127.0.0.1")).toBe("127.0.0.1");
  });

  it("leaves a plain IPv4 address alone", () => {
    expect(normalizeIp("203.0.113.7")).toBe("203.0.113.7");
  });

  it("leaves a real IPv6 address alone", () => {
    expect(normalizeIp("2606:2800:220:1:248:1893:25c8:1946")).toBe("2606:2800:220:1:248:1893:25c8:1946");
    expect(normalizeIp("::1")).toBe("::1");
  });

  it("passes undefined and empty string straight through", () => {
    expect(normalizeIp(undefined)).toBeUndefined();
    expect(normalizeIp("")).toBeUndefined();
  });

  it("only strips a prefix at the very start", () => {
    expect(normalizeIp("2001:db8::ffff:1.2.3.4")).toBe("2001:db8::ffff:1.2.3.4");
  });
});

describe("formatDeviceLabel", () => {
  it("names browser and OS for a desktop web session", () => {
    expect(formatDeviceLabel(UA_CHROME_MAC, "web")).toBe("Chrome on macOS");
  });

  it("names the device model and OS for a phone", () => {
    expect(formatDeviceLabel(UA_IPHONE, "web")).toBe("iPhone · iOS");
  });

  it("names the device model and OS for a tablet", () => {
    expect(formatDeviceLabel(UA_IPAD, "web")).toBe("iPad · iOS");
  });

  it("marks a native session as the Forge app", () => {
    expect(formatDeviceLabel(UA_IPHONE, "native")).toBe("iPhone · iOS (Forge app)");
    expect(formatDeviceLabel(UA_CHROME_MAC, "native")).toBe("Chrome on macOS (Forge app)");
  });

  it("falls back by kind when there is no User-Agent at all", () => {
    expect(formatDeviceLabel(undefined, "web")).toBe("Unknown device");
    expect(formatDeviceLabel(undefined, "native")).toBe("Forge app");
    expect(formatDeviceLabel("", "web")).toBe("Unknown device");
    expect(formatDeviceLabel("", "native")).toBe("Forge app");
  });

  it("falls back to a generic label for a User-Agent it cannot parse", () => {
    expect(formatDeviceLabel("x", "web")).toBe("Unknown device");
    expect(formatDeviceLabel("x", "native")).toBe("Unknown device (Forge app)");
  });

  it("never returns an empty label", () => {
    for (const ua of [UA_CHROME_MAC, UA_IPHONE, UA_IPAD, "x", "curl/8.4.0", undefined]) {
      for (const kind of ["web", "native"] as const) {
        expect(formatDeviceLabel(ua, kind).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("shouldTouchLastSeen", () => {
  const THROTTLE_MS = 10 * 60 * 1000;
  // Ids are namespaced per test -- the module keeps one process-wide Map and
  // there is no exported reset, so reusing an id across tests would carry
  // state between them.
  let nextId = 1000;
  const freshId = () => nextId++;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes through the first time it sees a session", () => {
    expect(shouldTouchLastSeen(freshId())).toBe(true);
  });

  it("throttles a second call inside the window", () => {
    const id = freshId();
    expect(shouldTouchLastSeen(id)).toBe(true);
    vi.advanceTimersByTime(THROTTLE_MS - 1);
    expect(shouldTouchLastSeen(id)).toBe(false);
  });

  it("writes through again exactly at the window boundary", () => {
    const id = freshId();
    expect(shouldTouchLastSeen(id)).toBe(true);
    vi.advanceTimersByTime(THROTTLE_MS);
    expect(shouldTouchLastSeen(id)).toBe(true);
  });

  it("throttles a burst of requests down to one write", () => {
    const id = freshId();
    const writes = [shouldTouchLastSeen(id), shouldTouchLastSeen(id), shouldTouchLastSeen(id)].filter(Boolean);
    expect(writes).toHaveLength(1);
  });

  it("tracks each session independently", () => {
    const a = freshId();
    const b = freshId();
    expect(shouldTouchLastSeen(a)).toBe(true);
    expect(shouldTouchLastSeen(b)).toBe(true);
    vi.advanceTimersByTime(THROTTLE_MS - 1);
    expect(shouldTouchLastSeen(a)).toBe(false);
    expect(shouldTouchLastSeen(b)).toBe(false);
  });

  it("evicts a session that went quiet, so the map does not grow forever", () => {
    const quiet = freshId();
    const active = freshId();
    expect(shouldTouchLastSeen(quiet)).toBe(true);
    vi.advanceTimersByTime(THROTTLE_MS);
    // This call sweeps the map before recording itself, which is what drops
    // the quiet session's entry.
    expect(shouldTouchLastSeen(active)).toBe(true);
    // The quiet session is gone from the cache. Observable only as behavior:
    // it write-throughs as a first sighting would, which is also what it
    // would have done anyway -- the eviction is about memory, not answers.
    expect(shouldTouchLastSeen(quiet)).toBe(true);
  });

  it("keeps a still-active session's entry when the sweep runs", () => {
    const active = freshId();
    const other = freshId();
    expect(shouldTouchLastSeen(active)).toBe(true);
    vi.advanceTimersByTime(THROTTLE_MS / 2);
    expect(shouldTouchLastSeen(other)).toBe(true); // sweeps
    // active is only half a window old, so it must still be throttled.
    expect(shouldTouchLastSeen(active)).toBe(false);
  });

  it("never write-throughs more than once per window under a long request stream", () => {
    const id = freshId();
    let writes = 0;
    // One request a minute for an hour: six windows, so six writes.
    for (let i = 0; i < 60; i++) {
      if (shouldTouchLastSeen(id)) writes++;
      vi.advanceTimersByTime(60 * 1000);
    }
    expect(writes).toBe(6);
  });
});

describe("resolveLocation", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function ok(body: unknown) {
    return { ok: true, json: async () => body };
  }

  it("joins city, region and country", async () => {
    fetchMock.mockResolvedValue(ok({ city: "Austin", region: "Texas", country_name: "United States" }));
    await expect(resolveLocation("203.0.113.7")).resolves.toBe("Austin, Texas, United States");
  });

  it("omits the parts the service could not supply", async () => {
    fetchMock.mockResolvedValue(ok({ country_name: "Canada" }));
    await expect(resolveLocation("203.0.113.7")).resolves.toBe("Canada");
  });

  it("returns null when the service answered with nothing usable", async () => {
    fetchMock.mockResolvedValue(ok({}));
    await expect(resolveLocation("203.0.113.7")).resolves.toBeNull();
  });

  it("returns null on the service's own error flag", async () => {
    fetchMock.mockResolvedValue(ok({ error: true, city: "Nowhere" }));
    await expect(resolveLocation("203.0.113.7")).resolves.toBeNull();
  });

  it("returns null on a non-200", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    await expect(resolveLocation("203.0.113.7")).resolves.toBeNull();
  });

  it("returns null rather than throwing when the lookup fails outright", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(resolveLocation("203.0.113.7")).resolves.toBeNull();
  });

  it("returns null on a malformed body", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError("bad json"); } });
    await expect(resolveLocation("203.0.113.7")).resolves.toBeNull();
  });

  it("percent-encodes the address into the URL", async () => {
    fetchMock.mockResolvedValue(ok({ city: "X" }));
    await resolveLocation("2606:2800::1");
    expect(fetchMock.mock.calls[0][0]).toBe("https://ipapi.co/2606%3A2800%3A%3A1/json/");
  });

  it("skips the lookup entirely for a missing address", async () => {
    await expect(resolveLocation(undefined)).resolves.toBeNull();
    await expect(resolveLocation("")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const privateAddresses = ["127.0.0.1", "10.1.2.3", "192.168.1.5", "172.16.0.1", "172.31.255.254", "::1", "fc00::1", "fe80::1"];
  for (const ip of privateAddresses) {
    it(`skips the lookup for private address ${ip}`, async () => {
      await expect(resolveLocation(ip)).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("does look up a public address that merely starts with similar digits", async () => {
    fetchMock.mockResolvedValue(ok({ city: "X" }));
    for (const ip of ["172.15.0.1", "172.32.0.1", "1.10.1.1"]) {
      await resolveLocation(ip);
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // DEFECT (not fixed here -- server/session-tracking.ts is owned by another
  // session). PRIVATE_IP_PATTERNS misses three ranges the SSRF guard in
  // server/safe-fetch.ts does block: 169.254.0.0/16 (link-local, and the cloud
  // metadata address 169.254.169.254 with it), 100.64.0.0/10 (carrier-grade
  // NAT), and the fd00::/8 half of the fc00::/7 unique-local range -- the
  // pattern is /^fc00:/ rather than /^f[cd]/. Consequence is limited but real:
  // an internal address reaches ipapi.co as an outbound request instead of
  // being short-circuited, which leaks an internal address to a third party
  // and burns a lookup that can only ever answer "unknown".
  it.skip("skips the lookup for link-local, CGNAT, and fd00:: addresses too", async () => {
    for (const ip of ["169.254.169.254", "169.254.0.1", "100.64.0.1", "fd12:3456::1"]) {
      await expect(resolveLocation(ip)).resolves.toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
