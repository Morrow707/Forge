/** Writes a static HTML file per public route, with that route's real head baked in, plus the
 * app shell every other path is served from.
 *
 * WHY THIS EXISTS. Forge is a single-page app: the server hands out one index.html whose body is
 * an empty <div id="root">, and every title, description and share card is written by JavaScript
 * after React mounts. Google executes JavaScript and will usually cope. Nothing else does --
 * iMessage, Slack, WhatsApp, Facebook, LinkedIn and Bing all read the HTML as served, so every
 * shared Forge link arrived as a bare URL and every page looked identical to any crawler that
 * does not run a browser.
 *
 * WHAT IT DOES NOT DO. This bakes the HEAD, not the body. The page content still renders
 * client-side. That is the deliberate cheap 90%: the head is what a share card and a search
 * snippet read, it is static per route, and producing it does not require running the app
 * server-side with a database behind it. Full server-side body rendering is a different and much
 * larger project.
 *
 * The rendering itself is shared/prerender-head.ts, so a test can run it without a build. This
 * file is the IO: read the template, read the PNGs for their dimensions, write the files.
 */
import fs from "node:fs";
import path from "node:path";
import { PUBLIC_ROUTES } from "../shared/public-routes";
import { renderRouteHtml, renderAppShell, pngSize } from "../shared/prerender-head";
import { prerenderedFileFor, APP_SHELL_FILE } from "../server/public-static";

const dist = path.resolve(import.meta.dirname, "..", "dist", "public");
const origin = (process.env.VITE_PUBLIC_ORIGIN || "https://forgeperformancesystems.com").replace(/\/$/, "");

const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const routes = PUBLIC_ROUTES.filter((r) => r.index);
if (routes.length === 0) throw new Error("Nothing to prerender");

const sizeCache = new Map<string, ReturnType<typeof pngSize>>();
function imageSizeOf(imagePath: string) {
  if (!sizeCache.has(imagePath)) {
    const file = path.join(dist, imagePath);
    sizeCache.set(imagePath, fs.existsSync(file) ? pngSize(fs.readFileSync(file)) : undefined);
  }
  return sizeCache.get(imagePath);
}

// The shell FIRST, from the untouched template: "/" overwrites index.html below, and the shell
// must not inherit the home page's canonical and structured data.
fs.writeFileSync(path.join(dist, APP_SHELL_FILE), renderAppShell(template));

let written = 0;
for (const route of routes) {
  if (route.preload && !fs.existsSync(path.join(dist, route.preload))) {
    throw new Error(`${route.path} preloads ${route.preload}, which is not in the build`);
  }
  const html = renderRouteHtml(template, route, origin, imageSizeOf);
  // A flat file per route, served at the clean URL by servePrerendered in server/public-static.ts.
  // NOT a directory with an index.html: express.static answers that with a 301 to the
  // trailing-slash URL, which is how the first version of this shipped every public page behind
  // a redirect its own canonical tag disagreed with.
  const out = path.join(dist, prerenderedFileFor(route.path));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  written++;
}

console.log(`Prerendered ${written} routes and the app shell.`);
