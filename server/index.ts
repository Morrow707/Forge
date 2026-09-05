import "dotenv/config";
import * as Sentry from "@sentry/node";

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

// Defense-in-depth on top of the dataCollection lockdown below -- that option controls
// structured request/DB context the SDK attaches automatically, but not what ends up INSIDE a
// thrown error's own message or a breadcrumb (e.g. an Error whose message happens to echo an
// athlete's or guardian's email, which several routes in this app do interpolate into error
// text). Redacts anything email-shaped out of every string field an event actually carries,
// and strips request cookies/body/headers again here too in case a future SDK upgrade changes
// what dataCollection's defaults capture -- this function is the one place that gets audited
// when "does Forge send PII to Sentry" comes up, so it shouldn't rely on a setting living only
// in the init() call below.
function scrubPii(event: Sentry.ErrorEvent, _hint: Sentry.EventHint): Sentry.ErrorEvent {
  if (event.message) event.message = event.message.replace(EMAIL_PATTERN, "[redacted-email]");
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = ex.value.replace(EMAIL_PATTERN, "[redacted-email]");
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = crumb.message.replace(EMAIL_PATTERN, "[redacted-email]");
  }
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.headers;
  }
  return event;
}

// Error reporting -- same "silently no-op until configured" pattern every
// other optional integration in this file follows (AI, email, push). Has
// to run this early (before express-async-errors and every other import
// below) so Sentry's own auto-instrumentation can hook modules like http
// and pg before anything else touches them. Deliberately no
// tracesSampleRate/profiling here -- error monitoring only, matching what
// was actually asked for; performance tracing is a separate Sentry
// product this app isn't opting into.
//
// dataCollection is deliberately locked all the way down, not left on the SDK's own defaults:
// Forge handles video and performance data on minors, and on this SDK version several
// dataCollection categories (cookies, HTTP headers, request/response bodies, DB query data,
// stack-frame local variables) default to ON independent of the older sendDefaultPii flag --
// an unconfigured Sentry.init({ dsn }) would already be sending far more than "error monitoring
// only" implies (a session cookie via httpHeaders, an athlete's info via a request body or a
// captured local variable). scrubPii above is the second, independent layer on top of this.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    beforeSend: scrubPii,
  });
}

// Express 4's router never awaits (or attaches a .catch to) an async route
// handler's returned promise -- a rejection inside one (a dropped DB
// connection, any unguarded throw) becomes an unhandled promise rejection
// instead of ever reaching the error-handling middleware below. The
// visible symptom is a connection that just resets with no response body
// at all, which the client can't parse as JSON and falls back to a generic
// "X failed" toast with no real error message -- indistinguishable from a
// wrong password or a genuine validation failure even though the real
// cause was a server-side crash. This patches Express's router so every
// async handler's rejection is automatically forwarded to next(err), the
// same fix applied by hand to the login handler after it hit exactly this
// failure mode -- importing it here (before any route is registered)
// covers every route in the app, not just the ones that have already
// broken this way once. Side-effect-only import: it patches Express's
// prototype and has to run before app.get/post/etc. are ever called.
import "express-async-errors";
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startReflectionJob } from "./reflection-job";
import { startDataRetentionJob } from "./data-retention-job";
import { startVideoRetentionJob } from "./video-retention-job";
import { verifyStripeWebhook, handleStripeWebhookEvent } from "./billing";
import { verifyAppleNotification } from "./apple-iap";
import { storage } from "./storage";
import { signMediaUrlsDeep } from "./media-url-signing";
import { verifyRequestOrigin } from "./csrf-protection";
import { NATIVE_APP_ORIGINS } from "./native-app-origins";

const app = express();
// contentSecurityPolicy is report-only, not enforcing -- see its own
// directives below for why. crossOriginEmbedderPolicy stays off -- this
// app already serves cross-origin video/image sources (uploaded clips,
// external lesson video links) and registers its own service worker
// (client/src/sw.ts) for push + offline; a default-on COEP would need to
// be hand-tuned against every one of those before it's safe to enforce,
// which isn't something to guess at blind the way CSP's report-only mode
// lets you. crossOriginResourcePolicy is also off -- helmet's "same-origin"
// default is a separate browser-level block from CORS above, and WebKit
// (the native app's WKWebView) is known to enforce it independently, which
// would silently defeat the CORS allowlist above for exactly the requests
// it exists to permit. Everything else here (nosniff, frameguard, HSTS,
// referrer policy, etc.) is a pure hardening default with no behavior
// change for a same-origin request.
app.use(
  helmet({
    contentSecurityPolicy: {
      reportOnly: true,
      directives: {
        // upgrade-insecure-requests is an active behavior (upgrade the
        // connection), not a restriction that can be violated -- browsers
        // correctly no-op it under a report-only policy and log a console
        // warning every single time, which is pure noise (confirmed by
        // actually loading the app: ~15 of these per page). Helmet's own
        // default directives include it; explicitly unset it here rather
        // than let it ride along doing nothing but spamming the console.
        upgradeInsecureRequests: null,
        // No inline <script> tags and no third-party script host anywhere
        // in client/src or index.html -- the single script is the app's
        // own Vite-built bundle.
        scriptSrc: ["'self'"],
        // React's style={{...}} prop renders as a literal inline
        // style="..." attribute (41 call sites across the client) -- CSP's
        // style-src governs that the same as a <style> tag, and a
        // nonce-based rewrite isn't realistic to retrofit right now.
        // Inline styles can't execute script, so this is a much narrower
        // relaxation than script-src 'unsafe-inline' would be.
        styleSrc: ["'self'", "'unsafe-inline'"],
        // 'self' for /uploads (signed-URL gated, see media-url-signing.ts)
        // and the app's own bundled images; img.youtube.com for exercise/
        // skill video thumbnails (exercise-video.tsx); blob: for local
        // file previews (report-problem-dialog.tsx's screenshot preview);
        // data: for canvas-generated frames (photo-capture.ts,
        // video-frames.ts, video-watermark.ts).
        imgSrc: ["'self'", "https://img.youtube.com", "blob:", "data:"],
        // Uploaded form-check/skill videos -- same-origin only, nothing
        // external is ever assigned to a <video> element.
        mediaSrc: ["'self'"],
        // The only external frame this app ever embeds -- YouTube exercise/
        // skill demo videos (exercise-video.tsx, exercise-detail.tsx,
        // skill-detail.tsx all build youtube.com/embed/... URLs directly).
        frameSrc: ["https://www.youtube.com"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        // Where violation reports land -- see the /api/csp-report route
        // in routes.ts. Nothing is blocked yet (reportOnly above), so this
        // is purely collecting real-traffic signal on what the directives
        // above still need before it's safe to flip to enforcing.
        reportUri: ["/api/csp-report"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  }),
);
// No compression anywhere on this server until a 500k-profile stress test
// found /api/coach/roster serializing a 12.6MB uncompressed JSON response
// for one large-roster coach -- every response on the platform, this one
// most of all, was going out uncompressed. Default threshold (1kb) and
// filter (skips already-compressed types like video/image) are fine as-is;
// gzip on repetitive structured JSON like a roster list routinely gets
// 80-90%+ smaller.
app.use(compression());
// The web deployment is same-origin with itself, so it's never subject to
// CORS at all -- this exists purely for the native iOS/Android app, whose
// WKWebView/WebView serves the bundled UI from capacitor://localhost or
// https://localhost (Capacitor's own fixed default origins, never
// user-controlled) rather than this server's own origin, making every one
// of its API calls cross-origin. `credentials: true` is required to accept
// the session cookie those requests carry (see cookie.sameSite below,
// which is the other half of making that same cookie flow work
// cross-origin in the first place).
app.use(
  cors({
    origin: NATIVE_APP_ORIGINS,
    credentials: true,
  }),
);
// See csrf-protection.ts -- blocks a cross-site form/fetch from riding a
// logged-in user's session cookie into a state-changing request. Reuses
// the same native-app allowlist CORS does above.
app.use(verifyRequestOrigin(NATIVE_APP_ORIGINS));
// Registered before registerRoutes(app) runs, so it's outside the general
// /api limiter mounted in routes.ts -- needs its own. Keyed by IP only (no
// session exists for a server-to-server webhook call); generous relative
// to anything Stripe's own retry behavior would ever produce, just a
// backstop against someone hammering this with forged payloads, each of
// which is cheap to reject (verifyStripeWebhook below) but not free.
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again shortly." },
});

// Registered BEFORE express.json() below -- Stripe's webhook signature
// check needs the exact raw request bytes, which a JSON-parsed body no
// longer is by the time a route handler sees it. Framework only (see
// billing.ts's own comment): verifyStripeWebhook returns null whenever
// STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET aren't set, which is every
// environment today, so this 400s harmlessly if anything ever hits it.
app.post(
  "/api/billing/webhook",
  webhookLimiter,
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const event = verifyStripeWebhook(req.body, req.headers["stripe-signature"] as string | undefined);
    if (!event) return res.status(400).send("Invalid signature");
    await handleStripeWebhookEvent(event);
    res.json({ received: true });
  },
);

// Apple Server Notifications V2 -- the App Store's own equivalent of the
// Stripe webhook above, same raw-body-before-express.json() requirement
// (verifyAppleNotification needs the exact signedPayload string, a JWS).
// Framework only in the exact same sense: nothing is registered as this
// app's Server Notifications URL in App Store Connect yet, and
// verifyAppleNotification fails closed (returns null) whenever
// server/apple-root-certs/AppleRootCA-G3.cer is missing, which it is in
// every environment today -- see that file's own README.
app.post(
  "/api/webhooks/apple",
  webhookLimiter,
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signedPayload = (req.body as Buffer).toString("utf8");
    let parsed: { signedPayload?: string };
    try {
      parsed = JSON.parse(signedPayload);
    } catch {
      return res.status(400).send("Invalid payload");
    }
    if (!parsed.signedPayload) return res.status(400).send("Invalid payload");
    const notification = await verifyAppleNotification(parsed.signedPayload);
    if (!notification) return res.status(400).send("Invalid signature");
    await storage.applyAppleServerNotification(notification);
    res.json({ received: true });
  },
);

// Raised from Express's 100kb default -- the AI form-check and photo-analysis
// routes accept base64-encoded JPEGs, which clear 100kb easily even resized
// down, and the admin AI-teaching chats (coach AI, nutrition AI,
// camera/movement AI) accept a single large paste: a whole reference
// document, not just a chat message.
//
// It was 200mb, which is a ceiling nothing legitimate comes close to and a
// real hazard on a 1GB Postgres plan. The workout-log route writes eleven
// json columns straight out of its request body, and the capture arrays
// feeding them had no length bound of their own (see setLogInputSchema),
// so one authenticated request could push most of the database's capacity
// through in a single insert. That is now bounded from both directions:
// those arrays have caps, and this is the outer wall.
//
// 25mb is chosen to clear every real use with a wide margin rather than to
// sit near one. As plain text it is roughly twelve thousand pages, far past
// any paste. As base64 it is about 18mb of image bytes, several phone
// photos at full size. And it comfortably fits the largest plausible
// tracked set now that skeletonFrames is capped.
//
// File uploads do not come through here at all -- video and image uploads
// are multipart and carry their own per-route multer fileSize limits, which
// this does not touch.
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined;
// Response bodies are logged in full below, which is genuinely useful for debugging and was
// quietly writing credentials to disk. POST /api/auth/mfa/setup returns the raw TOTP seed and an
// otpauth URI containing it -- short enough to fit inside the 200-character truncation, so a
// coach's authenticator secret landed in the application log intact, enough for anyone with log
// access to enrol their own device. A pending MFA token and a 30-day native bearer token go the
// same way; the native one survives today only because it usually falls past the truncation,
// which is luck rather than protection.
//
// Redacts by key name at the top level, which is where all of these live. Deliberately not a
// deep walk: the log line is truncated to 200 characters anyway, and a recursive scan on every
// single API response is a cost paid forever to protect against a shape that does not exist.
const SENSITIVE_LOG_KEYS = new Set([
  "secret",
  "otpauthUri",
  "mfaToken",
  "nativeToken",
  "token",
  "passwordHash",
  "backupCodes",
]);

function redactForLog(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  let cloned: Record<string, unknown> | null = null;
  for (const key of Object.keys(body as Record<string, unknown>)) {
    if (!SENSITIVE_LOG_KEYS.has(key)) continue;
    if (!cloned) cloned = { ...(body as Record<string, unknown>) };
    cloned[key] = "[redacted]";
  }
  return cloned ?? body;
}


  const originalResJson = res.json.bind(res);
  res.json = ((body: any) => {
    capturedJsonResponse = body;
    return originalResJson(body);
  }) as typeof res.json;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(redactForLog(capturedJsonResponse))}`;
      }
      if (logLine.length > 200) {
        logLine = logLine.slice(0, 199) + "…";
      }
      log(logLine);
    }
  });

  next();
});

// See media-url-signing.ts -- swept last (after the logging wrapper above)
// so whatever a route handler passes to res.json() gets its /uploads URLs
// re-signed with a fresh expiry right before it goes out, no matter which
// route or how deeply nested. res.locals.skipMediaSign is set by the
// handful of upload-confirmation routes that return a bare, freshly-created
// path meant to be echoed back into a later write (see routes.ts) -- those
// must stay unsigned so the database only ever stores plain paths.
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    if (res.locals.skipMediaSign) return originalJson(body);
    return originalJson(signMediaUrlsDeep(body));
  }) as typeof res.json;
  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Reports the error to Sentry, then calls next(err) itself -- doesn't
  // swallow anything, so the existing handler below still runs unchanged
  // and still sends the same response shape it always has. No-ops if
  // SENTRY_DSN was never set (Sentry's capture calls are safe to invoke
  // without an initialized client). This also doesn't touch
  // rest-timer-push.ts's deliberate choice not to install a global
  // unhandledRejection handler -- Sentry's SDK reports a fatal crash on
  // its way out; Node still crashes the process exactly as it does today.
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    // A 4xx message is written for the person reading it -- "Email already in use", "Invalid
    // invite code" -- and passing it through is the point. A 5xx message is not: it is whatever
    // the failing library said, and it went straight to the client. Losing a race on the signup
    // duplicate-email check handed the athlete `duplicate key value violates unique constraint
    // "users_email_idx"`, and any other database failure leaked schema detail the same way.
    // The real message still reaches the logs and Sentry below.
    const clientMessage =
      status >= 500 || status < 400
        ? "Something went wrong on our end. Please try again."
        : err.message || "Request failed";
    res.status(status).json({ message: clientMessage });
    console.error(err);
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
    startReflectionJob();
    startDataRetentionJob();
    startVideoRetentionJob();
    // One-time backlog cleanup for the dev-testing account's accumulated
    // video volume -- see oneTimeCleanupPreexistingVideosForAccount's own
    // comment for why this is safe to leave as permanent boot-time code
    // (self-limiting by a fixed cutoff, not "now" on every boot).
    //
    // Confirmed on production (2026-08-31 03:43 UTC log) that this finds
    // the right account and runs cleanly, but matches 0 rows -- Jordan's
    // account genuinely has no old videos. The 1078-video/8.85GB backlog
    // is NOT on this account; scoping every fix attempt to it was the
    // wrong assumption from the start. Left running (harmless, matches
    // nothing) while diagnoseVideoBacklog below establishes where the
    // backlog actually lives.
    storage
      .oneTimeCleanupPreexistingVideosForAccount("athlete@forge.app", new Date("2026-08-31T03:30:37.000Z"))
      .then((result) => log(`One-time video cleanup: ${JSON.stringify(result)}`))
      .catch((err) => console.error("One-time video cleanup failed:", err));
    // Read-only diagnostic -- see diagnoseVideoBacklog's own comment.
    // Kept running (harmless, cheap) as an ongoing sanity check that
    // cleanupOrphanedVideoRows below is actually keeping up: rawCounts and
    // byAthlete's summed counts should read equal on every future boot.
    storage
      .diagnoseVideoBacklog()
      .then((result) => log(`Video backlog diagnostic: ${JSON.stringify(result)}`))
      .catch((err) => console.error("Video backlog diagnostic failed:", err));
    // Confirmed via the diagnostic above (production log, 2026-08-31 03:56
    // UTC): all 1078 stuck videos are workout_set_entries rows whose
    // parent chain is gone -- raw count 1078, athlete-joined count 0. See
    // cleanupOrphanedVideoRows' own comment for why that's safe to purge
    // unconditionally (unreachable through any real UI flow, for any
    // athlete) and why local dev's DB couldn't reproduce this to test it
    // against a real fixture beforehand.
    storage
      .cleanupOrphanedVideoRows()
      .then((result) => log(`Orphaned video cleanup: ${JSON.stringify(result)}`))
      .catch((err) => console.error("Orphaned video cleanup failed:", err));
  });
})();
