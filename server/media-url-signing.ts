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
// The fallback chain is fine; falling all the way through it in production
// is not. "forge-dev-secret" is a constant published in this file, so a
// production boot that reached it would sign every media URL with a value
// anyone can read here -- forging a signature for any gated upload becomes
// arithmetic, and the whole scheme is decorative. That was unreachable in
// practice only because SESSION_SECRET is separately required to boot, which
// makes this file's safety a side effect of auth.ts's check rather than
// something this file does. auth.ts's requireSecret refuses to start rather
// than sign a cookie with a public constant; the same reasoning applies here,
// so the same thing happens.
function resolveMediaSecret(): string {
  const dedicated = process.env.MEDIA_URL_SECRET?.trim();
  if (dedicated) return dedicated;
  const shared = process.env.SESSION_SECRET?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!shared) {
      throw new Error(
        "MEDIA_URL_SECRET is not set, and neither is SESSION_SECRET. Refusing to start in " +
          "production: media URLs would be signed with a public constant from this file, so " +
          "anyone could mint a valid signature for any athlete's footage. Set MEDIA_URL_SECRET " +
          "to a long random value.",
      );
    }
    // Falling back to SESSION_SECRET is safe but is the key-separation
    // weakness this file's comment above describes, and it is silent. Say so
    // once at boot so it shows up in the deploy log rather than only here.
    console.warn(
      "[media] MEDIA_URL_SECRET is not set -- signing media URLs with SESSION_SECRET. " +
        "Set a separate value in Render (Dashboard -> Environment) so the two keys can be " +
        "rotated independently.",
    );
    return shared;
  }
  return shared || "forge-dev-secret";
}

const MEDIA_URL_SECRET = resolveMediaSecret();

// Long enough that a single open session/tab never sees a video 403 out
// from under it (queries refetch on focus/remount well inside this
// window), short enough that a leaked/screenshotted link stops working
// within the day rather than forever.
//
// Was six hours, now one. The signature binds a path and an expiry and
// nothing about the viewer -- deliberately, because a bare <video src> can
// carry neither a cookie nor a header, and on iOS WKWebView the session
// cookie is dropped outright, which is the reason this scheme exists at all.
// That makes the URL a bearer credential for its whole lifetime, so the
// lifetime is the only dial there is. The leak paths that remain are a link
// someone pastes somewhere and a screenshot of the address bar; helmet's
// no-referrer default already stops the URL escaping through a Referer
// header. An hour still sits far above the refetch cadence this comment
// relies on -- React Query refetches these on focus and on remount -- so the
// tab that stays open all afternoon re-signs long before anything expires.
const TTL_MS = 60 * 60 * 1000;

// problem-reports: a "report a problem" screenshot can just as easily show
// an athlete's page/roster/video as any of the other three -- same
// treatment, same reasoning.
// waivers: a signed participation waiver or medical clearance carries a
// minor's name, a guardian's signature and often medical detail -- strictly
// more sensitive than the form-check video in the directory above it, and the
// one kind of upload here that is a legal document about a named child.
const GATED_UPLOAD_DIRS = new Set([
  "form-videos",
  "skill-videos",
  "annotations",
  "problem-reports",
  "waivers",
]);

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
