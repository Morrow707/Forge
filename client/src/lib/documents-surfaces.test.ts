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
    // The research card's own phrasings, from when it was a review packet: "neither has been
    // read by a lawyer", "both are drafts below", a DRAFT badge, and a warning not to send.
    expect(adminPage).not.toMatch(/read by a lawyer/i);
    expect(adminPage).not.toMatch(/are drafts/i);
    expect(adminPage).not.toMatch(/no extract should be sent/i);
    expect(adminPage).not.toMatch(/questions for counsel/i);
    expect(adminPage).not.toContain("<DraftBadge");
  });

  it("cites the export cell floor from the server rather than retyping it", () => {
    // RESEARCH_EXPORT_MIN_CELL lives in server/research-export.ts, which the client cannot
    // import. The public research_consent route reports it as exportMinCell; the card reads that.
    const card = adminPage.slice(
      adminPage.indexOf("function ResearchDataReviewCard"),
      adminPage.indexOf("export default function AdminDocuments"),
    );
    expect(card).toContain("exportMinCell");
    expect(card).not.toMatch(/\b10 athletes\b/);
    expect(card).not.toMatch(/floor of 10\b/);
    expect(routes).toMatch(/exportMinCell:\s*RESEARCH_EXPORT_MIN_CELL/);
    // And links to the page and the PDF it is describing.
    expect(card).toContain('href="/research-consent"');
    expect(card).toContain("/api/legal-documents/research_consent.pdf");
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

  it("include the research consent, which is a constant and not a row", () => {
    // The one accepted text with no public page until 2026-09-20. It is served by an explicit
    // branch on both public routes and stays OUT of the enums, so it can never reach the admin
    // editor or the seed as a row somebody retypes.
    expect(publicPage).toContain('docType="research_consent"');
    expect(publicPage).toContain("export function ResearchConsentPage");
    expect(read("client/src/App.tsx")).toContain('path="/research-consent"');
    expect(read("client/src/pages/legal.tsx")).toContain('href: "/research-consent"');
    expect(stringArray(routes, "LEGAL_DOC_TYPES")).not.toContain("research_consent");
    expect(stringArray(routes, "PUBLIC_LEGAL_DOC_TYPES")).not.toContain("research_consent");
    const pdfRoute = routes.indexOf('app.get("/api/legal-documents/:type.pdf"');
    const branch = routes.indexOf("type === RESEARCH_CONSENT_DOC_TYPE", pdfRoute);
    const lookup = routes.indexOf("if (!isPublicLegalDocType(type))", pdfRoute);
    expect(branch).toBeGreaterThan(pdfRoute);
    expect(branch).toBeLessThan(lookup);
  });

  it("each have a page in App.tsx that renders through the one component with the download", () => {
    // Every exported page in legal-document.tsx is routed, and every one renders
    // LegalDocumentPage, which is where the DownloadButton lives -- so a new public page cannot
    // ship without a download.
    const app = read("client/src/App.tsx");
    const pages = Array.from(publicPage.matchAll(/export function (\w+Page)\(/g), (m) => m[1]);
    expect(pages.length).toBeGreaterThanOrEqual(7);
    for (const page of pages) {
      expect(app, page).toContain(`component={${page}}`);
      const body = publicPage.slice(publicPage.indexOf(`export function ${page}(`));
      expect(body.slice(0, body.indexOf("}\n")), page).toContain("<LegalDocumentPage");
    }
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
