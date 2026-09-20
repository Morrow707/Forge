import fs from "node:fs";
import path from "node:path";
import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import type { ServeStaticOptions } from "serve-static";
import { isKnownAppPath } from "../shared/public-routes";

/** How the built client is served, and how the prerenderer has to name its files to match.
 *
 * THE BUG THIS SETTLES. The first prerender wrote each public route as a directory with its own
 * index.html (`dist/public/pricing/index.html`) on the assumption that express.static would serve
 * it at the clean URL. It does not: for a directory, express.static answers `/pricing` with a 301
 * to `/pricing/` and only serves the file at the slashed URL. So every sitemap entry, every
 * canonical tag and every share link named a URL the server redirected away from, and the
 * canonical tag on the page that finally loaded pointed at a different URL than the one it was on.
 * The client router tolerates a trailing slash, so no person saw it break -- which is exactly why
 * it survived the test suite.
 *
 * WHY NOT `extensions: ["html"]`. That was the first fix, and the test beside this file failed
 * it: when a DIRECTORY shares the route's name, serve-static sees the directory, does not fall
 * back to `<path>.html`, and the request drops through to the SPA catch-all -- the root page with
 * the root head. `/movements` has exactly that shape, sitting beside `/movements/<slug>`. So the
 * lookup is explicit instead: a flat file per route (`dist/public/pricing.html`,
 * `dist/public/movements/back-squat.html`), and a handler that serves it by path before
 * express.static gets a chance to see a directory.
 *
 * `redirect: false` on express.static as well, so no directory in dist can ever reintroduce the
 * 301 for some other URL.
 *
 * ONE MODULE, THREE CONSUMERS. `serveStatic` in server/vite.ts, scripts/prerender.ts and the
 * test read from here so the file naming and the serving cannot drift apart.
 */
// Both setupVite's (dev) and serveStatic's (production) catch-alls sit
// outside routes.ts's general /api limiter entirely -- they're mounted
// directly on the app in index.ts, not inside registerRoutes. Its own
// budget, not apiLimiter's: a single page load can fire far more of these
// (every JS/CSS chunk, image, and the SPA shell itself) than it does JSON
// API calls, so sharing a counter would let normal asset loading exhaust
// the budget a user's actual API calls need. No session/user context is
// reliably available at this layer either way (this runs for the very
// first request of a fresh page load, before any app code executes), so
// this one is keyed by IP only.
export const staticLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again shortly." },
});

export const PUBLIC_STATIC_OPTIONS: ServeStaticOptions = {
  redirect: false,
};

/** The app shell -- the template with a noindex -- written by scripts/prerender.ts beside the
 * prerendered pages. index.html is the HOME page once prerendering has run, with the home page's
 * canonical and structured data on it, which is the wrong thing to hand out for /coach. */
export const APP_SHELL_FILE = "app-shell.html";

/** Where the prerendered HTML for a public route lives, relative to the dist root. */
export function prerenderedFileFor(routePath: string): string {
  if (routePath === "/") return "index.html";
  return `${routePath.replace(/^\//, "").replace(/\/$/, "")}.html`;
}

/** Serves a route's prerendered file at its clean URL, or falls through. Only a GET or HEAD for an
 * extensionless path is considered; asset requests and everything else go on to express.static.
 * The path is resolved and checked to stay inside dist, so `..` cannot reach out of it. */
export function servePrerendered(distPath: string): RequestHandler {
  const root = path.resolve(distPath);
  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path === "/" || /\.[a-zA-Z0-9]+$/.test(req.path)) return next();
    let decoded: string;
    try {
      decoded = decodeURIComponent(req.path);
    } catch {
      return next();
    }
    const file = path.resolve(root, prerenderedFileFor(decoded));
    if (!file.startsWith(root + path.sep)) return next();
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) return next();
      res.sendFile(file);
    });
  };
}

/** The SPA catch-all: a client route gets the app shell, a missing ASSET gets a real 404, and a
 * path the client has no page for gets the shell WITH a 404 status.
 *
 * WHY THE ASSET 404 MATTERS. Everything unmatched used to fall through to index.html, including a
 * request for a hashed chunk that no longer exists -- which is exactly what a browser does for
 * the minutes after a deploy, with a tab still open on the previous build. Handing back
 * index.html with a 200 and text/html means dynamic import() gets a document where a module
 * should be, and the failure surfaces as "Cannot read properties of undefined (reading
 * 'default')" rather than as what it is. A real 404 is also what the client's own recovery waits
 * for: main.tsx's vite:preloadError listener and lazy-load-recovery.ts turn a failed chunk fetch
 * into one reload onto the current build. A 200 never reaches either of them.
 *
 * WHY THE PAGE 404 MATTERS. /pricng, /movement/back-squat, a link somebody mistyped on a forum:
 * the client renders its not-found page, but the server said 200, so to a crawler that is a page
 * and it gets indexed as one -- a soft 404, and Search Console fills up with them. The server
 * cannot run the router, so it asks isKnownAppPath, which is the route list plus the prefixes
 * the signed-in app lives under; shared/public-routes-are-complete.test.ts keeps that in step
 * with the router. The BODY is still the shell, so the person sees the same not-found page and
 * the client can still recover a deep link it knows better than this list does. Only the status
 * changes.
 *
 * THE BUG THAT MADE THE ASSET CHECK A NO-OP. It was written against `req.path`, and this handler
 * is mounted with `app.use("*", ...)`. Under a mounted handler Express strips the matched prefix,
 * so `req.path` is always "/" here and the extension test never matched: /missing.js came back as
 * the app's HTML with a 200 for as long as the check existed. `req.originalUrl` is the request as
 * sent, which is the thing to test. The test beside this file requests a missing .js and
 * asserts the 404, so the check cannot go quiet again.
 */
export function spaFallback(distPath: string): RequestHandler {
  const shell = path.resolve(distPath, APP_SHELL_FILE);
  const index = path.resolve(distPath, "index.html");
  // A dist built before the shell existed still serves: the home page's HTML, as before.
  const body = fs.existsSync(shell) ? shell : index;
  return (req, res) => {
    const requested = req.originalUrl.split("?")[0];
    if (/\.[a-zA-Z0-9]+$/.test(requested)) {
      return res.status(404).type("text/plain").send("Not found");
    }
    let decoded = requested;
    try {
      decoded = decodeURIComponent(requested);
    } catch {
      /* leave it; an undecodable path is not a known one either */
    }
    if (!isKnownAppPath(decoded)) res.status(404);
    res.sendFile(body);
  };
}
