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
 * AND, SINCE 2026-10-16, THE BODY OF EVERY PAGE WHOSE WORDS ARE IN THE REPO. The first version
 * baked the head only -- "the deliberate cheap 90%", which it was for share cards and search
 * snippets. What it left was an empty `<div id="root">` for every crawler that does not run
 * JavaScript, which is Bing, the LLM-backed engines and every unfurler: to them the site had
 * titles and no text. client/src/entry-prerender.tsx renders the real page components with
 * react-dom/server (built by vite.prerender.config.ts into dist/prerender first), and the result
 * goes inside the root. The legal documents are the exception and keep the empty root: their
 * text comes from the API, where an admin can edit it, so it is not knowable here.
 *
 * THE HOME PAGE GOES TO home.html, NOT index.html. index.html is what the native app boots from,
 * and a landing page in its body would flash inside the app before React sends it to the login
 * screen. index.html keeps the home head and an empty root; home.html is what "/" serves on the
 * web (server/public-static.ts).
 *
 * The rendering itself is shared/prerender-head.ts, so a test can run it without a build. This
 * file is the IO: read the template, read the PNGs for their dimensions, write the files.
 */
import fs from "node:fs";
import path from "node:path";
import { PUBLIC_ROUTES } from "../shared/public-routes";
import { renderRouteHtml, renderAppShell, pngSize } from "../shared/prerender-head";
import { prerenderedFileFor, APP_SHELL_FILE, HOME_PAGE_FILE } from "../server/public-static";

const dist = path.resolve(import.meta.dirname, "..", "dist", "public");
const origin = (process.env.VITE_PUBLIC_ORIGIN || "https://forgeperformancesystems.com").replace(/\/$/, "");

const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const routes = PUBLIC_ROUTES.filter((r) => r.index);
if (routes.length === 0) throw new Error("Nothing to prerender");

// The server-side build of the public pages (vite.prerender.config.ts). A build that skipped it
// is a build whose public pages are empty to a crawler again, so that is an error, not a fallback.
const prerenderEntry = path.resolve(import.meta.dirname, "..", "dist", "prerender", "entry-prerender.js");
if (!fs.existsSync(prerenderEntry)) {
  throw new Error(`${prerenderEntry} is missing: run \`vite build --config vite.prerender.config.ts\` before this script`);
}
const { renderPublicPage, prerendersBody } = (await import(prerenderEntry)) as {
  renderPublicPage: (p: string) => string;
  prerendersBody: (p: string) => boolean;
};

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
let bodies = 0;
for (const route of routes) {
  if (route.preload && !fs.existsSync(path.join(dist, route.preload))) {
    throw new Error(`${route.path} preloads ${route.preload}, which is not in the build`);
  }
  const body = prerendersBody(route.path) ? renderPublicPage(route.path) : undefined;
  if (body) bodies++;
  if (route.path === "/") {
    // index.html: the home head, empty root (the native app's entry). home.html: the same with
    // the landing page's body, served at "/" on the web.
    fs.writeFileSync(path.join(dist, prerenderedFileFor("/")), renderRouteHtml(template, route, origin, imageSizeOf));
    fs.writeFileSync(path.join(dist, HOME_PAGE_FILE), renderRouteHtml(template, route, origin, imageSizeOf, body));
    written++;
    continue;
  }
  const html = renderRouteHtml(template, route, origin, imageSizeOf, body);
  // A flat file per route, served at the clean URL by servePrerendered in server/public-static.ts.
  // NOT a directory with an index.html: express.static answers that with a 301 to the
  // trailing-slash URL, which is how the first version of this shipped every public page behind
  // a redirect its own canonical tag disagreed with.
  const out = path.join(dist, prerenderedFileFor(route.path));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  written++;
}

console.log(`Prerendered ${written} routes (${bodies} with their body) and the app shell.`);
