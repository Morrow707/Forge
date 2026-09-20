import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_ROUTES, NOINDEX_PREFIXES, AUTHED_PREFIXES } from "./public-routes";
import { renderRouteHtml, renderAppShell, fullTitle, pngSize } from "./prerender-head";
import { sitemapXml, robotsTxt, DEFAULT_ORIGIN } from "./seo-files";
import { FREE_AGENT_TIERS, FREE_AGENT_TIER_ORDER } from "./free-agent-tiers";

/** WHAT EVERY PUBLIC PAGE'S HEAD SAYS, checked without a build.
 *
 * The prerenderer, the sitemap and robots.txt are all pure functions of the route list now, so
 * this runs them over the real client/index.html and reads the results back. It pins the things
 * a search result or a share card is made of: a title and description that are unique per page
 * and short enough not to be cut off, a canonical that matches the sitemap, an og:image a scraper
 * can decode, structured data that parses and quotes the real prices, and a robots.txt that
 * keeps the signed-in app out.
 */
const ROOT = join(__dirname, "..");
const TEMPLATE = readFileSync(join(ROOT, "client", "index.html"), "utf8");
const routes = PUBLIC_ROUTES.filter((r) => r.index);

function imageSizeOf(imagePath: string) {
  try {
    return pngSize(readFileSync(join(ROOT, "client", "public", imagePath)));
  } catch {
    return undefined;
  }
}

const pages = routes.map((r) => ({ route: r, html: renderRouteHtml(TEMPLATE, r, DEFAULT_ORIGIN, imageSizeOf) }));

const tag = (html: string, re: RegExp) => html.match(re)?.[1];
const title = (html: string) => tag(html, /<title>([^<]*)<\/title>/);
const description = (html: string) => tag(html, /<meta name="description" content="([^"]*)"/);
const canonical = (html: string) => tag(html, /<link rel="canonical" href="([^"]*)"/);
const ogImage = (html: string) => tag(html, /<meta property="og:image" content="([^"]*)"/);
const jsonLd = (html: string) => {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("no JSON-LD on the page");
  return JSON.parse(m[1]);
};

describe("every prerendered public page", () => {
  it("renders at least the pages the site is for", () => {
    expect(routes.map((r) => r.path)).toEqual(
      expect.arrayContaining(["/", "/pricing", "/for-high-schools", "/for-athletes", "/privacy", "/research-consent"]),
    );
  });

  it("has a title nothing else on the site shares", () => {
    const titles = pages.map((p) => title(p.html));
    expect(new Set(titles).size).toBe(titles.length);
    for (const p of pages) {
      expect(title(p.html), p.route.path).toContain("Forge Performance Systems");
    }
  });

  it("has a description nothing else on the site shares", () => {
    const ds = pages.map((p) => description(p.html));
    expect(new Set(ds).size).toBe(ds.length);
  });

  it("keeps the distinctive part of the title in front of the cut", () => {
    // Google shows roughly 60 characters. The page part comes first and the brand is appended,
    // so the brand is what gets truncated, never the words that say which page this is. 35 for
    // the page part keeps at least "| Forge Perf" visible; the home page carries the brand itself.
    for (const r of routes) {
      const page = r.path === "/" ? r.title.replace(/^Forge Performance Systems:?\s*/, "") : r.title;
      expect(page.length, `${r.path} title "${r.title}"`).toBeLessThanOrEqual(35);
      expect(fullTitle(r.title).length, `${r.path} full title`).toBeLessThanOrEqual(70);
      expect(fullTitle(r.title).split("Forge Performance Systems").length, `${r.path} brand doubled`).toBe(2);
    }
  });

  it("keeps the description inside a snippet", () => {
    for (const r of routes) {
      expect(r.description.length, `${r.path} description too long`).toBeLessThanOrEqual(160);
      expect(r.description.length, `${r.path} description too short`).toBeGreaterThan(50);
    }
  });

  it("has a canonical that is exactly the sitemap URL, with no trailing slash", () => {
    const sitemap = sitemapXml(DEFAULT_ORIGIN, "2026-01-01");
    for (const p of pages) {
      const c = canonical(p.html)!;
      expect(c, p.route.path).toBe(`${DEFAULT_ORIGIN}${p.route.path}`);
      expect(c.endsWith("/") && p.route.path !== "/", `${p.route.path} trailing slash`).toBe(false);
      expect(sitemap, `${c} missing from the sitemap`).toContain(`<loc>${c}</loc>`);
      expect(tag(p.html, /<meta property="og:url" content="([^"]*)"/)).toBe(c);
    }
  });

  it("offers a share image a scraper can decode, with its dimensions, while the page loads webp", () => {
    for (const p of pages) {
      const img = ogImage(p.html)!;
      expect(img, p.route.path).toMatch(/^https:\/\/[^ ]+\.(png|jpe?g)$/);
      expect(tag(p.html, /<meta name="twitter:image" content="([^"]*)"/)).toBe(img);
      expect(tag(p.html, /<meta property="og:image:width" content="(\d+)"/), `${p.route.path} width`).toBeDefined();
      expect(tag(p.html, /<meta property="og:image:height" content="(\d+)"/), `${p.route.path} height`).toBeDefined();
      expect(tag(p.html, /<meta property="og:image:alt" content="([^"]*)"/), `${p.route.path} alt`).toBeTruthy();
    }
    const home = pages.find((p) => p.route.path === "/")!;
    expect(home.html).toContain('<link rel="preload" as="image" href="/marketing/shot-dashboard.webp"');
    // Only the home page has an above-the-fold image; a preload anywhere else is wasted bytes.
    expect(pages.filter((p) => p.html.includes('rel="preload" as="image"')).length).toBe(1);
  });

  it("carries no noindex, and the app shell carries one", () => {
    for (const p of pages) {
      expect(p.html, p.route.path).not.toMatch(/name="robots"/);
    }
    const shell = renderAppShell(TEMPLATE);
    expect(shell).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(shell).not.toContain("application/ld+json");
  });

  it("keeps the html lang attribute", () => {
    for (const p of pages) expect(p.html).toMatch(/<html lang="en"/);
  });
});

describe("the structured data", () => {
  it("parses on every page, names the organisation once and quotes the real tier prices", () => {
    for (const p of pages) {
      const ld = jsonLd(p.html);
      expect(ld["@context"]).toBe("https://schema.org");
      const types = ld["@graph"].map((n: { "@type": string }) => n["@type"]);
      expect(types, p.route.path).toEqual(expect.arrayContaining(["Organization", "WebSite", "SoftwareApplication", "WebPage"]));
      const app = ld["@graph"].find((n: { "@type": string }) => n["@type"] === "SoftwareApplication");
      expect(app.operatingSystem).toBe("iOS, Web");
      for (const id of FREE_AGENT_TIER_ORDER) {
        const t = FREE_AGENT_TIERS[id];
        const offer = app.offers.find((o: { name: string }) => o.name.startsWith(t.label));
        expect(offer, `${id} offer`).toBeDefined();
        expect(offer.price).toBe((t.monthlyPriceCents / 100).toFixed(2));
      }
      const page = ld["@graph"].find((n: { "@type": string }) => n["@type"] === "WebPage");
      expect(page.url).toBe(`${DEFAULT_ORIGIN}${p.route.path}`);
    }
  });

  it("never claims what nobody has measured", () => {
    // No ratings, no review counts, no accuracy claims. The camera caveat is on the page in
    // words; schema.org has no field for "these numbers are not yet accurate" and a rich result
    // that implies otherwise is worse than none.
    for (const p of pages) {
      const text = JSON.stringify(jsonLd(p.html)).toLowerCase();
      expect(text, p.route.path).not.toMatch(/aggregaterating|reviewcount|ratingvalue|"review"|sameas|accura/);
    }
  });

  it("breadcrumbs the nested pages and nothing else", () => {
    for (const p of pages) {
      const has = jsonLd(p.html)["@graph"].some((n: { "@type": string }) => n["@type"] === "BreadcrumbList");
      expect(has, p.route.path).toBe(p.route.path.split("/").filter(Boolean).length >= 2);
    }
  });
});

describe("robots.txt", () => {
  const robots = robotsTxt(DEFAULT_ORIGIN);

  it("disallows the signed-in app, the API and the token landings, and allows the rest", () => {
    for (const p of ["/api", "/admin", "/coach", "/athlete", "/guardian", "/documents"]) {
      expect(AUTHED_PREFIXES).toContain(p);
      expect(robots).toContain(`\nDisallow: ${p}\n`);
    }
    for (const p of NOINDEX_PREFIXES) expect(robots).toContain(`Disallow: ${p}\n`);
    for (const r of PUBLIC_ROUTES.filter((r) => !r.index)) expect(robots).toContain(`Disallow: ${r.path}\n`);
    for (const r of routes) expect(robots, `${r.path} disallowed`).not.toContain(`Disallow: ${r.path}\n`);
    expect(robots).toContain("Allow: /\n");
  });

  it("names the sitemap by its full URL", () => {
    expect(robots).toContain(`Sitemap: ${DEFAULT_ORIGIN}/sitemap.xml`);
  });
});

describe("sitemap.xml", () => {
  const xml = sitemapXml(DEFAULT_ORIGIN, "2026-09-20");

  it("lists every indexable route exactly once and nothing that is not", () => {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(new Set(locs).size).toBe(locs.length);
    expect(locs.sort()).toEqual(routes.map((r) => `${DEFAULT_ORIGIN}${r.path}`).sort());
    for (const p of [...AUTHED_PREFIXES, ...NOINDEX_PREFIXES, "/login", "/signup"]) {
      expect(locs.some((l) => l.startsWith(`${DEFAULT_ORIGIN}${p}`)), p).toBe(false);
    }
  });

  it("carries a lastmod on every entry and no trailing slashes", () => {
    expect((xml.match(/<lastmod>2026-09-20<\/lastmod>/g) ?? []).length).toBe(routes.length);
    expect(xml).not.toMatch(/<loc>https:\/\/[^<\/]+\/[^<]+\/<\/loc>/);
  });
});
