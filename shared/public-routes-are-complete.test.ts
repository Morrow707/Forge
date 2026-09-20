import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_ROUTES, NOINDEX_PREFIXES, isIndexable, isKnownAppPath } from "./public-routes";

// A PUBLIC PAGE NOBODY CLASSIFIED IS A PAGE GOOGLE DECIDES ABOUT ON ITS OWN.
//
// Three things read PUBLIC_ROUTES: the sitemap generator, the prerenderer, and RouteMeta in
// App.tsx. A route added to the router and to none of them gets the fallback head -- no
// per-page title, no share card, absent from the sitemap -- and nothing anywhere says so. The
// failure is silent in both directions: a marketing page that never gets indexed, or a page
// nobody meant to publish that does.
//
// So this does not keep a second list. It reads the router and requires every route reachable
// WITHOUT a session to be accounted for: either in PUBLIC_ROUTES with a title and description, or
// matched by a NOINDEX_PREFIXES entry, or explicitly named below as deliberately handled
// elsewhere. A new public page lands here as a failure naming its path.
const APP = readFileSync(join(__dirname, "..", "client", "src", "App.tsx"), "utf8");

/** Public routes whose metadata cannot come from a static list, with the reason. */
const HANDLED_AT_RUNTIME: Record<string, string> = {
  "/team/:code": "per-code, unknowable at build time -- PublicTeamPage sets its own head",
};

/** A router path may be a PATTERN. "/movements/:slug" is one route in App.tsx and four entries
 * in PUBLIC_ROUTES, one per validated movement, because each needs its own title and its own
 * line in the sitemap. Comparing the two as plain strings reported all four as routes that do
 * not exist -- so the comparison has to understand a parameter segment. */
function patternMatches(pattern: string, concrete: string): boolean {
  const a = pattern.split("/");
  const b = concrete.split("/");
  if (a.length !== b.length) return false;
  return a.every((seg, i) => seg.startsWith(":") || seg === b[i]);
}

function routerPaths(): { path: string; protected: boolean }[] {
  const found: { path: string; protected: boolean }[] = [];
  // Self-closing <Route path="..." component={X} /> is the public form; the wrapping
  // <Route path="..."><ProtectedRoute .../></Route> form is the gated one.
  //
  // BOTH gate components count. Written against ProtectedRoute alone, this scan reported
  // /documents -- which is gated by AuthedRoute (signed in, any role) -- as an unclassified
  // public page. A gate this test does not recognise reads as no gate at all, which is the
  // direction that matters: it would have had somebody add a signed-in page to the sitemap.
  // The attribute capture must NOT be able to eat the closing slash. Written as `([^>]*)(\/?)>`
  // it did: the greedy class took the "/" and selfClosing was always empty, so every route was
  // classified by the 300-character look-ahead instead -- and a public route that happened to
  // sit just above a gated one (/research-consent, above /dev/av-preview-test) read as gated and
  // was missing from the sitemap with this test green.
  for (const m of APP.matchAll(/<Route\s+path="([^"]+)"((?:[^>\/]|\/(?!>))*)(\/?)>/g)) {
    const [, path, attrs, selfClosing] = m;
    if (selfClosing === "/") {
      found.push({ path, protected: false });
      continue;
    }
    // Look ahead to the matching close for a ProtectedRoute.
    const after = APP.slice(m.index! + m[0].length, m.index! + m[0].length + 300);
    const GATES = /ProtectedRoute|AuthedRoute/;
    found.push({ path, protected: GATES.test(after) || GATES.test(attrs) });
  }
  return found;
}

describe("every route a logged-out visitor can reach is classified", () => {
  const paths = routerPaths();

  it("finds the router it is meant to be reading", () => {
    // The failure mode of a scan is silently matching nothing, after which it passes forever.
    expect(paths.length).toBeGreaterThan(40);
    expect(paths.some((p) => p.protected)).toBe(true);
    expect(paths.some((p) => !p.protected)).toBe(true);
  });

  it("leaves no public route without metadata", () => {
    const known = new Set(PUBLIC_ROUTES.map((r) => r.path));
    const unclassified = paths
      .filter((p) => !p.protected)
      .map((p) => p.path)
      .filter((path) => !known.has(path))
      // A parameterised route is covered when the list carries concrete paths under it.
      .filter((path) => !PUBLIC_ROUTES.some((r) => patternMatches(path, r.path)))
      .filter((path) => !(path in HANDLED_AT_RUNTIME))
      .filter((path) => !NOINDEX_PREFIXES.some((n) => path === n || path.startsWith(`${n}/`)))
      .sort();
    expect(
      unclassified,
      "a public page with no entry in shared/public-routes.ts gets no title, no share card and " +
        "no sitemap entry. Add it there, or to NOINDEX_PREFIXES if it should not be crawled.",
    ).toEqual([]);
  });

  it("lists nothing that is not actually a route", () => {
    const routerSet = new Set(paths.map((p) => p.path));
    const routerPatterns = [...routerSet];
    const stale = PUBLIC_ROUTES.map((r) => r.path)
      .filter((p) => !routerSet.has(p) && !routerPatterns.some((rp) => patternMatches(rp, p)))
      .sort();
    expect(stale, "in the sitemap but not in the router -- a 404 offered to Google").toEqual([]);
  });

  it("gives every indexable route a real title and description", () => {
    for (const r of PUBLIC_ROUTES.filter((r) => r.index)) {
      expect(r.title.length, `${r.path} title`).toBeGreaterThan(2);
      // Google truncates around 155-160 characters; under ~50 is usually a placeholder.
      expect(r.description.length, `${r.path} description too short`).toBeGreaterThan(50);
      expect(r.description.length, `${r.path} description too long`).toBeLessThan(200);
    }
  });

  it("keeps the token landings and the admin surface out of the index", () => {
    // Named individually rather than counted: each is a separate decision, and one silently
    // flipping to indexable should read as that page, not as a number changing.
    expect(isIndexable("/admin/login")).toBe(false);
    expect(isIndexable("/reset-password")).toBe(false);
    expect(isIndexable("/verify-email")).toBe(false);
    expect(isIndexable("/claim/ABC123")).toBe(false);
    expect(isIndexable("/guardian/claim")).toBe(false);
    expect(isIndexable("/login")).toBe(false);
    // Closed beta: a signup page in search results invites traffic the product cannot serve.
    expect(isIndexable("/signup")).toBe(false);
  });

  it("classifies both kinds of route, so a scan that matched nothing would be noticed", () => {
    // The regex bug above would have passed a "finds the router" count; this pins the split.
    const publicPaths = paths.filter((p) => !p.protected).map((p) => p.path);
    expect(publicPaths).toContain("/research-consent");
    expect(publicPaths).toContain("/pricing");
    expect(publicPaths).not.toContain("/coach");
    expect(publicPaths).not.toContain("/documents");
  });

  it("lets the server tell every router path from a typo, so the 404 status cannot hit a real page", () => {
    // spaFallback answers 404 for anything isKnownAppPath rejects. A route the router serves
    // that this rejects is a real page delivered with a not-found status, which Google drops.
    for (const p of paths) {
      // A parameterised PUBLIC route is known through its concrete entries (/movements/back-squat),
      // and an unknown slug there really is a not-found page, so a 404 for it is right. Elsewhere
      // any value stands in for the parameter.
      const concrete =
        PUBLIC_ROUTES.find((r) => patternMatches(p.path, r.path))?.path ?? p.path.replace(/:[^/]+/g, "x");
      expect(isKnownAppPath(concrete), `${p.path} would be served with a 404`).toBe(true);
    }
    expect(isKnownAppPath("/movements/not-a-movement")).toBe(false);
    expect(isKnownAppPath("/pricng")).toBe(false);
    expect(isKnownAppPath("/movement/back-squat")).toBe(false);
    expect(isKnownAppPath("/pricing/")).toBe(true);
  });

  it("keeps the pages that are the point of having a site IN the index", () => {
    expect(isIndexable("/")).toBe(true);
    expect(isIndexable("/pricing")).toBe(true);
    expect(isIndexable("/privacy")).toBe(true);
  });
});
