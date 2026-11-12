import fs from "fs";
import path from "path";
import { pageCatalogFromSource, type CatalogPage } from "@shared/feature-usage";

/* The list of pages the app routes, and whether anything in the code links to each, for the
 * feature usage report. No database here on purpose: scripts/generate-page-catalog.ts runs it at
 * build time into dist/page-catalog.json, and the server falls back to it where that file is
 * absent (development and the tests). */

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name.startsWith("__") ? [] : sourceFiles(full);
    // A source file and not a test: "app-shell.tsx" yes, "a.test.ts" / "b.itest.ts" / "c.json" no.
    // https://regex101.com/?regex=%5C.(ts%7Ctsx)%24&testString=app-shell.tsx
    const isSource = /\.(ts|tsx)$/.test(entry.name) && !/\.(test|itest)\.tsx?$/.test(entry.name);
    return isSource ? [full] : [];
  });
}

/** The pages the app routes and whether anything links to each. Built at build time into
 * dist/page-catalog.json (scripts/generate-page-catalog.ts); read from source where that file is
 * absent (development and the tests), through the same function. */
export function computePageCatalog(root: string): CatalogPage[] {
  const appFile = path.join(root, "client/src/App.tsx");
  const others = ["client/src", "shared", "server"].flatMap((d) => sourceFiles(path.join(root, d))).filter((f) => f !== appFile);
  return pageCatalogFromSource(fs.readFileSync(appFile, "utf8"), others.map((f) => fs.readFileSync(f, "utf8")));
}

