import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { BIOMETRIC_DOCUMENT_NAME, BIOMETRIC_DOCUMENT_NAME_INLINE } from "@shared/contact";

/** The video and biometric document was retitled from a "release" to a consent, because it
 * releases nothing -- it takes permission to collect. The title changed in one file. The places
 * that NAME the document to a user did not, so a guardian could tick "the video and biometric
 * release", follow the link, and land on a document called something else. A person's only handle
 * on which paper they agreed to is its name; two names for it is a real problem.
 *
 * A grep found fourteen of them. The fifteenth is why this is a scan and not a list. */
const ROOT = join(import.meta.dirname, "../../..");
const SEARCHED = ["client/src", "server", "shared"];

/** Files that legitimately still contain an old name, each for a stated reason. This list may
 * only shrink -- anything added needs a reason of the same kind, which in practice means "this
 * text has to match something already stored byte-for-byte". */
const EXEMPT: ReadonlyArray<readonly [string, string]> = [
  ["server/seed-data/legal-documents-draft.ts", "BIOMETRIC_WAIVER_DRAFT is the superseded draft, kept as the historical text the migration prefix is checked against. It is what production may still be carrying, so it is not ours to reword."],
  ["server/seed-data/shipped-versions.ts", "Comments naming which historical version each hash is."],
  ["server/seed-data/signup-agreement.ts", "LIVE_DOCUMENT_PATCHES matches the exact text stored in installations that took the old name -- the old spelling IS the pattern."],
  ["server/seed-data/biometric-release.ts", "Holds the prior text for the same reason."],
  ["server/seed-data/documents-are-not-drafts.test.ts", "Asserts the superseded draft still carries its old title verbatim -- that exact string is what nextBiometricRelease matches on."],
  ["shared/contact.ts", "The constant's own doc comment says which names it replaced; naming them is the point of it."],
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

const FILES = SEARCHED.flatMap((d) => walk(join(ROOT, d))).map((f) => relative(ROOT, f));

/** The names the document used to go by. A line matching one of these is naming the document
 * something a reader of the document itself will not find on it. */
const OLD_NAMES = [
  /Biometric Information Consent and Release/i,
  /Video and Biometric Consent and Release/i,
  /video and biometric release/i,
  /Biometric Data Waiver/i,
  // "Biometric Waiver" as a LABEL. The docType `biometric_waiver` is a database enum value and
  // stays -- renaming a stored key to fix a display string turns a naming problem into a data
  // problem -- so this matches the spaced, capitalised form only.
  /\bBiometric Waiver\b/,
];

describe("the video and biometric document has one name", () => {
  it("is spelled once, and the two spellings agree", () => {
    expect(BIOMETRIC_DOCUMENT_NAME.toLowerCase()).toBe(BIOMETRIC_DOCUMENT_NAME_INLINE);
  });

  it("is not called anything else anywhere that a person reads", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      if (EXEMPT.some(([exempt]) => exempt === file)) continue;
      const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
      lines.forEach((line, i) => {
        // A test asserting ON an old name is doing the same job this file does.
        if (/legal-document-naming/.test(file)) return;
        for (const pattern of OLD_NAMES) {
          if (pattern.test(line)) offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 100)}`);
        }
      });
    }
    expect(offenders, `\n${offenders.join("\n")}\n`).toEqual([]);
  });

  it("keeps every exemption pointed at a file that exists", () => {
    // An exemption for a deleted file is a licence nobody is using and the next reader cannot
    // evaluate. The list may only shrink; a stale entry is how it stops shrinking.
    for (const [file] of EXEMPT) expect(FILES, file).toContain(file);
  });
});
