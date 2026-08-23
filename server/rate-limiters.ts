import rateLimit from "express-rate-limit";

// Shared by every general (non-purpose-specific) limiter below -- keyed by
// user id when a session already resolved one, not just IP. A team
// practice routinely has a dozen-plus athletes on the same gym wifi NAT IP
// at once, and a pure per-IP limit would let one misbehaving client
// throttle everyone else on the same network. Falls back to IP for the
// much smaller unauthenticated surface, which is exactly what the
// login/signup/reset limiters in auth.ts already key on.
export function rateLimitKey(req: any): string {
  return req.isAuthenticated?.() && req.user?.id ? `user:${req.user.id}` : (req.ip ?? "unknown");
}

// General backstop under every JSON route in the app -- CodeQL's
// js/missing-rate-limiting flagged this at scale (~200+ authenticated route
// handlers, only a handful of which had their own purpose-specific limiter
// in auth.ts: login, signup, password reset, MFA, change-password). Rather
// than bolting a bespoke limiter onto every one of them, this covers all of
// /api/* as a floor; the tighter limiters already guarding the sensitive
// auth endpoints still apply on top of it, unaffected.
//
// Mounted inside auth.ts's setupAuth, deliberately not here and not in
// routes.ts -- it has to run after passport's session middleware (this
// limiter's own keying needs req.isAuthenticated to actually resolve) but
// before ANY route, including the ~30 registered directly inside setupAuth
// itself (signup, login, join-coach, guardian invites, ...). Mounting it in
// routes.ts instead would put it after all of those -- each one already
// sends its own response before a later-registered limiter ever gets a
// chance to run, so it would silently cover none of them.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { message: "Too many requests. Please try again shortly." },
});

// Separate budget from apiLimiter, not a shared one -- /uploads serves the
// actual video/image bytes behind the signed-URL check in routes.ts, and a
// single roster or calendar page can legitimately fire far more of these in
// a burst than it does JSON API calls (every visible thumbnail is its own
// request). Sharing apiLimiter's counter would let a media-heavy page
// exhaust the same budget a user's actual API calls need. Mounted in
// routes.ts, after setupAuth returns -- no ordering conflict there, since
// /uploads has no routes of its own registered ahead of it the way /api
// does inside setupAuth.
export const uploadsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { message: "Too many requests. Please try again shortly." },
});
