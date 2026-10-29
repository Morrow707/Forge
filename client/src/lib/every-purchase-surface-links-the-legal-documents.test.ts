import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * EVERY SURFACE THAT STARTS A PURCHASE CARRIES A FUNCTIONAL LINK TO THE PRIVACY POLICY AND THE
 * TERMS OF USE (EULA), AND SAYS THE SUBSCRIPTION RENEWS.
 *
 * App Review rejected 1.0 (build 691) a second time on 2026-10-29 under Guideline 3.1.2: the
 * reviewer could not find a privacy-policy link anywhere in the app, and the purchase flow
 * stated no subscription length and linked no terms. Five surfaces sold something and none had
 * the links; a sixth (the per-lesson unlock) had the machinery and no price. This scan states
 * the rule rather than naming the five, so the next surface fails here the day it is written.
 *
 * Discovery is by what a file DOES -- it calls one of the store purchase functions or POSTs to a
 * checkout route -- never by a list of pages. The IAP modules in lib/ define those functions and
 * are excluded by directory, not by name.
 */
const CLIENT = path.resolve(__dirname, "..");
const COMPONENT = "client/src/components/subscription-legal-links.tsx";

const STARTS_A_PURCHASE =
  /\b(purchaseFreeAgentTier|purchaseFreeAgentAddOn|purchaseCoachAddOn|purchaseFreeAgentTierOnGooglePlay|purchaseFreeAgentAddOnOnGooglePlay)\(|["'`]\/api\/billing\/checkout\//;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

function purchaseSurfaces(): string[] {
  return walk(CLIENT)
    .filter((f) => !f.includes(`${path.sep}lib${path.sep}`))
    .filter((f) => STARTS_A_PURCHASE.test(stripComments(fs.readFileSync(f, "utf8"))))
    .map((f) => path.relative(path.resolve(CLIENT, "../.."), f))
    .sort();
}

describe("every purchase surface links the legal documents", () => {
  it("discovers the surfaces from what they do, and there are at least the five Apple reviewed", () => {
    const surfaces = purchaseSurfaces();
    expect(surfaces).toEqual(
      expect.arrayContaining([
        "client/src/pages/athlete/upgrade.tsx",
        "client/src/components/all-classes-card.tsx",
        "client/src/pages/coach/billing.tsx",
        "client/src/pages/coach/coaches-corner.tsx",
        "client/src/pages/athlete/sport-coaches.tsx",
      ]),
    );
  });

  it("every one of them renders SubscriptionLegalLinks (comments stripped first)", () => {
    for (const rel of purchaseSurfaces()) {
      const src = stripComments(fs.readFileSync(path.resolve(CLIENT, "../..", rel), "utf8"));
      expect(src, `${rel} starts a purchase and carries no <SubscriptionLegalLinks`).toMatch(
        /<SubscriptionLegalLinks\b/,
      );
    }
  });

  it("the component links the two documents by the app's own routes, which App.tsx serves", () => {
    const src = stripComments(fs.readFileSync(path.resolve(CLIENT, "../..", COMPONENT), "utf8"));
    expect(src).toMatch(/href="\/privacy"/);
    expect(src).toMatch(/href="\/eula"/);
    // Never an absolute URL: that would hand an iOS buyer to a browser, which the native paywall
    // scan refuses for a checkout and Apple reads the same way for a terms link.
    expect(src).not.toMatch(/https?:\/\//);
    const app = stripComments(fs.readFileSync(path.resolve(CLIENT, "App.tsx"), "utf8"));
    expect(app).toMatch(/path="\/privacy"/);
    expect(app).toMatch(/path="\/eula"/);
  });

  it("says the subscription is monthly and renews, in both sizes", () => {
    const src = stripComments(fs.readFileSync(path.resolve(CLIENT, "../..", COMPONENT), "utf8"));
    expect(src).toMatch(/monthly subscription that renews automatically/);
    expect(src).toMatch(/Monthly, renews until cancelled/);
  });

  it("the privacy policy is reachable from Account Settings and from every AppShell menu", () => {
    const dialog = stripComments(
      fs.readFileSync(path.resolve(CLIENT, "components/account-settings-dialog.tsx"), "utf8"),
    );
    expect(dialog).toMatch(/href="\/privacy"/);
    expect(dialog).toMatch(/href="\/eula"/);
    const shell = stripComments(fs.readFileSync(path.resolve(CLIENT, "components/app-shell.tsx"), "utf8"));
    // One entry per nav array: coach, athlete, admin. Three arrays, three entries.
    const entries = shell.match(/href: "\/legal"/g) ?? [];
    expect(entries).toHaveLength(3);
  });
});
