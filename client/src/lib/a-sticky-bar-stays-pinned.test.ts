import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* 2026-11-17, on the phone: the program builder's nav bar scrolled away with the page, leaving
 * the content under the clock and no way to navigate. The shell's root div had overflow-x:hidden,
 * which makes it a scroll container, so its sticky bar stuck to a box that never scrolls.
 * overflow-x:clip stops the same sideways spill and keeps sticky working. Measured in Chromium:
 * after scrolling 1000px the bar sat at -1000 under hidden and at 0 under clip. */
const strip = (s: string) =>
  s.split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "").replace(/^\s*\*.*$/, "").replace(/\{\/\*.*?\*\/\}/g, "")).join("\n");
const read = (p: string) => strip(readFileSync(join(__dirname, "..", p), "utf8"));

describe("a page with a sticky bar never hides its overflow", () => {
  for (const file of ["components/app-shell.tsx", "components/marketing-shell.tsx", "pages/landing.tsx"]) {
    it(`${file} clips instead of hiding`, () => {
      const src = read(file);
      expect(src).not.toMatch(/overflow-x-hidden/);
      expect(src).toMatch(/overflow-x-clip/);
    });
  }

  it("the full-screen pickers keep their title and close button below the status bar", () => {
    for (const file of ["components/exercise-picker-dialog.tsx", "components/skill-picker-dialog.tsx"]) {
      const src = read(file);
      expect(src, file).toMatch(/pt-\[env\(safe-area-inset-top\)\]/);
      expect(src, file).toMatch(/\[&>button:last-child\]:top-\[calc\(env\(safe-area-inset-top\)\+0\.5rem\)\]/);
    }
  });
});
