import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_ROUTES, NOINDEX_PREFIXES, isIndexable } from "./public-routes";

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

function routerPaths(): { path: string; protected: boolean }[] {
  const found: { path: string; protected: boolean }[] = [];
  // Self-closing <Route path="..." component={X} /> is the public form; the wrapping
  // <Route path="..."><ProtectedRoute .../></Route> form is the gated one.
  //
  // BOTH gate components count. Written against ProtectedRoute alone, this scan reported
  // /documents -- which is gated by AuthedRoute (signed in, any role) -- as an unclassified
  // public page. A gate this test does not recognise reads as no gate at all, which is the
  // direction that matters: it would have had somebody add a signed-in page to the sitemap.
  for (const m of APP.matchAll(/<Route\s+path="([^"]+)"([^>]*)(\/?)>/g)) {
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
    const stale = PUBLIC_ROUTES.map((r) => r.path).filter((p) => !routerSet.has(p)).sort();
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

  it("keeps the pages that are the point of having a site IN the index", () => {
    expect(isIndexable("/")).toBe(true);
    expect(isIndexable("/pricing")).toBe(true);
    expect(isIndexable("/privacy")).toBe(true);
  });
});
