import { UAParser } from "ua-parser-js";
import { NATIVE_APP_ORIGINS } from "./native-app-origins";

export type SessionKind = "web" | "native";

// The login/signup/mfa-verify-login request's own Origin is how the app
// already tells native traffic from web traffic elsewhere (cors(),
// csrf-protection.ts) -- reused here to decide, once, which kind of
// session record a login creates, rather than trying to guess it from the
// User-Agent (a WKWebView's UA carries no reliable "this is the Forge app"
// marker on its own).
export function isNativeAppRequest(req: { headers: { origin?: string } }): boolean {
  return !!req.headers.origin && (NATIVE_APP_ORIGINS as string[]).includes(req.headers.origin);
}

// req.ip can come back as an IPv4-mapped IPv6 address (::ffff:1.2.3.4)
// depending on how Node/the proxy present it -- strip that prefix so
// storage and the geolocation lookup both see the plain form.
export function normalizeIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

// Kept deliberately in step with server/safe-fetch.ts's own blocklist. The
// two exist for different reasons -- that one stops SSRF, this one stops a
// pointless outbound lookup -- but they answer the same question, and this
// one was missing three ranges that one already blocked:
//
//   - 169.254.0.0/16, link-local, which contains the cloud metadata address
//     169.254.169.254. Sending that to a third-party geolocation service is
//     the one address on this list it is least acceptable to leak.
//   - 100.64.0.0/10, carrier-grade NAT. Real mobile traffic lands here.
//   - fd00::/8. The pattern was /^fc00:/, but unique-local is fc00::/7,
//     which is the fc00: and fd00: halves together -- so every fd-prefixed
//     address, which in practice is most of them, was treated as public.
//
// Each miss meant an internal address was handed to ipapi.co as an outbound
// request instead of being short-circuited: an internal address disclosed
// to a third party, in exchange for a lookup that could only ever answer
// "unknown".
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^0\./,
  /^::1$/,
  /^f[cd][0-9a-f]{0,2}:/i,
  /^fe80:/i,
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((p) => p.test(ip));
}

// "iPhone · iOS 17.5 (Forge app)", "Chrome on macOS", etc. kind is folded
// in directly (rather than left for the caller to append) since a WKWebView
// UA string alone can't reliably say "this is the app" -- see
// isNativeAppRequest above for the actual signal.
export function formatDeviceLabel(userAgent: string | undefined, kind: SessionKind): string {
  if (!userAgent) return kind === "native" ? "Forge app" : "Unknown device";
  const { browser, os, device } = new UAParser(userAgent).getResult();
  let base: string;
  if (device.type === "mobile" || device.type === "tablet") {
    base = [device.model, os.name].filter(Boolean).join(" · ") || "Mobile device";
  } else {
    base = [browser.name, os.name ? `on ${os.name}` : null].filter(Boolean).join(" ") || "Unknown device";
  }
  return kind === "native" ? `${base} (Forge app)` : base;
}

const GEO_LOOKUP_TIMEOUT_MS = 3000;

// Best-effort, IP-based, approximate -- exactly the caveat every
// IP-geolocation feature (Netflix's "recent device activity" included)
// carries; ISPs and mobile carriers routinely resolve to the wrong city.
// Never called in the login response's critical path (see auth.ts's
// completeLogin) -- a slow or unreachable geolocation service must never
// slow down or break a login. No API key, no cost: ipapi.co's free tier is
// keyless for reasonable volume. Returns null on anything short of a
// clean, complete answer -- private/unresolvable IPs, a timeout, a
// non-200, a malformed body -- so a flaky geolocation service degrades to
// "Unknown location" in the UI, never an error.
export async function resolveLocation(ip: string | undefined): Promise<string | null> {
  if (!ip || isPrivateIp(ip)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEO_LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { error?: boolean; city?: string; region?: string; country_name?: string };
    if (data.error) return null;
    const parts = [data.city, data.region, data.country_name].filter((p): p is string => !!p);
    return parts.length > 0 ? parts.join(", ") : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Keeps "last active" reasonably fresh without a DB write on every single
// authenticated request -- a single Node process (no multi-instance
// scaling here), so an in-memory Map is enough; nothing durable is lost by
// forgetting this cache on a restart, since the next request just writes
// through again.
const LAST_SEEN_THROTTLE_MS = 10 * 60 * 1000;
const lastTouchedAt = new Map<number, number>();

// An entry is dead once it is older than the throttle window -- the next
// call for that session would return true and rewrite it anyway, so keeping
// it buys nothing. Without this the map only ever grew: one entry per
// session record the process has seen, held until restart, which on a
// long-lived instance with real signup volume is a slow leak of exactly the
// kind nothing ever surfaces (no error, no slow query, just a process that
// gets heavier the longer it stays up).
//
// Swept on write rather than on a timer, so there is no interval to own and
// no work at all on an idle process. The scan is over a map whose live size
// is bounded by "sessions active in the last ten minutes," and it runs at
// most once per ten minutes per session, so it is far cheaper than the DB
// write it exists to avoid.
function evictStaleLastSeen(now: number): void {
  for (const [id, at] of lastTouchedAt) {
    if (now - at >= LAST_SEEN_THROTTLE_MS) lastTouchedAt.delete(id);
  }
}

export function shouldTouchLastSeen(sessionRecordId: number): boolean {
  const now = Date.now();
  const last = lastTouchedAt.get(sessionRecordId) ?? 0;
  if (now - last < LAST_SEEN_THROTTLE_MS) return false;
  evictStaleLastSeen(now);
  lastTouchedAt.set(sessionRecordId, now);
  return true;
}
