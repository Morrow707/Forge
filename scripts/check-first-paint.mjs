/** Fails the build if a chunk that should be lazy is fetched on first paint.
 *
 * This is a build-time assertion rather than a unit test because the thing being checked only
 * exists after Rollup has run: which chunks the entry statically imports, and therefore which
 * ones Vite emits a <link rel="modulepreload"> for in index.html.
 *
 * IT HAS ALREADY BEEN WRONG ONCE, SILENTLY, FOR A LONG TIME. vite.config.ts carried a comment
 * saying recharts is "only fetched by the handful of pages that render a chart, never on initial
 * load". The build did not agree: React had been hoisted into the recharts chunk, so the entry
 * had to import it to get React at all, and every first load -- the landing page, the login form,
 * neither of which draws a chart -- pulled 560kB of charting library. Nothing about that is
 * visible from the source; the comment described the intent and the build did something else.
 * So the intent is asserted against the artifact.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "..", "dist", "public");
const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");

/** Chunks that must NOT appear in the first paint, and why each one is expensive. */
const MUST_BE_LAZY = [
  ["vendor-charts", "recharts -- only the history and analytics pages draw a chart"],
];

const firstPaint = [...html.matchAll(/(?:src|href)="\/assets\/([A-Za-z0-9._-]+)"/g)].map((m) => m[1]);

const violations = [];
for (const [chunk, why] of MUST_BE_LAZY) {
  const hit = firstPaint.find((f) => f.startsWith(`${chunk}-`) || f === `${chunk}.js`);
  if (hit) violations.push(`  ${hit} is fetched on first paint. ${why}.`);
}

if (violations.length > 0) {
  console.error(
    "\nFIRST-PAINT BUDGET FAILED -- a chunk that is supposed to be lazy is being preloaded:\n" +
      violations.join("\n") +
      "\n\nUsually this means a small shared dependency ended up inside that chunk, so the entry " +
      "has to import the whole thing to reach it. Check manualChunks in vite.config.ts and give " +
      "the shared module somewhere of its own to go.\n",
  );
  process.exit(1);
}

// The other failure mode of a check like this is matching nothing: a renamed asset directory or
// a changed attribute, after which it passes forever while checking nothing.
if (firstPaint.length < 2) {
  console.error(`\nFIRST-PAINT CHECK IS BROKEN -- found only ${firstPaint.length} asset(s) in index.html.\n`);
  process.exit(1);
}

console.log(`First-paint budget OK (${firstPaint.length} assets, none of them lazy-only chunks).`);
