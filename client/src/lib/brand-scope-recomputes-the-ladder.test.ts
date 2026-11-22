import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeBrandingStyle } from "./branding-style";

// THE BRANDING PREVIEWS RECOMPUTE THE COLOR LADDER (2026-11-20). Scott, on section 2: "the only
// thing that i can do here is click on the green and gold, nothing else i can change". The tint
// and strength buttons changed nothing: a custom property built from other ones is worked out
// where it is declared (:root), so a preview box setting its own --neutral-hue changed no color,
// and the light theme's surfaces were plain white whatever the tint. index.css now re-declares
// the ladder on .brand-scope, and these hold that copy equal to the real one.

const css = readFileSync(join(__dirname, "..", "index.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("\n}", start));
}

// A token built from the tint: "--card: var(--neutral-hue) calc(17% * var(--neutral-sat)) 16%;".
const LADDER = /^\s+(--[\w-]+):\s*([^;]*var\(--(?:neutral-hue|neutral-sat|light-tint)\)[^;]*);/gm;
const ladder = (src: string) => Object.fromEntries([...src.matchAll(LADDER)].map((m) => [m[1], m[2].trim()]));

describe("the brand preview's colors", () => {
  it("re-declares every tinted dark-theme token exactly as :root does", () => {
    const real = ladder(block(":root"));
    expect(Object.keys(real).length).toBeGreaterThan(5);
    expect(ladder(block(".brand-scope"))).toEqual(real);
  });

  it("re-declares every tinted light-theme token exactly as :root.light does", () => {
    const real = ladder(block(":root.light"));
    expect(real["--background"]).toContain("--light-tint");
    expect(ladder(block(":root.light .brand-scope"))).toEqual(real);
  });

  it("the light theme stays pure white until a program picks a tint", () => {
    expect(css).toMatch(/--light-tint: 0;/);
    expect(ladder(block(":root.light"))["--background"]).toBe("var(--neutral-hue) calc(var(--light-tint) * 30%) calc(100% - var(--light-tint) * 2.5%)");
  });

  it("a chosen tint reaches the light theme at its strength, Subtle included", () => {
    const style = (strength: number) =>
      computeBrandingStyle({ brandLogoUrl: null, brandPrimaryColor: null, brandSecondaryColor: null, brandBackgroundHue: 220, brandBackgroundStrength: strength }) as Record<string, string>;
    expect(style(1)["--light-tint"]).toBe("1");
    expect(style(1)["--neutral-sat"]).toBe("1");
    expect(style(3)["--light-tint"]).toBe("3");
  });

  it("Charcoal is no color at all (strength 0), never the red that hue 0 used to give", () => {
    const style = computeBrandingStyle({ brandLogoUrl: null, brandPrimaryColor: null, brandSecondaryColor: null, brandBackgroundHue: 220, brandBackgroundStrength: 0 }) as Record<string, string>;
    expect(style["--neutral-sat"]).toBe("0");
    expect(style["--light-tint"]).toBe("0");
    const page = readFileSync(join(__dirname, "..", "pages", "coach", "branding.tsx"), "utf8");
    expect(page).toMatch(/label: msg\("Charcoal"\), hue: \d+, strength: 0 \}/);
    expect(page).not.toMatch(/label: (msg\()?"Charcoal"\)?, hue: 0\b/);
  });

  it("the branding page's previews carry the scope", () => {
    const page = readFileSync(join(__dirname, "..", "pages", "coach", "branding.tsx"), "utf8");
    expect(page).toMatch(/className="brand-scope [^"]*"\s+style=\{draftStyle\}/);
  });
});
