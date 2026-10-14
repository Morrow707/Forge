import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// App Store guideline 3.1.1 and 3.1.3: a tier bought inside the app goes through Apple, and the
// app may not steer a buyer to the website, name a web price, or link to the web checkout. Forge
// will be mostly on the web, where Stripe sells the same tiers, which is exactly the shape Apple
// looks hardest at. This scans the in-app paywall and the surfaces it renders for the sentences
// that get an app rejected. The public pricing and landing pages are web pages and are not
// scanned: they live on the site, and the native shell never routes a signed-in athlete to them.
const PAYWALL_SURFACES = [
  "client/src/pages/athlete/upgrade.tsx",
  "client/src/components/free-agent-gate.tsx",
  "client/src/components/camera-metric-caveat.tsx",
  "shared/camera-accuracy-copy.ts",
  "shared/free-agent-tiers.ts",
  "client/src/lib/google-play-billing.ts",
];
const STEERS_TO_THE_WEB =
  /\b(on our website|on the website|visit our site|at forge\.[a-z]+|cheaper (on|at)|subscribe online|sign up online|buy online|save \d+% online|web price)\b/i;
const LINKS_TO_WEB_CHECKOUT = /href=["'][^"']*\/(pricing|checkout|billing)\b/i;

describe("the in-app paywall never points a buyer at the website", () => {
  for (const file of PAYWALL_SURFACES) {
    it(file, () => {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(STEERS_TO_THE_WEB);
      expect(src).not.toMatch(LINKS_TO_WEB_CHECKOUT);
    });
  }

  it("the Android app never renders the web checkout (Google Play's billing policy)", () => {
    const src = readFileSync("client/src/pages/athlete/upgrade.tsx", "utf8");
    expect(src).toMatch(/androidNative/);
    expect(src).toMatch(/\{!supported && !androidNative && \(/);
    expect(src).toMatch(/Subscriptions aren't available in the Android app yet/);
    // When Play Billing is live the Android app buys through Google, never through Stripe.
    expect(src).toMatch(/purchaseFreeAgentTierOnGooglePlay\(/);
    expect(src).toMatch(/SportCoachAddOns webCheckout=\{!supported && !androidNative\}/);
  });

  it("Restore Purchases is on the paywall, which 3.1.1 requires", () => {
    expect(readFileSync("client/src/pages/athlete/upgrade.tsx", "utf8")).toMatch(/Restore Purchases/);
  });

  // THE COACH PLAN IS SOLD ON THE WEB AND NEVER IN THE APP (2026-10-08). $4 an athlete in bands
  // is billed to a program by card, which guideline 3.1.3(c) allows outside Apple -- on the
  // condition that the app never prices it, links to it, or tells a coach where to go and buy
  // it. These pin the four places that did.
  describe("the native app never prices or steers to the web-only coach plan", () => {
    it("the coach billing screen describes the plan and does not say where to buy it", () => {
      const src = readFileSync("client/src/pages/coach/billing.tsx", "utf8");
      expect(src).not.toMatch(/Open Forge in a browser to (subscribe|pay|change)/i);
      expect(src).toMatch(/Your program's plan is set up outside the app/);
    });

    /* AND THE MONEY, NOT ONLY THE COPY (added 2026-10-14).
     *
     * The case above asserts the SENTENCES on the coach billing page and nothing about the
     * price -- so the page went on printing "21-40 athletes · $160.00/month" on the phone, and
     * drawing a plan editor whose Update prorates a Stripe charge, with this scan green the
     * whole time. Guideline 3.1.3(c) lets a program be billed by card off-platform; 3.1.1 is
     * the condition, and it is about pricing and facilitating the purchase, not about one
     * sentence.
     *
     * The BAND may show on the phone -- what a program is on is a fact about their account. The
     * money and the control that changes it may not. */
    it("the coach billing page prices the plan on the web only", () => {
      const src = readFileSync("client/src/pages/coach/billing.tsx", "utf8");
      // Every formatCents of a BAND price is behind !isNative. The add-on prices are exempt and
      // must stay so: Coaches Corner is sold through StoreKit, and Apple requires its price be
      // shown for the purchase.
      const bandPrice = src.indexOf("plan.band.monthlyPriceCents");
      expect(bandPrice).toBeGreaterThan(0);
      expect(src.slice(Math.max(0, bandPrice - 300), bandPrice)).toContain("isNative");
      // The band-price preview under the plan input stays -- it is genuinely useful on the web,
      // where a coach choosing a number should see what it costs. What matters is WHERE it sits:
      // inside the web-only branch, after the isNative split, so the phone never renders it.
      const preview = src.indexOf("bandForAthleteCount(Number(planDraft)).monthlyPriceCents");
      if (preview > -1) {
        expect(src.slice(0, preview)).toMatch(/\) : isNative \? \(/);
      }
    });

    it("the coach cannot change the plan size from inside the app", () => {
      // Update calls PUT /api/coach/plan, which syncs the band onto the Stripe subscription and
      // prorates a charge -- a payment outside IAP, started by a control in the app.
      const src = readFileSync("client/src/pages/coach/billing.tsx", "utf8");
      expect(src).toMatch(/Your program's plan size is changed outside the app/);
      // The editor sits on the far side of an isNative branch, so the input and its Update
      // button are not rendered on the phone at all.
      const editorAt = src.indexOf('id="planDraft"');
      expect(editorAt).toBeGreaterThan(0);
      expect(src.slice(0, editorAt)).toMatch(/\) : isNative \? \(/);
    });

    it("the login screen links to pricing on the web only", () => {
      const src = readFileSync("client/src/pages/login.tsx", "utf8");
      const idx = src.indexOf('href="/pricing"');
      expect(idx).toBeGreaterThan(0);
      expect(src.slice(Math.max(0, idx - 400), idx)).toMatch(/!Capacitor\.isNativePlatform\(\) &&/);
    });

    it("the coach signup states the band and never the price on the phone", () => {
      const src = readFileSync("client/src/pages/signup.tsx", "utf8");
      expect(src).toMatch(
        /Capacitor\.isNativePlatform\(\)\s*\?\s*expectedBand\.label\s*:/,
      );
    });

    it("the sales pages are web pages: the native shell sends them to login", () => {
      const src = readFileSync("client/src/App.tsx", "utf8");
      for (const page of ["PricingPage", "ForHighSchoolsPage", "ForAthletesPage"]) {
        expect(src).toMatch(new RegExp(`component=\\{WebOnlyPage\\(${page}\\)\\}`));
      }
      expect(src).toMatch(/Capacitor\.isNativePlatform\(\) \? <Redirect to="\/login" \/> : <Page \/>/);
    });

    it("the refusal a native client meets names no web checkout", () => {
      const src = readFileSync("server/routes.ts", "utf8");
      const idx = src.indexOf("function requireWebCheckout");
      expect(idx).toBeGreaterThan(0);
      const body = src.slice(idx, idx + 400);
      expect(body).not.toMatch(/browser|website|pay by card/i);
    });
  });

  it("the Smart App Banner is injected from the App Store id and never hardcoded", () => {
    expect(readFileSync("vite.config.ts", "utf8")).toMatch(/VITE_APP_STORE_ID/);
    expect(readFileSync("client/index.html", "utf8")).not.toMatch(/apple-itunes-app/);
  });
});
