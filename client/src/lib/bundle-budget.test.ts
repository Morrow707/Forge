import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

/** THE FIRST PAINT HAS A BUDGET, AND THE BUDGET IS THE ARTIFACT, NOT THE SOURCE.
 *
 * The entry chunk is everything a phone downloads and parses before the login form can draw --
 * and, because the web bundle is compiled into the native binary, before the app can do anything
 * at all after its icon is tapped. It was 766 kB (219 kB gzipped) on 2026-09-20, three-fifths of
 * it shared/schema.ts plus zod and drizzle, pulled in by ONE literal the signup form imported.
 * Nothing in the source said so; the build did. So the budget is asserted against dist/.
 *
 * Budget: about 10% above what the entry measured after that was fixed (463 kB / 142 kB gzipped).
 * Going over is not automatically wrong -- a genuinely new eager dependency is a reason to raise
 * it, in this file, with a sentence -- but it cannot happen silently.
 *
 * Runs only when dist/public exists (CI builds after `npm test`; a developer who has not built
 * sees it skipped, not failed). scripts/check-first-paint.mjs is the build-time twin that always
 * runs; this one carries the byte budget. */
const DIST = join(__dirname, "..", "..", "..", "dist", "public");
const built = existsSync(join(DIST, "index.html"));

const EAGER_BUDGET_BYTES = 510 * 1024;
const EAGER_BUDGET_GZIP_BYTES = 156 * 1024;

/** Chunks that must never be on the first paint, and what each one is. */
const MUST_BE_LAZY: Array<[string, string]> = [
  ["vendor-charts", "recharts -- only the history and analytics pages draw a chart"],
  ["vendor-schema", "shared/schema.ts + drizzle -- the server's table definitions, not client code"],
  ["vendor-zod", "zod -- two shared validators, imported by two pages, neither on the first paint"],
  ["pose-tracking", "MediaPipe's loader -- the camera pipeline loads when a camera opens"],
  ["bar-tracker-dialog", "the camera pipeline"],
  ["food-scanner-dialog", "@zxing barcode decoding, 1.3 MB, opened from the food log"],
];

function firstPaintAssets(): string[] {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  return [...html.matchAll(/(?:src|href)="\/assets\/([A-Za-z0-9._-]+)"/g)].map((m) => m[1]);
}

describe.skipIf(!built)("first-paint bundle budget (reads dist/public)", () => {
  it("the eager JavaScript stays inside the budget", () => {
    const js = firstPaintAssets().filter((f) => f.endsWith(".js"));
    // The check is only meaningful if it found the entry and React. Matching nothing would
    // pass forever while checking nothing.
    expect(js.length, "index.html should reference at least the entry and vendor-react").toBeGreaterThanOrEqual(2);
    let bytes = 0;
    let gz = 0;
    for (const f of js) {
      const buf = readFileSync(join(DIST, "assets", f));
      bytes += buf.length;
      gz += gzipSync(buf, { level: 6 }).length;
    }
    const kb = (n: number) => `${(n / 1024).toFixed(0)} kB`;
    expect(
      bytes,
      `eager JS is ${kb(bytes)} (${js.join(", ")}); budget ${kb(EAGER_BUDGET_BYTES)}. Something new is on the first paint.`,
    ).toBeLessThanOrEqual(EAGER_BUDGET_BYTES);
    expect(gz, `eager JS gzips to ${kb(gz)}; budget ${kb(EAGER_BUDGET_GZIP_BYTES)}`).toBeLessThanOrEqual(
      EAGER_BUDGET_GZIP_BYTES,
    );
  });

  it("no lazy-only chunk is preloaded", () => {
    const assets = firstPaintAssets();
    for (const [chunk, why] of MUST_BE_LAZY) {
      const hit = assets.find((f) => f.startsWith(`${chunk}-`));
      expect(hit, `${chunk} is on the first paint: ${why}`).toBeUndefined();
    }
  });

  it("the entry does not statically import a chunk that must be lazy", () => {
    // Preload links are what Vite EMITS for static imports; this reads the static imports
    // themselves, so a chunk reached through a second hop is caught too.
    const assets = readdirSync(join(DIST, "assets"));
    const entry = assets.find((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f) && statSync(join(DIST, "assets", f)).size > 50_000);
    expect(entry, "entry chunk").toBeTruthy();
    const seen = new Set<string>();
    const visit = (f: string) => {
      if (seen.has(f)) return;
      seen.add(f);
      const src = readFileSync(join(DIST, "assets", f), "utf8");
      for (const m of src.matchAll(/import[^;]*?from"\.\/([^"]+)"|import"\.\/([^"]+)"/g)) visit(m[1] ?? m[2]);
    };
    visit(entry!);
    for (const [chunk, why] of MUST_BE_LAZY) {
      const hit = [...seen].find((f) => f.startsWith(`${chunk}-`));
      expect(hit, `the entry reaches ${chunk} through static imports: ${why}`).toBeUndefined();
    }
  });
});
