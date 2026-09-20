/** Turns the built index.html into one public route's HTML, head baked in.
 *
 * Pure: takes the template and the route, returns the page. scripts/prerender.ts does the file IO
 * around it; shared/seo-head.test.ts runs it over client/index.html for every public route and
 * reads the result back, which is how "every page has its own title" is checked without a build.
 *
 * THE FALLBACK HEAD AND THIS FILE HAVE TO AGREE. Every tag rewritten here must already exist in
 * client/index.html. A replace that matches nothing is the failure mode: it leaves the fallback
 * tag in place, so a prerendered page quietly advertises the home page's title and nobody finds
 * out until a link is shared. replaceOrFail throws instead.
 */
import type { PublicRoute } from "./public-routes";
import { jsonLdForRoute } from "./structured-data";

export const SITE_NAME = "Forge Performance Systems";
export const DEFAULT_SHARE_IMAGE = "/marketing/shot-dashboard.png";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function fullTitle(title: string): string {
  return title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
}

function replaceOrFail(html: string, pattern: RegExp, replacement: string, what: string): string {
  if (!pattern.test(html)) {
    throw new Error(
      `Prerender could not find ${what} in client/index.html. The fallback head and shared/prerender-head.ts have to agree; add the tag there or fix the pattern here.`,
    );
  }
  return html.replace(pattern, replacement);
}

export type ImageSize = { width: number; height: number };

export function renderRouteHtml(
  template: string,
  route: PublicRoute,
  origin: string,
  imageSizeOf: (imagePath: string) => ImageSize | undefined,
): string {
  const base = origin.replace(/\/$/, "");
  const title = fullTitle(route.title);
  const url = `${base}${route.path}`;
  const imagePath = route.image ?? DEFAULT_SHARE_IMAGE;
  const image = `${base}${imagePath}`;
  const description = route.description;
  const size = imageSizeOf(imagePath);

  let html = template;
  const swaps: [RegExp, string, string][] = [
    [/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`, "<title>"],
    [/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${esc(description)}" />`, "the description tag"],
    [/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${esc(url)}" />`, "the canonical link"],
    [/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${esc(title)}" />`, "og:title"],
    [/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${esc(description)}" />`, "og:description"],
    [/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${esc(url)}" />`, "og:url"],
    [/<meta property="og:image" content="[^"]*"\s*\/>/, `<meta property="og:image" content="${esc(image)}" />`, "og:image"],
    [/<meta property="og:image:alt" content="[^"]*"\s*\/>/, `<meta property="og:image:alt" content="${esc(route.title)}" />`, "og:image:alt"],
    [/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${esc(title)}" />`, "twitter:title"],
    [/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${esc(description)}" />`, "twitter:description"],
    [/<meta name="twitter:image" content="[^"]*"\s*\/>/, `<meta name="twitter:image" content="${esc(image)}" />`, "twitter:image"],
    [/<meta name="twitter:image:alt" content="[^"]*"\s*\/>/, `<meta name="twitter:image:alt" content="${esc(route.title)}" />`, "twitter:image:alt"],
  ];
  if (size) {
    swaps.push(
      [/<meta property="og:image:width" content="[^"]*"\s*\/>/, `<meta property="og:image:width" content="${size.width}" />`, "og:image:width"],
      [/<meta property="og:image:height" content="[^"]*"\s*\/>/, `<meta property="og:image:height" content="${size.height}" />`, "og:image:height"],
    );
  }
  for (const [pattern, replacement, what] of swaps) {
    html = replaceOrFail(html, pattern, replacement, what);
  }

  // The per-page additions go in front of </head>: structured data, and for the one route with
  // an above-the-fold image, a preload so the fetch starts before the bundle has parsed.
  const extras: string[] = [];
  if (route.preload) {
    const type = route.preload.endsWith(".webp") ? "image/webp" : "image/png";
    extras.push(`<link rel="preload" as="image" href="${esc(route.preload)}" type="${type}" fetchpriority="high" />`);
  }
  // "</" inside a JSON string would close the script element early; escape it as JSON allows.
  const json = JSON.stringify(jsonLdForRoute(base, route, image)).replace(/<\//g, "<\\/");
  extras.push(`<script type="application/ld+json">${json}</script>`);
  return replaceOrFail(html, /<\/head>/, `    ${extras.join("\n    ")}\n  </head>`, "</head>");
}

/** The SPA shell: what the server hands out for every path that is NOT a prerendered public
 * page -- the signed-in app, the token landings, and a URL that resolves to nothing. It carries
 * the fallback head and a noindex, because nothing served through it belongs in a search result.
 * Without this, the shell was the home page's HTML, and a crawler that reached /coach through a
 * footer link saw the home page's title and canonical on it. */
export function renderAppShell(template: string): string {
  return replaceOrFail(
    template,
    /<\/head>/,
    `    <meta name="robots" content="noindex, nofollow" />\n  </head>`,
    "</head>",
  );
}

/** Width and height from a PNG's IHDR chunk. The share-card tags want the real dimensions,
 * and Facebook renders the card without waiting to fetch the image when they are present. */
export function pngSize(bytes: Uint8Array): ImageSize | undefined {
  if (bytes.length < 24) return undefined;
  const sig = [0x89, 0x50, 0x4e, 0x47];
  if (!sig.every((b, i) => bytes[i] === b)) return undefined;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}
