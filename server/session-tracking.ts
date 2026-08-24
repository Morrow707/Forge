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

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::1$/,
  /^fc00:/i,
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

export function shouldTouchLastSeen(sessionRecordId: number): boolean {
  const now = Date.now();
  const last = lastTouchedAt.get(sessionRecordId) ?? 0;
  if (now - last < LAST_SEEN_THROTTLE_MS) return false;
  lastTouchedAt.set(sessionRecordId, now);
  return true;
}
