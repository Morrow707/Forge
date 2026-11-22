import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import {
  CALENDAR_FETCH_TIMEOUT_MS,
  CALENDAR_MAX_BYTES,
  nodeTransport,
  CalendarFetchError,
  MAX_REDIRECTS,
  fetchCalendarText,
  isForbiddenAddress,
  normalizeCalendarUrl,
  type Resolver,
  type Transport,
  type TransportRequest,
} from "./calendar-fetch";

/* THE ADDRESS CHECKS ON A PASTED CALENDAR (2026-11-22). A pasted address is a request the server
 * makes, so: private, loopback and link-local addresses are refused after DNS resolution (and a
 * name that resolves to ANY such address is refused), a redirect to one is refused on the hop, the
 * connection goes to the address that was checked, webcal:// becomes https://, and only http/https
 * on the default ports is fetched. No test here touches the network. */

const CAL = "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n";
const OK = 200;
const FOUND = 302;
const NOT_FOUND = 404;
const PUBLIC_IP = "93.184.216.34";
const IPV4 = 4;
const IPV6 = 6;
const fixedResolver = (table: Record<string, string[]>): Resolver => async (host) => {
  const list = table[host];
  if (!list) throw new Error("ENOTFOUND");
  return list.map((address) => ({ address, family: address.includes(":") ? IPV6 : IPV4 }));
};

function recordingTransport(answer: (req: TransportRequest) => { status: number; location?: string; body?: string }) {
  const seen: TransportRequest[] = [];
  const transport: Transport = async (req) => {
    seen.push(req);
    const a = answer(req);
    return { status: a.status, location: a.location ?? null, body: a.body ?? "" };
  };
  return { seen, transport };
}

describe("isForbiddenAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.5.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "[::1]", "not-an-ip"])(
    "refuses %s",
    (ip) => expect(isForbiddenAddress(ip)).toBe(true),
  );
  it.each([PUBLIC_IP, "8.8.8.8", "2606:4700:4700::1111", "172.32.0.1"])("allows %s", (ip) => expect(isForbiddenAddress(ip)).toBe(false));
});

describe("normalizeCalendarUrl", () => {
  it("turns webcal:// into https:// and keeps the path", () => {
    expect(normalizeCalendarUrl("  webcal://p01-calendars.icloud.com/published/2/abc ").toString()).toBe("https://p01-calendars.icloud.com/published/2/abc");
  });
  it.each(["ftp://x.test/a.ics", "file:///etc/passwd", "javascript:alert(1)", "https://user:pw@x.test/a.ics", "https://x.test:8443/a.ics", "not a url"])("refuses %s", (raw) => {
    expect(() => normalizeCalendarUrl(raw)).toThrow(CalendarFetchError);
  });
});

describe("nodeTransport", () => {
  it("connects to the address that was checked, never to what the name resolves to now", async () => {
    // A loopback server stands in for the checked address; the URL names a host that does not
    // exist, so the only way the request lands is through the pinned address.
    const server = http.createServer((_req, res) => res.end(CAL));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    try {
      const out = await nodeTransport({
        url: new URL(`http://pinned.invalid:${port}/feed.ics`),
        address: { address: "127.0.0.1", family: IPV4 },
        timeoutMs: CALENDAR_FETCH_TIMEOUT_MS,
        maxBytes: CALENDAR_MAX_BYTES,
      });
      expect(out).toMatchObject({ status: OK, body: CAL });
    } finally {
      server.close();
    }
  });
});

describe("fetchCalendarText", () => {
  it("fetches a public calendar, connecting to the address it checked", async () => {
    const { seen, transport } = recordingTransport(() => ({ status: OK, body: CAL }));
    const out = await fetchCalendarText("webcal://calendar.test/feed.ics", { resolve: fixedResolver({ "calendar.test": [PUBLIC_IP] }), transport });
    expect(out.text).toBe(CAL);
    expect(seen[0].url.protocol).toBe("https:");
    expect(seen[0].address.address).toBe(PUBLIC_IP);
  });

  it("refuses localhost and a literal private address before any connection", async () => {
    const { seen, transport } = recordingTransport(() => ({ status: OK, body: CAL }));
    const resolve = fixedResolver({ localhost: ["127.0.0.1"] });
    await expect(fetchCalendarText("https://localhost/a.ics", { resolve, transport })).rejects.toThrow("private network");
    await expect(fetchCalendarText("http://169.254.169.254/latest/meta-data", { resolve, transport })).rejects.toThrow("private network");
    await expect(fetchCalendarText("http://[::1]/a.ics", { resolve, transport })).rejects.toThrow("private network");
    expect(seen).toHaveLength(0);
  });

  it("refuses a name that resolves to a private address, even beside a public one", async () => {
    const { seen, transport } = recordingTransport(() => ({ status: OK, body: CAL }));
    const resolve = fixedResolver({ "sneaky.test": [PUBLIC_IP, "10.0.0.5"] });
    await expect(fetchCalendarText("https://sneaky.test/a.ics", { resolve, transport })).rejects.toThrow("private network");
    expect(seen).toHaveLength(0);
  });

  it("refuses a redirect to a private address on the hop", async () => {
    const { seen, transport } = recordingTransport((req) =>
      req.url.hostname === "calendar.test" ? { status: FOUND, location: "http://internal.test/admin" } : { status: OK, body: CAL },
    );
    const resolve = fixedResolver({ "calendar.test": [PUBLIC_IP], "internal.test": ["192.168.0.10"] });
    await expect(fetchCalendarText("https://calendar.test/a.ics", { resolve, transport })).rejects.toThrow("private network");
    expect(seen.map((r) => r.url.hostname)).toEqual(["calendar.test"]);
  });

  it("follows a public redirect, and stops after the limit", async () => {
    const hop = recordingTransport((req) => (req.url.pathname === "/a.ics" ? { status: FOUND, location: "/b.ics" } : { status: OK, body: CAL }));
    const resolve = fixedResolver({ "calendar.test": [PUBLIC_IP] });
    expect((await fetchCalendarText("https://calendar.test/a.ics", { resolve, transport: hop.transport })).finalUrl.pathname).toBe("/b.ics");
    const loop = recordingTransport(() => ({ status: FOUND, location: "/again.ics" }));
    await expect(fetchCalendarText("https://calendar.test/a.ics", { resolve, transport: loop.transport })).rejects.toThrow("too many times");
    expect(loop.seen).toHaveLength(MAX_REDIRECTS + 1);
  });

  it("names an error answer and an unknown host in a sentence", async () => {
    const { transport } = recordingTransport(() => ({ status: NOT_FOUND }));
    const resolve = fixedResolver({ "calendar.test": [PUBLIC_IP] });
    await expect(fetchCalendarText("https://calendar.test/a.ics", { resolve, transport })).rejects.toThrow("answered with an error (404)");
    await expect(fetchCalendarText("https://nowhere.test/a.ics", { resolve, transport })).rejects.toThrow("Couldn't find");
  });
});
