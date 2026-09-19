/** Writes a static HTML file per public route, with that route's real head baked in.
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
 * Imports the same PUBLIC_ROUTES list as the sitemap generator and RouteMeta -- see that file's
 * header for why this is a tsx script rather than a regex over the source.
 */
import fs from "node:fs";
import path from "node:path";
import { PUBLIC_ROUTES } from "../shared/public-routes";
import { SITE_NAME, DEFAULT_SHARE_IMAGE } from "../client/src/lib/page-meta";
import { prerenderedFileFor } from "../server/public-static";

const dist = path.resolve(import.meta.dirname, "..", "dist", "public");
const origin = (process.env.VITE_PUBLIC_ORIGIN || "https://forgeperformancesystems.com").replace(/\/$/, "");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const routes = PUBLIC_ROUTES.filter((r) => r.index);
if (routes.length === 0) throw new Error("Nothing to prerender");

/** Every tag this rewrites must already exist in index.html. A replace that matches nothing is
 * the failure mode here: it leaves the fallback tag in place, so every prerendered page quietly
 * advertises the home page's title and nobody finds out until a link is shared. */
function replaceOrFail(html: string, pattern: RegExp, replacement: string, what: string): string {
  if (!pattern.test(html)) {
    throw new Error(
      `Prerender could not find ${what} in client/index.html. The fallback head and this script have to agree; add the tag there or fix the pattern here.`,
    );
  }
  return html.replace(pattern, replacement);
}

let written = 0;
for (const route of routes) {
  const title = route.title === SITE_NAME ? SITE_NAME : `${route.title} | ${SITE_NAME}`;
  const url = `${origin}${route.path}`;
  const image = `${origin}${route.image ?? DEFAULT_SHARE_IMAGE}`;
  const description = route.description;

  let html = template;
  const swaps: [RegExp, string, string][] = [
    [/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`, "<title>"],
    [/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${esc(description)}" />`, "the description tag"],
    [/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${esc(url)}" />`, "the canonical link"],
    [/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${esc(title)}" />`, "og:title"],
    [/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${esc(description)}" />`, "og:description"],
    [/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${esc(url)}" />`, "og:url"],
    [/<meta property="og:image" content="[^"]*"\s*\/>/, `<meta property="og:image" content="${esc(image)}" />`, "og:image"],
    [/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${esc(title)}" />`, "twitter:title"],
    [/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${esc(description)}" />`, "twitter:description"],
    [/<meta name="twitter:image" content="[^"]*"\s*\/>/, `<meta name="twitter:image" content="${esc(image)}" />`, "twitter:image"],
  ];
  for (const [pattern, replacement, what] of swaps) {
    html = replaceOrFail(html, pattern, replacement, what);
  }

  // A flat file per route, served at the clean URL through the extensions option in
  // server/public-static.ts. NOT a directory with an index.html: express.static answers that
  // with a 301 to the trailing-slash URL, which is how the first version of this shipped every
  // public page behind a redirect its own canonical tag disagreed with.
  const out = path.join(dist, prerenderedFileFor(route.path));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  written++;
}

console.log(`Prerendered ${written} routes.`);
