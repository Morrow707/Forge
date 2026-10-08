import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BETA_NOT_CHARGING_NOTICE } from "./billing-tiers";
import { HIGH_SCHOOLS_FAQ } from "./high-schools-faq";
import { PUBLIC_ROUTES } from "./public-routes";

/* A PUBLIC PAGE THAT QUOTES A PRICE SAYS NOTHING IS BEING CHARGED, AND SAYS IT IN ONE SENTENCE.
 *
 * CLAUDE.md states as settled fact that "the pricing page still says Forge is not charging yet,
 * which is the truthful statement of TODAY", and tells the next reader not to "fix" it to match
 * the Terms, which describe the paid plans. The launch checklist's row F3 repeats it.
 *
 * Neither was true of what a visitor read. On 2026-10-08 the only such sentence anywhere in the
 * repo was the <meta name="description"> for /pricing -- which no reader sees -- plus one
 * hardcoded clause buried inside a /for-high-schools FAQ answer. /pricing and the landing page
 * quoted six prices in silence while every checkout refused all of them.
 *
 * The three surfaces now read one constant. That is the load-bearing part: on the day BILLING_LIVE
 * is set this sentence has to leave all three at the same moment, and three separately-worded
 * sentences in three registers is the shape that leaves one behind -- which is exactly how
 * /for-high-schools came to be the only one that said it.
 */

const read = (...parts: string[]) => readFileSync(join(__dirname, "..", ...parts), "utf8");

/* Discovered from PUBLIC_ROUTES rather than listed, then narrowed to the ones that actually
 * quote money. A public page added later that prices something has to join this set or explain
 * itself, and the explaining happens here where the argument is. */
const PRICE_QUOTING_PUBLIC_PAGES: Record<string, string> = {
  "/pricing": "client/src/pages/pricing.tsx",
  "/": "client/src/pages/landing.tsx",
};

/* The third priced page carries the notice TRANSITIVELY: it renders HIGH_SCHOOLS_FAQ, and the
 * answer about what Forge costs a school interpolates the constant. That is the right shape --
 * the sentence belongs inside the answer it qualifies, not bolted above the list -- so the chain
 * is asserted in two links rather than the page being made to name the constant itself. */
const RENDERS_IT_THROUGH_THE_FAQ: Record<string, string> = {
  "/for-high-schools": "client/src/pages/for-high-schools.tsx",
};

/* Public pages that quote no price, with the reason. Nothing here is expected to carry the
 * notice; the list exists so that the "every public page is classified" assertion below can be a
 * scan over PUBLIC_ROUTES instead of a hand-written set of three. */
const QUOTES_NO_PRICE: Record<string, string> = {
  "/for-athletes": "Describes the athlete product and links to /pricing for the money.",
  "/camera-validation": "What the camera has and has not been validated against. No money on it.",
  "/movements": "The validated-movement library. No money on it.",
  "/movements/back-squat": "A movement detail page: what this lift has been validated against.",
  "/movements/bench-press": "A movement detail page.",
  "/movements/pendlay-row": "A movement detail page.",
  "/movements/box-jump": "A movement detail page.",
  "/legal": "The index of legal documents.",
  "/terms": "A legal document. Section 11 DESCRIBES the paid plans on purpose (CLAUDE.md: the Terms state the launch position while the pricing page states today), so the notice must NOT be added here.",
  "/privacy": "A legal document.",
  "/eula": "A legal document.",
  "/ai-terms": "A legal document.",
  "/biometric-release": "A legal document.",
  "/parent-notice": "A legal document.",
  "/assumption-of-risk": "A legal document.",
  "/research-consent": "A legal document.",
  "/delete-account": "Account deletion instructions.",
  "/login": "The sign-in form.",
  "/signup": "The sign-up form.",
  "/forgot-password": "Password reset.",
  "/unsubscribe": "One button, for the launch list.",
};

describe("the beta pricing notice", () => {
  it("is one sentence, stated once", () => {
    expect(BETA_NOT_CHARGING_NOTICE.trim().length).toBeGreaterThan(20);
    // A literal copy of the sentence anywhere but its own declaration is the drift this exists to
    // stop. billing-tiers.ts holds the declaration; nothing else may hold the words.
    for (const rel of [
      ...Object.values(PRICE_QUOTING_PUBLIC_PAGES),
      ...Object.values(RENDERS_IT_THROUGH_THE_FAQ),
      "shared/high-schools-faq.ts",
    ]) {
      expect(read(rel), `${rel} hardcodes the sentence instead of reading the constant`).not.toContain(
        BETA_NOT_CHARGING_NOTICE,
      );
    }
  });

  it.each(Object.entries(PRICE_QUOTING_PUBLIC_PAGES))(
    "%s renders it from the constant",
    (_route, rel) => {
      const src = read(rel);
      // The identifier has to be USED, not merely imported -- the same weakness mutation testing
      // exposed in tier-withdrawal-machinery.test.ts's first draft, where deleting the filter and
      // leaving the import kept a toContain green.
      const withoutImports = src.replace(/^import[\s\S]*?from\s+"[^"]+";$/gm, "");
      expect(
        withoutImports.includes("{BETA_NOT_CHARGING_NOTICE}") ||
          withoutImports.includes("${BETA_NOT_CHARGING_NOTICE}"),
        `${rel} imports the notice but never renders it`,
      ).toBe(true);
    },
  );

  it.each(Object.entries(RENDERS_IT_THROUGH_THE_FAQ))(
    "%s renders the FAQ list that carries it",
    (_route, rel) => {
      // Link one of two. Link two is the assertion below, that the answer itself interpolates
      // the constant. Split because neither alone is the claim: a page rendering the list proves
      // nothing if the list dropped the sentence, and vice versa.
      expect(read(rel)).toContain("HIGH_SCHOOLS_FAQ");
    },
  );

  it("reaches the high-schools FAQ answer, which is where it already lived as a clause", () => {
    const answer = HIGH_SCHOOLS_FAQ.find((e) => /cost a school/i.test(e.question))?.answer ?? "";
    expect(answer).toContain(BETA_NOT_CHARGING_NOTICE);
  });

  it("classifies every public route, so a new priced page cannot be silent", () => {
    const unclassified = PUBLIC_ROUTES.map((r) => r.path).filter(
      (p) =>
        !(p in PRICE_QUOTING_PUBLIC_PAGES) &&
        !(p in RENDERS_IT_THROUGH_THE_FAQ) &&
        !(p in QUOTES_NO_PRICE),
    );
    expect(
      unclassified,
      `Unclassified public route(s): ${unclassified.join(", ")}. If the page quotes a price it ` +
        "renders BETA_NOT_CHARGING_NOTICE and joins PRICE_QUOTING_PUBLIC_PAGES; if it does not, " +
        "say so in QUOTES_NO_PRICE with a reason.",
    ).toEqual([]);
  });

  it("is not added to the Terms, which describe the paid plans on purpose", () => {
    // CLAUDE.md is explicit that the Terms state the LAUNCH position while the pricing page
    // states TODAY, and that neither should be "fixed" to match the other. A reader who finds
    // this constant and sprays it over every money-mentioning surface would undo that.
    expect(QUOTES_NO_PRICE["/terms"]).toContain("must NOT be added here");
    expect(read("server", "seed-data", "signup-agreement.ts")).not.toContain(BETA_NOT_CHARGING_NOTICE);
  });
});
