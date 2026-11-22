// Every catalog key the code asks for (t("..."), translate, msg, plural) that es.json does not
// carry yet (client/src/i18n/README.md).
//
//   npx tsx scripts/i18n-missing.ts          list them, with the file and line that asks
//   npx tsx scripts/i18n-missing.ts --json   print them as a JSON object of "English": "" to fill
//
// It never writes the catalog: an English string pasted in as the "Spanish" would turn the test
// green and ship English. Fill each one in by hand.
import { readFileSync } from "node:fs";
import { findTranslationKeys } from "../client/src/i18n/untranslated-scan";
import { SPANISH_CATALOG_PATH, allClientFiles, readRepoFile } from "../client/src/i18n/source-files";

const JSON_INDENT = 2;
const catalog = JSON.parse(readFileSync(SPANISH_CATALOG_PATH, "utf8")) as Record<string, string>;
const missing = allClientFiles().flatMap((f) =>
  findTranslationKeys(f, readRepoFile(f))
    .filter((k) => !(k.key in catalog))
    .map((k) => ({ ...k, file: f })),
);
const unique = [...new Set(missing.map((m) => m.key))];

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(Object.fromEntries(unique.map((k) => [k, ""])), null, JSON_INDENT));
} else {
  missing.forEach((m) => console.log(`${m.file}:${m.line}  ${JSON.stringify(m.key)}`));
  console.log(`${unique.length} key(s) missing from es.json`);
}
