import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PRERENDERED_BODY_PATHS, PRERENDERED_ATTR, prerendersBody, renderPublicPage } from "../entry-prerender";
import { PUBLIC_ROUTES } from "@shared/public-routes";

const root = path.resolve(__dirname, "..", "..", "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

/** Every public page whose words live in the repo arrives with those words in its HTML, so a
 * crawler that runs no JavaScript reads them. The first prerender (2026-10-02) baked the head
 * only; until 2026-10-16 the body of every public page was `<div id="root"></div>` to Bing,
 * to every LLM-backed engine and to every link unfurler. */
describe("the public pages prerender their bodies", () => {
  const h1Of = (html: string) =>
    (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "").replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

  it("renders every prerendered path to real markup with its own heading, under the marker", () => {
    const expectedH1: Record<string, RegExp> = {
      "/": /Coach smarter/,
      "/pricing": /^Pricing$/,
      "/for-high-schools": /rosters of minors/,
      "/for-athletes": /Today's session/,
      "/camera-validation": /camera has actually been tested/,
      "/movements": /How to film it/,
      "/movements/back-squat": /Filming a back squat/,
      "/movements/bench-press": /Filming a bench press/,
      "/movements/pendlay-row": /Filming a Pendlay row/,
      "/movements/box-jump": /Filming a box jump/,
    };
    expect(Object.keys(expectedH1).sort()).toEqual([...PRERENDERED_BODY_PATHS].sort());
    for (const p of PRERENDERED_BODY_PATHS) {
      const html = renderPublicPage(p);
      expect(html.startsWith(`<div ${PRERENDERED_ATTR}="">`), p).toBe(true);
      expect(html.length, p).toBeGreaterThan(5000);
      expect(h1Of(html), p).toMatch(expectedH1[p]);
    }
  });

  it("every indexable public route is prerendered unless its text comes from the API", () => {
    // The legal documents are fetched after mount (an admin can edit them), so their bodies
    // cannot be known at build time. Everything else indexable has to be in the list, so a new
    // marketing page cannot ship empty to a crawler by being forgotten here.
    const runtimeTextPaths = /^\/(terms|privacy|eula|ai-terms|biometric-release|parent-notice|assumption-of-risk|research-consent|delete-account|legal)$/;
    const indexable = PUBLIC_ROUTES.filter((r) => r.index).map((r) => r.path);
    for (const p of indexable) {
      const runtimeText = runtimeTextPaths.test(p);
      expect(prerendersBody(p), `${p} is ${runtimeText ? "runtime text" : "repo text"}`).toBe(!runtimeText);
    }
    expect(prerendersBody("/login")).toBe(false);
    expect(prerendersBody("/coach")).toBe(false);
  });

  it("renders without a browser: no window, no storage, no fetch", () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((input: unknown) => {
      calls.push(String(input));
      return Promise.reject(new Error("no network at build time"));
    }) as typeof fetch;
    try {
      for (const p of PRERENDERED_BODY_PATHS) renderPublicPage(p);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(calls).toEqual([]);
  });

  it("the live app mounts over the same pages eagerly, so no Suspense spinner replaces the prerendered body", () => {
    const app = read("client/src/App.tsx");
    for (const page of ["pricing", "for-high-schools", "for-athletes", "camera-validation", "movement"]) {
      expect(app, page).toMatch(new RegExp(`^import .* from "@/pages/${page}";`, "m"));
      expect(app, page).not.toMatch(new RegExp(`lazy\\([^)]*import\\("@/pages/${page}"\\)`));
    }
  });

  it("main.tsx records the prerendered boot before createRoot, and the first mount holds still", () => {
    const main = read("client/src/main.tsx");
    const mark = main.indexOf("markBootFromPrerender(rootElement)");
    const create = main.indexOf("createRoot(rootElement)");
    expect(mark).toBeGreaterThan(-1);
    expect(mark).toBeLessThan(create);
    const app = read("client/src/App.tsx");
    expect(app).toMatch(/const holdStill = bootedFromPrerender\(\) && location === bootLocation;/);
    expect(app).toMatch(/className=\{holdStill \? undefined : "motion-safe:animate-in/);
  });

  it("a browser that has signed in before hides the prerendered body until the auth check answers", () => {
    expect(read("client/index.html")).toMatch(/forge:had-session[\s\S]*classList\.add\("had-session"\)/);
    expect(read("client/src/index.css")).toMatch(/html\.had-session \[data-prerendered\]\s*\{\s*visibility: hidden;/);
    expect(read("client/src/lib/session-hint.ts")).toMatch(/SESSION_HINT_KEY = "forge:had-session"/);
  });

  it("the home page's body goes to home.html and index.html keeps an empty root for the native app", () => {
    const script = read("scripts/prerender.ts");
    expect(script).toMatch(/fs\.writeFileSync\(path\.join\(dist, prerenderedFileFor\("\/"\)\), renderRouteHtml\(template, route, origin, imageSizeOf\)\)/);
    expect(script).toMatch(/fs\.writeFileSync\(path\.join\(dist, HOME_PAGE_FILE\), renderRouteHtml\(template, route, origin, imageSizeOf, body\)\)/);
    expect(read("package.json")).toMatch(/vite build && vite build --config vite\.prerender\.config\.ts && npx tsx scripts\/prerender\.ts/);
  });
});
