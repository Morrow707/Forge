import fs from "node:fs";
import path from "node:path";
import type { RequestHandler } from "express";
import type { ServeStaticOptions } from "serve-static";

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
export const PUBLIC_STATIC_OPTIONS: ServeStaticOptions = {
  redirect: false,
};

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
