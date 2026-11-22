/* FETCHING A PASTED CALENDAR ADDRESS, SAFELY (2026-11-22). A person pastes a subscribe address
 * from Google, Apple or Outlook, and the SERVER fetches it, so the address is a request the server
 * makes on somebody's say-so. Left unchecked that is server-side request forgery: an address that
 * names 127.0.0.1, the cloud metadata service at 169.254.169.254 or a private network host would
 * have Forge's server read it and hand the answer back as "events". So:
 *
 *   - only http and https (a webcal:// or webcals:// address becomes https://, which is what the
 *     calendar apps do with it), on the default ports, with no user name or password in it;
 *   - the host is resolved and EVERY address it resolves to must be public: loopback, private,
 *     link-local, carrier-grade NAT, documentation, multicast, unspecified and the IPv6 equivalents
 *     (including an IPv4 address wrapped in IPv6) are refused;
 *   - the connection is made to the address that was checked, never re-resolved, so a name that
 *     answers a public address to the check and a private one to the connection (DNS rebinding)
 *     still reaches only the public one;
 *   - a redirect is followed at most MAX_REDIRECTS times and every hop is checked again;
 *   - a time limit and a size cap, so a slow or endless answer cannot hold a request open.
 *
 * The transport and the resolver are injectable so the tests and the itest never touch the
 * network. */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { LookupFunction } from "node:net";

export class CalendarFetchError extends Error {}

export const MAX_REDIRECTS = 3;
export const CALENDAR_FETCH_TIMEOUT_MS = 10_000;
/** A season of a school's athletics calendar is tens of kilobytes; five megabytes is far past any. */
const KIB = 1024;
const MAX_MEBIBYTES = 5;
export const CALENDAR_MAX_BYTES = MAX_MEBIBYTES * KIB * KIB;
const DEFAULT_PORTS = new Set(["", "80", "443"]);
const HTTP_REDIRECT_MIN = 300;
const HTTP_REDIRECT_MAX = 399;
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;
const IPV4 = 4;
const IPV6 = 6;

/** Every range an outside address must not fall in. */
const BLOCKED = new net.BlockList();
/** The blocked ranges in CIDR form: "this network", private, carrier-grade NAT, loopback,
 * link-local (the cloud metadata service lives there), documentation, benchmarking, multicast and
 * reserved, then the IPv6 equivalents (NAT64 and unique-local among them). */
const BLOCKED_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
];
const BLOCKED_V6 = ["::/128", "::1/128", "64:ff9b::/96", "100::/64", "2001:db8::/32", "fc00::/7", "fe80::/10", "fec0::/10", "ff00::/8"];
function addCidr(cidr: string, type: "ipv4" | "ipv6") {
  const [addr, prefix] = cidr.split("/");
  BLOCKED.addSubnet(addr, Number(prefix), type);
}
BLOCKED_V4.forEach((c) => addCidr(c, "ipv4"));
BLOCKED_V6.forEach((c) => addCidr(c, "ipv6"));

// An IPv4 address wrapped in IPv6, dotted or in hex. Matches "::ffff:127.0.0.1" and
// "::ffff:7f00:1"; rejects "2606:4700::1111".
// https://regex101.com/?regex=%5E%3A%3Affff%3A(.%2B)%24&flags=i&testString=%3A%3Affff%3A127.0.0.1
const MAPPED_V4_RE = /^::ffff:(.+)$/i;
// Two hex groups of a mapped address. Matches "7f00:1"; rejects "127.0.0.1".
// https://regex101.com/?regex=%5E(%5B0-9a-f%5D%7B1%2C4%7D)%3A(%5B0-9a-f%5D%7B1%2C4%7D)%24&flags=i&testString=7f00%3A1
const HEX_PAIR_RE = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;
// The square brackets around an IPv6 host. Matches "[" and "]" in "[::1]"; rejects "::1".
// https://regex101.com/?regex=%5E%5C%5B%7C%5C%5D%24&flags=g&testString=%5B%3A%3A1%5D
const IPV6_BRACKETS_RE = /^\[|\]$/g;
const BYTE = 256;
const HEX = 16;

function unwrapMappedV4(ip: string): string | null {
  const m = MAPPED_V4_RE.exec(ip);
  if (!m) return null;
  if (net.isIPv4(m[1])) return m[1];
  const hex = HEX_PAIR_RE.exec(m[1]);
  if (!hex) return null;
  const hi = parseInt(hex[1], HEX);
  const lo = parseInt(hex[2], HEX);
  return [Math.floor(hi / BYTE), hi % BYTE, Math.floor(lo / BYTE), lo % BYTE].join(".");
}

/** True for an address an outside calendar may not resolve to. Anything unparseable is refused. */
export function isForbiddenAddress(ip: string): boolean {
  const bare = ip.replace(IPV6_BRACKETS_RE, "");
  if (net.isIPv4(bare)) return BLOCKED.check(bare, "ipv4");
  if (net.isIPv6(bare)) {
    const mapped = unwrapMappedV4(bare);
    if (mapped) return BLOCKED.check(mapped, "ipv4");
    return BLOCKED.check(bare, "ipv6");
  }
  return true;
}

/** The address a person pasted, as the URL Forge would fetch. Throws with a sentence for them. */
export function normalizeCalendarUrl(raw: string): URL {
  const trimmed = raw.trim();
  // webcal:// and webcals:// are what the calendar apps hand out; they mean https.
  // Matches "webcal://x" and "WEBCALS://x"; rejects "https://x".
  // https://regex101.com/?regex=%5Ewebcals%3F%3A%5C%2F%5C%2F&flags=i&testString=webcal%3A%2F%2Fp01-calendars.icloud.com
  const rewritten = trimmed.replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(rewritten);
  } catch {
    throw new CalendarFetchError("That doesn't look like a calendar address. It should start with https:// or webcal://.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new CalendarFetchError("Only https:// and webcal:// calendar addresses can be added.");
  }
  if (url.username || url.password) {
    throw new CalendarFetchError("That address has a user name or password in it. Use the calendar's public or secret subscribe address instead.");
  }
  if (!DEFAULT_PORTS.has(url.port)) {
    throw new CalendarFetchError("That address uses an unusual port and can't be added.");
  }
  url.hash = "";
  return url;
}

export type ResolvedAddress = { address: string; family: number };
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export const systemResolver: Resolver = async (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

/** Resolves the host and refuses it unless every address it resolves to is public. */
export async function resolvePublicHost(hostname: string, resolve: Resolver): Promise<ResolvedAddress> {
  const bare = hostname.replace(IPV6_BRACKETS_RE, "");
  const literal = net.isIP(bare);
  let addresses: ResolvedAddress[];
  if (literal) addresses = [{ address: bare, family: literal }];
  else {
    try {
      addresses = await resolve(bare);
    } catch {
      throw new CalendarFetchError("Couldn't find that calendar's server. Check the address and try again.");
    }
  }
  if (addresses.length === 0) throw new CalendarFetchError("Couldn't find that calendar's server. Check the address and try again.");
  if (addresses.some((a) => isForbiddenAddress(a.address))) {
    throw new CalendarFetchError("That address points at a private network and can't be added.");
  }
  return addresses[0];
}

export type TransportRequest = { url: URL; address: ResolvedAddress; timeoutMs: number; maxBytes: number };
export type TransportResponse = { status: number; location: string | null; body: string };
export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

/** The real network: connects to the checked address only, under the time and size limits. */
export const nodeTransport: Transport = ({ url, address, timeoutMs, maxBytes }) =>
  new Promise((resolve, reject) => {
    // The pinned lookup is what makes a rebinding name harmless: the socket can only go where the
    // check already went.
    const pinned: LookupFunction = (_host, options, callback) => {
      const all = typeof options === "object" && options !== null && (options as { all?: boolean }).all;
      if (all) (callback as unknown as (e: null, a: ResolvedAddress[]) => void)(null, [address]);
      else callback(null, address.address, address.family === IPV6 ? IPV6 : IPV4);
    };
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: pinned,
        headers: { "User-Agent": "Forge-Calendar/1.0", Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        if (status >= HTTP_REDIRECT_MIN && status <= HTTP_REDIRECT_MAX) {
          res.resume();
          resolve({ status, location, body: "" });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy(new CalendarFetchError("That calendar is too large to add."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, location, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    const timer = setTimeout(() => req.destroy(new CalendarFetchError("That calendar took too long to answer.")), timeoutMs);
    req.on("timeout", () => req.destroy(new CalendarFetchError("That calendar took too long to answer.")));
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err instanceof CalendarFetchError ? err : new CalendarFetchError("Couldn't reach that calendar. Check the address and try again."));
    });
    req.on("close", () => clearTimeout(timer));
    req.end();
  });

export type CalendarFetchDeps = { resolve?: Resolver; transport?: Transport };

/** Fetches a pasted calendar address under every rule above. Returns the text and the address it
 * finally came from (after any redirects). */
export async function fetchCalendarText(raw: string, deps: CalendarFetchDeps = {}): Promise<{ text: string; finalUrl: URL }> {
  const resolve = deps.resolve ?? systemResolver;
  const transport = deps.transport ?? nodeTransport;
  let url = normalizeCalendarUrl(raw);
  // eslint-disable-next-line ts-patterns/no-loop-statements -- each hop is checked before the next
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const address = await resolvePublicHost(url.hostname, resolve);
    const res = await transport({ url, address, timeoutMs: CALENDAR_FETCH_TIMEOUT_MS, maxBytes: CALENDAR_MAX_BYTES });
    if (res.status >= HTTP_REDIRECT_MIN && res.status <= HTTP_REDIRECT_MAX) {
      if (!res.location) throw new CalendarFetchError("That calendar redirected without saying where.");
      url = normalizeCalendarUrl(new URL(res.location, url).toString());
      continue;
    }
    if (res.status < HTTP_OK_MIN || res.status > HTTP_OK_MAX) {
      throw new CalendarFetchError(`That calendar answered with an error (${res.status}). Check that the address is the calendar's subscribe address.`);
    }
    if (Buffer.byteLength(res.body, "utf8") > CALENDAR_MAX_BYTES) throw new CalendarFetchError("That calendar is too large to add.");
    return { text: res.body, finalUrl: url };
  }
  throw new CalendarFetchError("That calendar redirected too many times.");
}
