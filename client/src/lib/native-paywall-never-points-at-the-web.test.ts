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
  });

  it("Restore Purchases is on the paywall, which 3.1.1 requires", () => {
    expect(readFileSync("client/src/pages/athlete/upgrade.tsx", "utf8")).toMatch(/Restore Purchases/);
  });

  it("the Smart App Banner is injected from the App Store id and never hardcoded", () => {
    expect(readFileSync("vite.config.ts", "utf8")).toMatch(/VITE_APP_STORE_ID/);
    expect(readFileSync("client/index.html", "utf8")).not.toMatch(/apple-itunes-app/);
  });
});
