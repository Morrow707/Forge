// The Forge library names the library catalog (client/src/i18n/exercise-es.json) has to cover:
// every VISIBLE exercise (seed.ts's three lists minus the hidden ones of the 2026-11-22 review,
// plus the review's additions and the throwing-workload entries) and every visible skill drill.
//
//   npx tsx scripts/i18n-library-names.ts            print the names, one per line
//   npx tsx scripts/i18n-library-names.ts --missing  only those exercise-es.json does not carry
//
// The test every-library-name-is-translated.test.ts runs the same list.
import { libraryNamesToTranslate } from "../client/src/i18n/library-names";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../client/src/i18n/source-files";

const catalog = JSON.parse(readFileSync(join(REPO_ROOT, "client/src/i18n/exercise-es.json"), "utf8")) as Record<string, string>;
const names = libraryNamesToTranslate();
const shown = process.argv.includes("--missing") ? names.filter((n) => !(n in catalog)) : names;
shown.forEach((n) => console.log(n));
console.error(`${shown.length} of ${names.length}`);
