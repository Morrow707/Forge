import crypto from "crypto";

// Closes the gap where /uploads was served as fully public, unauthenticated
// static files -- anyone with a video's URL (leaked link, screenshot,
// browser history, referrer) could view it forever, regardless of whether
// they were ever the athlete, their coach, or an admin. The three
// directories below hold actual filmed athlete footage (form-check clips,
// skill-session clips, and coach annotations drawn directly on frames of
// those clips) -- lesson-videos/attachments/images and team-logos are
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
const MEDIA_URL_SECRET = process.env.SESSION_SECRET || "forge-dev-secret";

// Long enough that a single open session/tab never sees a video 403 out
// from under it (queries refetch on focus/remount well inside this
// window), short enough that a leaked/screenshotted link stops working
// within the day rather than forever.
const TTL_MS = 6 * 60 * 60 * 1000;

const GATED_UPLOAD_DIRS = new Set(["form-videos", "skill-videos", "annotations"]);

// Matches only a bare, freshly-stored path with no query string yet --
// exactly the shape every one of these URLs has in the database. Deliberately
// does NOT match a path that already carries ?exp=&sig= (see stripSignature
// below): every sign call strips first, so re-signing an already-signed URL
// always replaces it with a fresh one rather than silently declining to
// touch it (which would leave a stale, expired signature stuck in a
// response body).
function isGatedUploadPath(pathname: string): boolean {
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

export function verifyMediaUrl(pathname: string, exp: unknown, sig: unknown): boolean {
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
