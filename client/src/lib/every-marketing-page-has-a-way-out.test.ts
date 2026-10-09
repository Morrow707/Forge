import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_ROUTES } from "@shared/public-routes";

/* A PUBLIC PAGE A STRANGER LANDS ON HAS A WAY ONWARD, AND /pricing DID NOT.
 *
 * Found 2026-10-09 by the launch audit's link sweep. `/pricing` was the only one of the six
 * marketing pages rendering neither `MarketingNav` nor `MarketingFooter` -- it opened with a bare
 * `<div className="min-h-screen bg-background px-4 py-10">` -- so a visitor arriving from the
 * login screen, the signup footer or the nav on any other page had the browser's back button and
 * nothing else. It is indexable at priority 0.9, which means search results send people straight
 * to it.
 *
 * The footer is also the internal link graph, which `MarketingNav`'s own comment makes the
 * argument for: the audience and validation pages were orphans the moment they shipped until they
 * were listed there, reachable by a crawler only through the sitemap. A page outside the shell is
 * outside that graph in both directions.
 *
 * Nothing caught it, and the gap is worth naming: mutation-testing the fix showed that removing
 * `MarketingShell` from /pricing again turned no test red anywhere. This is that test.
 *
 * Every route in PUBLIC_ROUTES is classified, in the shape
 * `every-upload-directory-is-classified.test.ts` uses, so a public page added later cannot
 * default into having no way out.
 */
const ROOT = join(import.meta.dirname, "../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** A marketing page: prose a stranger reads, which needs the nav and the footer. */
const MARKETING_PAGES: Record<string, string> = {
  "/": "client/src/pages/landing.tsx",
  "/pricing": "client/src/pages/pricing.tsx",
  "/for-high-schools": "client/src/pages/for-high-schools.tsx",
  "/for-athletes": "client/src/pages/for-athletes.tsx",
  "/camera-validation": "client/src/pages/camera-validation.tsx",
  "/movements": "client/src/pages/movement.tsx",
};

/* The nine legal documents, which share ONE reason rather than nine near-identical ones. Written
 * as a group because nine copies of "a legal document, as /terms" is padding, and padding is what
 * a length check on each would have forced. */
const LEGAL_DOCUMENT_ROUTES = [
  "/terms",
  "/privacy",
  "/eula",
  "/ai-terms",
  "/biometric-release",
  "/parent-notice",
  "/assumption-of-risk",
  "/research-consent",
];
const LEGAL_DOCUMENT_REASON =
  "Every one of these renders through the single LegalDocumentPage component, which carries its " +
  "own heading, its download button and a link to the other document in the pair. A marketing " +
  "nav offering Get Started above an attorney-reviewed document is the wrong furniture, and the " +
  "/legal index is the navigation these have.";

/* Everything else public, with the reason it carries no marketing chrome. A page here is a
 * deliberate choice, never a default -- which is the whole point, since /pricing's missing nav
 * looked exactly like a choice until somebody fetched the live page. */
const NO_MARKETING_CHROME: Record<string, string> = {
  "/legal":
    "The index of legal documents. Its own list IS its navigation, and every document it links to links back to it.",
  "/delete-account":
    "Instructions for deleting an account. Reached by somebody who already has one and is looking for one specific thing; a marketing nav offering Get Started would be the wrong furniture on it.",
  "/login":
    "A form. Marketing chrome on a sign-in screen is a way to lose the person who came to sign in, and the login screen deliberately carries no pricing link at all (3.1.1).",
  "/signup":
    "A form, as /login. It also carries the coming-soon card while PUBLIC_SIGNUPS_OPEN is false, which is the only thing a visitor there should be reading.",
  "/forgot-password": "A form, as /login: one field, one button, nothing to browse away to.",
  "/unsubscribe":
    "One button, reached from an email by somebody who wants to leave. Offering them the marketing nav instead would be the opposite of what they asked for.",
};

describe("every public route", () => {
  const paths = PUBLIC_ROUTES.map((r) => r.path);

  it("is discovered at all, so this file cannot pass vacuously", () => {
    expect(paths.length).toBeGreaterThanOrEqual(20);
    expect(paths).toContain("/pricing");
  });

  it("is classified as a marketing page or as deliberately without chrome", () => {
    const unclassified = paths.filter(
      (p) =>
        !(p in MARKETING_PAGES) &&
        !(p in NO_MARKETING_CHROME) &&
        !LEGAL_DOCUMENT_ROUTES.includes(p) &&
        !p.startsWith("/movements/"),
    );
    expect(
      unclassified,
      `Unclassified public route(s): ${unclassified.join(", ")}. If a stranger reads prose there ` +
        "it renders MarketingShell and joins MARKETING_PAGES; if not, say why in " +
        "NO_MARKETING_CHROME. /pricing had no nav and no footer for months because there was no " +
        "list it was missing from.",
    ).toEqual([]);
  });

  it("gives every no-chrome entry a real reason, not a word", () => {
    for (const [route, why] of Object.entries(NO_MARKETING_CHROME)) {
      expect(why.length, `${route}'s reason is too short to be one`).toBeGreaterThan(50);
    }
    expect(LEGAL_DOCUMENT_REASON.length).toBeGreaterThan(50);
    expect(LEGAL_DOCUMENT_ROUTES.length).toBeGreaterThanOrEqual(8);
  });

  it("is never in both lists", () => {
    for (const route of Object.keys(MARKETING_PAGES)) {
      expect(NO_MARKETING_CHROME[route], `${route} is in both lists`).toBeUndefined();
      expect(LEGAL_DOCUMENT_ROUTES, `${route} is in both lists`).not.toContain(route);
    }
  });
});

describe("every marketing page", () => {
  it.each(Object.entries(MARKETING_PAGES))("%s renders the nav and the footer", (_route, rel) => {
    const src = read(rel);
    // Either the shell, or the nav and footer separately -- landing.tsx does the latter because
    // it interleaves its own hero above the nav. Both give the reader a way onward, so asserting
    // one shape would force the wrong one on landing.
    const hasShell = /<MarketingShell>/.test(src);
    const hasBoth = /<MarketingNav\s*\/>/.test(src) && /<MarketingFooter\s*\/>/.test(src);
    expect(
      hasShell || hasBoth,
      `${rel} renders neither <MarketingShell> nor both <MarketingNav /> and <MarketingFooter />, ` +
        "so a visitor who lands there has no way onward and no crawler reaches it except through " +
        "the sitemap.",
    ).toBe(true);
  });

  it("does not nest two min-h-screen wrappers inside the shell", () => {
    // MarketingShell already supplies min-h-screen and bg-background. A page that keeps its own
    // makes itself at least two viewports tall with a dead second one -- which is what the first
    // draft of the /pricing fix did before this assertion existed.
    for (const [route, rel] of Object.entries(MARKETING_PAGES)) {
      const src = read(rel);
      if (!/<MarketingShell>/.test(src)) continue;
      const inner = src.slice(src.indexOf("<MarketingShell>"));
      expect(inner, `${route} keeps a min-h-screen inside MarketingShell`).not.toContain("min-h-screen");
    }
  });
});
