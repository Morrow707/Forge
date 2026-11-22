// The files the translation ratchet reads. Shared by the test and the two scripts so they cannot
// disagree about what "every page" is. Node only; never imported by the app.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const SCANNED_DIRS = ["client/src/pages", "client/src/components"];
export const BASELINE_PATH = join(REPO_ROOT, "client/src/i18n/untranslated-baseline.json");
export const SPANISH_CATALOG_PATH = join(REPO_ROOT, "client/src/i18n/es.json");

// A source file the app ships. Matches "login.tsx", "nav.ts"; rejects "login.test.ts", "a.d.ts".
// https://regex101.com/?regex=%5E(%3F!.*%5C.(test%7Citest%7Cd)%5C.tsx%3F%24).*%5C.tsx%3F%24&testString=login.tsx
const SHIPPED_SOURCE = /^(?!.*\.(test|itest|d)\.tsx?$).*\.tsx?$/;

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listFiles(full);
    return SHIPPED_SOURCE.test(name) ? [full] : [];
  });
}

/** Every shipped page and component file, as repo-relative paths with forward slashes. */
export function scannedFiles(): string[] {
  return SCANNED_DIRS.flatMap((d) => listFiles(join(REPO_ROOT, d)))
    .map((f) => relative(REPO_ROOT, f).split("\\").join("/"))
    .sort();
}

/** Every shipped client source file (pages, components, lib, hooks, i18n ...). */
export function allClientFiles(): string[] {
  return listFiles(join(REPO_ROOT, "client/src"))
    .map((f) => relative(REPO_ROOT, f).split("\\").join("/"))
    .filter((f) => !f.startsWith("client/src/i18n/untranslated-scan") && !f.startsWith("client/src/i18n/source-files"))
    .sort();
}

export function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}
