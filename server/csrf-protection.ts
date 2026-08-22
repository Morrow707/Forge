import type { RequestHandler } from "express";

// Closes a real gap: the session cookie is sameSite: "none" in production
// (required so the native app's cross-origin requests carry it -- see
// index.ts's cors() comment), and the server parses both JSON and
// form-urlencoded bodies. Combined, that means a plain HTML <form> on a
// malicious site -- no JavaScript, so CORS never even applies -- could
// auto-submit a POST to almost any cookie-authenticated route here, and
// the browser attaches a logged-in user's real session cookie
// automatically. The native app's Bearer-token auth path (auth.ts's
// attachNativeTokenAuth) is immune to this on its own -- nothing a browser
// attaches ambiently -- but this check runs unconditionally anyway since a
// legitimate request through this app, cookie or token, always carries a
// real Origin/Referer that matches.
//
// Verifying Origin against an allowlist (rather than full CSRF tokens) is
// a standard, OWASP-documented defense for a JSON API like this one --
// lower-effort, no per-form token plumbing needed, and every modern
// browser sends Origin on state-changing fetch/XHR/form requests
// regardless of same-origin status. A request with NEITHER Origin nor
// Referer is let through rather than rejected: that combination doesn't
// happen for a real browser-driven request (the exact thing this defends
// against), but does happen for legitimate non-browser callers this app
// already has (Stripe's webhook, for one) -- rejecting on absence would
// block those, not attackers.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostFromHeaderValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

export function verifyRequestOrigin(nativeAppOrigins: string[]): RequestHandler {
  const allowedHosts = new Set(nativeAppOrigins.map((o) => new URL(o).host));
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const requestHost = hostFromHeaderValue(req.headers.origin) ?? hostFromHeaderValue(req.headers.referer);
    if (!requestHost) return next();
    if (requestHost === req.headers.host || allowedHosts.has(requestHost)) return next();
    return res.status(403).json({ message: "Request blocked -- origin mismatch." });
  };
}
