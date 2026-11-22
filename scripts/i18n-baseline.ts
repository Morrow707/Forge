// The translation ratchet's baseline (client/src/i18n/README.md).
//
//   npx tsx scripts/i18n-baseline.ts            rewrite untranslated-baseline.json from the source
//   npx tsx scripts/i18n-baseline.ts --top 20   print the files with the most untranslated text
//   npx tsx scripts/i18n-baseline.ts --file client/src/pages/login.tsx
//                                               list every untranslated string in one file, by line
//
// Re-run the first form after converting a file and commit the JSON: its count only ever goes
// down, and every-page-is-translated.test.ts fails if a file's count rises.
import { writeFileSync } from "node:fs";
import { findUntranslated } from "../client/src/i18n/untranslated-scan";
import { BASELINE_PATH, readRepoFile, scannedFiles } from "../client/src/i18n/source-files";

const ARGS_START = 2;
const DEFAULT_TOP = 20;
const COUNT_WIDTH = 5;
const JSON_INDENT = 2;
const args = process.argv.slice(ARGS_START);
const fileArg = args.indexOf("--file");
const topArg = args.indexOf("--top");

if (fileArg >= 0) {
  const path = args[fileArg + 1];
  const findings = findUntranslated(path, readRepoFile(path));
  findings.forEach((f) => console.log(`${path}:${f.line}  [${f.kind}]  ${f.text}`));
  console.log(`${findings.length} untranslated in ${path}`);
} else {
  const counts = Object.fromEntries(
    scannedFiles()
      .map((f) => [f, findUntranslated(f, readRepoFile(f)).length] as const)
      .filter(([, n]) => n > 0),
  );
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (topArg >= 0) {
    const n = Number(args[topArg + 1] ?? DEFAULT_TOP);
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .forEach(([f, c]) => console.log(`${String(c).padStart(COUNT_WIDTH)}  ${f}`));
    console.log(`total ${total} untranslated across ${Object.keys(counts).length} files`);
  } else {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(counts, null, JSON_INDENT)}\n`);
    console.log(`wrote ${BASELINE_PATH}: ${total} untranslated across ${Object.keys(counts).length} files`);
  }
}
