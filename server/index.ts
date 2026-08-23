import "dotenv/config";
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
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startReflectionJob } from "./reflection-job";
import { startDataRetentionJob } from "./data-retention-job";
import { startFreeAgentVideoCapJob } from "./free-agent-video-cap-job";
import { verifyStripeWebhook, handleStripeWebhookEvent } from "./billing";
import { signMediaUrlsDeep } from "./media-url-signing";
import { verifyRequestOrigin } from "./csrf-protection";
import { NATIVE_APP_ORIGINS } from "./native-app-origins";

const app = express();
// contentSecurityPolicy and crossOriginEmbedderPolicy are both off --
// this app already serves cross-origin video/image sources (uploaded
// clips, external lesson video links) and registers its own service
// worker (client/src/sw.ts) for push + offline; a default-on CSP or COEP
// would need to be hand-tuned against every one of those before it's safe
// to ship, which isn't something to guess at blind. crossOriginResourcePolicy
// is also off -- helmet's "same-origin" default is a separate browser-level
// block from CORS above, and WebKit (the native app's WKWebView) is known
// to enforce it independently, which would silently defeat the CORS
// allowlist above for exactly the requests it exists to permit. Everything
// else here (nosniff, frameguard, HSTS, referrer policy, etc.) is a pure
// hardening default with no behavior change for a same-origin request.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  }),
);
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
// Registered BEFORE express.json() below -- Stripe's webhook signature
// check needs the exact raw request bytes, which a JSON-parsed body no
// longer is by the time a route handler sees it. Framework only (see
// billing.ts's own comment): verifyStripeWebhook returns null whenever
// STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET aren't set, which is every
// environment today, so this 400s harmlessly if anything ever hits it.
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const event = verifyStripeWebhook(req.body, req.headers["stripe-signature"] as string | undefined);
    if (!event) return res.status(400).send("Invalid signature");
    await handleStripeWebhookEvent(event);
    res.json({ received: true });
  },
);

// Raised from Express's 100kb default -- the AI form-check route accepts a
// handful of base64-encoded JPEG frames per request, which clears 100kb
// easily even resized down.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined;

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
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
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

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
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
    startFreeAgentVideoCapJob();
  });
})();
