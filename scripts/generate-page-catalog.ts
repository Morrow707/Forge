import fs from "fs";
import path from "path";
import { computePageCatalog } from "../server/page-catalog";

/* Build step for the feature usage report: every page App.tsx routes, and whether anything in the
 * code links to it, written beside the server bundle as dist/page-catalog.json. The server reads
 * that file in production, where it should not depend on the source tree being present. */

const out = path.resolve("dist/page-catalog.json");
const catalog = computePageCatalog(process.cwd());
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(catalog));
const unlinked = catalog.filter((p) => !p.linked).length;
console.log(`page catalog: ${catalog.length} pages, ${unlinked} with no link found in the code -> ${out}`);
