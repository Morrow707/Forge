import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dynamicTypeScale } from "./dynamic-type";

/** THE APP STORE ACCESSIBILITY PAGE CLAIMS THREE THINGS, and each is pinned here so the claim
 * cannot outlive the code: Dark Interface, Reduced Motion, Larger Text. Nothing else is ticked
 * on that page, and nothing else should be until it is true and pinned. */
const root = join(__dirname, "..", "..", "..");
const css = readFileSync(join(root, "client/src/index.css"), "utf8");
const main = readFileSync(join(root, "client/src/main.tsx"), "utf8");

describe("Dark Interface", () => {
  it("the root declares a dark colour scheme", () => {
    expect(css).toMatch(/html\s*\{[^}]*color-scheme:\s*dark/);
  });
});

describe("Reduced Motion", () => {
  it("one global rule stops every animation and transition under prefers-reduced-motion", () => {
    const block = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toContain("*::after");
    expect(block).toContain("animation-duration: 0.01ms !important");
    expect(block).toContain("transition-duration: 0.01ms !important");
  });
});

describe("Larger Text", () => {
  it("the root font follows iOS Dynamic Type from the entry point", () => {
    expect(main).toContain("startDynamicType();");
  });
  it("the default size is untouched and larger settings scale up, bounded", () => {
    expect(dynamicTypeScale(17)).toBe(1);
    expect(dynamicTypeScale(null)).toBe(1);
    expect(dynamicTypeScale(15)).toBe(1);
    expect(dynamicTypeScale(34)).toBe(2);
    expect(dynamicTypeScale(100)).toBe(3);
  });
});
