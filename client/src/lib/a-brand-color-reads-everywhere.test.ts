import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeBrandingStyle } from "./branding-style";
import {
  APP_DARK_BACKGROUND_HEX,
  APP_LIGHT_BACKGROUND_HEX,
  contrastRatio,
  hexToHslTriplet,
  readableTextShade,
} from "./color";
import { applyEmailBranding, emailTextOn } from "../../../server/email-branding";
import { emailShell } from "../../../server/email-shell";

// A PROGRAM'S COLORS READ WHEREVER THEY ARE DRAWN (2026-11-19), found by driving a navy-and-gold
// program through the real app in a browser:
//   1. text ON a brand color (buttons, the email band) was always white, so gold was white on gold;
//   2. text IN a dark brand color (links) was navy on a near-black page, 1.5:1;
//   3. pop-ups render outside the shell's own root and stayed Forge orange.

const NAVY = "#003262";
const GOLD = "#FDB515";
const AA = 4.5;
const BLACK_TEXT = "0 0% 4%";
const WHITE_TEXT = "0 0% 100%";

// Removes /* block */ comments, then whole-line // comments: "  // note" goes, "a // b" stays.
// https://regex101.com/?regex=%5E%5Cs*%5C%2F%5C%2F.*%24
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("text in a brand color", () => {
  it("navy is moved to a shade that reads on the dark page, and left alone on the light one", () => {
    const onDark = readableTextShade(NAVY, APP_DARK_BACKGROUND_HEX) ?? "";
    expect(contrastRatio(NAVY, APP_DARK_BACKGROUND_HEX) ?? 0).toBeLessThan(AA);
    expect(contrastRatio(onDark, APP_DARK_BACKGROUND_HEX) ?? 0).toBeGreaterThanOrEqual(AA);
    expect(readableTextShade(NAVY, APP_LIGHT_BACKGROUND_HEX)).toBe(NAVY);
  });

  it("the page variables carry both shades, and index.css reads them for text-primary", () => {
    const vars = computeBrandingStyle({ brandLogoUrl: null, brandPrimaryColor: NAVY, brandSecondaryColor: GOLD }) as Record<string, string>;
    expect(vars["--primary-text-dark"]).toBe(hexToHslTriplet(readableTextShade(NAVY, APP_DARK_BACKGROUND_HEX) ?? ""));
    expect(vars["--primary-text-light"]).toBe(hexToHslTriplet(NAVY));
    const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
    expect(css).toContain("color: hsl(var(--primary-text-dark, var(--primary)));");
    expect(css).toContain("color: hsl(var(--primary-text-light, var(--primary)));");
    expect(css).toContain(":root.light .text-primary,");
  });
});

describe("text on a brand color", () => {
  it("is black on gold and white on navy, in the app", () => {
    const gold = computeBrandingStyle({ brandLogoUrl: null, brandPrimaryColor: GOLD, brandSecondaryColor: null }) as Record<string, string>;
    const navy = computeBrandingStyle({ brandLogoUrl: null, brandPrimaryColor: NAVY, brandSecondaryColor: GOLD }) as Record<string, string>;
    expect(gold["--primary-foreground"]).toBe(BLACK_TEXT);
    expect(navy["--primary-foreground"]).toBe(WHITE_TEXT);
    expect(navy["--secondary-foreground"]).toBe(BLACK_TEXT);
  });

  it("is black on gold and white on navy, in an email's band and buttons", () => {
    expect(emailTextOn(GOLD).solid).toBe("#0a0a0a");
    expect(emailTextOn(NAVY).solid).toBe("#fff");
    const raw = emailShell("Hello", '<a style="display:inline-block;background:#F65B23;color:#fff;padding:12px 24px;">Open</a>');
    const html = applyEmailBranding(raw, { brandLogoUrl: null, brandPrimaryColor: GOLD, brandTeamName: "Cal Strength" } as never);
    expect(html).toContain(`background:${GOLD};color:#0a0a0a`);
    expect(html).not.toContain(`background:${GOLD};color:#fff`);
    expect(html).toContain('<span style="color:#0a0a0a;');
  });
});

describe("pop-ups wear the program's colors", () => {
  it("the shell copies its brand variables onto <html>, where portalled dialogs inherit them, and takes them off", () => {
    const hook = stripComments(readFileSync(new URL("../hooks/use-brand-vars-on-root.ts", import.meta.url), "utf8"));
    expect(hook).toContain("const root = document.documentElement;");
    expect(hook).toContain("root.style.setProperty(name, String(vars[name]))");
    expect(hook).toContain("root.style.removeProperty(name)");
    // Every page that draws its own frame instead of the shell wears the brand the same way.
    ["../components/app-shell.tsx", "../pages/guardian-dashboard.tsx"].forEach((page) => {
      const src = stripComments(readFileSync(new URL(page, import.meta.url), "utf8"));
      expect(src, page).toMatch(/useBrandVarsOnRoot\(brandingStyle\)/);
    });
  });
});
