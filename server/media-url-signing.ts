import crypto from "crypto";

// Closes the gap where /uploads was served as fully public, unauthenticated
// static files -- anyone with a video's URL (leaked link, screenshot,
// browser history, referrer) could view it forever, regardless of whether
// they were ever the athlete, their coach, or an admin. The directories
// below hold actual filmed athlete footage or screenshots that can just as
// easily contain someone's PII (form-check clips, skill-session clips,
// coach annotations drawn on frames of those clips, and problem-report
// screenshots) -- lesson-videos/attachments/images and team-logos are
// coach/org-authored content, not footage of an identifiable person, so
// they're deliberately left out of this and stay plain public files, same
// as before.
//
// Can't gate this with a session cookie or an Authorization header the way
// every other route is: video/image elements are loaded via a bare <video
// src>/<img src>, which never carries custom headers, and on iOS the
// session cookie itself is dropped entirely (WKWebView + Apple's ITP --
// see auth.ts's attachNativeTokenAuth comment). So instead, every JSON
// response is swept (see wrapResponseWithMediaSigning below) and any
// /uploads URL under a gated directory gets a short-lived HMAC signature
// appended as a query string right before it reaches the client -- the
// URL itself becomes the bearer credential, minted only by a server
// response that already passed whatever ownership check that route
// enforces (coach-roster check, athlete-owns-this-set check, admin role,
// etc.). No new per-request ownership lookup needed; this just lets an
// authorization decision the app already makes travel into a plain media
// URL a <video> tag can load unmodified.
// Its own dedicated secret rather than reusing SESSION_SECRET (which also
// signs the session cookie) or auth.ts's native-token secret -- three
// different cryptographic purposes sharing one key is a real, if minor,
// key-separation weakness: rotating one for a real reason (a leak, a
// scheduled rotation) would silently invalidate the other two along with
// it. Falls back to SESSION_SECRET, then the same dev-only placeholder
// auth.ts uses, so this never breaks an environment that hasn't set
// MEDIA_URL_SECRET yet -- but a real, separate value should be set in
// Render (Dashboard -> Environment) once this ships.
const MEDIA_URL_SECRET = process.env.MEDIA_URL_SECRET || process.env.SESSION_SECRET || "forge-dev-secret";

// Long enough that a single open session/tab never sees a video 403 out
// from under it (queries refetch on focus/remount well inside this
// window), short enough that a leaked/screenshotted link stops working
// within the day rather than forever.
const TTL_MS = 6 * 60 * 60 * 1000;

// problem-reports: a "report a problem" screenshot can just as easily show
// an athlete's page/roster/video as any of the other three -- same
// treatment, same reasoning.
const GATED_UPLOAD_DIRS = new Set(["form-videos", "skill-videos", "annotations", "problem-reports"]);

// Matches only a bare, freshly-stored path with no query string yet --
// exactly the shape every one of these URLs has in the database. Deliberately
// does NOT match a path that already carries ?exp=&sig= (see stripSignature
// below): every sign call strips first, so re-signing an already-signed URL
// always replaces it with a fresh one rather than silently declining to
// touch it (which would leave a stale, expired signature stuck in a
// response body).
// Exported for storage.ts's assertUploadedFileOwnedBy -- the ownership
// check below only needs to run against a path that's gated in the first
// place; a public path (lesson-videos, team-logos) never goes through the
// signed-URL scheme at all, so there's nothing to protect by tracking who
// uploaded it.
export function isGatedUploadPath(pathname: string): boolean {
  const match = /^\/uploads\/([^/]+)\/[^/]+$/.exec(pathname);
  return !!match && GATED_UPLOAD_DIRS.has(match[1]);
}

function stripQuery(url: string): string {
  const i = url.indexOf("?");
  return i === -1 ? url : url.slice(0, i);
}

function sign(pathname: string, exp: number): string {
  return crypto.createHmac("sha256", MEDIA_URL_SECRET).update(`${pathname}.${exp}`).digest("hex");
}

export function signMediaUrl(url: string): string {
  const pathname = stripQuery(url);
  if (!isGatedUploadPath(pathname)) return url;
  const exp = Date.now() + TTL_MS;
  return `${pathname}?exp=${exp}&sig=${sign(pathname, exp)}`;
}

// isGatedUploadPath answers "does this need a signature", and anything it
// does not recognize is treated as public and waved through. That is the
// right default for a genuinely public directory like lesson-videos, and
// the wrong one for a path that only looks unrecognized because it has been
// walked: /uploads/lesson-videos/../form-videos/clip.mp4 has three segments
// rather than two, so the gate did not match it, so it was allowed without
// a signature -- while resolving back into a gated directory.
//
// Nothing was exploitable through it, because express.static is mounted
// after this middleware and serve-static rejects a decoded path containing
// "..", so the request died one layer later. But the gate was being held
// shut by a dependency's behaviour rather than by its own check, and that
// is only true until someone reorders the middleware or serves these files
// another way.
//
// So: under /uploads/, an unparseable or walked path is DENIED rather than
// treated as public. Decoding repeats until stable so a double-encoded
// "%252e%252e" is caught too, and a malformed escape denies rather than
// throwing. Deliberately narrow -- it only ever turns an allow into a deny,
// and only for /uploads/ -- so it cannot make a public file unreachable.
// isGatedUploadPath itself is left alone, since signMediaUrl uses it to
// decide what to sign and widening it there would start signing public
// URLs.
function isWalkedUploadPath(pathname: string): boolean {
  let decoded = pathname;
  try {
    for (let i = 0; i < 3; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return true;
  }
  const normalized = decoded.replace(/\\/g, "/");
  if (!normalized.startsWith("/uploads/")) return false;
  return normalized.split("/").some((segment) => segment === "..");
}

export function verifyMediaUrl(pathname: string, exp: unknown, sig: unknown): boolean {
  if (isWalkedUploadPath(pathname)) return false;
  if (!isGatedUploadPath(pathname)) return true;
  if (typeof exp !== "string" || typeof sig !== "string") return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now()) return false;
  const expected = sign(pathname, expNum);
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
}

// Recursively re-signs every string in a JSON response body that looks like
// a gated /uploads path -- the single chokepoint that covers every current
// and future route returning one of these URLs (workout sets, skill
// session logs, comments, admin video listings, ...) without hunting down
// each call site by hand. Mutates arrays/objects in place; strings are
// immutable so those are returned fresh.
export function signMediaUrlsDeep<T>(value: T): T {
  if (typeof value === "string") {
    return (value.startsWith("/uploads/") ? signMediaUrl(value) : value) as unknown as T;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = signMediaUrlsDeep(value[i]);
    return value;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value as object)) {
      (value as any)[key] = signMediaUrlsDeep((value as any)[key]);
    }
    return value;
  }
  return value;
}
