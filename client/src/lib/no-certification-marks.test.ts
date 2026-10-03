import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** No certification mark Forge does not hold appears on a surface a coach or the public
 * sees. "CSCS-aligned" read as NSCA affiliation (docs/legal-open-questions.md, question 13).
 * The admin knowledge-base screen is exempt: its placeholder names a book an admin may
 * upload, which is a fact about a file, not a claim about Forge. */
const ROOTS = ["client/src/pages", "client/src/components"];
const EXEMPT = new Set(["client/src/pages/admin/knowledge-base.tsx"]);
const MARKS = [/\bCSCS\b/, /\bNSCA\b/];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

describe("certification marks", () => {
  it("appear on no coach-facing or public surface", () => {
    const hits: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (EXEMPT.has(file)) continue;
        const text = readFileSync(file, "utf8");
        for (const re of MARKS) if (re.test(text)) hits.push(`${file}: ${re.source}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
