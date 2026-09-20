/** Writes robots.txt and sitemap.xml into client/public/ from the one route list.
 *
 * Generated at build time rather than committed, because a hand-maintained sitemap is one that
 * silently goes stale: the page gets added, the XML does not, and nothing breaks loudly enough
 * for anyone to notice. The text itself comes from shared/seo-files.ts so a test can read it.
 *
 * RUN THROUGH tsx SO IT IMPORTS THE REAL LIST. The first version of this parsed
 * shared/public-routes.ts with a regex over the source text, to avoid adding a build step for
 * one small array. That broke the moment the movement-library pages were appended to the array
 * programmatically instead of being typed out as literals -- the regex saw the literals and
 * missed four real pages, which is precisely the silent drift the generated sitemap exists to
 * prevent. Importing the module costs a `tsx` invocation and cannot be wrong about what is in it.
 *
 * lastmod is the date of the commit being built, not the clock: two builds of the same commit
 * say the same thing, and a sitemap that changes its dates on every deploy is telling Google
 * every page changed when nothing did. Outside a git checkout it falls back to today.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { PUBLIC_ROUTES, NOINDEX_PREFIXES } from "../shared/public-routes";
import { sitemapXml, robotsTxt, DEFAULT_ORIGIN } from "../shared/seo-files";

const outDir = path.resolve(import.meta.dirname, "..", "client", "public");
const origin = (process.env.VITE_PUBLIC_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/, "");

function commitDate(): string {
  try {
    const iso = execSync("git log -1 --format=%cI", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10);
  } catch {
    /* not a checkout */
  }
  return new Date().toISOString().slice(0, 10);
}

fs.writeFileSync(path.join(outDir, "sitemap.xml"), sitemapXml(origin, commitDate()));
fs.writeFileSync(path.join(outDir, "robots.txt"), robotsTxt(origin));

console.log(
  `SEO files written: ${PUBLIC_ROUTES.filter((r) => r.index).length} indexable routes, ${NOINDEX_PREFIXES.length} disallowed prefixes.`,
);
