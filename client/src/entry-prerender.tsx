/** THE SERVER-SIDE ENTRY FOR THE PUBLIC PAGES, run once at build time.
 *
 * scripts/prerender.ts calls `renderPublicPage(path)` for each crawlable public route and bakes
 * the result into that route's static HTML, so a crawler that does not run JavaScript -- Bing,
 * the LLM-backed search engines, every link unfurler -- reads the page's words instead of an
 * empty `<div id="root">`. Before 2026-10-16 only the HEAD was prerendered (see
 * scripts/prerender.ts, "WHAT IT DOES NOT DO"); the body is the other half.
 *
 * WHAT IS RENDERED HERE IS THE REAL PAGE. The same components the browser mounts, under the
 * same providers they need (a query client with nothing in it, a router pinned to the path),
 * with no mocks and nothing invented (RULE #3). What differs from the browser is only what a
 * browser supplies: no session (`useSignupAvailability` answers `undefined` and SignupCta draws
 * its disabled open label), no storage, no effects (`usePageMeta` never runs; the head is the
 * prerenderer's job already). main.tsx then mounts the app over the same markup.
 *
 * ONLY pages whose content is in the bundle. The legal documents fetch their text from the
 * API after mount (an admin can edit them), so their bodies cannot be known at build time and
 * they keep an empty root; everything in PRERENDERED_BODY_PATHS is written in the repo.
 */
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router, Switch } from "wouter";
import LandingPage from "@/pages/landing";
import PricingPage from "@/pages/pricing";
import ForHighSchoolsPage from "@/pages/for-high-schools";
import ForAthletesPage from "@/pages/for-athletes";
import CameraValidationPage from "@/pages/camera-validation";
import MovementPage, { MovementIndexPage } from "@/pages/movement";
import { MOVEMENTS } from "@shared/movement-library";

/** The route PATTERNS whose bodies are prerendered. A concrete path (/movements/back-squat)
 * matches its pattern; `prerendersBody(path)` is the question scripts/prerender.ts asks. */
export const PRERENDERED_BODY_PATTERNS = [
  "/",
  "/pricing",
  "/for-high-schools",
  "/for-athletes",
  "/camera-validation",
  "/movements",
  "/movements/:slug",
] as const;

/** Every concrete path that gets a body: the patterns above with the movement slugs expanded. */
export const PRERENDERED_BODY_PATHS: string[] = [
  ...PRERENDERED_BODY_PATTERNS.filter((p) => !p.includes(":")),
  ...MOVEMENTS.map((m) => `/movements/${m.slug}`),
];

export function prerendersBody(path: string): boolean {
  return PRERENDERED_BODY_PATHS.includes(path);
}

/** Marks the markup so the live page can tell it was handed content before React mounted
 * (client/src/lib/prerendered-boot.ts): the first mount then skips its page fade-in, and a
 * browser that has signed in before hides it until the auth check answers (index.html). */
export const PRERENDERED_ATTR = "data-prerendered";

export function renderPublicPage(path: string): string {
  if (!prerendersBody(path)) throw new Error(`${path} is not a prerendered public page`);
  // Nothing is fetched: renderToString runs no effects and react-query starts no fetch on the
  // server, so every query here is pending and every component draws its no-data state.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const markup = renderToString(
    <QueryClientProvider client={client}>
      <Router ssrPath={path}>
        <Switch>
          <Route path="/" component={LandingPage} />
          <Route path="/pricing" component={PricingPage} />
          <Route path="/for-high-schools" component={ForHighSchoolsPage} />
          <Route path="/for-athletes" component={ForAthletesPage} />
          <Route path="/camera-validation" component={CameraValidationPage} />
          <Route path="/movements" component={MovementIndexPage} />
          <Route path="/movements/:slug" component={MovementPage} />
        </Switch>
      </Router>
    </QueryClientProvider>,
  );
  client.clear();
  return `<div ${PRERENDERED_ATTR}="">${markup}</div>`;
}
