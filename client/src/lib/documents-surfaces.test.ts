import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** WHERE A DOCUMENT CAN BE REACHED, CHECKED AGAINST WHAT THE SERVER SERVES.
 *
 * Three findings from the 2026-09-20 documents audit, each a surface that had quietly stopped
 * matching the routes behind it:
 *
 * - The AI Terms of Use were seeded, routed, public and admin-editable, and had no card on the
 *   admin Legal & Compliance page, so an admin could neither download nor email them. The Terms
 *   of Use card had no buttons at all, although the server resolved terms_of_service for both.
 * - The public legal pages showed a document with no way to keep a copy; only an admin could
 *   download one.
 * - Two pages told people the uploaded file was deleted after review. It has been kept since
 *   Scott's call on 2026-09-17 (see externalWaivers in shared/schema.ts).
 *
 * Each is a scan of the real source rather than a list, for the reason CLAUDE.md gives for every
 * other scan here: the next one will not be on anybody's list.
 */
const ROOT = join(import.meta.dirname, "../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const routes = read("server/routes.ts");
const adminPage = read("client/src/pages/admin/documents.tsx");
const publicPage = read("client/src/pages/legal-document.tsx");

/** The string literals inside a `const NAME = [ ... ] as const;` array in routes.ts. */
function stringArray(source: string, name: string): string[] {
  const start = source.indexOf(`const ${name} = [`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("] as const;", start);
  const body = source
    .slice(start, end)
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  return Array.from(body.matchAll(/"([a-z_]+)"/g), (m) => m[1]);
}

describe("the admin Legal & Compliance page", () => {
  it("offers download and email for every document type the server can resolve", () => {
    const types = stringArray(routes, "LEGAL_DOC_TYPES");
    expect(types.length).toBeGreaterThanOrEqual(7);
    for (const type of types) {
      // Either an editor (download + email + save) or the send-only row for the Terms, which
      // are edited in the signup agreement editor.
      expect(adminPage, type).toMatch(
        new RegExp(`<(LegalDocEditor|LegalDocSendRow) docType="${type}" />`),
      );
    }
  });

  it("does not claim a document is unreviewed", () => {
    // Per-card verdicts went stale the moment counsel answered. What is still open with counsel
    // lives in docs/legal-open-questions.md, where a reviewer reads it.
    expect(adminPage).not.toMatch(/not (yet )?reviewed by counsel/i);
    expect(adminPage).not.toMatch(/awaiting counsel/i);
  });
});

describe("the public legal pages", () => {
  it("offer the same PDF the admin page does, from a public route", () => {
    expect(publicPage).toContain("/api/legal-documents/${docType}.pdf");
    expect(publicPage).toContain("<DownloadButton");
  });

  it("have that route registered ahead of the text route it would otherwise match", () => {
    // Express matches in registration order, and "privacy_policy.pdf" is a perfectly good :type.
    const pdf = routes.indexOf('app.get("/api/legal-documents/:type.pdf"');
    const text = routes.indexOf('app.get("/api/legal-documents/:type"');
    expect(pdf).toBeGreaterThanOrEqual(0);
    expect(text).toBeGreaterThanOrEqual(0);
    expect(pdf).toBeLessThan(text);
  });

  it("serve every public type from the same set the page can request", () => {
    const publicTypes = stringArray(routes, "PUBLIC_LEGAL_DOC_TYPES");
    for (const type of publicTypes) {
      expect(publicPage, type).toContain(`docType="${type}"`);
    }
  });
});

describe("what people are told about an uploaded file", () => {
  it.each([
    "client/src/pages/documents.tsx",
    "client/src/pages/admin/waivers.tsx",
  ])("%s does not say the file is deleted after review", (rel) => {
    const source = read(rel);
    // The one legitimate mention is the "file deleted" label for rows decided under the OLD
    // behaviour, whose files genuinely are gone. It reads "file deleted" and nothing else.
    const withoutLabel = source.replace(/"file deleted"|>file deleted</g, "");
    expect(withoutLabel).not.toMatch(/file is deleted|deletes the file|destroyed on the spot|file was destroyed/i);
  });
});
