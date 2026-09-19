/** Writes a static HTML file per public route, with that route's real head baked in.
 *
 * WHY THIS EXISTS. Forge is a single-page app: the server hands out one index.html whose body is
 * an empty <div id="root">, and every title, description and share card is written by JavaScript
 * after React mounts. Google executes JavaScript and will usually cope. Nothing else does --
 * iMessage, Slack, WhatsApp, Facebook, LinkedIn and Bing all read the HTML as served, so every
 * shared Forge link arrived as a bare URL, and every page looked identical to any crawler that
 * does not run a browser.
 *
 * WHAT IT DOES NOT DO. This bakes the HEAD, not the body. The page content still renders
 * client-side. That is the deliberate cheap 90%: the head is what a share card and a search
 * snippet read, it is static per route, and producing it does not require the app to run
 * server-side with a database behind it. If full server-side body rendering is ever wanted, it
 * is a different and much larger project -- see the note in shared/public-routes.ts.
 *
 * Driven by the same PUBLIC_ROUTES list as the sitemap and RouteMeta, so the three cannot
 * disagree about what exists.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dist = path.join(root, "dist", "public");

const origin = (process.env.VITE_PUBLIC_ORIGIN || "https://forgeperformancesystems.com").replace(/\/$/, "");
const SITE_NAME = "Forge Performance Systems";
const DEFAULT_IMAGE = "/marketing/shot-dashboard.png";

const src = fs.readFileSync(path.join(root, "shared", "public-routes.ts"), "utf8");

function parseRoutes() {
  const start = src.indexOf("export const PUBLIC_ROUTES");
  const open = src.indexOf("[", start);
  const end = src.indexOf("\n];", open);
  if (start < 0 || open < 0 || end < 0) throw new Error("Could not find PUBLIC_ROUTES");
  const routes = [];
  for (const m of src.slice(open, end + 2).matchAll(/\{([^{}]*)\}/g)) {
    const chunk = m[1];
    const pick = (key) => {
      const hit = chunk.match(new RegExp(`${key}:\\s*("(?:[^"\\\\]|\\\\.)*"|true|false|[\\d.]+)`, "s"));
      if (!hit) return undefined;
      const raw = hit[1];
      if (raw === "true") return true;
      if (raw === "false") return false;
      if (raw.startsWith('"')) return JSON.parse(raw);
      return Number(raw);
    };
    const p = pick("path");
    if (!p) continue;
    routes.push({
      path: p,
      title: pick("title"),
      description: pick("description"),
      index: pick("index"),
      image: pick("image"),
    });
  }
  return routes;
}

/** Multi-line description strings are written across several lines in the source. The single-line
 * regex above misses those, and a route whose description came back undefined would be
 * prerendered with the word "undefined" as its share text -- worse than no tag at all. */
function requireField(route, field) {
  const v = route[field];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(
      `Route ${route.path} has no parseable ${field}. Keep titles and descriptions on one line in shared/public-routes.ts.`,
    );
  }
  return v;
}

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const routes = parseRoutes().filter((r) => r.index);
if (routes.length === 0) throw new Error("Nothing to prerender");

let written = 0;
for (const route of routes) {
  const title = route.title === SITE_NAME ? SITE_NAME : `${requireField(route, "title")} | ${SITE_NAME}`;
  const description = requireField(route, "description");
  const url = `${origin}${route.path}`;
  const image = `${origin}${route.image ?? DEFAULT_IMAGE}`;

  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${esc(description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${esc(url)}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${esc(title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${esc(description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${esc(url)}" />`)
    .replace(/<meta property="og:image" content="[^"]*"\s*\/>/, `<meta property="og:image" content="${esc(image)}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${esc(title)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${esc(description)}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*"\s*\/>/, `<meta name="twitter:image" content="${esc(image)}" />`);

  if (route.path === "/") {
    fs.writeFileSync(path.join(dist, "index.html"), html);
  } else {
    // A directory with its own index.html, so express.static serves it at the clean URL with no
    // routing change and no rewrite rule.
    const dir = path.join(dist, route.path.replace(/^\//, ""));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html);
  }
  written++;
}

console.log(`Prerendered ${written} routes.`);
